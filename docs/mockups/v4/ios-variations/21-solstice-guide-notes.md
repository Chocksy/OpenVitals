# Solstice: a daily guide

Evolution of study 19. The original circle and food illustrations remain. Study 21 adds plan completion, sleep context, goals, and one relevant next step.

## What to try

- Select a complete, partial, rest, or future day. Past days are sample history and read-only.
- Sync the demo workout. Two weekly workouts become three, and the strength action completes once.
- Confirm vitamin D, answer “Not yet,” or skip. Only confirmation completes the adopted action.
- Mark the dinner walk done or move it to tomorrow. Undo restores the plan; moving does not earn completion.
- Complete the remaining actions. Saturday receives a check; a rest day remains distinct from an incomplete day.
- Open “Why this suggestion?” to see source facts and timing.
- After the required steps, explore a weekly food suggestion. Today’s sardines suppress another fish reminder.
- Save a meal idea for tomorrow. The future day displays it as planned, not eaten.
- Open the sleep source and report how rested you feel. A low-rest answer softens the walk suggestion.
- Switch between LDL, demo weight, and weekly consistency. Scenario inputs change the illustrative trajectory, not measured values.
- Add, edit, scale, delete, or undo a meal using the existing capture flow.

## Data and boundaries

The sample day remains September 5, 2026. Initial actions: breakfast and steps complete, dinner walk and supplement open, strength pending sync. Daily completion counts adopted actions due that day. Rescheduling reduces due actions but does not increase completed actions. Skipped supplements remain incomplete.

Sleep is measured duration, not an inferred quality score. Weight 84.2 kg and the 80 kg target are demo values. LDL measurements remain 168 mg/dL on December 9, 2025 and 131 on August 1, 2026. The LDL scenario reuses study 19’s illustrative arithmetic. Weight uses `84.2 - 2.4 × consistency` over eight weeks for demonstration. Neither model provides clinical predictions.

Genetic context is grounded in `apps/ios/Tests/Fixtures/genome.json`: APOE e2/e3, imported August 28. Genetics is background context, not daily points or a reason to alter supplement dosing. Missing preferences are not fabricated. The sample food week contains only the displayed meal records; incomplete logging is acknowledged.

Food suggestions follow the distinction between [weekly fish for heart health](https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/fats/fish-and-omega-3-fatty-acids) and [dietary patterns for cholesterol management](https://www.heart.org/en/health-topics/cholesterol/prevention-and-treatment-of-high-cholesterol-hyperlipidemia/cooking-to-lower-cholesterol). A fish meal is not presented as a guaranteed LDL reduction.

These are local browser prototypes. Apple Health syncing, parsing, voice, and camera are demonstrations. No hardware, account data, or production services are accessed. Existing food illustrations are reused; generating them from actual meals remains implementation work.

## Verification

Browser checks passed for sync idempotence, supplement skip/Undo/confirmation, day completion, historical dates and read-only browsing, rescheduling and restoration, source explanations and modal keyboard handling, sleep check-ins, scenario controls, capture, portions, meal editing, delete confirmation, and separate meal/plan Undo transactions.

Checked 320, 390, 768, 1024, and 1280-pixel layouts, light/dark themes, and reduced motion. No horizontal overflow, browser exceptions, or failed assets were found. Screenshots and the executable verification script are in `/tmp/solstice-guide/`.

The lower-cost builder hit a workspace spend cap and left an incomplete draft. The overnight continuation started but timed out. Codex completed the design locally by restoring the tested capture foundation and rebuilding the guidance interactions. No independent critic score is claimed.
