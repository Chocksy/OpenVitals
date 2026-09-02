# 30d addendum: what a reader trips on, read off the desktop Home on 2026-09-02

Read as the owner's wife would: no engine vocabulary, wants to know what is
wrong, how sure we are, and what to do. Each item says what is on screen and
what it must become. Every one of these is in scope for slice 30d.

## Wrong or leaking numbers

1. Under every conclusion card the old range bar prints its scale ends as if
   they were readings: "320 IU/mL · -12.24 · normal 0–34 · optimal 0–9 · 320
   IU/mL", "38.08 U/L" under ALT 34, "222.2 ng/mL" under ferritin 22, "109.72
   ng/mL" under vitamin D 19. A reader sees a second value. The shared Ruler
   from 30c prints only: 0, the band edges, a rounded axis end, the value with
   its unit, and the "was" mark with its date. No decimals on axis ends.
2. Card 3 "Chronic inflammation: likely" argues FOR with hs-CRP 3.4 mg/L but
   draws ferritin's ruler (22 ng/mL, normal 15–150). The ruler under a card
   must be the marker the FOR line names; when the lead marker is not in the
   FOR line, draw no ruler. Add a test.
3. "On track: hba1c expected 5.26 % by 2026-11-23, retest then" prints the
   engine code and an ISO date. Names go through `explainKey` (HbA1c), dates
   print as "Nov 23 2026", everywhere on the page.

## Sentences that do not read

4. "matters most for energy (grade A)" is the lens weight, and nobody reads
   it that way. Print "weighs most on energy · evidence A" with the grade
   glyph, per the system page's state row.
5. Action titles glue the dose on: "Selenium 200 µg/day as selenomethionine
   for 6 months200 µg · capsule · once daily…". Title on one line, the dose
   line under it in `.t-meta`, once. Never repeat the dose the title already
   has (parked from 28a, now in scope).
6. Action targets print engine grammar: "tpo antibodies down → <100 IU/mL,
   measure after 24 weeks", "alt down → <25 U/L", "vitamin d up → 45 ng/mL",
   and for a non-numeric test "thyroid ultrasound up → no nodules or
   documented baseline". Print: "aim: TPO antibodies under 100 IU/mL ·
   retest in 24 weeks". For a non-numeric target: "aim: no nodules, or a
   documented baseline · in 4 weeks". Names through `explainKey`, direction
   words are "under", "over", "to" (a range), never "up →" / "down →".
7. "dihydromyricetin ● A · alt down" is a bare supplement with no dose, no
   sentence and a grade A that is under review. An action with no dose line
   and no sentence does not render on Home; it goes to Plan's horizon shelf
   with its evidence chip. Add a test for the rule.
8. The evidence glyphs ◐ and ● stand alone on most actions. A glyph without
   its letter tells a reader nothing. Every glyph carries its grade letter
   and a `<Term code="grade">` tooltip, per `EvidenceChip`; the legend line
   "● trial · ◐ observational · ○ anecdote" appears once at the top of the
   ledger.

## Too many controls

9. Each card ends with Add ×n, "Add 3 to your protocol", Doctor's note, Not
   for me, Discuss, Why?, Something's off?: seven controls. The system page's
   ConclusionCard anatomy has: the what-to-do rows each with one quiet Add,
   one ink "Add all n", then a text row "Not for me · Discuss", and the why
   disclosure. "Doctor's note" moves inside the why disclosure as the copy
   button. "Something's off?" becomes a link inside the same disclosure.

## Layout

10. Desktop: the navy Status card spans two rows with an empty middle. Per
    `home.html` and `system.html` section 07, Status is one row tall on
    desktop; Body, Blood and Plan sit beside it; the twelve systems appear
    once, as the state tiles section under the ask pill, not as rail cards
    AND chips. On the phone the rail keeps the system cards and the chips
    section stays (Kite's rule: the rail hides content, the list repeats it).
11. The hero light on desktop is a hard-edged rectangle band under the nav.
    `.home-light` needs the radial mask from `system.css` (`.home-light`
    fades to nothing at its edges), and the blobs must be positioned inside
    the hero, not under the header.

## What stays because it works

The sentence at the top, the FOR / AGAINST lines with real values, the
percentage next to the state word, the "1 resolved since Sep 2" line, the
Ask pill, the systems as state, the "What improved" list with dates.
