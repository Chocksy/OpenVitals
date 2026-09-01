# Phase 25a: regressions from phase 24, fixed first

Owner review of phase 24 (2026-09-01, with screenshots). These are
breakages, not taste; they are in production. `apps/simple`. Ponytail.

1. **"Add to protocol" crashes the page** (`NotFoundError: Failed to
execute 'removeChild' on 'Node'`). Root cause verified:
   `components/ledger-motion.tsx` mutates React-owned DOM
   (`group.replaceChildren()`, `appendChild(span)` for the digit pop-in;
   the FLIP reorders nodes by hand). On React's next commit the tree no
   longer matches. Fix: **no imperative mutation of React-owned nodes,
   ever.** Digits pop-in: render digit spans from state with a `key`
   that changes when the value changes so React remounts them with the
   animation class. FLIP: measure previous rects in a ref, let React
   reorder by `key`, apply the inverse transform in `useLayoutEffect`
   and release it next frame (standard React FLIP). Text swap: state,
   not DOM. Lock: a vitest that greps `components/**` for
   `replaceChildren|appendChild|insertBefore|removeChild|innerHTML` and
   fails on any hit outside an allowlist (which should be empty); manual
   repro: answer a Today question, then "Add to protocol" on any card,
   then "Not for me" — no overlay error, network 200s.
2. **Bubbles do not react to clicks** ("I need to click a specific
   place; everything moves with it"). The pan handler swallows taps.
   Fix: select on `pointerup` when total movement < 6 px, pan only after
   the threshold; `setPointerCapture`; make sure no `.hit-40`
   pseudo-element or overlay sits above the SVG. Verify with `ab click`
   on a bubble centre and on its label → panel switches.
3. **"Answer →" dead end.** Links go to `/#today-question` but the
   Today card shows only its own top question, so a link from /plan
   ("Do you smoke?") lands on a card asking something else. Fix: the
   link carries the key (`/?ask=smoking#today-question`); the Today
   card renders the requested question first (with its effect line),
   then continues its normal list. Test in `asking.test.ts` and a
   manual repro from /plan and from a ledger card.
4. **Still-true re-asks show raw keys** ("Still yes? SYM COLD",
   "CONDITIONS"). Fix: render the original question text with the held
   answer: "Do you still have cold hands and feet, or feel cold when
   others do not? · you said Yes" with buttons "Still yes / Changed /
   Not now"; list facts (conditions) read "Still: Non-alcoholic fatty
   liver disease?" with the human name. Never a key on screen. Lock: a
   test that every `dueFacts` row has a `question` string from
   `PROFILE_QUESTIONS`/`SYMPTOMS`, and the component never prints
   `key`.
5. **Discuss mini-chat swallows the answer** ("asking… loading… then
   it went away, nothing showed"). Find it (the per-card Discuss box;
   likely the ledger diff/refresh unmounting the box or the stream
   state being reset). Fix so the streamed answer appears under the
   card and stays until closed; it must survive the in-place ledger
   update. Manual repro with a real question, screenshot.
6. **"Not for me" gives no feedback** (prints a mono "NOT FOR ME"
   label). Fix: toast "Hidden from your plan · undo", card collapses
   with the panel-reveal exit, counter updates; undo restores.
7. **Ask box rejects questions** ("how can I make sure I do not get
   T2D?" → "Nothing in HPO or MONDO matches that"). Fix: route by
   intent. A term → the existing lookup. A question (contains `?` or
   starts with how/what/why/should/can/is/do) → a grounded answer:
   `chatContext(userId)` + the ledger's current conclusions + the
   lookup result for any disease named, one LLM call, 2–4 plain
   sentences, followed by the engine's "what would move it" list for
   the named condition when there is one. The no-match copy becomes
   "I don't know that word. Ask it as a question, or try the disease
   name." Lock: a unit test for the intent router; a compose-style
   eval with 6 inputs (3 terms, 3 questions) asserting the route.
8. **Counter inconsistency**: "Questions worth answering" must update
   on every answer path (Today question, Still-true confirm/skip/
   changed, card Answer flows). Lock: ledger-diff test covers the
   `StillTrue` paths.
9. Small: hide "was likely → likely (+8 pts)" when the state word did
   not change (show "+8 since yesterday" instead); dedupe and humanise
   the "Never measured" list (no `amh`, `shbg`, duplicate Testosterone);
   the `optimal …-20` truncation shows the real bound.

Verification: typecheck, vitest (1082 baseline, higher), eval:journeys
25/25, eval:compose 14/14, the new intent eval, screenshots to
`/tmp/p25a/` for each numbered item's repro (before is in the owner's
screenshots), then the main agent pushes as a hotfix.
