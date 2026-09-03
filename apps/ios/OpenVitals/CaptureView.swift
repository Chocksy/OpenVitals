import PhotosUI
import SwiftUI
import UIKit

/// Add. The sheet behind the +, and the one lime control on the phone: lime
/// sits on "photo of a lab sheet" only, because that is the control that adds
/// the most data. A lab sheet is not confirmed here — it goes to the upload
/// reader and comes back as a read receipt under Blood.
struct CaptureView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var pick: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var caption = ""
    @State private var camera = false
    @State private var library = false
    @State private var words = false
    @State private var busy = false
    @State private var note = ""
    @State private var result: Api.CaptureResult?
    @State private var chips: [Api.Chip] = []
    @State private var keep: Set<String> = []
    @State private var signIn = false

    var body: some View {
        Screen(title: "Add", icon: "xmark", iconLabel: "Close",
               action: { dismiss() }) {
            buttons
            if words { note0 }
            if let image { shot(image) }
            if let result { read(result) }
            if !chips.isEmpty { confirm }
            if !note.isEmpty { Caption(note) }
            Caption("A lab sheet is not confirmed here — it goes to the upload "
                    + "reader and comes back as a read receipt under Blood.")
        }
        .onChange(of: pick) { _, item in Task { await load(item) } }
        .fullScreenCover(isPresented: $camera) { CameraPicker { image = $0; reset() } }
        .photosPicker(isPresented: $library, selection: $pick, matching: .images)
        .sheet(isPresented: $signIn) { SignInView() }
    }

    // MARK: - the four things the engine actually accepts

    private var buttons: some View {
        VStack(spacing: Design.s8) {
            Button { open() } label: {
                Label("Photo of a lab sheet", systemImage: "camera")
            }
            .buttonStyle(AddButtonStyle())

            Button { open() } label: {
                Label("Photo of food", systemImage: "fork.knife")
            }
            .buttonStyle(QuietButtonStyle())

            Button { words = true } label: {
                Label("Ask or tell", systemImage: "square.and.pencil")
            }
            .buttonStyle(QuietButtonStyle())

            Button { words = true; caption = "I feel " } label: {
                Label("Log how you feel", systemImage: "drop")
            }
            .buttonStyle(QuietButtonStyle())
        }
    }

    private var note0: some View {
        Panel(title: "In your words", meta: "rides with the photo") {
            TextField("What is it?", text: $caption, axis: .vertical)
                .ovType(.sm)
                .lineLimit(2...5)
                .padding(Design.s8)
                .background(Design.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                            style: .continuous))
            Caption("These words are read with the photograph. The full "
                    + "composer is on the website; it is not one of the phone's "
                    + "endpoints yet.")
        }
    }

    private func shot(_ image: UIImage) -> some View {
        Panel(title: "Photo", meta: busy ? "reading…" : nil) {
            Image(uiImage: image)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                            style: .continuous))
            Button(busy ? "Reading…" : "Read the photo") { Task { await read() } }
                .buttonStyle(InkButtonStyle())
                .disabled(busy)
        }
    }

    private func read(_ result: Api.CaptureResult) -> some View {
        Panel(title: "What it looks like", meta: "before anything is written") {
            VStack(alignment: .leading, spacing: Design.s5) {
                line("Kind", result.kind ?? "unknown")
                if let label = result.label, !label.isEmpty { line("Label", label) }
                if let confidence = result.confidence {
                    line("Confidence", String(format: "%.2f", confidence))
                }
                if let basis = result.basis, !basis.isEmpty { Caption(basis) }
                if result.estimated == true {
                    Caption("Every food number below is an estimate and is "
                            + "stored as one. Not a scale.")
                }
                if let routed = result.routedTo {
                    Caption("Sent to the \(routed) pipeline"
                            + (result.note.map { " · \($0)" } ?? ""))
                }
            }
        }
    }

    private func line(_ name: String, _ value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(name).ovType(.sm).foregroundStyle(Design.ink3)
            Spacer()
            Text(value).ovType(.sm, weight: .medium).foregroundStyle(Design.ink)
        }
    }

    private var confirm: some View {
        Panel(title: "Confirm",
              meta: "\(Design.plural(chips.count, "chip", "chips")) · each one has a switch") {
            VStack(spacing: 0) {
                ForEach(Array(chips.enumerated()), id: \.element.id) { i, chip in
                    if i > 0 { Hair().padding(.vertical, Design.s8) }
                    Toggle(isOn: binding(for: chip)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(chip.label)
                                .ovType(.sm)
                                .foregroundStyle(Design.ink)
                            Text("\(chip.kind) · \(chip.key) · \(chip.date)")
                                .ovType(.xs)
                                .foregroundStyle(Design.ink3)
                        }
                    }
                    .tint(Design.ok)
                }
            }
            Button("Save \(Design.plural(keep.count, "chip", "chips"))") {
                Task { await save() }
            }
            .buttonStyle(InkButtonStyle())
            .disabled(keep.isEmpty || busy)
        }
    }

    // MARK: - doing it

    private func open() {
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            camera = true
        } else {
            library = true
        }
    }

    private func binding(for chip: Api.Chip) -> Binding<Bool> {
        Binding(
            get: { keep.contains(chip.id) },
            set: { on in
                if on { keep.insert(chip.id) } else { keep.remove(chip.id) }
            })
    }

    private func load(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let ui = UIImage(data: data) {
            image = ui
            reset()
        }
    }

    private func reset() {
        result = nil
        chips = []
        keep = []
        note = ""
    }

    private func read() async {
        guard let image, let data = image.jpegData(compressionQuality: 0.8)
        else { return }
        guard Api.signedIn else { signIn = true; return }
        busy = true
        defer { busy = false }
        reset()
        do {
            let reply = try await Api.capture(photo: data, caption: caption,
                                              takenAt: Date())
            result = reply
            chips = reply.chips ?? []
            keep = Set(chips.map(\.id))
            if chips.isEmpty && reply.routedTo == nil {
                note = "Nothing to confirm from that photo."
            }
        } catch {
            note = error.localizedDescription
        }
    }

    private func save() async {
        busy = true
        defer { busy = false }
        let chosen = chips.filter { keep.contains($0.id) }
        do {
            let reply = try await Api.confirm(
                chips: chosen, label: result?.label, at: Api.iso(Date()))
            note = "Written"
                + (reply.day.map { " for \($0)" } ?? "")
                + ((reply.facts?.isEmpty == false)
                   ? " · facts: \(reply.facts!.joined(separator: ", "))" : "")
            chips = []
            keep = []
        } catch {
            note = error.localizedDescription
        }
    }
}

struct CameraPicker: UIViewControllerRepresentable {
    var onImage: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ picker: UIImagePickerController, context: Context) {}

    final class Coordinator: NSObject, UIImagePickerControllerDelegate,
                             UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(
            _ picker: UIImagePickerController,
            didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
        ) {
            if let image = info[.originalImage] as? UIImage { parent.onImage(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
            parent.dismiss()
        }
    }
}

#if DEBUG
#Preview("Capture") {
    CaptureView()
        .onAppear { UserDefaults.standard.set(true, forKey: "OVFixtures") }
}
#endif
