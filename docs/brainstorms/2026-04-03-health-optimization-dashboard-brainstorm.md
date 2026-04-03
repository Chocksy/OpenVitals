# Brainstorm: Health Optimization Dashboard

**Date**: 2026-04-03
**Status**: Ready for planning

### Design Decision
- **V3 card layout** (2-column with inline sparklines) in **light mode**
- Must use the **existing OpenVitals design system** — same colors, fonts, components, spacing
- No new design system from scratch

## What We're Building

Reshape OpenVitals from a generic medical records app into a **personal health optimization tool** centered around biomarker tracking, trend analysis, and an LLM health coach.

### Core Vision

The app serves a person who gets regular blood work (every 3-6 months) and wants to:
1. See key metabolic panels at a glance
2. Understand what changed since last blood work
3. Get actionable lifestyle suggestions from an LLM
4. Track whether they followed suggestions and measure impact

### User Profile
- Gets blood work from Romanian labs (Bioclinica, Medisim, Synlab, Synevo)
- Family use: Razvan + Ramona (wife)
- No active medical conditions — focused on optimization
- Tracks specific thresholds from metabolic health experts (Levels, Attia)

## Key Decisions

### 1. Home Page: Metabolic Panel Grid
Replace the current dashboard-of-everything with a focused panel view inspired by the user's existing Numbers spreadsheet.

**Key panels** (in priority order):
- **Metabolic**: Glucose, HbA1c, Insulin, HOMA-IR
- **Lipid**: Total Cholesterol, LDL, HDL, Triglycerides, Apo B, Cholesterol/HDL Ratio, Trig/HDL Ratio
- **Inflammation**: hsCRP, Homocysteine
- **Thyroid**: TSH, Free T3, Free T4, TPO Antibodies
- **Vitamins & Minerals**: Vitamin D, B12, Ferritin, Iron, Magnesium, Zinc

**Personal optimal thresholds** (tighter than lab ranges):
- hsCRP < 1 mg/L (some push < 0.5)
- HbA1c < 5.5% (< 5.0% even better)
- Fasting Insulin < 7 uIU/mL (optimal 2-6)
- Triglycerides < 80 mg/dL
- HDL-C > 50 mg/dL (female), > 40 mg/dL (male)
- LDL-C < 100 mg/dL (< 70 optimal)
- Total Cholesterol < 180 mg/dL
- HOMA-IR < 1
- Fasting Glucose < 90 mg/dL

**Layout**: Single scroll with sections:
1. Panel grid (latest values + trend arrow + color status)
2. "What changed" — comparison between last 2 blood works
3. Active suggestions from LLM with adherence status

### 2. LLM Health Coach (not just chat)
The AI chat evolves from a generic Q&A into a structured health coach:

- **Auto-analysis on upload**: When new blood work is processed, the LLM auto-generates a structured report (what improved, what worsened, what to try)
- **Decision tracking**: During conversations, the LLM identifies lifestyle "experiments" (e.g., "start 2g omega-3 daily") and tracks them
- **Follow-up check-ins**: When user opens the app, pending follow-ups appear ("You started omega-3 3 weeks ago — how's your adherence?")
- **Impact correlation**: When new blood work arrives, the LLM connects changes to tracked experiments ("Triglycerides dropped 18% since you started omega-3 and reduced sugar")

### 3. Correlations Page: Lifestyle Experiments
Transform from medication-centric to **decision-driven**:
- Instead of manually adding medications, experiments come from LLM conversations
- Each experiment has: description, target biomarker, start date, expected timeframe, adherence log
- When new blood work is uploaded, auto-evaluate impact

### 4. Navigation Restructure
**Primary nav** (what matters):
- Home (panel dashboard)
- Labs (biomarker detail + trends)
- Uploads (PDF management)
- AI Coach (chat + suggestions)

**Secondary nav** ("More" section):
- Reports
- Testing/Retests
- Correlations/Experiments
- Settings

**Deprioritized** (keep code, hide from main nav):
- Conditions
- Encounters
- Medications
- Sharing

### 5. Notifications (Future Task)
LLM follow-ups delivered via Telegram/WhatsApp integration. Separate implementation task.

## Why This Approach

- **Reshape, don't rebuild**: The existing code (reports, trend charts, data tables, AI chat) is solid. We're changing what's shown, not how it works.
- **Panel grid is the killer feature**: Seeing all key biomarkers in one view with color-coded status replaces the Numbers spreadsheet entirely.
- **LLM as coach, not chat**: Structured suggestions with tracking give the AI memory and purpose beyond Q&A.
- **Personal thresholds, not lab ranges**: The dynamic status system (already built) supports this — optimal ranges drive the color coding.

## Open Questions

1. **Experiment data model**: Where do LLM-suggested experiments live? New table? CEMS memory? Both?
2. **Auto-analysis trigger**: Should the auto-report be a background job (like ingestion) or a client-side AI call when viewing results?
3. **Family switching**: How to handle Razvan vs Ramona — separate accounts? Account switcher?
4. **Historical data**: Re-run existing blood work through the new auto-analysis, or only apply to future uploads?

## Implementation Order (Suggested)

1. **Home page panel grid** — biggest impact, uses existing data
2. **Nav restructure** — quick win, declutters the experience
3. **Auto-analysis on upload** — LLM report after blood work processing
4. **Decision/experiment tracking** — new data model + UI
5. **LLM follow-ups** — check-in system when user opens app
6. **Correlations reshape** — auto-evaluate experiments against blood work
7. **Notifications** — Telegram/WhatsApp integration (separate task)
