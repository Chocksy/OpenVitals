# Phase 23: the iOS companion — HealthKit for all we can take, and the camera as an input

Owner ask (2026-09-01): "we do health app data for all we can take. and
we add a front for uploading a photo and analyzing with ai to add food
and such." The phone is the capture organ; the web app stays the
viewing organ. Two halves: the server endpoints in `apps/simple`
(deployable independently), and the SwiftUI app in `apps/ios`.

## 1. What the app is (and is not)

Three tabs, nothing more:

1. **Today** — a webview of the deployed site (the responsive Home with
   the Today card and the composer already works on 390 px). Native
   chrome, shared auth cookie.
2. **Capture** — camera / photo picker. A photo goes up, chips come
   back, one tap confirms. Food plates, supplement labels, lab sheets,
   a doctor's letter — one flow.
3. **Sync** — what HealthKit has sent, when, and any type the user has
   not granted yet.

Not in scope: native charts, native plan, notifications (later), Android.

## 2. HealthKit: all we can take

Read authorization for every type the engine can use, synced with
`HKAnchoredObjectQuery` per type (anchors persisted on device) and
background delivery (`HKObserverQuery` + the entitlement) so data flows
without opening the app:

| HealthKit type                                                                                                                     | lands as                                                                                                | cadence                |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------- |
| steps, activeEnergy, exerciseMinutes, standHours                                                                                   | `daily_logs` aggregates                                                                                 | daily                  |
| restingHeartRate, heartRateVariabilitySDNN, respiratoryRate, oxygenSaturation, walkingHeartRateAverage, heartRateRecoveryOneMinute | `readings` (code per metric, unit mapped), one representative value per day (the day's resting/median)  | daily                  |
| sleepAnalysis (stages)                                                                                                             | `daily_logs` sleep duration + a `readings` row for `sleep_duration`; stages kept in the daily log jsonb | daily                  |
| vo2Max                                                                                                                             | `readings` `vo2max_est`                                                                                 | when it changes        |
| bodyMass, bodyFatPercentage, waistCircumference                                                                                    | `readings` (weight, body_fat_pct, waist_cm) + `waist_cm` profile fact refresh                           | when logged            |
| bloodPressureSystolic/Diastolic                                                                                                    | `readings` bp codes                                                                                     | when logged            |
| bloodGlucose (CGM or meter)                                                                                                        | `readings` glucose with `flags: ["self_reported","healthkit"]`                                          | as it arrives, batched |
| appleSleepingWristTemperature                                                                                                      | `readings` wrist_temp (new metric, reference from Apple's relative baseline)                            | daily                  |
| menstrualFlow / cycle tracking                                                                                                     | `profile_facts` cycle keys via the existing fact path                                                   | when logged            |
| mindfulSession                                                                                                                     | `daily_logs` habit tick if a matching habit exists                                                      | daily                  |
| dietaryEnergy/macros (when another app writes them)                                                                                | `daily_logs` nutrition                                                                                  | daily                  |

Anything HealthKit has that maps to nothing yet is listed in the Sync
tab as "seen, not used" so the owner can ask for it later — take all,
use what we can, hide nothing.

**Server**: `POST /api/sync/healthkit` — batched samples
`{ type, unit, value, start, end, sourceBundle }[]`, authenticated with
the better-auth session (the webview shares the cookie; the native
layer stores it). Server-side mapping table HealthKit type → metric
code + unit conversion (one pure `lib/healthkit.ts`, tested), daily
aggregation server-side (the phone sends raw samples; the server owns
the arithmetic — principle 3 applies to phones too). Dedupe on
`(user, code, day, source)` upsert. Wearable rows carry
`source: "healthkit"` and never overwrite a lab draw. The engine's
tier-0 vectors (resting HR, sleep, HRV, steps) go from "never measured"
to living values, which is the whole point.

## 3. The camera front: photo → chips → facts

`POST /api/capture` — a photo plus an optional caption. One vision LLM
call (documents.ts pattern: closed schema, confidence, the model never
writes directly) classifies and extracts:

- **meal**: items with estimated portions → kcal, protein, carbs, fat,
  each with a confidence and the honest label "estimate" — lands in
  `daily_logs` nutrition after confirmation. A meal photo at 21:40 also
  offers the `last_meal_hour` fact chip ("dinner at 21:40?" — the
  conditional edges already read it).
- **supplement or medication label**: name, dose → `supplements` /
  `medications` fact chips (changed, dated today).
- **lab sheet photo**: routed to the existing extract/OCR upload path
  unchanged — do not rebuild it.
- **anything else medical** (letter, device screen): routed to the
  existing documents path.

The reply is the same chip UX the composer taught: dashed chips, tap to
fix, confirm to write. Everything confirmed goes through the existing
writers (`writeFact`, daily logs, uploads) so history, revisit cadence
and beliefs all just work. The Capture tab renders the chips natively;
the same endpoint also powers a web "+ photo" button in the composer
modal, so Ramona's laptop gets it too.

Precision honesty: food numbers are estimates and are labelled so in
the UI and stored with `estimated: true`; the engine treats nutrition
as context (graph edges, confounders), never as evidence rules.

## 4. The app itself (`apps/ios`)

SwiftUI, iOS 17+, no third-party packages (URLSession, HealthKit,
PhotosUI, WKWebView). Structure: one Xcode project generated by
`xcodegen`? No — ponytail: a plain checked-in `.xcodeproj` with three
views, an `Api.swift` (session cookie + the two endpoints), a
`HealthSync.swift` (types list, anchors in `UserDefaults`, batching),
`Capture.swift`. Sign-in: a webview to the site's login that hands the
session cookie to the native store (better-auth cookie), no custom
token flow.

Build verification: `xcodebuild -scheme OpenVitals -destination
'generic/platform=iOS Simulator' build` must pass on this Mac (Xcode is
installed). HealthKit itself cannot be exercised in CI; the simulator
build plus unit tests on the mapping/batching logic (XCTest, pure) are
the lock. Server-side `lib/healthkit.ts` mapping and `/api/capture`
chip extraction get vitest + one eval (`evals/capture/cases.json`: a
described meal fixture → expected chip set; no live LLM in the suite).

## 5. Order of work

1. Server half first (`lib/healthkit.ts`, `/api/sync/healthkit`,
   `/api/capture`, composer photo button, tests, evals) — after phase
   22 and 16b land, since compose.ts is in motion.
2. Deploy with the 17b cutover so the phone has a real host.
3. The SwiftUI app against the deployed host.

## 6. Verification

Server: typecheck, vitest, the capture eval, curl the sync endpoint
with a fixture batch and show the daily_logs/readings rows, screenshots
of the web composer photo flow. App: simulator build log, XCTest run,
and a photo of the Capture flow running on the owner's device once they
install it (TestFlight or direct — owner's call).
