# Variation 27 "Ledger" spec

Direction: health kept as a double-entry ledger, written by hand in a bound book. The score is the running balance. No cards, no rounded tiles, no shadows on paper, no glass, no gradient blobs. Structure and data come from 25-onion; everything visible (colour, type, spacing, grid) is this variation's own.

Output: `docs/mockups/v4/ios-variations/27-ledger.html`, self-contained, no build, vanilla JS, IBM Plex Serif + IBM Plex Mono from Google Fonts, two 390x844 phones side by side inside `.doc` with the eyebrow / h1 / lede header and foot-note tables, like 25-onion and 26-matrix. `index.html` is not touched; the orchestrator adds the row.

## Mandatory reads

- `25-onion.html` (whole file): `.doc` / `.phones` / `.cap`, phone frame, status bar, tab bar, Add-sheet mechanics, foot-note tables, and the LIFE / BLOOD / GENES / LOG data with the score arithmetic.
- `24-glow.html`: the sheet mechanics reused verbatim (`data-do="open"/"close"`, `.phone.open`, one click handler).
- `26-matrix-spec.md`: this file's format.

## Data (do not change)

LIFE / BLOOD / GENES / LOG and the score maths copied from 25-onion. Score 72, lifestyle 77, blood 71, genes 63, weights .40 / .45 / .15, `console.assert(score === 72)` kept. PhenoAge 36.2 at 39. LDL 131 mg/dL on 1 Aug 2026, down from 168 on 9 Dec 2025. Vitamin D 29 ng/mL. Sleep 7h30. APOE ε3/ε4. Projection: "Keep this eight weeks and LDL lands near 104, from 131."

## The stationery

One pitch governs the ledger block. `--p: 20px` is the ruling pitch and the leading; `--base: 15px` is where a 12px baseline falls inside it. Every written line is exactly one pitch tall, so every baseline sits on a printed rule.

Two faces, one semantic rule. Printed stationery is IBM Plex Serif: the running head, the column heads in small caps, the balance label, the book's tabs, the stamp, and any printed reference range. What was written onto the page is IBM Plex Mono on tabular figures: dates, particulars, folios and every figure in the money columns. The documentation under the phones is set in the printed face at reading size with no ledger rules, so the docs never read as product.

Colour, one meaning per ink:

| Token | Value | Means |
|---|---|---|
| `--desk` | `#34302a` | the desk the book lies on |
| `--paper` | `#f5f0e2` | the leaf |
| `--board` | `#e6dcc4` | the book's board, only at the foot |
| `--carbon` | `#dde4d9` | the posting slip: a cooler stock than the leaf |
| `--print` | `#6c8ba4` | printed before a word was written |
| `--print-2` | `#b1c5d2` | the ruling itself |
| `--ink` | `#1f1d19` | what was written, including every credit |
| `--red` | `#b0362b` | a debit. Nothing else |
| `--stamp` | `#4c3d7a` | the examiner's stamp |
| `--pencil` | `#7c786e` | memoranda |

## The column system

One grid, `grid-template-columns: 36px 172px 30px 44px 44px`, `column-gap: 8px`, `padding: 0 8px`, used by every block. Date, Particulars, Fo., Cr., Dr. Particulars are left aligned with one strategy only, the printed reference range set inline in stationery blue. Figures are two-decimal, right aligned with an 8px gutter to the rule. Empty cells stay empty; no dashes.

The stationery is printed only where entries are ruled into columns. The ruling and the six column rules live on the `.ruled` block (`background-size: 1px 100%`), not on the screen, so:

- the head of the leaf and the foot of the leaf are clear paper, and no printed line can cross a written word;
- no printed head can read as an underlined link, because there is no rule under it;
- the horizontal ruling starts at x = 49, to the right of the double margin rule at 47/49, and never runs through the margin column.

Gutter centres, and so the rules: 47 and 49 (the margin), 228, 266, 318, 370.

Rule weights carry the chapters: a blue hairline under every entry (the ruling itself), a black double rule under a footing and under the balance, a 2.5px black rule at an account close.

## Phone 1, the day's leaf

Thirty-six pitches from the status bar to the board, all of them used, no blank ruled rows at the foot.

1. Status bar in the paper's own ink at 62 percent, the island a soft grey, so the chrome never outweighs the paper at the first pixel.
2. The head on clear paper, two lines and two vintage cues only, not a stack: "Day book / Razvan · 9 Sep 2026", "Brought forward / 70 · PhenoAge 36.2 at 39". No folio number, no examination date.
3. Heavy rule, then the column heads in printed small caps.
4. Account A, the three domains footed: `Lifestyle 77 × .40 → 30.80`, `Blood 71 × .45 → 31.95`, `Genes 63 × .15 → 9.45`, `Footing, accounts 72.20`, closed heavy.
5. The day book, seven postings with date, particulars, folio and a credit or a debit. The nil posting is off this leaf. `Footing, day book 13.00 / 5.00`, closed heavy.
6. Account B, blood, as real double entry: the three debiting markers with the printed aim inline, the four in range footed on one line, `Footing, blood = 71` with 7.00 against 2.00, closed heavy.
7. The balance, written last, at the foot, on clear paper: "Balance carried down" in the printed face and `72` at 64px in the written face, its baseline on the third rule of the block, then a double rule. Over it the examiner's stamp, "On track" at 21px, boxed, tilted -6.5deg, `mix-blend-mode: multiply`, a turbulence displacement filter and a turbulence alpha mask so the ink breaks and the box edges are eaten. It overprints the balance figure. Phone 2 carries a different impression: another seed, another frequency and -11deg, because a stamp is struck once per leaf.
8. The memorandum below the closing rule, in the margin, pencil, wrapped over two lines. It is never an entry with blank columns.
9. The foot is the book's board with a 1px ink rule above it. Tabs in the printed face: Day book / Body / Blood / Post.

## Phone 2, the posting slip

A second paper, not a sheet: `--carbon` stock (cooler and lighter than the leaf), a perforated top edge from a repeating radial-gradient mask, and a real shadow onto the book (`0 -14px 26px -8px rgba(20,18,15,.6)`). Its height is 253px so the perforation lands exactly on a rule of the book beneath, never mid-entry.

Content: "Posting slip" printed, "Cancel" written; a heavy rule; one written line, "Written from [the photograph] speak by hand", the chosen source boxed in ink, the other two greyed, so it is a slip and not a settings list; then the slip's own ruled block with the same column heads and the draft entry `9 Sep · Sardines, rye 462 kcal · L2 · 1.00` plus a blank ruled line to write on; a double rule; the pencil note "Read from the plate, 1:08 PM"; and a boxed "Post it".

Opens from the Post tab via `data-do="open"`; phone 2 carries `class="open"` from load. Slip 420ms on transform, veil 300ms, nothing else moves.

## Verify

```
cd docs/mockups/v4/ios-variations
python3 -m http.server 8811 &
perl -e 'alarm 60; exec @ARGV' "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --virtual-time-budget=6000 --user-data-dir=/tmp/hl-27 --window-size=900,1500 --screenshot=/tmp/shot-27.png http://127.0.0.1:8811/27-ledger.html
```

Read the screenshot. Checks: no printed rule crosses a glyph; the ruling never enters the margin column; every entry baseline on a rule; the balance at the foot with the stamp overprinting it and a different impression on each phone; the leaf filling to the board with no blank ruled rows; the slip's perforation landing on a rule; no clipped particulars; no horizontal scrollbar at 900 and 1280; no console errors; `console.assert(score === 72)` silent.
