"use client";

import { CmdHeader } from "./_components/cmd-header";
import { ActionQueue, type ActionItem } from "./_components/action-queue";
import {
  WorkstreamPanel,
  type Workstream,
} from "./_components/workstream-panel";
import { LiveProcesses, type AgentProcess } from "./_components/live-processes";
import {
  WeeklyReview,
  type WeeklyReviewData,
} from "./_components/weekly-review";
import { QuickDispatch } from "./_components/quick-dispatch";
import { ActivityFeed, type ActivityEvent } from "./_components/activity-feed";

// ---------------------------------------------------------------------------
// Mock data — replace with real data sources
// ---------------------------------------------------------------------------

const WORKSTREAMS: Workstream[] = [
  {
    id: "docuflow",
    name: "DocuFlow",
    status: "active",
    summary:
      "Automated document processing pipeline. PDF ingestion, entity extraction, structured output via custom ML models.",
    currentBlocker:
      "Enterprise pilot onboarding — 3 accounts in staging, need sign-off",
    lastAction:
      "Deployed v2 extraction model, integrated into monorepo via @repo/extract-client",
    nextStep:
      "Push pilot accounts to production; evaluate Tika vs managed APIs for format conversion",
    updated: "2026-03-27",
  },
  {
    id: "lattice",
    name: "Lattice",
    status: "active",
    summary:
      "Developer collaboration platform. Real-time code review, async standups, PR analytics dashboard.",
    currentBlocker:
      "Growth strategy — targeting mid-market engineering teams, 50-200 engineers",
    lastAction:
      "Shipped PR analytics v1, integrated GitHub and GitLab webhooks",
    nextStep: "Launch waitlist campaign; finalize pricing tiers for team plans",
    updated: "2026-03-27",
  },
  {
    id: "arcwise",
    name: "Arcwise",
    status: "building",
    summary:
      "Web-based workflow builder. Event-driven execution engine on Postgres. Sandboxed step runners, webhook triggers.",
    currentBlocker:
      "Architecture solidification — execution engine design + step isolation model",
    lastAction:
      "Designed webhook authentication and step sandboxing architecture",
    nextStep:
      "Finalize Postgres schema, build first-party workflow templates to prove the platform",
    updated: "2026-03-26",
  },
  {
    id: "healthkit",
    name: "HealthKit",
    status: "building",
    summary:
      "Open-source personal health data aggregator. Clean dashboard UI. Targeting quantified-self users.",
    currentBlocker:
      "Needs initial architecture decisions — data model, integrations, MVP scope",
    lastAction: "Building command center for operations dashboard",
    nextStep: "Spec out data model and pick first 2-3 wearable integrations",
    updated: "2026-03-27",
  },
  {
    id: "tutorbase",
    name: "TutorBase",
    status: "running",
    summary:
      "AI tutoring platform used by school districts. Stable, generating revenue.",
    currentBlocker: "None — stable, generating revenue",
    lastAction: "Ongoing maintenance",
    nextStep: "Monitor usage, explore expansion opportunities",
    updated: "2026-03-25",
  },
];

const ACTIONS: ActionItem[] = [
  {
    id: "a1",
    type: "approval",
    workstream: "DocuFlow",
    title: "Approve Tika integration PR",
    description:
      "Agent completed format conversion pipeline refactor. 12 files changed, tests passing.",
    agent: "claude-code",
    priority: "high",
    createdAt: "2h ago",
  },
  {
    id: "a2",
    type: "question",
    workstream: "Arcwise",
    title: "Step schema: flatten or nest trigger fields?",
    description:
      "Need direction on whether trigger metadata should be top-level or nested under a trigger object in the Postgres schema.",
    agent: "claude-code",
    priority: "medium",
    createdAt: "4h ago",
  },
  {
    id: "a3",
    type: "alert",
    workstream: "TutorBase",
    title: "Usage spike: 2.3x normal for Lincoln USD",
    description:
      "Abnormal usage pattern detected. May indicate viral adoption or a bot. Worth investigating.",
    agent: "monitor",
    priority: "low",
    createdAt: "6h ago",
  },
];

const PROCESSES: AgentProcess[] = [
  {
    id: "p1",
    name: "Enterprise prospect research",
    agent: "research-agent",
    workstream: "DocuFlow",
    status: "running",
    progress: 67,
    startedAt: "14:32",
    duration: "23m",
    lastOutput: "Analyzing enterprise document compliance requirements...",
  },
  {
    id: "p2",
    name: "Competitor landscape analysis",
    agent: "claude-code",
    workstream: "Lattice",
    status: "running",
    progress: 34,
    startedAt: "14:45",
    duration: "10m",
    lastOutput: "Compiling feature comparison matrix for dev tools market...",
  },
  {
    id: "p3",
    name: "Extraction model benchmark suite",
    agent: "test-runner",
    workstream: "DocuFlow",
    status: "completed",
    startedAt: "13:00",
    duration: "47m",
    lastOutput: "All 23 test cases passed. Model accuracy: 94.2%",
  },
  {
    id: "p4",
    name: "Postgres schema migration draft",
    agent: "claude-code",
    workstream: "Arcwise",
    status: "queued",
    startedAt: "—",
  },
];

const WEEKLY_REVIEW: WeeklyReviewData = {
  weekOf: "Mar 23",
  workstreamUpdates: [
    {
      workstream: "DocuFlow",
      movement: "forward",
      summary: "v2 extraction model deployed, 3 enterprise pilots in staging",
    },
    {
      workstream: "Lattice",
      movement: "forward",
      summary: "PR analytics shipped, GitHub + GitLab integrations live",
    },
    {
      workstream: "Arcwise",
      movement: "neutral",
      summary: "Architecture design phase, no shipping this week",
    },
    {
      workstream: "HealthKit",
      movement: "forward",
      summary: "Operations dashboard built, design system locked in",
    },
    {
      workstream: "TutorBase",
      movement: "neutral",
      summary: "Stable revenue, no changes needed",
    },
  ],
  highestLeverage:
    "Close the DocuFlow enterprise pilots — converting 2 of 3 validates the GTM motion for Q2",
  highestLeverageWorkstream: "DocuFlow",
  keyDecisions: [
    "Prioritize enterprise pilots over new features for DocuFlow",
    "Defer Arcwise shipping until Postgres schema is validated with real workflows",
    "HealthKit: clean dashboard direction confirmed, building ops view first",
  ],
};

const ACTIVITY: ActivityEvent[] = [
  {
    id: "e1",
    type: "dispatch",
    title: "Dispatched enterprise prospect research",
    workstream: "DocuFlow",
    timestamp: "14:32",
  },
  {
    id: "e2",
    type: "complete",
    title: "Extraction benchmark suite completed — 94.2% accuracy",
    workstream: "DocuFlow",
    timestamp: "13:47",
  },
  {
    id: "e3",
    type: "commit",
    title: "feat: add webhook auth + step sandboxing",
    workstream: "Arcwise",
    timestamp: "12:15",
  },
  {
    id: "e4",
    type: "chat",
    title: "Discussed execution engine design tradeoffs",
    workstream: "Arcwise",
    timestamp: "11:30",
  },
  {
    id: "e5",
    type: "dispatch",
    title: "Dispatched competitor landscape analysis",
    workstream: "Lattice",
    timestamp: "10:45",
  },
  {
    id: "e6",
    type: "alert",
    title: "Usage anomaly detected for Lincoln USD",
    workstream: "TutorBase",
    timestamp: "09:20",
  },
  {
    id: "e7",
    type: "commit",
    title: "fix: extraction timeout on large PDFs",
    workstream: "DocuFlow",
    timestamp: "Yesterday",
  },
  {
    id: "e8",
    type: "report",
    title: "Weekly review generated",
    workstream: "All",
    timestamp: "Yesterday",
  },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CommandCenterPage() {
  const activeWorkstreams = WORKSTREAMS.filter(
    (w) => w.status !== "paused",
  ).length;
  const runningProcesses = PROCESSES.filter(
    (p) => p.status === "running",
  ).length;

  return (
    <div className="px-4 md:px-6 lg:px-8 py-6 max-w-350 mx-auto">
      {/* Header + status strip */}
      <CmdHeader
        activeCount={activeWorkstreams}
        pendingActions={ACTIONS.length}
        runningProcesses={runningProcesses}
      />

      {/* Main grid: left column (primary) + right column (secondary) */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
        {/* Left column — primary content */}
        <div className="flex flex-col gap-6">
          {/* Action queue — top priority, needs your input */}
          <ActionQueue actions={ACTIONS} />

          {/* Workstreams */}
          <WorkstreamPanel workstreams={WORKSTREAMS} />

          {/* Weekly review */}
          <WeeklyReview review={WEEKLY_REVIEW} />
        </div>

        {/* Right column — secondary / monitoring */}
        <div className="flex flex-col gap-6">
          {/* Quick dispatch */}
          <QuickDispatch />

          {/* Live processes */}
          <LiveProcesses processes={PROCESSES} />

          {/* Activity feed */}
          <ActivityFeed events={ACTIVITY} />
        </div>
      </div>
    </div>
  );
}
