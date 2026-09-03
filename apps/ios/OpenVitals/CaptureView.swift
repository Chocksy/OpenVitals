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
    @State private var words = Fixtures.screen == "words"
    @State private var feel = false
    @State private var answer = ""
    @State private var busy = false
    @State private var note = ""
    @State private var result: Api.CaptureResult?
    @State private var chips: [Api.Chip] = []
    @State private var keep: Set<String> = []
    @State private var signIn = false

    var body: some View {
        // `system.html` section 11: the sheet is a 34 px corner, a grabber,
        // then the head, then the body. Without the 21 px inset the "Add"
        // title sits under the grabber and the first control touches it.
        Screen(title: "Add", icon: "xmark", iconLabel: "Close",
               action: { dismiss() }) {
            buttons
            if words { note0 }
            if let image { shot(image) }
            if let result { read(result) }
            if !chips.isEmpty { confirm }
            if !note.isEmpty { receipt }
            Caption("A lab sheet is not confirmed here — it goes to the upload "
                    + "reader and comes back as a read receipt under Blood.")
        }
        .safeAreaPadding(.top, DesignTokens.s21)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(DesignTokens.rHero)
        .presentationBackground(Design.canvas)
        .interactiveDismissDisabled(busy)
        .onChange(of: pick) { _, item in Task { await load(item) } }
        .fullScreenCover(isPresented: $camera) { CameraPicker { image = $0; reset() } }
        .photosPicker(isPresented: $library, selection: $pick, matching: .images)
        .sheet(isPresented: $signIn) { SignInView() }
    }

    // MARK: - the four things the engine actually accepts

    private var buttons: some View {
        // `.stackv` — the four things `/api/capture` and the composer accept.
        // Lime is on the lab sheet only: it is the control that adds the most.
        VStack(spacing: DesignTokens.s13) {
            Button { open() } label: {
                Label("Photo of a lab sheet", systemImage: "camera")
            }
            .buttonStyle(.ov(.add, wide: true, leading: true))

            Button { open() } label: {
                Label("Photo of food", systemImage: "fork.knife")
            }
            .buttonStyle(.ov(.quiet, wide: true, leading: true))

            Button { words = true } label: {
                Label("Ask or tell", systemImage: "square.and.pencil")
            }
            .buttonStyle(.ov(.quiet, wide: true, leading: true))

            Button { words = true; feel = true; caption = "I feel " } label: {
                Label("Log how you feel", systemImage: "drop")
            }
            .buttonStyle(.ov(.quiet, wide: true, leading: true))
        }
    }

    /// Words, on their own.
    ///
    /// `POST /api/compose` is the route the web composer posts text to
    /// (`components/composer.tsx` `post`), and it takes `{ text }` with no
    /// photograph: `draft: true` reads the words and writes nothing, and the
    /// same call without it writes the chips it read. A question goes to
    /// `POST /api/ask` instead, which is the same split `openingMode` makes on
    /// the web, so what the button says and what the server does agree.
    private var note0: some View {
        Panel(title: feel ? "How you feel" : "In your words",
              meta: Api.isQuestion(caption) ? "a question" : "a statement") {
            TextField("What is it?", text: $caption, axis: .vertical)
                .ovType(.sm)
                .lineLimit(2...5)
                .padding(Design.s8)
                .background(Design.surfaceHi)
                .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                            style: .continuous))
            HStack(spacing: DesignTokens.s13) {
                Button(busy ? "Sending…"
                       : (Api.isQuestion(caption) ? "Ask" : "Send")) {
                    Task { await send() }
                }
                    .buttonStyle(.ovInk)
                    .disabled(!canSend)
                    .opacity(canSend ? 1 : 0.45)
                Button("Add a photo") { open() }
                    .buttonStyle(.ovText)
                Spacer(minLength: 0)
            }
            if !answer.isEmpty {
                Hair()
                Text(answer).ovType(.sm, leading: 1.6)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Caption(image == nil
                    ? "Words on their own go to /api/compose, the same route "
                    + "the website's composer posts to. A question goes to "
                    + "/api/ask instead."
                    : "The words go with the photograph in one call.")
        }
    }

    /// Two characters is the floor `/api/ask` itself enforces; `/api/compose`
    /// reads anything, and an empty box is not words.
    private var canSend: Bool {
        !busy && caption.trimmingCharacters(in: .whitespaces).count >= 2
    }

    /// A question is asked, a statement is composed, and a photograph on the
    /// table takes precedence because `/api/capture` reads the two together.
    private func send() async {
        if image != nil { await read(); return }
        guard Api.signedIn else { signIn = true; return }
        busy = true
        defer { busy = false }
        let text = caption.trimmingCharacters(in: .whitespaces)
        do {
            if Api.isQuestion(text) {
                let said = try await Api.ask(text)
                answer = said.answer ?? said.error ?? "No answer came back."
            } else {
                // A post writes: `/api/compose` reads the words itself when
                // the client sends none, so the chips that come back are
                // already stored and there is nothing left to confirm.
                let posted = try await Api.compose(text: text)
                let read = posted.chips ?? []
                answer = posted.reply ?? posted.error
                    ?? "Written · \(Design.plural(read.count, "chip", "chips"))"
                if posted.error == nil {
                    note = "Written · "
                        + (read.isEmpty
                           ? "nothing in that was a fact this app stores"
                           : read.map(\.label).joined(separator: ", "))
                }
            }
        } catch {
            answer = error.localizedDescription
        }
    }

    /// What the sheet says after a write. It stays open, shows the receipt,
    /// and offers the one control that closes it.
    private var receipt: some View {
        Panel(title: "Receipt", meta: busy ? "writing…" : nil) {
            Caption(note)
            Button("Done") { dismiss() }
                .buttonStyle(.ovInk)
                .disabled(busy)
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
            Button(busy ? "Reading…" : "Use this photo") {
                Task { await read() }
            }
            .buttonStyle(.ovInk)
            .disabled(busy)
            .opacity(busy ? 0.45 : 1)
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
            .buttonStyle(.ovInk)
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
