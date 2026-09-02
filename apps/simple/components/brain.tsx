"use client";

/**
 * /brain: the engine with the lid off. Pick a patient state, run the whole
 * model over it, and watch the hypotheses move as tests come back.
 *
 * The page owns no health logic. It posts a scenario to /api/brain and renders
 * what comes back. The scenario lives in the URL so a run can be linked; the
 * overlay (simulated readings, added facts, confounder tags) lives in
 * localStorage keyed by the scenario, so a reload keeps the simulation.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ChevronDown,
  Pin,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Undo2,
} from "lucide-react";
import type { ReportBody } from "@/db";
import type { BrainRun } from "@/lib/brain";
import type { Discriminator, HypothesisResult, Lens } from "@/lib/hypotheses";
import { AskBox } from "./ask-box";
import { Journeys } from "./journeys";
import { PillTabs } from "./pill-tabs";
import type { Move } from "@/lib/infogain";
import { money } from "@/lib/prices";
import type { Overlay, Scenario } from "@/lib/sample";
import type { TreeNode } from "@/lib/tree";
import { cn } from "@/lib/utils";
import type { AssertionReport } from "@/evals/assert";
import { ActionCard } from "./action-card";
import { ViewShell } from "./plan";
import { Button, Card, StateWord, type StateTone } from "./ui-kit";

export interface BrainUser {
  id: string;
  email: string;
  name: string;
}

const LENSES: Lens[] = ["lifespan", "energy", "mood", "weight"];
const KINDS = ["empty", "user", "sampled", "persona"] as const;
const MASKS = ["last_draw", "random_pct", "panels", "before_year"] as const;
const CONFOUNDER_TAGS = [
  "acute_illness",
  "post_viral",
  "heavy_training",
  "not_fasted",
  "poor_sleep",
  "acute_stress",
  "luteal_phase",
  "winter",
  "dehydration",
];

const STATE_TONE: Record<string, StateTone> = {
  ruled_out: "none",
  unlikely: "none",
  possible: "none",
  likely: "border",
  confirmed: "off",
};

const COVERAGE_TONE: Record<string, StateTone> = {
  current: "on",
  stale: "border",
  never: "off",
  "n/a": "none",
};

const TREND = { up: "↑", down: "↓", flat: "→", "n/a": "·" } as const;

const EMPTY: Overlay = { readings: [], facts: {}, confounders: {} };

/**
 * Ring 2 put diseases at one in ten million into the differential, so a
 * percentage rounded to the nearest point prints "0%" for all of them and
 * hides the thousand-fold difference between two of them.
 */
const pct = (v: number) =>
  v >= 0.005 ? `${Math.round(v * 100)}%` : `${(v * 100).toPrecision(2)}%`;

/**
 * One field of the system's form. `.field > label` already carries the label
 * voice, so the old mono-uppercase span is gone.
 */
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  );
}

/** The system's panel: a title, the run's real counts on the right, content. */
function Panel({
  title,
  right,
  id,
  children,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="panel" id={id}>
      <div className="panel-head">
        <h3>{title}</h3>
        {right ? <span className="r">{right}</span> : null}
      </div>
      {children}
    </div>
  );
}

/* ── scenario in the URL ──────────────────────────────────────────────── */

interface Query {
  kind: (typeof KINDS)[number];
  /** `empty` only: who the person with nothing measured is */
  sex: "female" | "male";
  age: number;
  userId: string;
  seed: number;
  mask: (typeof MASKS)[number];
  pct: number;
  panels: string;
  year: number;
  persona: string;
  lens: Lens;
  /** 0 = no budget; anything dearer than what is left is dropped */
  budget: number;
}

function toScenario(q: Query): Scenario {
  if (q.kind === "empty") return { kind: "empty", sex: q.sex, age: q.age };
  if (q.kind === "persona") return { kind: "persona", id: q.persona };
  if (q.kind === "user") return { kind: "user", userId: q.userId };
  return {
    kind: "sampled",
    userId: q.userId,
    seed: q.seed,
    mask: q.mask,
    pct: q.pct,
    panels: q.panels
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean),
    year: q.year,
  };
}

/* ── the page ─────────────────────────────────────────────────────────── */

export function Brain({
  users,
  personas,
  panels,
}: {
  users: BrainUser[];
  personas: string[];
  panels: Record<string, string[]>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // ponytail: every memo below hangs off primitives, never off the objects
  // React hands back. An object dep here re-runs the overlay effect on every
  // render, which is an infinite loop and a blank page.
  const search = params.toString();
  const firstUser = users[0]?.id ?? "";
  const firstPersona = personas[0] ?? "";

  const q: Query = useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      kind: (p.get("kind") as Query["kind"]) ?? "empty",
      userId: p.get("userId") ?? firstUser,
      seed: Number(p.get("seed") ?? 1),
      mask: (p.get("mask") as Query["mask"]) ?? "last_draw",
      pct: Number(p.get("pct") ?? 50),
      panels: p.get("panels") ?? "",
      year: Number(p.get("year") ?? 2024),
      persona: p.get("persona") ?? firstPersona,
      lens: (p.get("lens") as Lens) ?? "lifespan",
      budget: Number(p.get("budget") ?? 0),
      sex: p.get("sex") === "male" ? "male" : "female",
      age: Number(p.get("age") ?? 34),
    };
  }, [search, firstUser, firstPersona]);

  const set = (patch: Partial<Query>) => {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries({ ...q, ...patch }))
      next.set(k, String(v));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const key = JSON.stringify(toScenario(q));
  const scenario = useMemo(() => JSON.parse(key) as Scenario, [key]);

  const [overlay, setOverlay] = useState<Overlay>(EMPTY);
  const [run, setRun] = useState<BrainRun | null>(null);
  const [last, setLast] = useState<Map<string, number>>(new Map());
  const [pinned, setPinned] = useState<BrainRun | null>(null);
  const [trail, setTrail] = useState<{ label: string; before: Overlay }[]>([]);
  const [plan, setPlan] = useState<ReportBody | null>(null);
  const [assertions, setAssertions] = useState<AssertionReport | null>(null);
  const [busy, setBusy] = useState<"" | "run" | "plan">("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"engine" | "journeys">("engine");

  // The overlay follows the scenario, not the tab.
  useEffect(() => {
    const saved = window.localStorage.getItem(`brain:${key}`);
    setOverlay(saved ? (JSON.parse(saved) as Overlay) : EMPTY);
    setTrail([]);
  }, [key]);

  const save = (next: Overlay) => {
    setOverlay(next);
    window.localStorage.setItem(`brain:${key}`, JSON.stringify(next));
    return next;
  };

  const post = useCallback(
    async (mode: "run" | "generate", next: Overlay, lens: Lens, budget = 0) => {
      setBusy(mode === "run" ? "run" : "plan");
      setError("");
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          scenario,
          overlay: next,
          lens,
          budget: budget || undefined,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      setBusy("");
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Failed");
        return null;
      }
      return data;
    },
    [scenario],
  );

  const doRun = async (
    next: Overlay = overlay,
    lens: Lens = q.lens,
    budget: number = q.budget,
  ) => {
    const data = await post("run", next, lens, budget);
    if (!data) return;
    setLast(new Map((run?.hypotheses ?? []).map((h) => [h.id, h.score])));
    setRun(data as unknown as BrainRun);
  };

  const doPlan = async () => {
    const data = await post("generate", overlay, q.lens);
    if (!data) return;
    setPlan(data.plan as ReportBody);
    setAssertions((data.assertions as AssertionReport) ?? null);
  };

  /** Add a simulated reading, keep the newest per code, re-run. */
  const simulate = (code: string, value: number, unit?: string) => {
    const readings = [
      ...overlay.readings.filter((r) => r.code !== code),
      { code, value, unit, date: run?.today ?? new Date().toISOString().slice(0, 10) },
    ];
    void doRun(save({ ...overlay, readings }));
  };

  /** Clicking a branch is the Simulate button with the outcome filled in. */
  const takeBranch = (label: string, apply: Overlay) => {
    const next: Overlay = {
      readings: [
        ...overlay.readings.filter(
          (r) => !apply.readings.some((a) => a.code === r.code),
        ),
        ...apply.readings,
      ],
      facts: { ...overlay.facts, ...apply.facts },
      confounders: { ...overlay.confounders, ...apply.confounders },
    };
    setTrail([...trail, { label, before: overlay }]);
    void doRun(save(next));
  };

  const undoBranch = () => {
    const last = trail[trail.length - 1];
    if (!last) return;
    setTrail(trail.slice(0, -1));
    void doRun(save(last.before));
  };

  const pinnedScores = useMemo(
    () => new Map((pinned?.hypotheses ?? []).map((h) => [h.id, h])),
    [pinned],
  );
  const pinnedRanks = useMemo(
    () => new Map((pinned?.pillars ?? []).map((p) => [p.vector.id, p.rank])),
    [pinned],
  );

  // The toolbar's meta line is the run itself, never an invented timestamp.
  const lastRun = run
    ? `${run.lens} · ${run.hypotheses.length} hypotheses · ${run.totalTokens} tokens · ${key}`
    : "no run yet";

  return (
    <ViewShell
      title="Brain"
      subtitle="The engine with the lid off: any patient state, every hypothesis, and the cheapest way to settle it."
    >
      <div className="rowh">
        <PillTabs
          label="Brain view"
          active={tab}
          onSelect={(id) => setTab(id === "journeys" ? "journeys" : "engine")}
          tabs={[
            { id: "engine", label: "Engine" },
            { id: "journeys", label: "Journeys" },
          ]}
        />
        <Button size="sm" disabled={busy !== ""} onClick={() => doRun()}>
          {busy === "run" ? <RefreshCw className="spin" /> : <Play />}
          {busy === "run" ? "Running…" : "Run"}
        </Button>
        <Button
          job="quiet"
          size="sm"
          disabled={!run}
          onClick={() => setPinned(run)}
        >
          <Pin /> Pin
        </Button>
        <Button
          job="quiet"
          size="sm"
          disabled={trail.length === 0}
          onClick={undoBranch}
        >
          <Undo2 /> Undo last run
        </Button>
        <Button
          job="text"
          size="sm"
          onClick={() => {
            setTrail([]);
            void doRun(save(EMPTY));
          }}
        >
          <RotateCcw /> Reset overlay
        </Button>
        <span className="t-meta">{lastRun}</span>
      </div>

      {tab === "journeys" && <Journeys />}

      {tab === "engine" && (
        <>
      <ScenarioBar
        q={q}
        set={set}
        users={users}
        personas={personas}
        panels={panels[q.userId] ?? []}
        priced={!!run?.path.some((m) => m.priced)}
        onLens={(lens) => {
          set({ lens });
          void doRun(overlay, lens);
        }}
      />

      {/* Trigger 5 of the five rings triggers. Read-only over the engine
          until "Consider this for me" is pressed, which wakes it for the
          signed-in admin, never for the scenario's user. */}
      <AskBox />

      {error && <p className="err">{error}</p>}

      {!run && (
        <div className="empty">
          <span className="k">No run yet</span>
          <p>Pick a scenario and press Run.</p>
        </div>
      )}

      {run && (
        <div className="space-y-6">
          <Path run={run} trail={trail} onBranch={takeBranch} />
          <Hypotheses
            run={run}
            pinned={pinnedScores}
            last={last}
            onSimulate={simulate}
          />
          <Pillars run={run} pinnedRanks={pinnedRanks} />
          <FactsPanel
            run={run}
            overlay={overlay}
            onFact={(key, value) =>
              void doRun(save({ ...overlay, facts: { ...overlay.facts, [key]: value } }))
            }
            onTag={(code, tag) =>
              void doRun(
                save({
                  ...overlay,
                  confounders: {
                    ...overlay.confounders,
                    [code]: [...new Set([...(overlay.confounders[code] ?? []), tag])],
                  },
                }),
              )
            }
            onDropReading={(code) =>
              void doRun(
                save({
                  ...overlay,
                  readings: overlay.readings.filter((r) => r.code !== code),
                }),
              )
            }
          />
          <Pack run={run} pinnedTokens={pinned?.totalTokens} />
          <PlanPanel
            plan={plan}
            assertions={assertions}
            busy={busy === "plan"}
            onGenerate={doPlan}
          />
        </div>
      )}
        </>
      )}
    </ViewShell>
  );
}

/* ── 1. scenario bar ──────────────────────────────────────────────────── */

function ScenarioBar({
  q,
  set,
  users,
  personas,
  panels,
  priced,
  onLens,
}: {
  q: Query;
  set: (patch: Partial<Query>) => void;
  users: BrainUser[];
  personas: string[];
  panels: string[];
  /** the run priced its tests in euros, so the budget is euros too */
  priced: boolean;
  onLens: (lens: Lens) => void;
}) {
  return (
    <Panel title="Parameters" right={`${q.kind} · ${q.lens}`}>
      <div className="fields">
        <Field label="scenario">
        <select
          className="sel"
          value={q.kind}
          onChange={(e) => set({ kind: e.target.value as Query["kind"] })}
        >
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </Field>

      {(q.kind === "user" || q.kind === "sampled") && (
        <Field label="user">
          <select
            className="sel"
            value={q.userId}
            onChange={(e) => set({ userId: e.target.value })}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>
        </Field>
      )}

      {q.kind === "persona" && (
        <Field label="persona">
          <select
            className="sel"
            value={q.persona}
            onChange={(e) => set({ persona: e.target.value })}
          >
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      )}

      {q.kind === "sampled" && (
        <>
          <Field label="mask">
            <select
              className="sel"
              value={q.mask}
              onChange={(e) => set({ mask: e.target.value as Query["mask"] })}
            >
              {MASKS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
          {q.mask === "random_pct" && (
            <Field label="keep %">
              <input
                className="inp num"
                type="number"
                value={q.pct}
                onChange={(e) => set({ pct: Number(e.target.value) })}
              />
            </Field>
          )}
          {q.mask === "panels" && (
            <Field label="panels">
              <select
                className="sel"
                value={q.panels}
                onChange={(e) => set({ panels: e.target.value })}
              >
                <option value="">pick a panel</option>
                {panels.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {q.mask === "before_year" && (
            <Field label="before year">
              <input
                className="inp num"
                type="number"
                value={q.year}
                onChange={(e) => set({ year: Number(e.target.value) })}
              />
            </Field>
          )}
          <Field label="seed">
            <span className="flex items-center gap-2">
              <input
                className="inp num"
                type="number"
                value={q.seed}
                onChange={(e) => set({ seed: Number(e.target.value) })}
              />
              <Button
                size="sm"
                job="quiet"
                onClick={() =>
                  set({ seed: Math.floor(Math.random() * 100000) })
                }
              >
                Reroll
              </Button>
            </span>
          </Field>
        </>
      )}

      {q.kind === "empty" && (
        <>
          <Field label="sex">
            <select
              className="sel"
              value={q.sex}
              onChange={(e) =>
                set({ sex: e.target.value === "male" ? "male" : "female" })
              }
            >
              <option value="female">female</option>
              <option value="male">male</option>
            </select>
          </Field>
          <Field label="age">
            <input
              className="inp num"
              type="number"
              min={18}
              max={100}
              value={q.age}
              onChange={(e) => set({ age: Number(e.target.value) })}
            />
          </Field>
        </>
      )}

      <Field label={priced ? "budget €" : "budget"}>
        <input
          className="inp num"
          type="number"
          min={0}
          placeholder="none"
          value={q.budget || ""}
          onChange={(e) => set({ budget: Number(e.target.value) })}
        />
      </Field>

      <Field label="lens">
        <select
          className="sel"
          value={q.lens}
          onChange={(e) => onLens(e.target.value as Lens)}
        >
          {LENSES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      </div>
    </Panel>
  );
}

/* ── 2. pillars ───────────────────────────────────────────────────────── */

function Pillars({
  run,
  pinnedRanks,
}: {
  run: BrainRun;
  pinnedRanks: Map<string, number>;
}) {
  return (
    <Panel title="Pillars" right={`${run.pillars.length} vectors, ranked`}>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Vector</th>
              <th>Grade</th>
              <th>State</th>
              <th>Distance</th>
              <th>Bands</th>
              <th>Trend</th>
              <th>Lenses</th>
              <th>Pinned</th>
            </tr>
          </thead>
          <tbody>
            {run.pillars.map((p) => {
              const was = pinnedRanks.get(p.vector.id);
              const quiet = p.state === "never" || p.state === "n/a";
              return (
                <tr key={p.vector.id} style={quiet ? { opacity: 0.5 } : undefined}>
                  <td className="n">{p.rank}</td>
                  <td className="k">{p.vector.name}</td>
                  <td>
                    <StateWord>{p.grade}</StateWord>
                  </td>
                  <td>
                    <StateWord tone={COVERAGE_TONE[p.state]}>{p.state}</StateWord>
                  </td>
                  <td title={`${p.distance} bands out`}>
                    <span
                      style={{
                        display: "block",
                        width: 96,
                        height: 3,
                        background: "var(--track)",
                      }}
                    >
                      <span
                        style={{
                          display: "block",
                          height: "100%",
                          width: `${Math.min(100, p.distance * 50)}%`,
                          background: "var(--bad)",
                        }}
                      />
                    </span>
                  </td>
                  <td className="n">
                    {p.distance ? p.distance.toFixed(2) : "not measured"}
                  </td>
                  <td className="n">{TREND[p.trend]}</td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {p.lenses.map((l) => (
                        <StateWord key={l}>{l}</StateWord>
                      ))}
                    </span>
                  </td>
                  <td className="n">
                    {was != null && was !== p.rank ? `${was} → ${p.rank}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ── 3. hypotheses ────────────────────────────────────────────────────── */

function SimulateForm({
  test,
  onSimulate,
}: {
  test: Discriminator;
  onSimulate: (code: string, value: number, unit?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const code = test.codes[0]!;

  if (!open)
    return (
      <Button size="sm" job="quiet" onClick={() => setOpen(true)}>
        Simulate
      </Button>
    );

  return (
    <span className="flex flex-wrap items-center gap-1">
      <input
        className="inp num mini"
        placeholder={test.unit ?? "value"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        size="sm"
        job="quiet"
        disabled={!Number.isFinite(Number(value)) || value.trim() === ""}
        onClick={() => onSimulate(code, Number(value), test.unit)}
      >
        Add
      </Button>
      {test.typicalPos != null && (
        <Button
          size="sm"
          job="text"
          onClick={() => onSimulate(code, test.typicalPos!, test.unit)}
        >
          typical positive ({test.typicalPos})
        </Button>
      )}
      {test.typicalNeg != null && (
        <Button
          size="sm"
          job="text"
          onClick={() => onSimulate(code, test.typicalNeg!, test.unit)}
        >
          typical negative ({test.typicalNeg})
        </Button>
      )}
      <Button size="sm" job="text" onClick={() => setOpen(false)}>
        close
      </Button>
    </span>
  );
}

function EvidenceList({
  title,
  rows,
}: {
  title: string;
  rows: {
    rule: string;
    input: string;
    value: string;
    lr: number;
    grade: string;
    discounted?: number;
  }[];
}) {
  if (!rows.length) return null;
  return (
    <div>
      <span className="c-label">{title}</span>
      <ul>
        {rows.map((r) => (
          <li key={r.rule} className="t-meta">
            {r.input} <span className="t-num">{r.value}</span> · LR{" "}
            <span className="t-num">{r.lr}</span>
            {r.discounted != null ? (
              <>
                {" → "}
                <span className="t-num">{r.discounted}</span> discounted
              </>
            ) : null}{" "}
            · {r.grade}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The one-word disclosure a long block hides behind. */
function More({
  word,
  children,
}: {
  word: string;
  children: React.ReactNode;
}) {
  return (
    <details className="disclose">
      <summary>
        {word} <ChevronDown className="ic" />
      </summary>
      <div className="inner">{children}</div>
    </details>
  );
}

function Hypotheses({
  run,
  pinned,
  last,
  onSimulate,
}: {
  run: BrainRun;
  pinned: Map<string, HypothesisResult>;
  /** the run before this one, so a simulated test shows its own delta */
  last: Map<string, number>;
  onSimulate: (code: string, value: number, unit?: string) => void;
}) {
  // Phase 17: two toggles, because they are two different things. Unlikely is
  // worth a glance; ruled out is the engine saying it looked, and after ring 2
  // most of that list is rare diseases something woke and the prior buried.
  const [showUnlikely, setShowUnlikely] = useState(false);
  const [showRuledOut, setShowRuledOut] = useState(false);
  const unlikely = run.hypotheses.filter((h) => h.state === "unlikely");
  const ruledOut = run.hypotheses.filter((h) => h.state === "ruled_out");
  const shown = run.hypotheses.filter(
    (h) =>
      (h.state !== "unlikely" || showUnlikely) &&
      (h.state !== "ruled_out" || showRuledOut),
  );

  return (
    <Panel
      title={`Hypotheses · ranked by score × lens weight (${run.lens})`}
      right={`${shown.length} shown · ${run.hypotheses.length} in the run`}
    >
      <div className="grid3">
        {shown.map((h) => {
          const was = pinned.get(h.id);
          const before = last.get(h.id);
          // The markers behind it, straight off the rows the engine read.
          const markers =
            h.for.map((r) => `${r.input} ${r.value}`).join(" · ") ||
            "nothing read yet";
          return (
            <Card key={h.id}>
              <div className="rowh" style={{ justifyContent: "space-between" }}>
                <span className="c-label">{h.state.replace("_", " ")}</span>
                <StateWord tone={STATE_TONE[h.state]}>{pct(h.score)}</StateWord>
              </div>
              <div
                className="c-title"
                style={{ fontSize: "var(--type-md)" }}
              >
                {h.name}
              </div>
              <p className="t-meta">{markers}</p>

              <More word="detail">
                <p className="t-meta">
                  <span className="t-num">{h.id}</span> · prior{" "}
                  <span className="t-num">{pct(h.prior)}</span> · lens weight{" "}
                  <span className="t-num">{h.lensWeight}</span>
                </p>
                <p className="t-meta">
                  Why in the catalog:{" "}
                  {h.burdenDaly != null ? `${h.burdenDaly} DALYs · ` : ""}
                  {h.priorSource ?? "seed"}
                </p>
                {before != null && before !== h.score && (
                  <p className="t-meta">
                    was{" "}
                    <span className="t-num">
                      {before.toFixed(3)} → {h.score.toFixed(3)}
                    </span>{" "}
                    on the run before this one
                  </p>
                )}
                {was && was.score !== h.score && (
                  <p className="t-meta">
                    pinned <span className="t-num">{was.score.toFixed(3)}</span>
                  </p>
                )}
                <span className="flex flex-wrap gap-2">
                  {Object.entries(h.lenses).map(([lens, w]) => (
                    <StateWord
                      key={lens}
                      tone={lens === run.lens ? "on" : "none"}
                    >
                      {lens} w{w.w} {w.grade}
                    </StateWord>
                  ))}
                </span>
                <p className="t-body">{h.summary}</p>
              </More>

              <More word="evidence">
                <EvidenceList title="For" rows={h.for} />
                <EvidenceList title="Against" rows={h.against} />
                {h.superseded.length > 0 && (
                  <p className="t-meta">
                    Superseded (read the same input, not counted):{" "}
                    {h.superseded
                      .map(
                        (x) =>
                          `${x.rule} ${x.input} ${x.value} LR ${x.lr} → ${x.by}`,
                      )
                      .join(" · ")}
                  </p>
                )}
              </More>

              <More word="tests">
                <span className="c-label">Missing</span>
                <p className="t-meta">
                  {h.missing.map((m) => m.input).join(", ") || "nothing"}
                </p>
                <span className="c-label">Confounded</span>
                <p className="t-meta">
                  {h.confounded.map((c) => `${c.input} (${c.tag})`).join(", ") ||
                    "nothing"}
                </p>
                <span className="c-label">Management</span>
                <p className="t-body">{h.management}</p>
                <span className="c-label">Next tests</span>
                {h.nextTests.map((t) => {
                  const test = h.tests.find((d) => d.test === t.test);
                  return (
                    <div key={t.test} className="rowh">
                      <span className="t-body">{t.test}</span>
                      <StateWord>cost {t.cost}</StateWord>
                      <span className="t-num">
                        shift {t.expectedShift.toFixed(3)} · ratio{" "}
                        {t.ratio.toFixed(3)}
                      </span>
                      {test && (
                        <SimulateForm test={test} onSimulate={onSimulate} />
                      )}
                      {t.howTo && (
                        <span className="t-meta" style={{ width: "100%" }}>
                          {t.howTo}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!h.nextTests.length && (
                  <p className="t-meta">
                    Everything that would move this has been measured.
                  </p>
                )}
              </More>

              <div className="c-line">
                {h.nextTests.length} moves · <a href="#path">open the tree</a>
              </div>
            </Card>
          );
        })}
      </div>
      <div className="rowh" style={{ marginTop: "var(--s13)" }}>
        {unlikely.length > 0 && (
          <Button
            job="text"
            size="sm"
            onClick={() => setShowUnlikely(!showUnlikely)}
          >
            {unlikely.length} unlikely ({showUnlikely ? "hide" : "show"})
          </Button>
        )}
        {ruledOut.length > 0 && (
          <Button
            job="text"
            size="sm"
            onClick={() => setShowRuledOut(!showRuledOut)}
          >
            show ruled out ({ruledOut.length}){showRuledOut ? " · hide" : ""}
          </Button>
        )}
      </div>
    </Panel>
  );
}

/* ── 4. path ──────────────────────────────────────────────────────────── */

/** "free", "\u20ac57" once a country has a price, "cost 2" when it does not. */
const costLabel = (move: Move) =>
  move.cost === 0
    ? "free"
    : move.priced
      ? money(move.cost)
      : `cost ${move.cost}`;

/** The colour a probability earns, on the same thresholds the engine uses. */
function beliefColour(p: number): string {
  if (p >= 0.9) return "var(--bad)";
  if (p >= 0.6) return "var(--warn)";
  if (p >= 0.25) return "var(--ink-2)";
  return "var(--ink-3)";
}

const STOP_LABEL: Record<string, string> = {
  likely: "likely",
  confirmed: "confirmed",
  exhausted: "exhausted",
  pruned: "pruned",
};

interface Spot {
  left: number;
  right: number;
  y: number;
}

/** Every node by depth, so the tree lays out as columns. */
function columnsOf(root: TreeNode): TreeNode[][] {
  const columns: TreeNode[][] = [];
  const walk = (n: TreeNode) => {
    (columns[n.depth] ??= []).push(n);
    for (const b of n.branches) walk(b.child);
  };
  walk(root);
  return columns;
}

function NodeCard({
  node,
  onBranch,
}: {
  node: TreeNode;
  onBranch: (label: string, apply: Overlay) => void;
}) {
  return (
    <div data-node={node.id} className="card w-[230px] shrink-0 p-2">
      <div className="flex items-start justify-between gap-1">
        <p className="t-body leading-snug">
          {node.chosen ? node.chosen.label : "not measured"}
        </p>
        {node.chosen && <StateWord>{costLabel(node.chosen)}</StateWord>}
      </div>
      {node.chosen && (
        <p className="t-num mt-0.5 text-[length:var(--type-xs)]">
          gain {node.chosen.gain.toFixed(3)} · ratio{" "}
          {node.chosen.ratio.toFixed(3)}
        </p>
      )}
      <div className="mt-2 space-y-0.5">
        {node.beliefs.slice(0, 5).map((b) => (
          <div key={b.id} className="flex items-center gap-1">
            <span className="t-num w-24 truncate text-[length:var(--type-xs)]">
              {b.id}
            </span>
            <span
              className="h-[6px] flex-1"
              style={{ background: "var(--track)" }}
            >
              <span
                className="block h-full"
                style={{
                  width: `${Math.round(b.p * 100)}%`,
                  background: beliefColour(b.p),
                }}
              />
            </span>
            <span className="t-num w-8 text-right text-[length:var(--type-xs)]">
              {pct(b.p)}
            </span>
          </div>
        ))}
        {/* The likelihood axis the bars were already implying (admin.html
            section 01). Same 0-100 % scale every bar above is drawn on. */}
        <div className="lanes">
          <svg viewBox="0 0 214 12" role="img" aria-label="0 to 100 per cent">
            {[0, 25, 50, 75, 100].map((t) => {
              const x = 100 + (t / 100) * 82;
              return (
                <g key={t}>
                  <line className="axis-line" x1={x} y1="0" x2={x} y2="4" />
                  <text className="tickt" x={x} y="11" textAnchor="middle">
                    {t}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
        {node.beliefs.length > 5 && (
          <p className="t-num text-[length:var(--type-xs)]">
            rest {node.beliefs.slice(5).map((b) => b.id).join(", ")}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="t-num text-[length:var(--type-xs)]">
          mass {pct(node.mass)}
        </span>
        {node.overBudget && (
          <StateWord tone="border">over the guide</StateWord>
        )}
        {node.stop && (
          <StateWord>{STOP_LABEL[node.stop] ?? node.stop}</StateWord>
        )}
      </div>
      {node.chosen && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-[var(--hair)] pt-2">
          {node.chosen.outcomes.map((o) => (
            <Button
              key={o.label}
              size="sm"
              job="text"
              onClick={() => onBranch(`${node.chosen!.label} → ${o.label}`, o.apply)}
            >
              {o.label} {pct(o.prob)}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The tree as columns with SVG connectors on top. Same trick as
 * `components/graph-map.tsx`: the cards are laid out by CSS, measured with
 * `getBoundingClientRect`, and one SVG is drawn over whatever CSS did.
 */
function Tree({
  root,
  onBranch,
}: {
  root: TreeNode;
  onBranch: (label: string, apply: Overlay) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [spots, setSpots] = useState<Record<string, Spot>>({});
  const columns = useMemo(() => columnsOf(root), [root]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => {
      const base = el.getBoundingClientRect();
      const next: Record<string, Spot> = {};
      for (const card of el.querySelectorAll<HTMLElement>("[data-node]")) {
        const r = card.getBoundingClientRect();
        if (!r.width) continue;
        next[card.dataset.node!] = {
          left: r.left - base.left + el.scrollLeft,
          right: r.right - base.left + el.scrollLeft,
          y: r.top - base.top + el.scrollTop + r.height / 2,
        };
      }
      setSize({ w: el.scrollWidth, h: el.scrollHeight });
      setSpots(next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The row is what shrinks when Simple hides the deep columns, so the
    // connectors to them go with it.
    if (row.current) observer.observe(row.current);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [root]);

  const edges = useMemo(() => {
    const out: { from: string; to: string; label: string; prob: number; apply: Overlay; title: string }[] = [];
    const walk = (n: TreeNode) => {
      for (const b of n.branches) {
        const outcome = n.chosen?.outcomes.find((o) => o.label === b.label);
        out.push({
          from: n.id,
          to: b.child.id,
          label: b.label,
          prob: b.prob,
          apply: outcome?.apply ?? { readings: [], facts: {}, confounders: {} },
          title: `${n.chosen?.label ?? ""} → ${b.label}`,
        });
      }
      for (const b of n.branches) walk(b.child);
    };
    walk(root);
    return out;
  }, [root]);

  return (
    <div ref={box} className="lanes relative overflow-x-auto pb-2">
      {size.w > 0 && (
        <svg
          className="pointer-events-none absolute left-0 top-0 z-10"
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
        >
          {edges.map((e) => {
            const a = spots[e.from];
            const b = spots[e.to];
            if (!a || !b) return null;
            const mid = (a.right + b.left) / 2;
            const d = `M ${a.right} ${a.y} C ${mid} ${a.y} ${mid} ${b.y} ${b.left} ${b.y}`;
            return (
              <g
                key={`${e.from}->${e.to}`}
                className="pointer-events-auto cursor-pointer"
                onClick={() => onBranch(e.title, e.apply)}
              >
                <title>{`${e.title} (${pct(e.prob)}) — click to take this branch`}</title>
                <path d={d} fill="none" stroke="transparent" strokeWidth={12} />
                <path
                  d={d}
                  fill="none"
                  className="axis-line"
                  strokeWidth={1 + e.prob * 5}
                  strokeOpacity={0.5}
                />
                <text
                  x={mid}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  className="factt"
                  fontSize={9}
                >
                  {e.label} {pct(e.prob)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      <div ref={row} className="flex w-fit gap-16">
        {columns.map((column, depth) => (
          depth > 2 ? (
            <details key={depth} className="disclose self-start">
              <summary>
                deeper <ChevronDown className="ic" />
              </summary>
              <div className="inner flex flex-col gap-4">
                {column.map((node) => (
                  <NodeCard key={node.id} node={node} onBranch={onBranch} />
                ))}
              </div>
            </details>
          ) : (
            <div key={depth} className="flex flex-col gap-4">
              {column.map((node) => (
                <NodeCard key={node.id} node={node} onBranch={onBranch} />
              ))}
            </div>
          )
        ))}
      </div>
    </div>
  );
}

/** One ranked move, as a table row: every number it carried is still here. */
function MoveRow({ move, rank }: { move: Move; rank: number }) {
  return (
    <>
      <tr>
        <td className="n">{rank}</td>
        <td className="k">{move.label}</td>
        <td>
          <StateWord>{move.kind}</StateWord>
        </td>
        <td>
          <StateWord>{costLabel(move)}</StateWord>
        </td>
        <td className="n">{move.gain.toFixed(3)}</td>
        <td className="n">{move.ratio.toFixed(3)}</td>
        <td className="n">
          {move.moves
            .map((x) => `${x.id} ${x.from.toFixed(2)}→${x.to.toFixed(2)}`)
            .join(" · ")}
        </td>
      </tr>
      {move.howTo && (
        <tr>
          <td />
          <td colSpan={6} className="t-meta">
            {move.howTo}
          </td>
        </tr>
      )}
    </>
  );
}

/** The tree, its breadcrumb, and the ranked moves underneath it. */
function Path({
  run,
  trail,
  onBranch,
}: {
  run: BrainRun;
  trail: { label: string }[];
  onBranch: (label: string, apply: Overlay) => void;
}) {
  const priced = run.path.some((m) => m.priced);
  return (
    <Panel
      id="path"
      title="Path"
      right={
        `the next question or test, by information gain` +
        (priced ? " · per €" : " · per cost band") +
        (run.budget ? ` · budget ${priced ? money(run.budget) : run.budget}` : "")
      }
    >
      {trail.length > 0 && (
        <div className="chips mb-[13px]">
          {trail.map((t, i) => (
            <span key={`${t.label}-${i}`} className="chip quiet">
              {t.label}
            </span>
          ))}
        </div>
      )}
      <Tree root={run.tree} onBranch={onBranch} />
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Move</th>
              <th>Kind</th>
              <th>Cost</th>
              <th>Gain</th>
              <th>Ratio</th>
              <th>Moves</th>
            </tr>
          </thead>
          <tbody>
            {run.path.map((move, i) => (
              <MoveRow
                key={`${move.featureId}-${move.label}`}
                move={move}
                rank={i + 1}
              />
            ))}
            {!run.path.length && (
              <tr>
                <td colSpan={7}>Nothing left to order.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ── 5. facts and events ──────────────────────────────────────────────── */

function FactsPanel({
  run,
  overlay,
  onFact,
  onTag,
  onDropReading,
}: {
  run: BrainRun;
  overlay: Overlay;
  onFact: (key: string, value: string) => void;
  onTag: (code: string, tag: string) => void;
  onDropReading: (code: string) => void;
}) {
  const [key, setKey] = useState("");
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [tag, setTag] = useState(CONFOUNDER_TAGS[0]!);

  return (
    <section>
      <span className="c-label">Facts, events and the overlay this run read</span>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1">
          {Object.entries(run.facts).map(([k, v]) => (
            <StateWord key={k}>
              {k}: {Array.isArray(v) ? v.join("; ") : String(v)}
            </StateWord>
          ))}
          {!Object.keys(run.facts).length && (
            <span className="t-meta">nothing answered yet</span>
          )}
        </div>

        {overlay.readings.length > 0 && (
          <div>
            <span className="c-label">Simulated readings</span>
            <div className="flex flex-wrap gap-1">
              {overlay.readings.map((r) => (
                <button
                  key={r.code}
                  onClick={() => onDropReading(r.code)}
                  className="chip"
                >
                  {r.code} {r.value} <Trash2 className="size-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(overlay.confounders).length > 0 && (
          <div>
            <span className="c-label">Tagged draws</span>
            <div className="flex flex-wrap gap-1">
              {Object.entries(overlay.confounders).map(([c, tags]) => (
                <StateWord key={c} tone="border">
                  {c}: {tags.join(", ")}
                </StateWord>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Field label="add fact">
            <input
              className="inp"
              placeholder="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <Field label="value">
            <input
              className="inp"
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            job="quiet"
            disabled={!key.trim()}
            onClick={() => {
              onFact(key.trim(), value);
              setKey("");
              setValue("");
            }}
          >
            Add fact
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Field label="tag draw">
            <input
              className="inp"
              placeholder="metric code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="confounder">
            <select
              className="sel"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
            >
              {CONFOUNDER_TAGS.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Button
            size="sm"
            job="quiet"
            disabled={!code.trim()}
            onClick={() => {
              onTag(code.trim(), tag);
              setCode("");
            }}
          >
            Tag draw
          </Button>
        </div>
      </Card>
    </section>
  );
}

/* ── 6. context pack ──────────────────────────────────────────────────── */

const BAR_COLOURS = [
  "var(--ink)",
  "var(--ink-2)",
  "var(--ink-3)",
  "var(--ok)",
  "var(--warn)",
];

function Pack({
  run,
  pinnedTokens,
}: {
  run: BrainRun;
  pinnedTokens?: number;
}) {
  return (
    <section>
      <span className="c-label">
        Context pack · {run.totalTokens} tokens over {run.pack.length} sections
        {pinnedTokens != null && pinnedTokens !== run.totalTokens
          ? ` · pinned ${pinnedTokens} (${run.totalTokens - pinnedTokens > 0 ? "+" : ""}${run.totalTokens - pinnedTokens})`
          : ""}
      </span>
      <Card className="space-y-2 p-4">
        <div className="flex h-3 w-full overflow-hidden border border-[var(--hair)]">
          {run.pack.map((p, i) => (
            <span
              key={p.section}
              title={`${p.section}: ${p.tokens}`}
              style={{
                width: `${(p.tokens / Math.max(1, run.totalTokens)) * 100}%`,
                background: BAR_COLOURS[i % BAR_COLOURS.length],
              }}
            />
          ))}
        </div>
        {run.pack.map((p) => (
          <details
            key={p.section}
            className="disclose border-t border-[var(--hair)] pt-2"
          >
            <summary>
              {p.section}{" "}
              <span className="t-num">
                {p.tokens} tokens ·{" "}
                {Math.round((p.tokens / Math.max(1, run.totalTokens)) * 100)}%
              </span>
            </summary>
            <pre className="inner mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words">
              {p.text}
            </pre>
          </details>
        ))}
      </Card>
    </section>
  );
}

/* ── 7. generate ──────────────────────────────────────────────────────── */

function PlanPanel({
  plan,
  assertions,
  busy,
  onGenerate,
}: {
  plan: ReportBody | null;
  assertions: AssertionReport | null;
  busy: boolean;
  onGenerate: () => void;
}) {
  return (
    <section>
      <span className="c-label">Plan · one model call over the pack above</span>
      <Card className="space-y-3 p-4">
        <Button disabled={busy} onClick={onGenerate}>
          <RefreshCw className={busy ? "spin" : ""} />
          {busy ? "Writing…" : "Generate plan"}
        </Button>

        {assertions && (
          <p className="t-num">
            assertions {assertions.passed}/{assertions.total}
            {assertions.shouldTotal
              ? ` · should ${assertions.shouldPassed}/${assertions.shouldTotal}`
              : ""}{" "}
            ·{" "}
            <span
              className={
                assertions.failedMust
                  ? "text-[var(--bad)]"
                  : "text-[var(--ok)]"
              }
            >
              {assertions.failedMust ? "MUST FAILED" : "ok"}
            </span>
            {assertions.failed.length ? ` — ${assertions.failed.join("; ")}` : ""}
          </p>
        )}

        {plan && (
          <>
            <ul className="t-body list-disc space-y-1 pl-5">
              {plan.summary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="space-y-3">
              {plan.actions.map((a, i) => (
                <ActionCard key={`${a.title}-${i}`} action={a} />
              ))}
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
