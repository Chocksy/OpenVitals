import AVFoundation
import PhotosUI
import SwiftUI
import UIKit

// Phase 38 D5: the + opens a camera. One tap to shoot, one to send.
// `docs/plans/2026-09-24-phase38-hybrid-tabs-spec.md` part D5. The system
// camera cannot carry the gallery, the mode strip or the frozen frame, so
// this is its own `AVCaptureSession`.

/// What Add shows over the screen: the camera, or the sheet in a mode.
enum AddSurface: Equatable {
    /// `caption`: words typed in the sheet before its Photo tile, sent with
    /// the photo.
    case camera(caption: String)
    case sheet(AddMode?)

    var isCamera: Bool {
        if case .camera = self { return true }
        return false
    }
}

struct AddCamera: View {
    var caption: String = ""
    let close: () -> Void
    /// Voice or Text from the strip: the camera closes, the sheet opens.
    let switchTo: (AddMode) -> Void

    @Environment(IslandModel.self) private var island: IslandModel?
    @Environment(\.accessibilityReduceMotion) private var reduce

    @State private var camera = CameraSession()
    @State private var access: Access = .asking
    @State private var front = false
    @State private var flash = false
    @State private var canFlash = false
    @State private var frozen: UIImage?
    @State private var pick: PhotosPickerItem?
    @State private var shooting = false
    @State private var shots = 0
    @State private var slide: CGFloat = 0
    @State private var signIn = false

    /// What the preview area can show.
    enum Access: Equatable { case asking, live, denied, absent }

    /// The strip, left to right; Photo is the camera itself.
    static let modes: [AddMode] = [.voice, .photo, .text]
    /// A sideways drag past this picks the next mode, as the iOS camera does.
    static let swipe: CGFloat = 55
    static let stripItem: CGFloat = 72

    static let denied = "The camera is off for OpenVitals. "
        + "Allow it in Settings, or pick a photo from the gallery."
    static let absent = "There is no camera here. "
        + "Pick a photo from the gallery, or say it or type it instead."

    static func access(status: AVAuthorizationStatus, hasCamera: Bool) -> Access {
        guard hasCamera else { return .absent }
        switch status {
        case .authorized: return .live
        case .notDetermined: return .asking
        default: return .denied
        }
    }

    /// The words in the preview area; nil while it is live or asking.
    static func says(_ access: Access) -> String? {
        switch access {
        case .denied: return denied
        case .absent: return absent
        case .live, .asking: return nil
        }
    }

    /// Settings can turn a denied camera on; it cannot add one.
    static func offersSettings(_ access: Access) -> Bool { access == .denied }

    /// Left moves the strip on to Text, right back to Voice. A short or
    /// mostly vertical drag stays on Photo.
    static func mode(after drag: CGSize) -> AddMode {
        guard abs(drag.width) >= swipe, abs(drag.width) > abs(drag.height) else { return .photo }
        return drag.width < 0 ? .text : .voice
    }

    /// Send carries the frozen frame and the words brought from the sheet;
    /// nothing until a frame is frozen.
    static func payload(frozen: UIImage?, caption: String) -> CapturePayload? {
        guard let frozen else { return nil }
        return CapturePayload(image: frozen,
                              text: caption.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            finder
            if let frozen {
                Color.clear
                    .overlay { Image(uiImage: frozen).resizable().scaledToFill() }
                    .clipped()
                    .ignoresSafeArea()
                    .accessibilityLabel("The photo to send")
                    .transition(.opacity)
            }
            controls
        }
        .contentShape(Rectangle())
        .gesture(swiping)
        .motion(Curve.ease.animation(0.2), value: frozen == nil)
        .environment(\.colorScheme, .dark)
        .sensoryFeedback(.impact, trigger: shots)
        .onChange(of: pick) { _, item in Task { await load(item) } }
        .task { await begin() }
        .onDisappear { camera.stop() }
        .sheet(isPresented: $signIn) { SignInView() }
        #if DEBUG
        .onAppear(perform: stage)
        #endif
    }

    // MARK: the preview

    @ViewBuilder private var finder: some View {
        switch access {
        case .live:
            Viewfinder(session: camera.session)
                .ignoresSafeArea()
                .accessibilityHidden(true)
        case .asking:
            Color.black.ignoresSafeArea()
        case .denied, .absent:
            VStack(spacing: DesignTokens.s13) {
                Image(systemName: "camera")
                    .font(.system(size: 34, weight: .light))
                    .foregroundStyle(Hy.mist)
                Text(Self.says(access) ?? "")
                    .hType(15, .regular, Hy.cream)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
                if Self.offersSettings(access) {
                    Button("Open Settings") {
                        if let url = URL(string: UIApplication.openSettingsURLString) {
                            UIApplication.shared.open(url)
                        }
                    }
                    .font(.grotesk(15, .semibold))
                    .foregroundStyle(Hy.plum)
                    .padding(.horizontal, DesignTokens.s21)
                    .frame(minHeight: 44)
                    .background(Capsule().fill(Hy.lime))
                    .buttonStyle(Pressed(scale: 0.96))
                }
            }
            .padding(.horizontal, DesignTokens.s34)
        }
    }

    // MARK: the controls

    private var controls: some View {
        VStack(spacing: 0) {
            HStack {
                round("xmark", "Close", action: close)
                Spacer(minLength: 0)
                if frozen == nil, canFlash {
                    round(flash ? "bolt.fill" : "bolt.slash.fill",
                          flash ? "Flash on" : "Flash off",
                          tint: flash ? Hy.lime : Hy.cream) { flash.toggle() }
                }
            }
            .padding(.horizontal, DesignTokens.s21)
            .padding(.top, DesignTokens.s8)
            Spacer(minLength: 0)
            if frozen == nil { shooter } else { sender }
        }
    }

    private var shooter: some View {
        VStack(spacing: DesignTokens.s21) {
            strip
            HStack(spacing: 0) {
                gallery
                Spacer(minLength: 0)
                shutter
                Spacer(minLength: 0)
                round("arrow.triangle.2.circlepath", "Switch camera") {
                    Task { await flip() }
                }
                .disabled(access != .live)
                .opacity(access == .live ? 1 : 0.4)
            }
            .padding(.horizontal, DesignTokens.s34)
        }
        .padding(.bottom, DesignTokens.s21)
        .transition(.opacity)
    }

    /// `Voice · Photo · Text`, Photo centred and lime. The strip follows a
    /// sideways drag by half, then settles back or hands over.
    private var strip: some View {
        HStack(spacing: 0) {
            ForEach(Self.modes, id: \.self) { mode in
                let on = mode == .photo
                Button { if !on { switchTo(mode) } } label: {
                    Text(Self.word(mode)).textCase(.uppercase)
                        .hType(13, .semibold, on ? Hy.lime : Hy.cream.opacity(0.7),
                               tracking: 0.08)
                        .frame(width: Self.stripItem, height: 34)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(on ? .isSelected : [])
            }
        }
        .offset(x: slide)
    }

    static func word(_ mode: AddMode) -> String {
        switch mode {
        case .voice: return "Voice"
        case .photo: return "Photo"
        case .text: return "Text"
        }
    }

    /// The 72 shutter: a white ring round a lime disc.
    private var shutter: some View {
        Button { Task { await shoot() } } label: {
            ZStack {
                Circle().strokeBorder(Hy.cream, lineWidth: 4)
                Circle().fill(Hy.lime).padding(8)
            }
            .frame(width: 72, height: 72)
            .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.9))
        .disabled(access != .live || shooting)
        .opacity(access == .live ? 1 : 0.4)
        .accessibilityLabel("Take the photo")
    }

    /// A 44 rounded square; the in-process picker asks for no library access.
    private var gallery: some View {
        let shape = RoundedRectangle(cornerRadius: 13, style: .continuous)
        return PhotosPicker(selection: $pick, matching: .images) {
            Image(systemName: "photo.on.rectangle")
                .font(.system(size: 19))
                .foregroundStyle(Hy.cream)
                .frame(width: 44, height: 44)
                .background(shape.fill(.ultraThinMaterial))
                .overlay(shape.strokeBorder(Hy.cream.opacity(0.6), lineWidth: 2))
                .contentShape(shape)
        }
        .buttonStyle(Pressed(scale: 0.92))
        .accessibilityLabel("Choose a photo")
    }

    /// The frozen frame: Retake on glass, Send in lime.
    private var sender: some View {
        HStack(spacing: DesignTokens.s8) {
            Button { retake() } label: {
                Text("Retake").hType(17, .semibold, Hy.cream)
                    .padding(.horizontal, DesignTokens.s21)
                    .frame(minHeight: 55)
                    .background(Capsule().fill(.ultraThinMaterial))
                    .contentShape(Capsule())
            }
            .buttonStyle(Pressed(scale: 0.96))
            Button { Task { await send() } } label: {
                Text("Send").hType(17, .semibold, Hy.plum)
                    .frame(maxWidth: .infinity, minHeight: 55)
                    .background(Capsule().fill(Hy.lime))
                    .contentShape(Capsule())
            }
            .buttonStyle(Pressed(scale: 0.96))
        }
        .padding(.horizontal, DesignTokens.s21)
        .padding(.bottom, DesignTokens.s21)
        .transition(.opacity)
    }

    private func round(_ glyph: String, _ label: String, tint: Color = Hy.cream,
                       action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: glyph)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(tint)
                .frame(width: 44, height: 44)
                .background(Circle().fill(.ultraThinMaterial))
                .contentShape(Circle())
        }
        .buttonStyle(Pressed(scale: 0.92))
        .accessibilityLabel(label)
    }

    private var swiping: some Gesture {
        DragGesture(minimumDistance: DesignTokens.s21)
            .onChanged { v in
                guard frozen == nil, abs(v.translation.width) > abs(v.translation.height) else { return }
                slide = max(-Self.stripItem, min(Self.stripItem, v.translation.width / 2))
            }
            .onEnded { v in
                guard frozen == nil else { return }
                let next = Self.mode(after: v.translation)
                if next == .photo {
                    Motion.animate(Curve.spring.animation(0.52), reduce: reduce) { slide = 0 }
                } else {
                    switchTo(next)
                }
            }
    }

    // MARK: the work

    private func begin() async {
        let has = CameraSession.hasCamera
        var status = AVCaptureDevice.authorizationStatus(for: .video)
        if has, status == .notDetermined {
            access = .asking
            status = await AVCaptureDevice.requestAccess(for: .video) ? .authorized : .denied
        }
        access = Self.access(status: status, hasCamera: has)
        guard access == .live, !Task.isCancelled else { return }
        guard let ready = await camera.start(front: front) else {
            access = .absent
            return
        }
        canFlash = ready
        // Gone while it was starting: stop it again.
        if Task.isCancelled { camera.stop() }
    }

    private func flip() async {
        guard let ready = await camera.start(front: !front) else { return }
        front.toggle()
        canFlash = ready
        if !ready { flash = false }
    }

    private func shoot() async {
        guard !shooting else { return }
        shooting = true
        defer { shooting = false }
        shots += 1
        if let image = await camera.shoot(flash: flash && canFlash) { frozen = image }
    }

    private func retake() {
        frozen = nil
        pick = nil
        slide = 0
    }

    private func load(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let ui = UIImage(data: data) {
            frozen = ui
        }
    }

    private func send() async {
        guard Api.signedIn else { signIn = true; return }
        guard let run = island?.run,
              let payload = Self.payload(frozen: frozen, caption: caption) else { return }
        _ = await run.send(payload)
        close()
    }

    #if DEBUG
    /// `-OVAdd frozen`: a drawn plate stands in for a shot.
    private func stage() {
        guard Fixtures.on, UserDefaults.standard.string(forKey: "OVAdd") == "frozen" else { return }
        frozen = Self.sample
    }

    static var sample: UIImage {
        let size = CGSize(width: 900, height: 1200)
        return UIGraphicsImageRenderer(size: size).image { r in
            let c = r.cgContext
            UIColor(rgb: 0x6b4a36).setFill()
            c.fill(CGRect(origin: .zero, size: size))
            UIColor(rgb: 0xf4ecdf).setFill()
            c.fillEllipse(in: CGRect(x: 90, y: 330, width: 720, height: 720))
            UIColor(rgb: 0xe6dccb).setFill()
            c.fillEllipse(in: CGRect(x: 170, y: 410, width: 560, height: 560))
            UIColor(rgb: 0xfaf6ee).setFill()
            c.fillEllipse(in: CGRect(x: 230, y: 470, width: 250, height: 220))
            UIColor(rgb: 0xe9825a).setFill()
            c.addPath(UIBezierPath(roundedRect: CGRect(x: 450, y: 520, width: 230, height: 150),
                                   cornerRadius: 40).cgPath)
            c.fillPath()
            UIColor(rgb: 0x5f8f3e).setFill()
            for (x, y) in [(270, 720), (340, 770), (410, 730), (480, 790), (550, 740), (380, 850)] {
                c.fillEllipse(in: CGRect(x: x, y: y, width: 110, height: 90))
            }
        }
    }
    #endif
}

// MARK: - the session

/// One `AVCaptureSession` and its photo output. Every change runs on its
/// own serial queue, never the main thread.
final class CameraSession: @unchecked Sendable {
    let session = AVCaptureSession()
    private let queue = DispatchQueue(label: "openvitals.camera")
    private let output = AVCapturePhotoOutput()
    private var input: AVCaptureDeviceInput?
    /// Held until each photo lands.
    private var shots: [Int64: Shot] = [:]

    /// Nil on the simulator.
    static var hasCamera: Bool { AVCaptureDevice.default(for: .video) != nil }

    static func device(front: Bool) -> AVCaptureDevice? {
        AVCaptureDevice.default(.builtInWideAngleCamera, for: .video,
                                position: front ? .front : .back)
    }

    /// Points it at the back or front camera and runs it. Nil when there is
    /// no such camera; otherwise whether that camera has a flash.
    func start(front: Bool) async -> Bool? {
        await withCheckedContinuation { go in
            queue.async {
                guard self.configure(front: front) else { go.resume(returning: nil); return }
                if !self.session.isRunning { self.session.startRunning() }
                go.resume(returning: self.output.supportedFlashModes.contains(.on))
            }
        }
    }

    func stop() {
        queue.async {
            if self.session.isRunning { self.session.stopRunning() }
        }
    }

    func shoot(flash: Bool) async -> UIImage? {
        await withCheckedContinuation { go in
            queue.async {
                guard self.session.isRunning else { go.resume(returning: nil); return }
                let settings = AVCapturePhotoSettings()
                if flash, self.output.supportedFlashModes.contains(.on) { settings.flashMode = .on }
                let id = settings.uniqueID
                let shot = Shot { image in
                    self.queue.async { self.shots[id] = nil }
                    go.resume(returning: image)
                }
                self.shots[id] = shot
                self.output.capturePhoto(with: settings, delegate: shot)
            }
        }
    }

    /// On the queue.
    private func configure(front: Bool) -> Bool {
        guard let device = Self.device(front: front),
              let next = try? AVCaptureDeviceInput(device: device) else { return false }
        session.beginConfiguration()
        defer { session.commitConfiguration() }
        if session.canSetSessionPreset(.photo) { session.sessionPreset = .photo }
        if let input { session.removeInput(input) }
        guard session.canAddInput(next) else {
            if let input { session.addInput(input) }
            return false
        }
        session.addInput(next)
        input = next
        if !session.outputs.contains(output), session.canAddOutput(output) {
            session.addOutput(output)
        }
        // Portrait, and the selfie mirrored as the preview shows it.
        if let link = output.connection(with: .video) {
            if link.isVideoRotationAngleSupported(90) { link.videoRotationAngle = 90 }
            if link.isVideoMirroringSupported {
                link.automaticallyAdjustsVideoMirroring = false
                link.isVideoMirrored = front
            }
        }
        return true
    }

    private final class Shot: NSObject, AVCapturePhotoCaptureDelegate {
        private var done: ((UIImage?) -> Void)?

        init(_ done: @escaping (UIImage?) -> Void) { self.done = done }

        func photoOutput(_ output: AVCapturePhotoOutput,
                         didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
            let image = error == nil ? photo.fileDataRepresentation().flatMap(UIImage.init(data:)) : nil
            done?(image)
            done = nil
        }

        func photoOutput(_ output: AVCapturePhotoOutput,
                         didFinishCaptureFor resolvedSettings: AVCaptureResolvedPhotoSettings,
                         error: Error?) {
            // A capture that never produced a photo still answers once.
            done?(nil)
            done = nil
        }
    }
}

/// The live preview, filling its frame.
private struct Viewfinder: UIViewRepresentable {
    let session: AVCaptureSession

    func makeUIView(context: Context) -> Preview {
        let view = Preview()
        view.backgroundColor = .black
        view.preview.session = session
        view.preview.videoGravity = .resizeAspectFill
        return view
    }

    func updateUIView(_ view: Preview, context: Context) {}

    final class Preview: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
}

#if DEBUG
#Preview("Camera") {
    AddCamera(close: {}, switchTo: { _ in })
}
#endif
