import PhotosUI
import SwiftUI
import UIKit

/// What the sheet says back after a send.
///
/// Every line in it comes from a field the server sent: the chips it
/// understood, the fields it wrote, and its own sentence. When a reply holds
/// none of those, `orRaw` prints the body verbatim rather than letting the
/// phone compose a sentence the server never said.
struct CaptureReceipt: Equatable {
    /// What was understood: one chip per fact, labelled as the reader
    /// labelled it.
    var chips: [String] = []
    /// What was saved: the keys `POST /api/capture` says it wrote, and the
    /// day it wrote them to.
    var saved: [String] = []
    /// The reader's own words: `reply`, `answer`, `note`, `basis`, `error`.
    var said = ""

    var isEmpty: Bool { chips.isEmpty && saved.isEmpty && said.isEmpty }

    /// Nothing recognisable in the reply, so print exactly what it said.
    func orRaw(_ raw: String) -> CaptureReceipt {
        isEmpty ? CaptureReceipt(said: raw) : self
    }

    /// Words on their own. `/api/compose` reads and writes in one call, so the
    /// chips that come back are already stored and its `reply` is the answer.
    static func of(_ composed: Api.Composed) -> CaptureReceipt {
        CaptureReceipt(chips: (composed.chips ?? []).map(\.label),
                       said: composed.reply ?? composed.error ?? "")
    }

    /// A question. `/api/ask` answers in one field.
    static func of(_ asked: Api.Asked) -> CaptureReceipt {
        CaptureReceipt(said: asked.answer ?? asked.error ?? "")
    }

    /// A photograph, read. A lab sheet carries a `note` instead of chips,
    /// because that one goes to the upload reader.
    static func of(_ read: Api.CaptureResult) -> CaptureReceipt {
        CaptureReceipt(chips: (read.chips ?? []).map(\.label),
                       said: read.note ?? read.basis ?? read.error ?? "")
    }

    /// The write that follows the read: what the server names as written.
    func with(_ wrote: Api.ConfirmResult) -> CaptureReceipt {
        var out = self
        out.saved = (wrote.facts ?? []) + (wrote.day.map { [$0] } ?? [])
        if let error = wrote.error, !error.isEmpty { out.said = error }
        return out
    }
}

/// Add. The sheet behind the +: one box, one photo, one Send.
///
/// The routing is the engine's, not the person's: a photograph goes to
/// `/api/capture`, a question to `/api/ask`, and anything else to
/// `/api/compose`. The sheet never says so — the owner types what happened and
/// the server decides which reader gets it.
struct CaptureView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var pick: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var text = ""
    @State private var camera = false
    @State private var library = false
    @State private var choosing = false
    @State private var busy = false
    @State private var receipt: CaptureReceipt?
    @State private var signIn = false
    @FocusState private var typing: Bool

    static let placeholder =
        "What happened, what you took, what you ate, or a question"

    static let caption =
        "Read by the app and kept as facts, meals and supplements. "
        + "A lab sheet becomes a read receipt under Blood."

    var body: some View {
        // `system.html` section 11: the sheet is a 34 px corner, a grabber,
        // then the head, then the body. Without the 21 px inset the "Add"
        // title sits under the grabber and the first control touches it.
        Screen(title: "Add", icon: "xmark", iconLabel: "Close",
               action: { dismiss() }) {
            // The receipt takes the box's place rather than landing under it,
            // so the answer is where the eye already is.
            if let receipt { read(receipt) } else { box }
            Caption(Self.caption)
        }
        .safeAreaPadding(.top, DesignTokens.s21)
        .presentationDragIndicator(.visible)
        .presentationCornerRadius(DesignTokens.rHero)
        .presentationBackground(Design.canvas)
        .interactiveDismissDisabled(busy)
        .onChange(of: pick) { _, item in Task { await load(item) } }
        .confirmationDialog("Photo", isPresented: $choosing,
                            titleVisibility: .hidden) {
            Button("Take a photo") { camera = true }
            Button("Choose a photo") { library = true }
        }
        .fullScreenCover(isPresented: $camera) {
            CameraPicker { image = $0; receipt = nil }
        }
        .photosPicker(isPresented: $library, selection: $pick, matching: .images)
        .sheet(isPresented: $signIn) { SignInView() }
    }

    // MARK: - one box

    private var box: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            Inp(label: "", text: $text, placeholder: Self.placeholder,
                lines: 3...8)
                .focused($typing)
            if let image { shot(image) }
            HStack(spacing: DesignTokens.s13) {
                Button { photo() } label: {
                    Label(image == nil ? "Photo" : "Another photo",
                          systemImage: "camera")
                }
                .buttonStyle(.ov(.quiet))
                Spacer(minLength: 0)
                Button(busy ? "Sending…" : "Send") { Task { await send() } }
                    .buttonStyle(.ovInk)
                    .disabled(!canSend)
                    .opacity(canSend ? 1 : 0.45)
            }
            Button("Log how you feel") {
                text = "I feel "
                typing = true
            }
            .buttonStyle(.ovText)
        }
    }

    /// Text or a photograph is enough. Two characters is the floor
    /// `/api/ask` itself enforces, and an empty box is not words.
    static func canSend(text: String, photo: Bool, busy: Bool) -> Bool {
        guard !busy else { return false }
        if photo { return true }
        return text.trimmingCharacters(in: .whitespacesAndNewlines).count >= 2
    }

    private var canSend: Bool {
        Self.canSend(text: text, photo: image != nil, busy: busy)
    }

    private func shot(_ image: UIImage) -> some View {
        Image(uiImage: image)
            .resizable()
            .scaledToFit()
            .frame(maxHeight: 160)
            .clipShape(RoundedRectangle(cornerRadius: Design.rInner,
                                        style: .continuous))
            .accessibilityLabel("The photo to send")
    }

    // MARK: - the receipt

    private func read(_ receipt: CaptureReceipt) -> some View {
        Panel(title: "Read", meta: busy ? "writing…" : nil) {
            if !receipt.chips.isEmpty {
                Flow {
                    ForEach(receipt.chips, id: \.self) { label in
                        Chip { Text(label) }
                    }
                }
            }
            if !receipt.saved.isEmpty {
                Caption("Saved · \(receipt.saved.joined(separator: " · "))")
            }
            if !receipt.said.isEmpty {
                Text(receipt.said)
                    .ovType(.sm, leading: 1.6)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: DesignTokens.s13) {
                Button("Done") { dismiss() }
                    .buttonStyle(.ovInk)
                    .disabled(busy)
                Button("Add another") { again() }
                    .buttonStyle(.ovText)
                    .disabled(busy)
                Spacer(minLength: 0)
            }
        }
    }

    // MARK: - doing it

    private func photo() {
        if UIImagePickerController.isSourceTypeAvailable(.camera) {
            choosing = true
        } else {
            library = true
        }
    }

    private func again() {
        receipt = nil
        text = ""
        image = nil
        pick = nil
        typing = true
    }

    private func load(_ item: PhotosPickerItem?) async {
        guard let item else { return }
        if let data = try? await item.loadTransferable(type: Data.self),
           let ui = UIImage(data: data) {
            image = ui
            receipt = nil
        }
    }

    /// One Send, three doors, and the person is told about none of them: a
    /// photograph goes to `/api/capture` and the chips it reads are written in
    /// the same breath, a question goes to `/api/ask`, and words go to
    /// `/api/compose`, which reads and writes in one call.
    private func send() async {
        guard Api.signedIn else { signIn = true; return }
        busy = true
        defer { busy = false }
        let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
        do {
            if let image, let data = image.jpegData(compressionQuality: 0.8) {
                let seen = try await Api.capture(photo: data, caption: words,
                                                 takenAt: Date())
                var made = CaptureReceipt.of(seen)
                let chips = seen.chips ?? []
                if !chips.isEmpty {
                    let wrote = try await Api.confirm(
                        chips: chips, label: seen.label, at: Api.iso(Date()))
                    made = made.with(wrote)
                }
                receipt = made.orRaw(Api.lastReply)
            } else if Api.isQuestion(words) {
                receipt = CaptureReceipt.of(try await Api.ask(words))
                    .orRaw(Api.lastReply)
            } else {
                receipt = CaptureReceipt.of(try await Api.compose(text: words))
                    .orRaw(Api.lastReply)
            }
        } catch {
            receipt = CaptureReceipt(said: error.localizedDescription)
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
