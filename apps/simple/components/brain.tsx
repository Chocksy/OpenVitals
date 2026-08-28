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
import { Pin, RefreshCw, RotateCcw, Trash2, Undo2 } from "lucide-react";
import type { ReportBody } from "@/db";
import type { BrainRun } from "@/lib/brain";
import type { Discriminator, HypothesisResult, Lens } from "@/lib/hypotheses";
import type { Move } from "@/lib/infogain";
import { money } from "@/lib/prices";
import type { Overlay, Scenario } from "@/lib/sample";
import type { TreeNode } from "@/lib/tree";
import { cn } from "@/lib/utils";
import type { AssertionReport } from "@/evals/assert";
import { ActionCard } from "./action-card";
import { ViewShell } from "./plan";
import { Badge, Button, Card } from "./ui-kit";

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

const STATE_BADGE = {
  ruled_out: "secondary",
  unlikely: "secondary",
  possible: "info",
  likely: "warning",
  confirmed: "critical",
} as const;

const COVERAGE_BADGE = {
  current: "normal",
  stale: "warning",
  never: "critical",
  "n/a": "secondary",
} as const;

const TREND = { up: "↑", down: "↓", flat: "→", "n/a": "·" } as const;

const EMPTY: Overlay = { readings: [], facts: {}, confounders: {} };

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-neutral-400">
      {children}
    </h2>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-neutral-400">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass =
  "h-8 rounded-sm border border-neutral-200 bg-neutral-0 px-2 font-mono text-[12px] text-neutral-800 focus:border-neutral-900 focus:outline-none";

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

  return (
    <ViewShell
      title="Brain"
      subtitle="The engine with the lid off: any patient state, every hypothesis, and the cheapest way to settle it."
      actions={
        <span className="flex items-center gap-2">
          <Button disabled={busy !== ""} onClick={() => doRun()}>
            <RefreshCw className={busy === "run" ? "animate-spin" : ""} />
            {busy === "run" ? "Running…" : "Run"}
          </Button>
          <Button
            variant="outline-subtle"
            size="sm"
            disabled={!run}
            onClick={() => setPinned(run)}
          >
            <Pin className="size-3.5" /> Pin
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setTrail([]);
              void doRun(save(EMPTY));
            }}
          >
            <RotateCcw className="size-3.5" /> Reset overlay
          </Button>
        </span>
      }
    >
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

      {error && (
        <p className="font-mono text-[12px] text-[var(--color-health-critical)]">
          {error}
        </p>
      )}

      {!run && (
        <Card className="p-6 text-center font-body text-[13px] text-neutral-500">
          Pick a scenario and press Run.
        </Card>
      )}

      {run && (
        <div className="space-y-6">
          <Path
            run={run}
            trail={trail}
            onBranch={takeBranch}
            onUndo={undoBranch}
          />
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
    <Card className="flex flex-wrap items-end gap-3 p-4">
      <Field label="scenario">
        <select
          className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
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
              className={inputClass}
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
                className={`${inputClass} w-20`}
                type="number"
                value={q.pct}
                onChange={(e) => set({ pct: Number(e.target.value) })}
              />
            </Field>
          )}
          {q.mask === "panels" && (
            <Field label="panels">
              <select
                className={inputClass}
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
                className={`${inputClass} w-24`}
                type="number"
                value={q.year}
                onChange={(e) => set({ year: Number(e.target.value) })}
              />
            </Field>
          )}
          <Field label="seed">
            <span className="flex items-center gap-1">
              <input
                className={`${inputClass} w-20`}
                type="number"
                value={q.seed}
                onChange={(e) => set({ seed: Number(e.target.value) })}
              />
              <Button
                size="sm"
                variant="outline-subtle"
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
              className={inputClass}
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
              className={`${inputClass} w-16`}
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
          className={`${inputClass} w-20`}
          type="number"
          min={0}
          placeholder="none"
          value={q.budget || ""}
          onChange={(e) => set({ budget: Number(e.target.value) })}
        />
      </Field>

      <Field label="lens">
        <select
          className={inputClass}
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
    </Card>
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
    <section>
      <Label>Pillars · {run.pillars.length} vectors, ranked</Label>
      <Card className="divide-y divide-neutral-100">
        {run.pillars.map((p) => {
          const was = pinnedRanks.get(p.vector.id);
          return (
            <div
              key={p.vector.id}
              className={cn(
                "flex flex-wrap items-center gap-2 px-3 py-2",
                p.state === "never" || p.state === "n/a" ? "opacity-50" : "",
              )}
            >
              <span className="w-6 font-mono text-[11px] tabular-nums text-neutral-400">
                {p.rank}
              </span>
              <span className="min-w-40 flex-1 font-body text-[13px]">
                {p.vector.name}
              </span>
              <Badge variant="outline">{p.grade}</Badge>
              <Badge variant={COVERAGE_BADGE[p.state]}>{p.state}</Badge>
              <span className="hidden w-28 md:block" title={`${p.distance} bands out`}>
                <span className="inline-block h-[3px] w-full bg-neutral-150">
                  <span
                    className="block h-full bg-[var(--color-health-critical)]"
                    style={{ width: `${Math.min(100, p.distance * 50)}%` }}
                  />
                </span>
              </span>
              <span className="w-12 font-mono text-[11px] tabular-nums text-neutral-500">
                {p.distance ? p.distance.toFixed(2) : "—"}
              </span>
              <span className="w-4 font-mono text-[12px] text-neutral-500">
                {TREND[p.trend]}
              </span>
              <span className="flex gap-1">
                {p.lenses.map((l) => (
                  <Badge key={l} variant="secondary">
                    {l}
                  </Badge>
                ))}
              </span>
              {was != null && was !== p.rank && (
                <Badge variant="info">
                  {was} → {p.rank}
                </Badge>
              )}
            </div>
          );
        })}
      </Card>
    </section>
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
      <Button size="sm" variant="outline-subtle" onClick={() => setOpen(true)}>
        Simulate
      </Button>
    );

  return (
    <span className="flex flex-wrap items-center gap-1">
      <input
        className={`${inputClass} w-24`}
        placeholder={test.unit ?? "value"}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline-subtle"
        disabled={!Number.isFinite(Number(value)) || value.trim() === ""}
        onClick={() => onSimulate(code, Number(value), test.unit)}
      >
        Add
      </Button>
      {test.typicalPos != null && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSimulate(code, test.typicalPos!, test.unit)}
        >
          typical positive ({test.typicalPos})
        </Button>
      )}
      {test.typicalNeg != null && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onSimulate(code, test.typicalNeg!, test.unit)}
        >
          typical negative ({test.typicalNeg})
        </Button>
      )}
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
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
      <Label>{title}</Label>
      <ul className="space-y-0.5">
        {rows.map((r) => (
          <li
            key={r.rule}
            className="font-mono text-[11px] tabular-nums text-neutral-600"
          >
            {r.input} {r.value} · LR {r.lr}
            {r.discounted != null ? ` → ${r.discounted} discounted` : ""} ·{" "}
            <span className="text-neutral-400">{r.grade}</span>
          </li>
        ))}
      </ul>
    </div>
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
  const [showQuiet, setShowQuiet] = useState(false);
  const quiet = (h: HypothesisResult) =>
    h.state === "unlikely" || h.state === "ruled_out";
  const hidden = run.hypotheses.filter(quiet);
  const shown = showQuiet
    ? run.hypotheses
    : run.hypotheses.filter((h) => !quiet(h));

  return (
    <section>
      <Label>
        Hypotheses · ranked by score × lens weight ({run.lens})
      </Label>
      <div className="space-y-3">
        {shown.map((h) => {
          const was = pinned.get(h.id);
          const before = last.get(h.id);
          return (
            <Card key={h.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-display text-[15px] font-medium">
                    {h.name}
                  </p>
                  <p className="font-mono text-[10px] uppercase tracking-[0.04em] text-neutral-400">
                    {h.id} · prior {pct(h.prior)} · lens weight {h.lensWeight}
                  </p>
                  <p className="font-body text-[11px] text-neutral-400">
                    Why in the catalog:{" "}
                    {h.burdenDaly != null
                      ? `${h.burdenDaly} DALYs · `
                      : ""}
                    {h.priorSource ?? "seed"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {before != null && before !== h.score && (
                    <span className="font-mono text-[11px] tabular-nums text-accent-500">
                      {before.toFixed(3)} → {h.score.toFixed(3)}
                    </span>
                  )}
                  {was && was.score !== h.score && (
                    <span className="font-mono text-[11px] tabular-nums text-neutral-400">
                      pinned {was.score.toFixed(3)}
                    </span>
                  )}
                  <span className="font-mono text-[24px] font-bold tabular-nums">
                    {pct(h.score)}
                  </span>
                  <Badge variant={STATE_BADGE[h.state]}>
                    {h.state.replace("_", " ")}
                  </Badge>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap gap-1">
                {Object.entries(h.lenses).map(([lens, w]) => (
                  <Badge
                    key={lens}
                    variant={lens === run.lens ? "info" : "secondary"}
                  >
                    {lens} w{w.w} {w.grade}
                  </Badge>
                ))}
              </div>

              <p className="mt-2 font-body text-[13px] text-neutral-700">
                {h.summary}
              </p>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <EvidenceList title="For" rows={h.for} />
                <EvidenceList title="Against" rows={h.against} />
              </div>

              {h.superseded.length > 0 && (
                <p className="mt-2 font-mono text-[10px] text-neutral-400">
                  Superseded (read the same input, not counted):{" "}
                  {h.superseded
                    .map(
                      (x) =>
                        `${x.rule} ${x.input} ${x.value} LR ${x.lr} → ${x.by}`,
                    )
                    .join(" · ")}
                </p>
              )}

              <div className="deep mt-3 grid gap-3 border-t border-neutral-100 pt-3 md:grid-cols-2">
                <div>
                  <Label>Missing</Label>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {h.missing.map((m) => m.input).join(", ") || "nothing"}
                  </p>
                </div>
                <div>
                  <Label>Confounded</Label>
                  <p className="font-mono text-[11px] text-neutral-500">
                    {h.confounded
                      .map((c) => `${c.input} (${c.tag})`)
                      .join(", ") || "nothing"}
                  </p>
                </div>
                <div className="md:col-span-2">
                  <Label>Management</Label>
                  <p className="font-body text-[12px] text-neutral-600">
                    {h.management}
                  </p>
                </div>
              </div>

              <div className="mt-3 space-y-2 border-t border-neutral-100 pt-3">
                <Label>Next tests</Label>
                {h.nextTests.map((t) => {
                  const test = h.tests.find((d) => d.test === t.test);
                  return (
                    <div
                      key={t.test}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span className="min-w-48 font-body text-[13px]">
                        {t.test}
                      </span>
                      <Badge variant="outline">cost {t.cost}</Badge>
                      <span className="font-mono text-[11px] tabular-nums text-neutral-500">
                        shift {t.expectedShift.toFixed(3)} · ratio{" "}
                        {t.ratio.toFixed(3)}
                      </span>
                      {test && (
                        <SimulateForm test={test} onSimulate={onSimulate} />
                      )}
                      {t.howTo && (
                        <span className="deep w-full font-body text-[12px] text-neutral-500">
                          {t.howTo}
                        </span>
                      )}
                    </div>
                  );
                })}
                {!h.nextTests.length && (
                  <p className="font-body text-[12px] text-neutral-500">
                    Everything that would move this has been measured.
                  </p>
                )}
              </div>
            </Card>
          );
        })}
        {hidden.length > 0 && (
          <button
            onClick={() => setShowQuiet(!showQuiet)}
            className="font-mono text-[11px] text-neutral-500 underline decoration-dotted"
          >
            {hidden.filter((h) => h.state === "unlikely").length} unlikely,{" "}
            {hidden.filter((h) => h.state === "ruled_out").length} ruled out (
            {showQuiet ? "hide" : "show"})
          </button>
        )}
      </div>
    </section>
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
  if (p >= 0.9) return "var(--color-health-critical)";
  if (p >= 0.6) return "var(--color-health-warning)";
  if (p >= 0.25) return "var(--color-health-info)";
  return "var(--color-neutral-300)";
}

const STOP_LABEL: Record<string, string> = {
  likely: "likely",
  confirmed: "confirmed",
  exhausted: "exhausted",
  pruned: "pruned",
  budget: "budget reached",
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
    <div
      data-node={node.id}
      className="w-[230px] shrink-0 border border-neutral-200 bg-neutral-0 p-2"
    >
      <div className="flex items-start justify-between gap-1">
        <p className="font-body text-[12px] leading-snug">
          {node.chosen ? node.chosen.label : "—"}
        </p>
        {node.chosen && <Badge variant="outline">{costLabel(node.chosen)}</Badge>}
      </div>
      {node.chosen && (
        <p className="mt-0.5 font-mono text-[10px] tabular-nums text-neutral-400">
          gain {node.chosen.gain.toFixed(3)} · ratio{" "}
          {node.chosen.ratio.toFixed(3)}
        </p>
      )}
      <div className="mt-2 space-y-0.5">
        {node.beliefs.slice(0, 5).map((b) => (
          <div key={b.id} className="flex items-center gap-1">
            <span className="w-24 truncate font-mono text-[9px] uppercase text-neutral-500">
              {b.id}
            </span>
            <span className="h-[6px] flex-1 bg-neutral-150">
              <span
                className="block h-full"
                style={{
                  width: `${Math.round(b.p * 100)}%`,
                  background: beliefColour(b.p),
                }}
              />
            </span>
            <span className="w-8 text-right font-mono text-[9px] tabular-nums text-neutral-500">
              {pct(b.p)}
            </span>
          </div>
        ))}
        {node.beliefs.length > 5 && (
          <p className="font-mono text-[9px] text-neutral-400">
            rest {node.beliefs.slice(5).map((b) => b.id).join(", ")}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="font-mono text-[9px] tabular-nums text-neutral-400">
          mass {pct(node.mass)}
        </span>
        {node.stop && (
          <Badge variant={node.stop === "budget" ? "warning" : "secondary"}>
            {STOP_LABEL[node.stop] ?? node.stop}
          </Badge>
        )}
      </div>
      {node.chosen && (
        <div className="mt-2 flex flex-wrap gap-1 border-t border-neutral-100 pt-2">
          {node.chosen.outcomes.map((o) => (
            <Button
              key={o.label}
              size="sm"
              variant="ghost"
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
    <div ref={box} className="relative overflow-x-auto pb-2">
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
                  stroke="var(--color-accent-500)"
                  strokeWidth={1 + e.prob * 5}
                  strokeOpacity={0.5}
                />
                <text
                  x={mid}
                  y={(a.y + b.y) / 2 - 4}
                  textAnchor="middle"
                  className="font-mono"
                  fontSize={9}
                  fill="var(--color-neutral-500)"
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
          <div
            key={depth}
            className={cn("flex flex-col gap-4", depth > 2 ? "deep" : "")}
          >
            {column.map((node) => (
              <NodeCard key={node.id} node={node} onBranch={onBranch} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function MoveRow({ move, rank }: { move: Move; rank: number }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <span className="w-6 font-mono text-[11px] tabular-nums text-neutral-400">
        {rank}
      </span>
      <span className="min-w-48 flex-1 font-body text-[13px]">{move.label}</span>
      <Badge variant="secondary">{move.kind}</Badge>
      <Badge variant="outline">{costLabel(move)}</Badge>
      <span className="font-mono text-[11px] tabular-nums text-neutral-500">
        gain {move.gain.toFixed(3)} · ratio {move.ratio.toFixed(3)}
      </span>
      <span className="font-mono text-[11px] tabular-nums text-neutral-400">
        {move.moves
          .map((x) => `${x.id} ${x.from.toFixed(2)}→${x.to.toFixed(2)}`)
          .join(" · ")}
      </span>
      {move.howTo && (
        <span className="deep w-full font-body text-[12px] text-neutral-500">
          {move.howTo}
        </span>
      )}
    </div>
  );
}

/** The tree, its breadcrumb, and the ranked moves underneath it. */
function Path({
  run,
  trail,
  onBranch,
  onUndo,
}: {
  run: BrainRun;
  trail: { label: string }[];
  onBranch: (label: string, apply: Overlay) => void;
  onUndo: () => void;
}) {
  return (
    <section>
      <Label>
        Path · the next question or test, by information gain over the whole
        differential
        {run.path.some((m) => m.priced) ? " · per €" : " · per cost band"}
        {run.budget
          ? ` · budget ${run.path.some((m) => m.priced) ? money(run.budget) : run.budget}`
          : ""}
      </Label>
      <Card className="space-y-3 p-4">
        {trail.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {trail.map((t, i) => (
              <Badge key={`${t.label}-${i}`} variant="info">
                {t.label}
              </Badge>
            ))}
            <Button size="sm" variant="ghost" onClick={onUndo}>
              <Undo2 className="size-3.5" /> undo
            </Button>
          </div>
        )}
        <Tree root={run.tree} onBranch={onBranch} />
        <div className="divide-y divide-neutral-100 border-t border-neutral-100">
          {run.path.map((move, i) => (
            <MoveRow key={`${move.featureId}-${move.label}`} move={move} rank={i + 1} />
          ))}
          {!run.path.length && (
            <p className="px-3 py-2 font-body text-[13px] text-neutral-500">
              Nothing left to order.
            </p>
          )}
        </div>
      </Card>
    </section>
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
      <Label>Facts, events and the overlay this run read</Label>
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap gap-1">
          {Object.entries(run.facts).map(([k, v]) => (
            <Badge key={k} variant="secondary">
              {k}: {Array.isArray(v) ? v.join("; ") : String(v)}
            </Badge>
          ))}
          {!Object.keys(run.facts).length && (
            <span className="font-body text-[13px] text-neutral-500">
              nothing answered yet
            </span>
          )}
        </div>

        {overlay.readings.length > 0 && (
          <div>
            <Label>Simulated readings</Label>
            <div className="flex flex-wrap gap-1">
              {overlay.readings.map((r) => (
                <button
                  key={r.code}
                  onClick={() => onDropReading(r.code)}
                  className="inline-flex items-center gap-1 border border-accent-500 px-2 py-0.5 font-mono text-[10px] uppercase text-accent-600"
                >
                  {r.code} {r.value} <Trash2 className="size-3" />
                </button>
              ))}
            </div>
          </div>
        )}

        {Object.keys(overlay.confounders).length > 0 && (
          <div>
            <Label>Tagged draws</Label>
            <div className="flex flex-wrap gap-1">
              {Object.entries(overlay.confounders).map(([c, tags]) => (
                <Badge key={c} variant="warning">
                  {c}: {tags.join(", ")}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <Field label="add fact">
            <input
              className={`${inputClass} w-40`}
              placeholder="key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </Field>
          <Field label="value">
            <input
              className={`${inputClass} w-48`}
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </Field>
          <Button
            size="sm"
            variant="outline-subtle"
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
              className={`${inputClass} w-40`}
              placeholder="metric code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Field label="confounder">
            <select
              className={inputClass}
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
            variant="outline-subtle"
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
  "var(--color-accent-500)",
  "var(--color-health-normal)",
  "var(--color-health-warning)",
  "var(--color-health-critical)",
  "var(--color-health-info)",
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
      <Label>
        Context pack · {run.totalTokens} tokens over {run.pack.length} sections
        {pinnedTokens != null && pinnedTokens !== run.totalTokens
          ? ` · pinned ${pinnedTokens} (${run.totalTokens - pinnedTokens > 0 ? "+" : ""}${run.totalTokens - pinnedTokens})`
          : ""}
      </Label>
      <Card className="space-y-2 p-4">
        <div className="flex h-3 w-full overflow-hidden border border-neutral-200">
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
          <details key={p.section} className="border-t border-neutral-100 pt-2">
            <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-[0.04em] text-neutral-600">
              {p.section}{" "}
              <span className="tabular-nums text-neutral-400">
                {p.tokens} tokens ·{" "}
                {Math.round((p.tokens / Math.max(1, run.totalTokens)) * 100)}%
              </span>
            </summary>
            <pre className="deep mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-neutral-600">
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
      <Label>Plan · one model call over the pack above</Label>
      <Card className="space-y-3 p-4">
        <Button disabled={busy} onClick={onGenerate}>
          <RefreshCw className={busy ? "animate-spin" : ""} />
          {busy ? "Writing…" : "Generate plan"}
        </Button>

        {assertions && (
          <p className="font-mono text-[12px] tabular-nums">
            assertions {assertions.passed}/{assertions.total}
            {assertions.shouldTotal
              ? ` · should ${assertions.shouldPassed}/${assertions.shouldTotal}`
              : ""}{" "}
            ·{" "}
            <span
              className={
                assertions.failedMust
                  ? "text-[var(--color-health-critical)]"
                  : "text-[var(--color-health-normal)]"
              }
            >
              {assertions.failedMust ? "MUST FAILED" : "ok"}
            </span>
            {assertions.failed.length ? ` — ${assertions.failed.join("; ")}` : ""}
          </p>
        )}

        {plan && (
          <>
            <ul className="list-disc space-y-1 pl-5 font-body text-[13px]">
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
