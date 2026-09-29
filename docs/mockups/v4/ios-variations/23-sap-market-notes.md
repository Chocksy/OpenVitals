# Market notes for round eight (Sap), 9 Sep 2026

Sources: appllama.io free tier (Health & Fitness list sorted by revenue, site search),
App Store screenshots through the iTunes lookup API (`ref/appstore-*.jpg`, `ref/appstore-apps.json`).

## Appllama

- 1,128 apps, 375 in Health & Fitness, 49,000 screens. Free tier: welcome screen for every app,
  onboarding/home/in-app flows for 2 apps, list capped at 21 rows, revenue masked.
- Pro is $10/month (offer ends 10 Sep 09:01, then $16). Pro includes the MCP (1,500 credits/month):
  connector `https://mcp.appllama.io/mcp`, skills `npx skills add appllama/appllama-skills`.
- In the library: WHOOP, Oura, Bevel, ZOE, Welltory, Cronometer, MacroFactor, Cal AI, Yazio,
  MyNetDiary, MyFitnessPal, Athlytic, Gentler Streak, Grow, BetterMe, Lumen (no).
- Not in the library: Function Health, Superpower, Merios, InsideTracker, Ultrahuman.
- Top-revenue health apps by name: Strava, MyFitnessPal, Flo, LADDER, AllTrails, Cal AI, Foodvisor,
  Headspace, BetterMe, Bevel, Calorie Counter+, MyNetDiary, Clue, Yazio, komoot, Runna, Calm,
  MacroFactor, Peloton.

## What the App Store screenshots show

Labs (`appstore-labs.jpg`)
- Function: "148 biomarkers · 125 in range · 16 out · 7 other" as one stacked bar; categories with
  counts (Pancreas 2, Kidney 8, Liver 9); AI chat that compares this draw with the last; dated
  clinician notes with a Summary and Strengths list.
- Superpower: one score 82/100 plus a biological age card; a goal card "Lower cholesterol to
  improve heart health" with health impact, recovery time (8 weeks) and priority; one recommended
  product under it.
- Merios: score 88/100; all markers as a grid of small coloured squares; "Connected to Apple Health";
  scan a lab PDF; four pillars, one score.
- Bevel: Today with three percentages (Active, Recovery, Sleep), a Stress & Energy section, sleep
  stages; six tiles (Fitness, Recovery, Stress, Sleep, Nutrition, Cycle).

Wearables (`appstore-wearables.jpg`)
- WHOOP: three rings (Sleep 75 %, Recovery 85 %, Strain 14.2), each with the metrics that made it
  and one sentence of advice.
- Oura: Readiness 88 with "Go get 'em"; Symptom Radar "No signs"; Body Clock "Aligned"; a narrative
  card ("Rising heart health, with a dip in stress management").
- Ultrahuman: arc scores 91/87/92, sleep architecture, "Golden hour", next best actions.
- Welltory: Battery 65 % as the headline, a day-long battery chart with a forecast, a stress-coping
  curve with "reduced −12 %". Closest to Sap's energy trace; Sap differs by the check-ins, the plates
  on the line and the blood floor.

Food (`appstore-food.jpg`)
- ZOE: diet quality gauge (60), plants this week 10/30, photo-first logging, gut-health framing.
- MacroFactor: expenditure trend, "log foods faster", snap foods with AI.
- Cal AI: calories-left ring plus three macro rings, scanner, weekly stacked bars.
- Cronometer: 95 micronutrient target bars, "lab-analysed data" trust line.

Recovery (`appstore-recovery.jpg`)
- Lumen: breath-based fuel (fat 80 % / carbs 20 %), "fuel up before your workout", Flex score 15.7.
- Gentler Streak: body metrics tiles, wellbeing narrative, illustrated character, "processed
  on-device, no accounts, no servers".
- Athlytic: Recovery 100 % "Ready to train"; "What's driving it": HRV and RHR against the 60-day
  baseline; exertion target for today.

## Ideas none of the 23 variations have yet

1. Every marker against your own baseline, not the population range (Athlytic, WHOOP): "HRV 44,
   68 % vs your 60-day average".
2. A goal card per off marker with impact, time to expect change and priority (Superpower).
3. All 52 markers as one grid of squares you can read at a glance (Merios, Function's stacked bar).
4. An illness or off-day radar from Apple Health vitals: "no signs" until there are (Oura Symptom
   Radar).
5. A plants-per-week counter next to protein and fibre (ZOE).
6. A one-line privacy promise on the welcome screen (Gentler Streak).
