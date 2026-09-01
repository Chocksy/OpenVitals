# Phase 24d: Home composition and motion — cause and effect you can see

From the UX audit (findings 5 and 6). Runs AFTER 24a and 24c land.
`apps/simple`. Ponytail; the two motion skills
(`~/.claude/skills/transitions-dev`, `~/.claude/skills/make-interfaces-feel-better`)
are the reference — copy their CSS verbatim, keep every
`prefers-reduced-motion` guard, no motion library.

## 1. Composition

- **Chart bug**: card 1's blank ~150 px region under the range bar
  (the trend chart does not render on the spear card in prod; caption
  "glucose, 45 draws" shows). Find and fix; a test on the data the
  chart receives.
- **Filler collapse**: consecutive "marker off" cards (audit: cards
  6–10, "Cholesterol, Total 217 mg/dL, off" with only WHY / NOT RIGHT?)
  become ONE card per system: "Lipids: 3 markers off — total
  cholesterol 217, HDL 50, LDL 131" with the markers as chips linking to
  `/m/<code>`; the WHY / NOT RIGHT? affordances become a single "…"
  menu with 40×40 hit areas.
- **Zeros line**: "Since …: 0 resolved · 0 new · 0 stronger · 0 weaker"
  is hidden when all four are zero; otherwise only the non-zero parts
  render ("since yesterday: 1 stronger").
- **Systems ring**: a system with nothing off shows a check mark, not
  "0"; the number stays for systems with a score.
- **Vocabulary**: "TIP OF THE SPEAR" → "Start here"; lens badges
  `ENERGY B · WEIGHT A · LIFESPAN A` → one muted line "matters most for
  lifespan (A)"; "each one changes a conclusion" already removed in 24a.
- **Interface checklist**: `tabular-nums` on every percentage and
  counter; `text-wrap: balance` on card titles; concentric radii on
  nested cards (outer = inner + padding); scale 0.96 on press for
  buttons; hit areas ≥ 40 px for every small link (This changed / I was
  wrong / WHY / NOT RIGHT? / Fit / lens tabs).

## 2. Motion, mapped to moments

Install `_root.css` tokens once into `globals.css`. Then:

| Moment                                   | Transition (transitions-dev file)                                                         | Where                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| a belief % changes after an answer       | number pop-in (02)                                                                        | cockpit %, card %, graph panel %                                 |
| a state chip flips                       | text states swap (04)                                                                     | LIKELY/POSSIBLE/RISK chips                                       |
| ledger cards reorder                     | card resize (01) + FLIP reorder via View Transitions API if available, else CSS transform | Home ledger                                                      |
| fact saved / chip confirmed              | success check (10) inside the button, toast (22) after                                    | AnswerQuestion, composer                                         |
| Today card advances to the next question | panel reveal (07)                                                                         | Today card                                                       |
| composer chips appear                    | texts reveal (18), 40 ms stagger; dashed→solid via icon swap (09)                         | composer                                                         |
| lens / tab switch                        | tabs sliding (16), ONE pill                                                               | Home lenses, Labs tabs, Graph lenses (replace the double toggle) |
| data pages first paint                   | skeleton reveal (14); no enter animation on plain navigation afterwards                   | Home, Graph                                                      |

The important behavioural change: **answering a question on the Today
card does not reload the page**. `/api/facts` already returns; the
client re-fetches the ledger payload (add a small `GET /api/ledger`
that returns the same model Home renders) and applies the diff with the
transitions above: numbers pop, chips swap, cards move. The person sees
what their answer did. Keep it interruptible (CSS transitions, exact
`transition-property`).

## 3. Locks

- Pure tests for the ledger-diff helper (which cards moved, which
  numbers changed).
- A test that every installed transition snippet has its
  `prefers-reduced-motion` block (grep the CSS in a vitest).
- Visual: screenshots before/after answering the Today question on the
  test user, plus a short screen recording if `ab` supports it
  (`ab record`), to `/tmp/p24d/`.

## 4. Verification

typecheck, vitest higher, `eval:journeys` 25/25, the screenshots, and a
table of every checklist change in the make-interfaces format
(Before | After, grouped by principle).
