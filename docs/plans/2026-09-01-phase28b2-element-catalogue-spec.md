# Phase 28b-2: the whole app in the new language — an element catalogue

Owner, 2026-09-01, after seeing `docs/mockups/home-v3.html`: "I am
impressed… I would even stop and add more elements… I am open to not
continuing with the existing design… make sure we have more elements,
as many as we can, to cover all grounds… one thing I notice in B: the
'improving' pill sits on top of something I'm not sure what it means; I
see DRAW and DRAW, I presume those are blood tests… show me a side by
side, or even the current design but with the new elements, for all the
data we have."

Still a mockup phase. No app code. Output is HTML the owner opens, plus
screenshots. 28c implements what gets picked.

## 0. Fix first: the timeline strip in hero B

Every dot on that strip must be a real thing a person can name, or it
goes. Rule for the catalogue: **no decorative data**. The strip becomes:

- x = days (last 60 or 90), one column per day.
- Small grey dots = days the phone synced (Apple Health present).
- Diamonds labelled with the date = blood draws ("Aug 1 · 15 markers"),
  not "DRAW".
- The coloured dots become one **series** with a name printed at the
  left of the strip: the metric the engine picked as the biggest real
  movement in the window (e.g. "Resting HR", "HRV", "Sleep", "Steps").
- The floating pill says that metric and the real delta with its unit:
  "Resting HR improving · 58 → 55 bpm, last 30 days". Never a bare
  score ("+3.2") because the engine has no composite score.
- A one-line legend under the axis: "● phone days  ◆ blood draws  —
  Resting HR".
- Keep a variant B2 where the strip is a plain 30-day sparkline of that
  one metric with the pill; sometimes fewer dots wins.

## 1. What data exists (the catalogue must cover every row)

From `db/schema.ts`, `lib/healthkit.ts`, the routes under `app/(app)`:

| Layer | Data | Source today |
|---|---|---|
| Blood | readings (value, unit, date, lab/optimal bands, status), draws (grouped by date), per-marker history, biomarker list, uploads (PDF/photo), OCR review items, "source: lab vs phone" | `/labs` (Biomarkers · Draws · Phone · Uploads), `range-bar`, `trend-chart` |
| Body (Apple Health) | steps, active energy, exercise min, stand hours, distance, flights, resting HR, HRV, respiratory rate, SpO₂, walking HR, HR recovery, sleep duration, VO₂max, body mass, body fat %, waist, BP sys/dia, glucose, wrist temp, menstrual flow, mindful minutes, dietary kcal/protein/carbs/fat, workouts (type, minutes, kcal) | `wearable.tsx`, `daily-charts.tsx`, `/labs/phone`, `healthkit-totals` |
| Food | photo capture → meal items, kcal, macros (`daily_logs.nutrition`) | `/api/capture`, `tracker.tsx` |
| Genome | variants (gene, rsid, genotype, effect, what it changes) | `genome-table.tsx`, `/uploads/[id]` |
| Person | profile facts + history (sex, birth year, family history, symptoms, habits like exercise_days_week), life events, check-in posts ("you said") | `today-ask`, `fact-edit`, `checkins` |
| Engine | conditions ledger (state word, %, for/against inputs, drivers, what-to-do, doctor's note, "already doing since"), systems (worst marker per system), biological age, markers optimal/normal/off counts, next draw with planned markers, projections (phase-19 target bands), belief snapshots (state over time), intervention outcomes ("did it work"), calibration | `home.tsx`, `ledger`, `plan.tsx`, `projections`, `interventionOutcomes` |
| Plan | protocol items (title, dose, basis glyph, started_at), habit logs (ticks per day), goals (dated retests), reports/actions per condition | `/protocol`, `/plan`, `/goals`, `action-card` |
| Knowledge | trends/claims with freshness class (contested · horizon · pooled · guideline; the sardines row), insights, bubbles graph (kg nodes/edges), journeys | `/trends`, `key-trends`, `bubbles.tsx`, `/graph` |
| Ask | question line, answer (prose with inline evidence glyphs, "Right now" row, Sources line, Act-on-it chips), loading state, Discuss-about-a-condition | `composer`, `ask-answer`, `act-on-it` |
| Shell | top nav (Home · Plan · Labs · Graph), the + capture button, theme toggle, mobile | `top-nav`, `pill-tabs` |

## 2. `docs/mockups/elements-v3.html` — one element per data row

Same tokens and CSS as `home-v3.html` (copy the `<style>` into a shared
`docs/mockups/v3.css` and link it from both files; keep both openable
from disk). Real values: the test user's labs (as in home-v3), Apple
Health numbers marked "illustrative" in a footnote (steps 8 412,
exercise 34 min, RHR 55, HRV 48 ms, sleep 7 h 12, SpO₂ 97 %, VO₂max
41.2, weight 78.4 kg, body fat 17.8 %, 3 workouts this week).

Sections, in the order a person meets them on the new Home ("simple
first, deeper later"):

1. **Hero** — A (two tiles), B (wide tile + fixed strip), B2 (sparkline
   strip), and **C**: one status sentence in the big light type
   ("3 things to fix. Body on track this week.") over three small
   tonal tiles: *Body* (today: steps · exercise · sleep), *Blood* (last
   draw: 26 markers · 19 optimal · 7 off, as a three-segment bar),
   *Plan* (4 actions · 11/14 days done). Each tile is a link into its
   layer.
2. **Body today** (Apple Health): the day tile (steps with a ruler to
   the person's 90-day median, exercise minutes, stand hours as 12
   small ticks); **recovery** tile (RHR, HRV, sleep in one row, each
   with a tiny 14-day dot run and an arrow word "steady / better /
   worse vs 90 d"); **workouts** week strip (7 columns, bar height =
   minutes, a small type glyph: run / strength / walk / cycle, the
   week's total and "3 of 3 planned"); **sleep** card (14 nights as
   thin rounded bars, the mean line, wrist-temp deviation as a soft
   band); **body** (weight, body fat, waist each on a mini ruler with
   the ghost "was" dot); **VO₂max** ruler over the age-sex bands; **BP
   / glucose from the phone** with the same ruler as blood so the eye
   learns one thing; a "last sync 2 min ago · 25 types" quiet line.
3. **Blood**: last-draw summary (date, n markers, three-segment bar);
   **markers grid** (every marker a compact card: name, value in big
   light mono, unit small, a 60 px mini ruler, status word coloured);
   **marker detail** (the full ruler from home-v3 + history dots on a
   dated axis + the projected target pace zone + the sentence);
   **draws** (dated list with marker chips: keep it, restyle);
   **Next draw** tile (in 12 wk · 4 markers planned · "Plan more");
   **upload / capture** entry (one quiet card: "Drop a PDF or a photo
   of a result", the + button's home); **source** tag (lab · phone ·
   photo) as a tiny glyph on the value.
4. **Conditions**: the ledger card from home-v3, plus a **compact row**
   variant (state word · title · % · driver · chevron) for the list
   below the top card; **For / Against** as two quiet columns with the
   evidence glyphs; three ways to show likelihood side by side (big
   number · thin ring · short bar) with a recommendation; the quiet
   action row (Not right · Discuss · Not for me · Did it today);
   "**You're already doing this since Aug 12**" state; a **test
   bubble**-style card for an unmeasured test ("CAC score would settle:
   43 % → 20 % if 0, → 70 % if > 100 · ask your doctor").
5. **Systems**: the pill list from home-v3 plus a **sidebar** variant
   (left rail with system · status word, the inspiration's layout) and
   a **grid of small tonal tiles** variant; pick one per breakpoint.
6. **Plan**: the **action card** (title, dose, glyph with grade,
   started date, 14-day habit dots, "Did it today" tick that fills a
   dot); **adherence** tile; **outcome** card ("Selenium · 12 weeks ·
   TPO 320 → 280, the change you were promised was −15 %: on track");
   the **retest goal** row with its date and the markers; "Add all"
   and undo toast restyled as a pill at the bottom.
7. **Person**: the **Today question** as a pill with quick answers
   (Yes · No · Not sure) and the counter ("2 of 5 worth answering");
   **you said** chips with dates; **facts** as a quiet key-value list
   with an edit affordance; **life events** as a dotted timeline (the
   same dot language as the hero strip).
8. **Ask**: the pill (idle · typing · asking with a spinner in the
   pill · answered), the **answer block** (prose with inline glyphs,
   "Right now: Hashimoto's — confirmed, 95 %" row, **Sources** line as
   small chips "Wichman 2016 · B", **Act on it** chips: Add · Plan
   retest · Answer · Ask your doctor with copy), "Ask another".
9. **Knowledge**: **trend / claim card** with the four freshness classes
   as small coloured words (contested · horizon · pooled · guideline)
   and the sardines example ("Sardines 3×/week · horizon · E · omega-3
   and calcium; nothing pooled yet"); **genome** rows (gene · rsid ·
   genotype · effect glyph · one line of what it changes for you);
   **food** meal card from a photo (thumbnail, items, kcal, protein,
   "added to Aug 31") and the day macro rulers; a **bubbles** teaser
   (three tonal circles sized by likelihood, linking to /graph).
10. **Shell**: the top nav as tonal pills, the floating **+** (capture)
    button, theme toggle, a **mobile tab bar** (Home · Body · Blood ·
    Plan) and the 390 px Home stacked in the new order: hero C →
    Body today → Blood summary → top condition → Plan → Ask pill fixed
    at the bottom.
11. **Dark**: the whole sheet has a dark toggle (one class on
    `<html>`); screenshot Home and the Body and Blood sections dark.

## 3. `docs/mockups/side-by-side.html`

Three columns, same width, same content (the test user):

- **Now**: the real screenshot `docs/mockups/ref/now-home-dark.png`
  (and `now-plan-dark.png` lower) as images, cropped to the section
  being compared.
- **Now + new elements**: the current dark canvas, current type and
  spacing, with only the new pieces swapped in: the ruler instead of
  the range bar, glyph chips instead of brackets, systems as pills, the
  hero tiles in the current palette (no warm grey). This is the "keep
  the design, upgrade the parts" path.
- **v3**: the new surface (warm grey light, tonal panels, big light
  numbers) for the same sections.

Rows: hero · systems · one ledger card · one marker (range bar vs
ruler) · plan action · ask answer. Under each row one line: what
changes and what it costs (reuse the cost notes' style).

## 4. Constraints (unchanged from 28b, plus)

- No decorative data anywhere. If a number is illustrative it says so
  once in a footnote, and its shape is the real one (steps are
  integers, HRV in ms, sleep in h min).
- Type families and mono-for-numbers stay. One accent per screen.
- Everything is CSS/SVG; no chart library. The sparkline and dot runs
  are inline SVG polylines/circles.
- Do not touch `apps/`. `home-v3.html` gets only the strip fix (§0)
  and the shared stylesheet extraction.
- Screenshots: every section of `elements-v3.html` at 1440 (light and
  the dark ones named in §2.11), the 390 px Home, and each row of
  `side-by-side.html`, to `/tmp/p28b2/`, named by section.
- Report: the file list, the screenshot list, and for each place where
  two or three variants exist, one sentence recommending one and why.
