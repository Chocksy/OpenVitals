/// Capture: a photo goes up, chips come back, one tap confirms.
///
/// The same two-step the composer taught. Nothing is written until the person
/// says so, food numbers are labelled estimates, and a lab sheet or a doctor's
/// letter is handed to the existing upload pipeline by the server rather than
/// turned into chips here.
import PhotosUI
import SwiftUI
import UIKit

struct CaptureView: View {
    @State private var pick: PhotosPickerItem?
    @State private var image: UIImage?
    @State private var caption = ""
    @State private var camera = false
    @State private var busy = false
    @State private var note = ""
    @State private var result: Api.CaptureResult?
    @State private var chips: [Api.Chip] = []
    @State private var keep: Set<String> = []
    @State private var signIn = false

    var body: some View {
        NavigationStack {
            Form {
                Section("Photo") {
                    if let image {
                        Image(uiImage: image)
                            .resizable().scaledToFit().frame(maxHeight: 220)
                    }
                    PhotosPicker("Choose a photo", selection: $pick,
                                 matching: .images)
                    if UIImagePickerController.isSourceTypeAvailable(.camera) {
                        Button("Take a photo") { camera = true }
                    }
                    TextField("What is it? (optional)", text: $caption)
                    Button(busy ? "Reading…" : "Read the photo") {
                        Task { await read() }
                    }
                    .disabled(image == nil || busy)
                }

                if let result {
                    Section("What it looks like") {
                        LabeledContent("Kind", value: result.kind ?? "unknown")
                        if let label = result.label, !label.isEmpty {
                            LabeledContent("Label", value: label)
                        }
                        if let basis = result.basis, !basis.isEmpty {
                            Text(basis).font(.footnote)
                                .foregroundStyle(.secondary)
                        }
                        if result.estimated == true {
                            Text("Food numbers are estimates and are stored as estimates.")
                                .font(.footnote).foregroundStyle(.secondary)
                        }
                        if let routed = result.routedTo {
                            Text("Sent to the \(routed) pipeline"
                                 + (result.note.map { " · \($0)" } ?? ""))
                                .font(.footnote)
                        }
                    }
                }

                if !chips.isEmpty {
                    Section("Confirm") {
                        ForEach(chips) { chip in
                            Toggle(isOn: binding(for: chip)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(chip.label)
                                    Text("\(chip.kind) · \(chip.key) · \(chip.date)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                        }
                        Button("Confirm \(keep.count) chip\(keep.count == 1 ? "" : "s")") {
                            Task { await confirm() }
                        }
                        .disabled(keep.isEmpty || busy)
                    }
                }

                if !note.isEmpty {
                    Section { Text(note).font(.footnote) }
                }
            }
            .navigationTitle("Capture")
            .onChange(of: pick) { _, item in Task { await load(item) } }
            .fullScreenCover(isPresented: $camera) {
                CameraPicker { image = $0 }
            }
            .sheet(isPresented: $signIn) { SignInView() }
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
            // Everything the model was sure enough to propose starts ticked;
            // untick is the correction, which is the cheaper gesture.
            keep = Set(chips.map(\.id))
            if chips.isEmpty && reply.routedTo == nil {
                note = "Nothing to confirm from that photo."
            }
        } catch {
            note = error.localizedDescription
        }
    }

    private func confirm() async {
        busy = true
        defer { busy = false }
        let chosen = chips.filter { keep.contains($0.id) }
        do {
            let reply = try await Api.confirm(
                chips: chosen, label: result?.label,
                at: Api.iso(Date()))
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

/// The camera, because SwiftUI still has no native one.
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
