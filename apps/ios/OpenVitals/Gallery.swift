#if DEBUG
import SwiftUI

/// The gallery: `docs/mockups/v4/system.html`, sections 03 to 15, drawn with
/// the native components in the same order and with the same sample values, so
/// the phone can be held next to the browser.
///
/// Reachable from Settings, or by launching with `-OVGallery YES`.
struct GalleryView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var section = "s03"

    static let sections: [(id: String, number: String, title: String)] = [
        ("s03", "03", "Shell"),
        ("s04", "04", "Buttons"),
        ("s05", "05", "Inputs"),
        ("s06", "06", "State words, chips and glyphs"),
        ("s07", "07", "Cards"),
        ("s08", "08", "Lists and rows"),
        ("s09", "09", "Tables"),
        ("s10", "10", "Charts"),
        ("s11", "11", "Sheets and overlays"),
        ("s12", "12", "Empty states"),
        ("s13", "13", "Motion"),
        ("s14", "14", "Dark"),
        ("s15", "15", "Phase 31b elements"),
    ]

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: DesignTokens.s34) {
                    Meta(Face.bundled
                         ? "Geist Sans and Geist Mono are bundled and loaded."
                         : "Geist did not load; this is SF, the fallback.")
                    ForEach(Self.sections, id: \.id) { section in
                        Gallery.section(section.id)
                    }
                }
                .padding(DesignTokens.s13)
            }
            .background(Design.canvas.ignoresSafeArea())
            .navigationTitle("Gallery")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                Button("Close") { dismiss() }
            }
        }
    }
}

/// One section of the system page, as a view the gallery and the snapshot
/// tests both render. The width is the phone's own 364 px of content.
enum Gallery {

    static let width: CGFloat = 364

    @ViewBuilder
    static func section(_ id: String) -> some View {
        switch id {
        case "s03": shell
        case "s04": buttons
        case "s05": inputs
        case "s06": states
        case "s07": cards
        case "s08": rows
        case "s09": tables
        case "s10": charts
        case "s11": sheets
        case "s12": empties
        case "s13": motion
        case "s14": dark
        default: phase31b
        }
    }

    private static func head(_ n: String, _ title: String,
                             _ lede: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            SecHead(number: n, title: title)
            Lede(lede)
        }
    }

    // MARK: - 03 Shell

    static var shell: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("03", "Shell",
                 "Five pills on desktop, four tabs and the lime + on the "
                 + "phone, one avatar menu, one System group for the admin "
                 + "pages.")
            SubHead(title: "390 px",
                    note: "four destinations and the one lime control")
            ScreenHead(title: "Home", icon: "sun.max")
            Text("Seven markers are off. Thyroid is the loudest one.")
                .ovType(.md).foregroundStyle(Design.ink)
                .fixedSize(horizontal: false, vertical: true)
            AskPill()
            TabBar(tab: .constant(0),
                   titles: [("Home", "house"), ("Body", "waveform.path.ecg"),
                            ("Blood", "drop"), ("Plan", "calendar")],
                   add: {})
            Caption("Graph is a row inside Blood, not a fifth tab. The + is "
                    + "the only lime in the app.")
        }
    }

    // MARK: - 04 Buttons

    static var buttons: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("04", "Buttons",
                 "Three jobs, one family. ink is the one primary per screen. "
                 + "quiet is bordered and does the rest. text has no box. The "
                 + "lime add is a fourth shape, not a fourth job.")
            Panel {
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    job("ink", .ink)
                    job("quiet", .quiet)
                    job("text", .text)
                    job("add · lime", .add)
                    HStack(spacing: DesignTokens.s13) {
                        Button("Small · ink") {}
                            .buttonStyle(.ov(.ink, small: true))
                        Button("Small · quiet") {}
                            .buttonStyle(.ov(.quiet, small: true))
                        AddButton {}
                    }
                    Caption("Every button is at least 40 px tall, which is the "
                            + "app's .hit-40 rule.")
                }
            }
        }
    }

    private static func job(_ name: String, _ kind: ButtonJob) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s5) {
            Text(name).ovType(.xs, mono: true).foregroundStyle(Design.ink3)
            HStack(spacing: DesignTokens.s8) {
                Button("Plan retest") {}.buttonStyle(.ov(kind))
                Button("Planning") {}.buttonStyle(.ov(kind))
                Button("Plan retest") {}.buttonStyle(.ov(kind))
                    .disabled(true).opacity(0.45)
            }
        }
    }

    // MARK: - 05 Inputs

    static var inputs: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("05", "Inputs",
                 "Everything the app asks a person to type, pick or drag. "
                 + "Focus is a 2 px ink ring; an invalid field is a 2 px --bad "
                 + "ring with the reason under it in words.")
            Panel {
                VStack(alignment: .leading, spacing: DesignTokens.s21) {
                    Inp(label: "Marker name",
                        text: .constant("TPO antibodies"))
                    Inp(label: "Optimal ceiling", text: .constant("9"),
                        help: "The engine's own optimal for TPO is 0–9.",
                        mono: true)
                    Inp(label: "Value at fault", text: .constant("3400"),
                        error: "hs-CRP is measured in mg/L. 3400 is a thousand "
                        + "times the ceiling; did you mean 3.4?",
                        mono: true)
                    VStack(alignment: .leading, spacing: DesignTokens.s5) {
                        FieldLabel(text: "Did it today")
                        CheckRow(label: "Selenium 200 µg",
                                 caption: "24 of 84 days · since Jun 14",
                                 on: true)
                        CheckRow(label: "Sardines, 3 tins a week",
                                 caption: "never ticked · since Aug 28",
                                 on: false)
                    }
                }
            }
        }
    }

    // MARK: - 06 State words, chips and glyphs

    static var states: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("06", "State words, chips and glyphs",
                 "A state is a word in its colour. It is never a filled "
                 + "badge, because a filled badge makes the spectrum a "
                 + "surface and the surface is what the eye reads first.")
            Panel {
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    word("Off", "TPO 320 IU/mL, ceiling 34")
                    word("Borderline", "HbA1c 5.6 %, optimal under 5.4")
                    word("Optimal", "Vitamin B12 612 pg/mL")
                    word("Never measured",
                         "Sex hormones, no marker with a value")
                    SubHead(title: "Tier and evidence",
                            note: "how settled the thing behind an action is")
                    Flow {
                        Tier(word: "established")
                        Tier(word: "early")
                        Tier(word: "experimental")
                        Glyph(mark: "● A")
                        Glyph(mark: "● B")
                        Glyph(mark: "◐ opinion", kind: "op")
                        Glyph(mark: "○ E", kind: "anec")
                    }
                    SubHead(title: "Systems, as chips",
                            note: "all twelve, because the rail hides what it "
                            + "scrolls past")
                    Flow {
                        ForEach(Self.systems, id: \.0) { name, state in
                            SystemChip(name: name, word: state, showsWord: true)
                        }
                    }
                }
            }
        }
    }

    static let systems: [(String, String)] = [
        ("Thyroid", "off"), ("Vitamins", "off"), ("Liver", "off"),
        ("Lipids", "off"), ("Lifestyle", "off"), ("Blood sugar", "borderline"),
        ("Iron", "borderline"), ("Kidneys", "borderline"),
        ("Stress hormones", "borderline"), ("Inflammation", "borderline"),
        ("Blood count", "borderline"), ("Sex hormones", "never measured"),
    ]

    private static func word(_ w: String, _ note: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            StateWord(word: w, dot: true, triangle: true)
            Meta(note)
        }
    }

    // MARK: - 07 Cards

    static var cards: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("07", "Cards",
                 "The tile, the hero, Kite's navy Status card, the drawer, "
                 + "and the ConclusionCard taken apart.")
            NavyCard(label: "Status", number: "7", glyph: true,
                     title: nil,
                     counts: ["7 off · 19 borderline · 26 optimal",
                              "2 new, 1 resolved since Aug 14 · draw Aug 1 2026"],
                     tone: "bad", bar: true)
            RailCard(label: "Body", number: "36.6", unit: "at 41",
                     line: "PhenoAge, from the Aug 1 draw. One question due today.")
            RailCard(label: "Blood", number: "7", unit: "/ 52 markers",
                     line: "Next draw in 12 wk: HbA1c, fasting insulin, TSH, TPO.",
                     tone: "bad")
            RailCard(label: "Thyroid", number: "320", unit: "IU/mL",
                     line: "TPO antibodies · off", tone: "bad")
            Meta("Shown here as the phone rail: it snaps card to card and "
                 + "fades at the right edge. The hue bar on the Status card is "
                 + "3 px and follows the worst band.")
        }
    }

    // MARK: - 08 Lists and rows

    static var rows: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("08", "Lists and rows",
                 "Five row shapes cover every list in the app. Each one names "
                 + "its number, its unit and its date.")
            Panel {
                SubHead(title: "Marker row",
                        note: "name · source · sparkline · value · state")
                RowList(count: Self.markers.count) { i in
                    let m = Self.markers[i]
                    MarkerRow(name: m.0, source: m.1, value: m.2, unit: m.3,
                              word: m.4)
                }
                SubHead(title: "Upload row",
                        note: "file · what came out of it · what to do")
                RowList(count: Self.uploads.count) { i in
                    let u = Self.uploads[i]
                    UploadRow(file: u.0, meta: u.1, got: u.2, word: u.3)
                }
                SubHead(title: "Protocol row",
                        note: "what you decided to do, and the 30 days behind it")
                RowList(count: 3) { i in
                    switch i {
                    case 0:
                        ProtocolRow(name: "Cut added sugar",
                                    sub: "daily · since Jun 14 2026 · ◐ opinion · HbA1c 5.6 %",
                                    pct: "80 %", of: "24 of the last 30 days",
                                    strip: Self.strip)
                    case 1:
                        ProtocolRow(name: "Selenium 200 µg",
                                    sub: "daily · since Jun 14 2026 · ● B · TPO 320 → under 100",
                                    pct: "86 %", of: "24 of 84 days done")
                    default:
                        ProtocolRow(name: "Sardines, 3 tins a week",
                                    sub: "weekly · since Aug 28 2026 · ○ E · triglycerides",
                                    pct: "0 %", of: "never ticked")
                    }
                }
                SubHead(title: "Goal row and thread row",
                        note: "the same shapes, two more jobs")
                RowList(count: 2) { i in
                    i == 0
                        ? GoalRow(goal: "TPO antibodies under 100 IU/mL",
                                  meta: "from Selenium 200 µg · due Feb 16 2027 · 29 % of the way from 412 to 100",
                                  target: "412 → 320 → target 100",
                                  progress: 0.29)
                        : GoalRow(goal: "Ferritin above 50 ng/mL",
                                  meta: "from Iron 60 mg alternate days · due Nov 24 2026 · one draw only",
                                  target: "22 of 50 ng/mL",
                                  progress: 0.44)
                }
                RowList(count: Self.threads.count) { i in
                    ThreadRow(day: Self.threads[i].0,
                              question: Self.threads[i].1)
                }
            }
        }
    }

    static let markers: [(String, String, String, String?, String)] = [
        ("TPO antibodies", "thyroid · lab · Aug 1 2026", "320", "IU/mL", "off"),
        ("HbA1c", "blood sugar · lab · Aug 1 2026", "5.6", "%", "borderline"),
        ("Ferritin", "iron · lab · Aug 1 2026", "22", "ng/mL", "borderline"),
        ("Vitamin D", "vitamins · lab · Aug 1 2026", "19", "ng/mL", "off"),
        ("Resting heart rate", "phone · Apple Health · Sep 1 2026", "55",
         "bpm", "optimal"),
    ]

    static let uploads: [(String, String, String, String)] = [
        ("bloodwork-2026-08-01.pdf", "PDF · 1.2 MB · read Aug 1 2026",
         "15 readings", "parsed"),
        ("genome-ancestry-raw.txt", "TXT · 24 MB · read Feb 3 2026",
         "9 genes, 4 moved a prior", "parsed"),
        ("photo-strip-aug31.jpeg", "JPEG · 2.1 MB · read Aug 31 2026",
         "1 reading · glucose 96 mg/dL", "needs a check"),
    ]

    static let threads: [(String, String)] = [
        ("Sep 1", "Should I take selenium?"),
        ("Sep 1", "Why is this confirmed and not likely?"),
        ("Aug 31", "Is a glucose of 96 fine after a meal?"),
        ("Aug 12", "What does a ferritin of 22 actually mean?"),
    ]

    static let strip: [Int] = [1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0,
                              1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1, 2]

    // MARK: - 09 Tables

    static var tables: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("09", "Tables",
                 "Three tables: the readings table on a marker, the admin "
                 + "table, and the wide HKB table whose first column stays put "
                 + "while the rest scrolls.")
            Panel {
                SubHead(title: "Readings",
                        note: "every draw that carried TPO antibodies")
                Table(columns: ["Date", "Value", "Reference", "State"],
                      rows: [["2026-08-01", "320 IU/mL", "0–34", "off"],
                             ["2025-12-09", "412 IU/mL", "0–34", "off"]],
                      numeric: [0, 1])
                SubHead(title: "Admin · curator runs",
                        note: "/admin, restyled, same columns")
                Table(columns: ["Run", "Started", "In", "Minted", "State"],
                      rows: [["curator-0219", "2026-09-01", "148", "31", "done"],
                             ["curator-0218", "2026-08-31", "96", "12", "done"],
                             ["curator-0217", "2026-08-30", "0", "0", "no input"]],
                      numeric: [1, 2, 3])
                Caption("No pagination anywhere in the app, on purpose: the "
                        + "tables are the size of one person's data.")
            }
        }
    }

    // MARK: - 10 Charts

    static var charts: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("10", "Charts",
                 "Every chart is hand-drawn with a real scale. The y axis is "
                 + "always the marker's own unit, the x axis is always real "
                 + "dates, and nothing is interpolated between two draws.")
            Panel {
                SubHead(title: "The ruler",
                        note: "one value against its own bands")
                Ruler(at: 0.744, normal: 0...0.0791, optimal: 0...0.0209,
                      ghost: 0.88, word: "off",
                      low: "0", mid: "normal 0–34 · optimal 0–9",
                      high: "430 IU/mL")
            }
            HistoryChart(title: "History", unit: "IU/mL · 2 draws",
                         points: [.init(x: 0, y: 0.0844, label: "412"),
                                  .init(x: 1, y: 0.2889, label: "320")],
                         normal: 0.9244...1)
            Panel(title: "Sparkline", meta: "resting HR · bpm · 12 days") {
                HStack(spacing: DesignTokens.s13) {
                    Sparkline(values: [58, 59, 57, 58, 56, 57, 56, 55, 57,
                                       56, 55, 55])
                    Meta("58 → 55 bpm, one value a day")
                }
            }
            Panel {
                SubHead(title: "30-cell strip",
                        note: "cut added sugar · 24 of 30 days · today outlined")
                Strip30(days: Self.strip)
            }
        }
    }

    // MARK: - 11 Sheets and overlays

    static var sheets: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("11", "Sheets and overlays",
                 "The + sheet, the chip editor, the toast, the glossary "
                 + "tooltip, the disclosure, and the marker drawer as a bottom "
                 + "sheet.")
            Sheet(title: "Ask or tell", close: {}) {
                Meta("About TPO antibodies")
                Inp(label: "In your words",
                    text: .constant("I started selenium 200 µg on Jun 14"))
                Meta("A dashed chip is a guess. Posting draws it solid and "
                     + "swaps the circle for a tick in the same slot.")
            } foot: {
                Button("Photo") {}.buttonStyle(.ovText)
                Spacer(minLength: 0)
                Button("Reset") {}.buttonStyle(.ovQuiet)
                Button("Post") {}.buttonStyle(.ovInk)
            }
            Panel(title: "The + sheet, on the phone", meta: "four rows") {
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    ForEach(Self.plusRows, id: \.0) { title, say in
                        HStack(alignment: .top, spacing: DesignTokens.s13) {
                            RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                             style: .continuous)
                                .fill(Design.surfaceHi)
                                .frame(width: DesignTokens.s34,
                                       height: DesignTokens.s34)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(title).ovType(.sm)
                                    .foregroundStyle(Design.ink)
                                Text(say).ovType(.xs)
                                    .foregroundStyle(Design.ink3)
                                    .fixedSize(horizontal: false,
                                               vertical: true)
                            }
                        }
                    }
                }
            }
            Panel(title: "Toast", meta: "one at a time, bottom centre") {
                Toast(say: "3 actions added to your protocol", undo: {})
            }
        }
    }

    static let plusRows: [(String, String)] = [
        ("Photo of a lab",
         "A result page, a strip, a screen. We read the markers."),
        ("PDF", "A whole panel or a genome export, read in about a minute."),
        ("Ask or tell", "“Should I take selenium?” · “I train 3 times a week”"),
        ("Log how you feel", "A check-in, dated, kept next to the markers."),
    ]

    // MARK: - 12 Empty states

    static var empties: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("12", "Empty states",
                 "Quiet tiles, no dashed borders anywhere. One sentence that "
                 + "says what is true, and one link to the thing that would "
                 + "change it.")
            Empty(kicker: "Day one", title: "Nothing measured yet",
                  say: "Add a lab result, or a photo of one, and the first "
                  + "reading turns this into a ledger. Nothing here is a demo.",
                  link: "Add your first result")
            Empty(kicker: "No draws", title: "No blood draws on file",
                  say: "The engine can still read your phone, but every "
                  + "likelihood on this page needs at least one draw behind it.",
                  link: "Plan a draw")
            Empty(kicker: "No plan", title: "Nothing to do first",
                  say: "Nothing you have measured is off, so there is nothing "
                  + "worth acting on today. The next draw is Nov 24 2026.",
                  link: "See the next draw")
            Empty(kicker: "Nothing due", title: "No question worth answering",
                  say: "The engine only asks when the answer would move a "
                  + "number. It has nothing to ask right now.",
                  link: "See what it already knows")
        }
    }

    // MARK: - 13 Motion

    static var motion: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("13", "Motion",
                 "The transitions.dev tokens the app already ships, one live "
                 + "sample each. Every one is off under Reduce Motion.")
            Panel {
                VStack(alignment: .leading, spacing: DesignTokens.s8) {
                    ForEach(DesignTokens.durations.sorted(by: { $0.key < $1.key }),
                            id: \.key) { name, seconds in
                        HStack {
                            Text(name).ovType(.sm, mono: true)
                                .foregroundStyle(Design.ink2)
                            Spacer(minLength: DesignTokens.s8)
                            Text("\(Int(seconds * 1000)) ms")
                                .ovType(.sm, mono: true)
                                .foregroundStyle(Design.ink)
                        }
                    }
                }
            }
            Panel(title: "text swap", meta: "250 ms") {
                HStack(spacing: DesignTokens.s13) {
                    StateWord(word: "borderline")
                    StateWord(word: "off", triangle: true)
                }
            }
            Panel(title: "toast", meta: "300 ms, one at a time") {
                Toast(say: "Selenium adopted", undo: {})
            }
        }
    }

    // MARK: - 14 Dark

    static var dark: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("14", "Dark",
                 "The same tokens under the dark column. The navy stays navy, "
                 + "because it is a colour and not a lightness; the spectrum "
                 + "lifts so it still clears AA on a dark tile.")
            Flow {
                swatch("--canvas", DesignTokens.canvas)
                swatch("--surface", DesignTokens.surface)
                swatch("--surface-hi", DesignTokens.surfaceHi)
                swatch("--navy", DesignTokens.navy)
                swatch("--ok", DesignTokens.ok)
                swatch("--warn", DesignTokens.warn)
                swatch("--bad", DesignTokens.bad)
                swatch("--lime", DesignTokens.lime)
            }
            NavyCard(label: "Status", number: "7", glyph: true,
                     counts: ["7 off · 19 borderline · 26 optimal",
                              "2 new, 1 resolved since Aug 14"],
                     tone: "bad", bar: true)
            RailCard(label: "Thyroid", number: "320", unit: "IU/mL",
                     line: "TPO antibodies · off", tone: "bad")
            HStack(spacing: DesignTokens.s8) {
                Button("Plan retest") {}.buttonStyle(.ovInk)
                Button("Dismiss") {}.buttonStyle(.ovText)
                Button("Add data") {}.buttonStyle(.ovAdd)
            }
            Flow {
                StateWord(word: "off", triangle: true)
                StateWord(word: "borderline")
                StateWord(word: "optimal")
                StateWord(word: "never measured", dot: true)
            }
        }
        .environment(\.colorScheme, .dark)
    }

    private static func swatch(_ name: String,
                               _ pair: DesignTokens.Pair) -> some View {
        VStack(alignment: .leading, spacing: DesignTokens.s3) {
            RoundedRectangle(cornerRadius: DesignTokens.rInner,
                             style: .continuous)
                .fill(pair.color)
                .frame(width: 76, height: 34)
                .overlay(RoundedRectangle(cornerRadius: DesignTokens.rInner,
                                          style: .continuous)
                    .strokeBorder(Design.hair, lineWidth: Design.hairline))
            Text(name).ovType(.xs, mono: true).foregroundStyle(Design.ink3)
        }
    }

    // MARK: - 15 Phase 31b elements

    static var phase31b: some View {
        VStack(alignment: .leading, spacing: DesignTokens.s13) {
            head("15", "Phase 31b elements",
                 "Five elements the app did not have, plus the chart hover "
                 + "card. Same tokens, same rules.")
            Panel {
                SubHead(title: "The verdict row", note: "answer first")
                RowList(count: 3) { i in
                    switch i {
                    case 0:
                        VerdictRow(question: "Coeliac disease:",
                                   answer: "essentially excluded · no test needed",
                                   say: "Coeliac needs HLA-DQ2.5 or DQ8 and your "
                                   + "file read neither.",
                                   side: "excluded", tone: "ok", grade: "● A")
                    case 1:
                        VerdictRow(question: "Type 2 diabetes:",
                                   answer: "+40 % background risk",
                                   say: "It moves the starting odds and nothing "
                                   + "else. Your HbA1c of 5.6 % decides the rest.",
                                   side: "×1.4", tone: "warn", grade: "● A")
                    default:
                        VerdictRow(question: "Cardiovascular risk:",
                                   answer: "the genome adds nothing",
                                   say: "No APOE ε4 copy. Your LDL of 131 mg/dL "
                                   + "is doing all of the work.",
                                   side: "no change", tone: "none", grade: "● A")
                    }
                }
            }
            Panel {
                SubHead(title: "The paper row",
                        note: "title, citation, grade, what it found")
                RowList(count: 2) { i in
                    i == 0
                        ? PaperRow(title: "Selenium supplementation in "
                                   + "autoimmune thyroiditis lowers thyroid "
                                   + "peroxidase antibodies",
                                   cite: ["Gärtner · J Clin Endocrinol Metab · 2002",
                                          "randomised trial · n = 36",
                                          "read Aug 1 2026"],
                                   grade: "● A",
                                   found: "Three months of selenium 200 µg cut "
                                   + "TPO antibodies by 21 % against placebo.",
                                   movesWord: "borderline",
                                   moves: "your selenium keeps its ● A grade and "
                                   + "the TPO target date holds at Feb 16 2027")
                        : PaperRow(title: "Serum TSH, T4 and thyroid antibodies "
                                   + "in the United States population",
                                   cite: ["Hollowell · J Clin Endocrinol Metab · 2002",
                                          "cross-sectional · n = 17 353",
                                          "read Aug 1 2026"],
                                   grade: "● A",
                                   found: "A positive TPO antibody carries an "
                                   + "odds ratio of 8.4 for raised TSH.",
                                   movesWord: "nothing for you",
                                   moves: "already counted; re-reading it changed "
                                   + "neither the rule nor the grade")
                }
            }
            Panel(title: "Month strip",
                  meta: "September 2026 · today outlined") {
                MonthStrip(title: "September 2026", days: Self.month)
            }
            Panel(title: "Day column", meta: "Thursday Sep 3 2026 · 2 of 7 done") {
                VStack(spacing: 0) {
                    DayRow(at: "08:00",
                           what: "Breakfast, then selenium 200 µg",
                           why: "with food, and four hours clear of the iron · "
                           + "TPO 320 → under 100 IU/mL by Feb 16 2027",
                           tag: "protocol · 86 %", done: true)
                        .padding(.vertical, DesignTokens.s13)
                    Hair()
                    DayRow(at: "13:10",
                           what: "Twelve minutes of walking, after the largest meal",
                           why: "nothing in the engine proposed this, so it "
                           + "counts toward nothing until you add it",
                           tag: "suggested", done: false, enabled: false,
                           adopt: {})
                        .padding(.vertical, DesignTokens.s13)
                    Hair()
                    DayRow(at: "17:30", what: "Resistance session, 45 minutes",
                           why: "the third of three this week · 55 bpm on "
                           + "three-session weeks against 58 on the others",
                           tag: "3rd of 3", done: false)
                        .padding(.vertical, DesignTokens.s13)
                }
            }
            Panel(title: "The schedule table",
                  meta: "what, how much, when, with what, until") {
                ScheduleTable(rows: [
                    .init(what: "Selenium", dose: "200 µg", slot: 0, note: nil,
                          with: "breakfast · 4 h clear of the iron",
                          until: "Feb 16 2027",
                          aimedAt: "TPO 320 → under 100 IU/mL"),
                    .init(what: "Vitamin D3", dose: "4 000 IU", slot: 2,
                          note: nil, with: "the largest fat of the day",
                          until: "Nov 24 2026",
                          aimedAt: "vitamin D 19 → 40–60 ng/mL"),
                    .init(what: "Iron", dose: "60 mg", slot: 3,
                          note: "alt. days", with: "empty stomach · vitamin C",
                          until: "Nov 24 2026",
                          aimedAt: "ferritin 22 → above 50 ng/mL"),
                ])
            }
            Panel(title: "The chart hover card",
                  meta: "date, value, unit, state word, band") {
                HoverCard(date: "Sat Aug 1 2026", value: "320", unit: "IU/mL",
                          word: "off", band: "normal 0–34 · optimal 0–9",
                          was: "was 412 on Dec 9 2025 · −22 %")
            }
        }
    }

    static let month: [MonthStrip.Day] = {
        var days: [MonthStrip.Day] = [.init(number: nil)]
        let dots: [[String]] = [
            ["supp", "food"], ["supp"], ["train", "supp"], ["supp", "food"],
            ["train", "supp"], ["supp", "food", "check"], ["train", "supp"],
            ["supp", "food"], ["supp"], ["train", "supp"], ["supp", "food"],
            ["train", "supp"], ["supp", "food", "check"],
        ]
        for (i, kinds) in dots.enumerated() {
            let n = i + 1
            days.append(.init(number: n, past: n < 3, today: n == 3,
                              dots: kinds))
        }
        return days
    }()
}

#Preview("Gallery") { GalleryView() }
#endif

// MARK: - the seven phone screens, as the mockup draws them

#if DEBUG
/// The six screens of `docs/mockups/v4/ios.html` plus the sign-in card of
/// `login.html`, built from the same components the app ships and with the
/// mockup's own sample values. `SnapshotTests` renders these against the
/// PNGs in `Tests/References`, so a component that drifts from the CSS shows
/// up as differing pixels rather than as an opinion.
enum Mock {

    /// The phone frame's own width, and the content width inside its 13 px.
    static let width: CGFloat = 390

    static let names = ["today", "body", "plan", "meals", "capture",
                        "settings", "signin", "blood", "research"]

    /// Phase 35 screens with no reference PNG. The Add sheet the phone now
    /// shows is not the four rows `docs/mockups/v4/ios.html` draws, and the
    /// mockups are not this phase's to redraw — so these two are written by
    /// the screenshot dumper and checked by `CaptureSheetTests`, not by a
    /// pixel diff against a render that does not exist.
    static let unrendered = ["capturebox", "captureread"]

    /// The goal row is not a phone frame: it is one element of `system.html`
    /// section 08, at the 1194 px it lays out at on the page it belongs to.
    static let goalWidth: CGFloat = 1194

    @ViewBuilder
    static func screen(_ name: String) -> some View {
        switch name {
        case "today": today
        case "body": body
        case "plan": plan
        case "meals": meals
        case "capture": capture
        case "capturebox": captureBox
        case "captureread": captureRead
        case "settings": settings
        case "blood": blood
        case "research": research
        default: signin
        }
    }

    /// `.phone` — 13 px of padding on the canvas, the head and the stack, and
    /// the tab bar 13 px under them.
    /// `ios.html` draws Today · Body · + · Meals · Plan; `blood.html`,
    /// `marker.html` and `research.html` draw Home · Body · + · Blood · Plan.
    /// The mockups disagree with each other, so each frame is checked against
    /// the bar its own page draws. The shipped bar is neither: phase 34 asked
    /// for Today · Blood · + · Body · Plan, which is `Shell.tabs`.
    static let iosBar: [(title: String, icon: String)] = [
        ("Today", "house"), ("Body", "waveform.path.ecg"),
        ("Meals", "fork.knife"), ("Plan", "calendar"),
    ]

    static let bloodBar: [(title: String, icon: String)] = [
        ("Home", "house"), ("Body", "waveform.path.ecg"),
        ("Blood", "drop"), ("Plan", "calendar"),
    ]

    private static func phone<Content: View>(
        _ tab: Int, _ title: String, icon: String,
        bar: [(title: String, icon: String)] = Mock.iosBar,
        @ViewBuilder _ content: () -> Content
    ) -> some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                ScreenHead(title: title, icon: icon)
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    content()
                }
            }
            TabBar(tab: .constant(tab), titles: bar, add: {})
                .padding(.top, DesignTokens.s13)
        }
        .padding(DesignTokens.s13)
        .frame(width: width)
        .background(Design.canvas)
    }

    // ── Today ────────────────────────────────────────────────────────

    static var today: some View {
        phone(0, "Today", icon: "sun.max") {
            Text("Seven markers are off. Thyroid is the loudest one.")
                .ovType(.md).foregroundStyle(Design.ink)
                .fixedSize(horizontal: false, vertical: true)
            NavyCard(label: "Status", number: "7",
                     title: "Attention · 7 markers off",
                     counts: ["26 optimal · 19 normal · 7 off",
                              "Aug 1 2026 draw"])
            // `.rail` scrolls sideways and fades at the right edge; the
            // frame clips it, which is what the mockup's frame shows.
            HStack(alignment: .top, spacing: DesignTokens.s13) {
                RailCard(label: "Body", number: "7 234",
                         line: "steps · Sep 2 · Apple Health")
                RailCard(label: "Blood", number: "52",
                         line: "markers · last draw Aug 1 2026")
                RailCard(label: "Plan", number: "2 / 7",
                         line: "done today · resistance at 17:30")
            }
            .frame(width: 364, alignment: .leading)
            .fixedSize(horizontal: true, vertical: false)
            .frame(width: 364, alignment: .leading)
            .clipped()
            Panel(title: "Systems", meta: "12") {
                Flow {
                    SystemChip(name: "Thyroid", word: "off")
                    SystemChip(name: "Vitamins", word: "off")
                    SystemChip(name: "Lipids", word: "off")
                    SystemChip(name: "Blood sugar", word: "borderline")
                    SystemChip(name: "Iron", word: "borderline")
                    SystemChip(name: "Sex hormones", word: "never measured")
                }
            }
        }
    }

    // ── Body ─────────────────────────────────────────────────────────

    static let bodyRows: [(String, String, String, String, String)] = [
        ("Steps", "StepCount · iPhone · Sep 2", "7 234", "", "under 10 000"),
        ("Resting heart rate", "RestingHeartRate · Apple Watch · Sep 2",
         "55", "bpm", "optimal"),
        ("Sleep", "SleepAnalysis · Apple Watch · Sep 2", "6.8", "h", "short"),
        ("Exercise time", "AppleExerciseTime · Apple Watch · Sep 2",
         "42", "min", "optimal"),
        ("Protein", "DietaryProtein · logged in Health · Sep 2",
         "88", "g", "optimal"),
    ]

    static var body: some View {
        phone(1, "Body", icon: "arrow.triangle.2.circlepath") {
            Panel(title: "Apple Health", meta: "27 types · last sync 08:12") {
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    ForEach(bodyRows, id: \.0) { row in
                        MarkerRow(name: row.0, source: row.1, value: row.2,
                                  unit: row.3.isEmpty ? nil : row.3,
                                  word: row.4)
                    }
                }
            }
            Caption("Every row names its HealthKit type and the device that "
                    + "wrote it. A type with nothing in it is listed and says "
                    + "so; it is never dropped.")
        }
    }

    // ── Plan ─────────────────────────────────────────────────────────

    static let planRows: [(String, String, String, String, Bool)] = [
        ("08:00", "Selenium 200 µg",
         "with breakfast · TPO 320 → under 100", "86 %", true),
        ("12:30", "Protein and fibre first",
         "at the largest meal · HbA1c 5.6 %", "every day", false),
        ("17:30", "Resistance, 45 min", "3rd of 3 this week", "today", false),
        ("19:30", "Vitamin D 4 000 IU",
         "with dinner · 19 → 40–60 ng/mL", "100 %", false),
        ("21:00", "Iron 60 mg", "empty stomach · alternate days",
         "ferritin", false),
    ]

    static var plan: some View {
        phone(3, "Plan", icon: "calendar") {
            Text("Thursday Sep 3. Two of seven done.")
                .ovType(.md).foregroundStyle(Design.ink)
            Panel {
                VStack(spacing: 0) {
                    ForEach(Array(planRows.enumerated()), id: \.offset) { i, r in
                        DayRow(at: r.0, what: r.1, why: r.2, tag: r.3,
                               done: r.4)
                            .padding(.vertical, DesignTokens.s13)
                        if i < planRows.count - 1 { Hair() }
                    }
                }
            }
            Caption("Ticking a row here is the same write as ticking it on the "
                    + "web: one item, one day, one boolean.")
        }
    }

    // ── Meals ────────────────────────────────────────────────────────

    static var meals: some View {
        phone(2, "Meals", icon: "camera") {
            Panel {
                HStack(alignment: .top, spacing: DesignTokens.s13) {
                    MealShot(url: nil)
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(alignment: .firstTextBaseline,
                               spacing: DesignTokens.s8) {
                            Text("Sardines on rye").ovType(.md)
                                .foregroundStyle(Design.ink)
                            Text("13:05").ovType(.xs, mono: true)
                                .foregroundStyle(Design.ink3)
                            Spacer(minLength: 0)
                        }
                        Flow(spacing: DesignTokens.s13) {
                            Macro(value: "422", name: "kcal est.")
                            Macro(value: "29 g", name: "protein est.")
                        }
                        .padding(.top, DesignTokens.s8)
                        Text("4 items · not a scale").ovType(.xs)
                            .foregroundStyle(Design.ink3)
                            .padding(.top, DesignTokens.s8)
                    }
                }
            }
            Panel(title: "Today", meta: "2 meals · 1 from a photo") {
                RowList(count: 2) { i in
                    i == 0
                        ? SaidRow(name: "Breakfast",
                                  say: "logged in Health · 08:05",
                                  meta: "not an estimate", word: "410 kcal",
                                  tone: "ok")
                        : SaidRow(name: "Lunch", say: "from a photo · 13:05",
                                  meta: "estimate", word: "422 kcal est.",
                                  tone: "warn")
                }
            }
            Caption("A meal from Apple Health carries no “est.”, because a "
                    + "barcode or a weighed entry is not a guess. A meal from "
                    + "a photo always carries it.")
        }
    }

    // ── Capture ──────────────────────────────────────────────────────

    /// The shipped Add sheet, phase 35: one box, one photo control, one Send,
    /// and the feel link under them.
    ///
    /// There is no reference render for this one. `Tests/References/capture-*`
    /// comes out of `docs/mockups/v4/ios.html`, which still draws the four
    /// rows, and the mockups are not this phase's to redraw — so `capture`
    /// below stays the mirror the pixel test checks, and this is the mirror of
    /// what the phone actually shows.
    static var captureBox: some View {
        phone(0, "Add", icon: "xmark") {
            VStack(alignment: .leading, spacing: DesignTokens.s13) {
                Inp(label: "", text: .constant(""),
                    placeholder: CaptureView.placeholder, lines: 3...8)
                HStack(spacing: DesignTokens.s13) {
                    Button { } label: {
                        Label("Photo", systemImage: "camera")
                    }
                    .buttonStyle(.ov(.quiet))
                    Spacer(minLength: 0)
                    Button("Send") { }
                        .buttonStyle(.ovInk)
                        .opacity(0.45)
                }
                Button("Log how you feel") { }
                    .buttonStyle(.ovText)
            }
            Caption(CaptureView.caption)
        }
    }

    /// The receipt, in the box's place.
    static var captureRead: some View {
        phone(0, "Add", icon: "xmark") {
            Panel(title: "Read") {
                Flow {
                    ForEach(["Selenium 200 µg", "since Jun 14",
                             "exercise 3–4 d/wk"], id: \.self) { label in
                        Chip { Text(label) }
                    }
                }
                Caption("Saved · supplements · 2026-09-03")
                Text("Selenium is on the list from June 14, and the training "
                     + "days are on the habit row.")
                    .ovType(.sm, leading: 1.6)
                    .foregroundStyle(Design.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: DesignTokens.s13) {
                    Button("Done") { }.buttonStyle(.ovInk)
                    Button("Add another") { }.buttonStyle(.ovText)
                    Spacer(minLength: 0)
                }
            }
            Caption(CaptureView.caption)
        }
    }

    /// The mockup's own Capture frame — four rows and the read panel. Kept
    /// because `testCapture` diffs it against the render of `ios.html`.
    static var capture: some View {
        phone(0, "Add", icon: "xmark") {
            VStack(spacing: DesignTokens.s13) {
                Button { } label: {
                    Label("Photo of a lab sheet", systemImage: "camera")
                }
                .buttonStyle(.ov(.add, wide: true, leading: true))
                Button { } label: {
                    Label("Photo of food", systemImage: "fork.knife")
                }
                .buttonStyle(.ov(.quiet, wide: true, leading: true))
                Button { } label: {
                    Label("Ask or tell", systemImage: "square.and.pencil")
                }
                .buttonStyle(.ov(.quiet, wide: true, leading: true))
                Button { } label: {
                    Label("Log how you feel", systemImage: "drop")
                }
                .buttonStyle(.ov(.quiet, wide: true, leading: true))
            }
            Panel(title: "What it looks like",
                  meta: "before anything is written") {
                RowList(count: 2) { i in
                    i == 0
                        ? SaidRow(name: "A meal",
                                  say: "confidence 0.86 · four items recognised",
                                  meta: "estimated", word: "meal", tone: "warn")
                        : SaidRow(name: "Chips to confirm",
                                  say: "kcal, protein, carbs, fat, last meal hour",
                                  meta: "each one has a switch", word: "5",
                                  tone: "ok")
                }
            }
            Caption("A lab sheet is not confirmed here — it goes to the upload "
                    + "reader and comes back as a read receipt under Blood.")
        }
    }

    // ── Settings ─────────────────────────────────────────────────────

    static let healthTypes: [(String, String, Bool)] = [
        ("Steps", "StepCount · 2 190 days on the server · last sent 08:12", true),
        ("Resting heart rate",
         "RestingHeartRate · 412 readings · last sent 08:12", true),
        ("Sleep", "SleepAnalysis · 388 readings · last sent 08:12", true),
        ("Blood glucose",
         "BloodGlucose · nothing on the server · syncs the moment it lands",
         false),
        ("Menstrual flow", "MenstrualFlow · not applicable · off", false),
    ]

    static var settings: some View {
        phone(0, "Settings", icon: "gearshape") {
            Panel(title: "Apple Health", meta: "27 types · 5 sending") {
                RowList(count: healthTypes.count) { i in
                    CheckRow(label: healthTypes[i].0,
                             caption: healthTypes[i].1, on: healthTypes[i].2)
                }
                HStack(spacing: DesignTokens.s13) {
                    Button("Sync now") {}
                        .buttonStyle(.ov(.ink, small: true))
                    Button("Resync everything") {}
                        .buttonStyle(.ov(.text, small: true))
                    Spacer(minLength: 0)
                }
            }
            Panel(title: "Seen, not used", meta: "4 types") {
                Caption("Your phone offered four HealthKit types the engine "
                        + "has no rule for. They are named here rather than "
                        + "silently dropped, and nothing about them is sent.")
            }
        }
    }

    // ── Blood ────────────────────────────────────────────────────────
    //
    // `blood.html` section 02. The draw timeline at the top of that frame is
    // a component the app does not have and phase 34 did not ask for, so the
    // screen opens on the filters.

    static let bloodRows: [(String, String, String, String, String)] = [
        ("TPO antibodies", "normal under 34", "320", "IU/mL", "off"),
        ("Vitamin D", "optimal 40–80", "19", "ng/mL", "off"),
        ("LDL cholesterol", "goal 70–100 by Dec 1", "131", "mg/dL", "off"),
        ("ALT", "normal 0–33", "34", "U/L", "off"),
    ]

    static var blood: some View {
        phone(2, "Blood", icon: "slider.horizontal.3", bar: bloodBar) {
            Filters(names: ["Off", "Borderline", "All"],
                    chosen: .constant("Off")) {
                ["Off": 7, "Borderline": 19, "All": 52][$0] ?? 0
            }
            Panel {
                VStack(alignment: .leading, spacing: DesignTokens.s13) {
                    ForEach(bloodRows, id: \.0) { row in
                        MarkerRow(name: row.0, source: row.1, value: row.2,
                                  unit: row.3, word: row.4)
                    }
                }
            }
        }
    }

    // ── Research ─────────────────────────────────────────────────────

    static var research: some View {
        phone(0, "Research", icon: "magnifyingglass", bar: bloodBar) {
            Filters(names: ["Moves something", "All"],
                    chosen: .constant("Moves something")) {
                $0 == "All" ? 4 : 1
            }
            Panel {
                VStack(spacing: 0) {
                    PaperRow(
                        title: "Selenium lowers TPO antibodies in autoimmune "
                        + "thyroiditis",
                        cite: ["Gärtner", "JCEM", "2002"], grade: "● A",
                        found: "−21 % against placebo over three months, "
                        + "95 % CI −34 to −7. n = 36.",
                        movesWord: "Hashimoto's", movesTone: "warn",
                        actions: false)
                        .padding(.bottom, DesignTokens.s13)
                    Hair()
                    PaperRow(
                        title: "Thyroid autoimmunity and other autoimmune "
                        + "conditions",
                        cite: ["Wang", "2015"], grade: "● A",
                        found: "Coeliac travels with thyroid autoimmunity, "
                        + "OR 1.6 (1.2–2.1).",
                        movesWord: "excluded by your HLA", movesTone: "ok",
                        actions: false)
                        .padding(.top, DesignTokens.s13)
                }
            }
            Caption("The row stacks: title, then the citation line, then what "
                    + "it found, then what it moves. The Open and Discuss "
                    + "buttons move to a long-press menu.")
        }
    }

    // ── the goal row ─────────────────────────────────────────────────

    static var goalrow: some View {
        RowList(count: 2) { i in
            i == 0
                ? GoalRow(goal: "TPO antibodies under 100 IU/mL",
                          meta: "from Selenium 200 µg · due Feb 16 2027 · "
                          + "29 % of the way from 412 to 100",
                          target: "412 → 320 → target 100", progress: 0.29)
                : GoalRow(goal: "Ferritin above 50 ng/mL",
                          meta: "from Iron 60 mg alternate days · due "
                          + "Nov 24 2026 · one draw only, so the bar is the "
                          + "value against the floor",
                          target: "22 of 50 ng/mL", progress: 0.44)
        }
        .frame(width: goalWidth)
        .background(Design.surface)
    }

    // ── Sign in ──────────────────────────────────────────────────────

    static var signin: some View {
        VStack(spacing: 0) {
            LoginCard(brand: "OpenVitals", say: "Welcome back.") {
                Inp(label: "Email", text: .constant("razvan@example.com"))
                Inp(label: "Password", text: .constant("••••••••••"),
                    secure: true)
                Button("Sign in") {}.buttonStyle(.ov(.ink, wide: true))
                Text("The same email and password as the website.")
                    .ovType(.sm).foregroundStyle(Design.ink3)
                    .frame(maxWidth: .infinity, alignment: .center)
                    .multilineTextAlignment(.center)
            }
            .padding(.top, DesignTokens.s55)
        }
        .padding(DesignTokens.s13)
        .frame(width: width)
        .background(Design.canvas)
    }
}
#endif
