"use client";

/**
 * The hunches on Home, phase 40b: the Watch rows, the Worth a look rail and
 * the case in the Drawer (`53-web.html`, with 54's three depths).
 *
 * Depth 1 is the rail card (stamp, line, mini corridor, state). Depth 2 is
 * the case: the corridor chart, or four lanes for a cluster; the
 * explanations as bars with `EvidenceChip`, re-ordered with a FLIP when an
 * answer moves them; the question chips; the test with Write it down and
 * its stamp; the outcome. Depth 3 is How we know: five folds (the rule, the
 * draws with their files, the evidence, what is not known, and a replay).
 *
 * Everything reads and writes `/api/hunches/*`. A write returns the case,
 * so the drawer redraws from the server's answer, and `router.refresh()`
 * brings the columns behind it up to date.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FileText, Pause, Play } from "lucide-react";
import type { HunchCase, HunchRow } from "@/lib/api-contract";
import { rowState, type GoalHeroProps } from "@/lib/home-hybrid";
import { cn, dayLabel } from "@/lib/utils";
import { Drawer } from "./drawer";
import { EvidenceChip } from "./evidence-chip";
import { Digits, LedgerList, toast } from "./motion";
import { Button, HEADING_ARROW, Stamp } from "./ui-kit";
import { CorridorChart, MiniCorridor, nice } from "./corridor";

/* ── which case is open ────────────────────────────────────────────────── */

const Board = createContext<{
  open: (id: string) => void;
  openId: string | null;
}>({
  open: () => {},
  openId: null,
});

/** The kind's ink, for the last dot of a mini corridor. */
export const KIND_INK: Record<string, string> = {
  step: "var(--blood)",
  drift: "var(--blood)",
  left_band: "var(--blood)",
  discordance: "var(--blood)",
  cluster: "var(--gene)",
  gap: "var(--h-amber)",
  good_news: "var(--h-green)",
};

/**
 * Holds the open case for everything inside it. `initial` is the
 * `?hunch=<id>` deep link, so a link (or a screenshot) can land on a case.
 */
export function HunchBoard({
  initial,
  children,
}: {
  initial?: string | null;
  children: React.ReactNode;
}) {
  const [openId, setOpenId] = useState<string | null>(initial ?? null);
  const open = useCallback((id: string) => setOpenId(id), []);
  return (
    <Board.Provider value={{ open, openId }}>
      {children}
      <CaseDrawer id={openId} onClose={() => setOpenId(null)} />
    </Board.Provider>
  );
}

/* ── depth 1: the Watch rows and the rail ──────────────────────────────── */

export function WatchList({ rows }: { rows: HunchRow[] }) {
  const { open } = useContext(Board);
  if (!rows.length)
    return <p className="hy-quiet">Nothing open. The engine is watching.</p>;
  return (
    <div className="wlist">
      {rows.map((r) => {
        const s = rowState(r);
        return (
          <button
            type="button"
            key={r.id}
            className="wrow"
            onClick={() => open(r.id)}
          >
            <b>
              <Stamp kind={r.kind}>{r.stamp}</Stamp> {r.line}
            </b>
            <span className="go" aria-hidden="true">
              ›
            </span>
            <small>
              {[r.system, s.word, s.next].filter(Boolean).join(" · ")}
            </small>
          </button>
        );
      })}
    </div>
  );
}

export function HunchRail({ rows }: { rows: HunchRow[] }) {
  const { open, openId } = useContext(Board);
  return (
    <div className="hrail">
      {rows.map((r) => {
        const s = rowState(r);
        return (
          <button
            type="button"
            key={r.id}
            className={cn(
              "hc",
              r.id === openId && "on",
              r.state === "closed" && "closed",
            )}
            onClick={() => open(r.id)}
          >
            <span className="top">
              <Stamp kind={r.kind}>{r.stamp}</Stamp>
              <span>{r.system}</span>
            </span>
            <span className="h4">{r.line}</span>
            <MiniCorridor
              band={r.mini.band}
              lab={r.mini.lab}
              last={r.mini.last}
              goal={r.mini.goal}
              tone={KIND_INK[r.kind]}
              width={200}
            />
            <span className="state">
              <b className={s.tone}>{s.word}</b>
              <span>{s.next}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * 55's hunch rows on Blood's Markers tab (40c): the line, the number, the
 * mini corridor and the next step. The row and its button both open the
 * case in the Drawer; the step itself is taken there.
 */
export function HunchShelf({ rows }: { rows: HunchRow[] }) {
  const { open } = useContext(Board);
  return (
    <div className="bm-list">
      {rows.map((r) => {
        const s = rowState(r);
        return (
          <button
            type="button"
            key={r.id}
            className={cn("bm-row bm-h", r.state === "closed" && "closed")}
            style={{ "--kc": KIND_INK[r.kind] } as React.CSSProperties}
            onClick={() => open(r.id)}
          >
            <span className="hl">
              <span className="ht">
                <Stamp kind={r.kind}>{r.stamp}</Stamp> {r.line}
              </span>
              {r.number.value != null && (
                <span className="hn">
                  <b>{nice(r.number.value)}</b>
                  {r.number.unit && <small>{r.number.unit}</small>}
                </span>
              )}
            </span>
            <span className="h2">
              <MiniCorridor
                band={r.mini.band}
                lab={r.mini.lab}
                last={r.mini.last}
                goal={r.mini.goal}
                tone={KIND_INK[r.kind]}
              />
              <span className={cn("act", s.tone && "soft")}>
                <small>{[r.system, s.word].filter(Boolean).join(" · ")}</small>
                <span>{r.action.label || s.next}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── the goal hero (53 `.hero`) ───────────────────────────────────────── */

/**
 * The first goal, big: the number, its gap, the word and slope, the facts,
 * and the corridor with "if nothing changes". The toggle swaps the window
 * and the slope between the recent draws and five years. Every string comes
 * from `goalHero` (`lib/home-hybrid.ts`), so this only switches views.
 */
export function GoalHero({ g }: { g: GoalHeroProps }) {
  const [at, setAt] = useState(0);
  const narrow = useNarrow();
  const v = g.views[at] ?? g.views[0]!;
  return (
    <section className="card hy-goal">
      <div>
        <div className="lbl">{g.label}</div>
        <div className="big">
          <b className="t-num">{g.value}</b>
          <small>
            {g.unit}
            {g.unit && <br />}
            {g.gap}
          </small>
        </div>
        <Link href={`/blood/m/${g.code}`} className={cn("word", g.word)}>
          {HEADING_ARROW[g.word]} {g.word}
          {g.slope ? ` · ${g.slope}` : ""}
        </Link>
        <div className="facts">
          {g.facts.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        {v.sentence && (
          <p className="sent">
            {v.sentence.pre}
            <b>{v.sentence.b}</b>
            {v.sentence.post}
          </p>
        )}
        {g.views.length > 1 && (
          <div className="hy-seg" role="group" aria-label="Slope window">
            {g.views.map((x, i) => (
              <button
                type="button"
                key={x.id}
                className={cn(i === at && "on")}
                aria-pressed={i === at}
                onClick={() => setAt(i)}
              >
                {x.tab}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <div className="hy-legend">
          <span>
            <i className="lg" />
            goal
          </span>
          <span>
            <i className="lb" />
            your band
          </span>
          <span>
            <i className="ll" />
            lab range
          </span>
          {v.landing && (
            <span>
              <i className="lx" />
              if nothing changes
            </span>
          )}
        </div>
        <CorridorChart
          key={`${v.id}-${narrow}`}
          series={g.series}
          bandAt={g.bandAt}
          lab={g.lab}
          goal={g.goal}
          landing={v.landing}
          from={v.from}
          unit={g.unit}
          label={`${g.label}, ${v.tab}`}
          width={narrow ? 340 : 820}
          height={narrow ? 220 : 280}
          gutter={narrow ? 89 : 110}
          labels={narrow ? 2 : 4}
          short={narrow}
          anim
        />
      </div>
    </section>
  );
}

/* ── depth 2 and 3: the case ───────────────────────────────────────────── */

type Load =
  | { at: "idle" }
  | { at: "loading"; id: string }
  | { at: "error"; id: string; line: string }
  | { at: "ready"; c: HunchCase };

function CaseDrawer({
  id,
  onClose,
}: {
  id: string | null;
  onClose: () => void;
}) {
  const [load, setLoad] = useState<Load>({ at: "idle" });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!id) return;
    let live = true;
    setLoad({ at: "loading", id });
    fetch(`/api/hunches/${id}`)
      .then(async (r) => {
        if (!r.ok)
          throw new Error(
            r.status === 404
              ? "This hunch is gone."
              : "Could not load the case.",
          );
        return (await r.json()) as HunchCase;
      })
      .then((c) => live && setLoad({ at: "ready", c }))
      .catch(
        (e: Error) => live && setLoad({ at: "error", id, line: e.message }),
      );
    return () => {
      live = false;
    };
  }, [id]);

  const close = () => {
    onClose();
    // drop a `?hunch=` deep link so a reload does not reopen the case
    if (
      typeof window !== "undefined" &&
      window.location.search.includes("hunch=")
    )
      router.replace(pathname, { scroll: false });
  };

  const c = load.at === "ready" && load.c.id === id ? load.c : null;
  const s = c ? caseState(c) : null;

  return (
    <Drawer
      open={id != null}
      onClose={close}
      label={c ? c.line : "Hunch"}
      head={
        c && s ? (
          <>
            <Stamp kind={c.kind}>{c.stamp}</Stamp>
            <span>{c.system}</span>
            <span className={cn("st", s.tone)}>{s.word}</span>
          </>
        ) : null
      }
    >
      {load.at === "loading" && <p className="hy-quiet">Opening the case…</p>}
      {load.at === "error" && <p className="err">{load.line}</p>}
      {c && (
        <CaseView
          c={c}
          onCase={(next) => {
            setLoad({ at: "ready", c: next });
            router.refresh();
          }}
        />
      )}
    </Drawer>
  );
}

function caseState(c: HunchCase): { word: string; tone: string } {
  if (c.outcome) return { word: c.outcome.replace("_", " "), tone: c.outcome };
  if (c.kind === "good_news") return { word: "good news", tone: "confirmed" };
  if (c.state === "testing") return { word: "testing", tone: "testing" };
  if (c.answer) return { word: "answered", tone: "" };
  return { word: "open", tone: "" };
}

async function post(path: string, body?: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * A phone gets its own chart size, so the 11 px labels stay 11 px instead of
 * scaling down with the viewBox. Read in JS, not a CSS `display` switch:
 * Chrome stopped painting the charts' CSS animations under a media-query
 * `display: none` rule on the same element. The server renders the wide one.
 */
const NARROW = "(max-width: 599px)";
function useNarrow(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(NARROW);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(NARROW).matches,
    () => false,
  );
}
const caseSize = (narrow: boolean) =>
  narrow
    ? { width: 320, height: 200, gutter: 89, short: true }
    : { width: 487, height: 230, gutter: 110 };

/**
 * Phase 40c: the corridor on `/blood/m/[code]`, above the history chart,
 * sized as the goal hero is (the page is server markup, so the size switch
 * lives here with `useNarrow`).
 */
export function MarkerCorridor(
  p: Pick<
    React.ComponentProps<typeof CorridorChart>,
    "series" | "bandAt" | "lab" | "goal" | "unit" | "label"
  >,
) {
  const narrow = useNarrow();
  return (
    <CorridorChart
      key={String(narrow)}
      {...p}
      anim
      {...(narrow
        ? { width: 340, height: 220, gutter: 89, labels: 2, short: true }
        : { width: 820, height: 280, gutter: 110, labels: 4 })}
    />
  );
}

/** The case itself. Exported for its render test. */
export function CaseView({
  c,
  onCase,
}: {
  c: HunchCase;
  onCase: (c: HunchCase) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [seen, setSeen] = useState(false);
  const narrow = useNarrow();
  const unit = c.number.unit;
  const band = c.mini.band;
  const lab = c.mini.lab;
  const goal = c.mini.goal
    ? { low: c.mini.goal[0], high: c.mini.goal[1] }
    : null;

  const act = async (
    key: string,
    path: string,
    body: unknown,
    said: string,
  ) => {
    setBusy(key);
    try {
      const r = await post(path, body);
      if (!r.ok) {
        const e = (await r.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast(e?.error ? `Not saved: ${e.error}` : "Not saved. Try again.");
        return;
      }
      if (key === "seen") setSeen(true);
      else onCase((await r.json()) as HunchCase);
      toast(said);
    } catch {
      toast("Not saved. Check the connection.");
    } finally {
      setBusy(null);
    }
  };

  const ordered = [...c.explanations].sort((a, b) => b.weight - a.weight);
  const predOf = new Map(
    (c.predictions ?? []).map((p) => [p.explanationId, p.text]),
  );
  const open = c.state === "open" && !c.outcome;

  return (
    <div className="case">
      <div>
        <h2>{c.line}</h2>
        <p className="say">{c.say}</p>
      </div>

      <section className="card case-card">
        <div className="hy-legend">
          {goal && (
            <span>
              <i className="lg" />
              goal
            </span>
          )}
          <span>
            <i className="lb" />
            your band
          </span>
          <span>
            <i className="ll" />
            lab range
          </span>
        </div>
        {c.kind === "cluster" && c.markers.length ? (
          <div className="case-lanes">
            {c.markers.map((m) => (
              <div key={m.code}>
                <h5>
                  {m.name}
                  <span>{m.unit}</span>
                </h5>
                <CorridorChart
                  series={m.series}
                  bandAt={m.bandAt}
                  unit={m.unit}
                  label={`${m.name} chart`}
                  width={232}
                  height={110}
                  gutter={8}
                  labels={1}
                  anim
                />
                <p className="nob">
                  {m.band
                    ? `Your band ${nice(m.band.median - m.band.sd)} to ${nice(m.band.median + m.band.sd)}${m.band.provisional ? ", provisional" : ""}`
                    : "No band yet: fewer than 4 earlier draws."}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <CorridorChart
              key={String(narrow)}
              series={c.series}
              bandAt={c.bandAt}
              lab={lab}
              goal={goal}
              unit={unit}
              label={`${c.line} chart`}
              {...caseSize(narrow)}
              anim
            />
            <p className="nob">
              {band
                ? `Your band: median ${nice(band.median)} ± ${nice(band.sd)}${unit ? ` ${unit}` : ""}, from ${band.n} draws${band.provisional ? " (provisional)" : ""}.`
                : "No band yet: fewer than 4 earlier draws. Lab line only."}
              {lab && lab[0] && lab[1] != null
                ? ` Lab range ${nice(lab[0])} to ${nice(lab[1])}.`
                : lab && lab[1] != null
                  ? ` Lab range under ${nice(lab[1])}.`
                  : lab && lab[0]
                    ? ` Lab range over ${nice(lab[0])}.`
                    : ""}
            </p>
          </>
        )}
      </section>

      {ordered.length > 0 && (
        <section className="card case-card">
          <h3>
            What could explain it{" "}
            <small>share of this hunch, not a diagnosis</small>
          </h3>
          <LedgerList className="ex">
            {ordered.map((e) => (
              <div key={e.id} data-card={e.id} className="er t-flip">
                <EvidenceChip basis={e.basis} grade={e.grade} className="g" />
                <span>{e.text}</span>
                <Digits className="p" text={`${Math.round(e.weight * 100)}%`} />
                <div className="trk">
                  <i style={{ width: `${Math.round(e.weight * 100)}%` }} />
                </div>
                {predOf.get(e.id) && (
                  <span className="pr">if so: {predOf.get(e.id)}</span>
                )}
              </div>
            ))}
          </LedgerList>
        </section>
      )}

      {c.question && (
        <section className="card case-card qcard">
          <h3>
            One question splits them <small>free</small>
          </h3>
          <p>{c.question.text}</p>
          <div className="qchips">
            {c.question.chips.map((ch) => (
              <button
                type="button"
                key={ch.id}
                className={cn(c.answer === ch.id && "on")}
                disabled={!open || busy != null}
                aria-pressed={c.answer === ch.id}
                onClick={() =>
                  act(
                    "answer",
                    `/api/hunches/${c.id}/answer`,
                    { chip: ch.id },
                    "Noted. The order moved.",
                  )
                }
              >
                {ch.label}
              </button>
            ))}
          </div>
          <p className="qn">
            {c.answer
              ? "Your answer moved the order. No probability changes until a result comes back."
              : "An answer moves the order. Only a result closes the case."}
          </p>
        </section>
      )}

      {c.test ? (
        <section className="card case-card tcard">
          <h3>
            The test that separates them{" "}
            <small>
              {c.test.estimated ? "price is an estimate" : "lab price"}
            </small>
          </h3>
          <div className="tt">
            <b>{c.test.name}</b>
            <span>
              {c.test.price} {c.test.currency}
            </span>
            <Button
              size="sm"
              busy={busy === "test"}
              disabled={!open || busy != null || c.writtenAt != null}
              onClick={() =>
                act(
                  "test",
                  `/api/hunches/${c.id}/test`,
                  undefined,
                  "Written down. The test is on your next draw.",
                )
              }
            >
              {c.writtenAt ? "Written down" : "Write it down"}
            </Button>
          </div>
          {!c.writtenAt && (
            <p className="tnote">
              Writing it down stores, before the result, what each explanation
              predicts.
            </p>
          )}
          <span
            className={cn("wstamp", c.writtenAt && "on")}
            aria-hidden={!c.writtenAt}
          >
            written down {c.writtenAt ? dayLabel(c.writtenAt) : ""}
          </span>
        </section>
      ) : c.kind === "good_news" ? (
        <section className="card case-card gn">
          <p>
            Nothing to do. Kept on file so the change does not get lost, and so
            the next draw is read against it.
          </p>
          <Button
            size="sm"
            job="quiet"
            busy={busy === "seen"}
            disabled={seen || busy != null}
            onClick={() =>
              act("seen", `/api/hunches/${c.id}/seen`, undefined, "Got it.")
            }
          >
            {seen ? "Seen" : "Got it"}
          </Button>
        </section>
      ) : null}

      {c.outcome && (
        <div className={cn("out", c.outcome)}>
          <span className="ostamp">{c.outcome.replace("_", " ")}</span>
          <b>{c.outcomeLine ?? "The result is in."}</b>
        </div>
      )}

      <HowWeKnow c={c} />
    </div>
  );
}

/* ── depth 3: How we know ──────────────────────────────────────────────── */

function HowWeKnow({ c }: { c: HunchCase }) {
  const draws = [...c.series].reverse();
  const fromFiles = c.series.filter((p) => p.file).length;
  return (
    <section className="hwk">
      <h3>How we know</h3>
      <p className="hwk-sub">
        Each number above, traced to its rule and its file.
      </p>
      <details className="hfold">
        <summary>
          <b>The rule that fired</b>
          <small>
            {c.stamp.toLowerCase()}
            {c.firedAt[0]
              ? ` · first found ${dayLabel(c.firedAt[0], true)}`
              : ""}
          </small>
        </summary>
        <ol className="rl2">
          {c.rule.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      </details>
      <details className="hfold">
        <summary>
          <b>The draws</b>
          <small>
            {c.series.length} draws · {fromFiles} from files
            {fromFiles < c.series.length
              ? ` · ${c.series.length - fromFiles} imported`
              : ""}
          </small>
        </summary>
        <div className="drws">
          {draws.map((p) => (
            <div key={p.date} className="drw">
              <span className="dd">{dayLabel(p.date, true)}</span>
              <span className="dv">
                {nice(p.value)} <small>{c.number.unit}</small>
              </span>
              <span className="df">
                <FileText className="ic" aria-hidden="true" />
                {p.file ? (
                  p.upload ? (
                    <Link href={`/blood/uploads/${p.upload}`} className="src">
                      {p.file}
                    </Link>
                  ) : (
                    <span className="src">{p.file}</span>
                  )
                ) : (
                  <span>imported from the old app</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </details>
      <details className="hfold">
        <summary>
          <b>The evidence</b>
          <small>
            {c.explanations.length
              ? `${c.explanations.length} explanations, graded`
              : "the rule and the draws are the evidence"}
          </small>
        </summary>
        {c.explanations.length ? (
          c.explanations.map((e) => (
            <div key={e.id} className="evd">
              <div className="et">
                <EvidenceChip basis={e.basis} grade={e.grade} />
                <span>{e.text}</span>
              </div>
              {e.source && <p>{e.source}</p>}
            </div>
          ))
        ) : (
          <p className="hy-quiet">Nothing to weigh here.</p>
        )}
      </details>
      <details className="hfold">
        <summary>
          <b>What is not known</b>
          <small>{c.unknowns.length} open points</small>
        </summary>
        <ul className="unk">
          {c.unknowns.map((u, i) => (
            <li key={i}>{u}</li>
          ))}
        </ul>
      </details>
      <details className="hfold">
        <summary>
          <b>Replay how this was found</b>
          <small>step through the draws</small>
        </summary>
        <Replay c={c} />
      </details>
    </section>
  );
}

/** Walks the draws: the chart and the rule as they stood on each day. */
function Replay({ c }: { c: HunchCase }) {
  const n = c.series.length;
  const [i, setI] = useState(Math.max(0, n - 1));
  const [playing, setPlaying] = useState(false);
  const narrow = useNarrow();

  useEffect(() => {
    if (!playing) return;
    const t = window.setInterval(() => {
      setI((k) => {
        if (k >= n - 1) {
          setPlaying(false);
          return k;
        }
        return k + 1;
      });
    }, 900);
    return () => window.clearInterval(t);
  }, [playing, n]);

  if (!n) return <p className="hy-quiet">No draws to replay.</p>;
  const day = c.series[i]!.date;
  const fired = c.firedAt.includes(day);
  const firstFired = c.firedAt[0];
  return (
    <div className="replay">
      <CorridorChart
        series={c.series.slice(0, i + 1)}
        bandAt={c.bandAt.filter((b) => b.date <= day)}
        lab={c.mini.lab}
        unit={c.number.unit}
        label={`Replay to ${day}`}
        {...caseSize(narrow)}
        height={180}
        labels={1}
      />
      <div className="ctl">
        <Button
          size="sm"
          job="quiet"
          onClick={() => {
            if (!playing && i >= n - 1) setI(0);
            setPlaying((p) => !p);
          }}
        >
          {playing ? <Pause className="ic" /> : <Play className="ic" />}
          {playing ? "Pause" : "Replay"}
        </Button>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={i}
          aria-label="Draw"
          onChange={(e) => {
            setPlaying(false);
            setI(Number(e.target.value));
          }}
        />
        <span className="when2">{dayLabel(day, true)}</span>
      </div>
      <p className="rmsg">
        {fired
          ? `On ${dayLabel(day, true)} the rule fired.`
          : firstFired && day < firstFired
            ? `On ${dayLabel(day, true)} nothing had fired yet.`
            : `On ${dayLabel(day, true)} the rule did not fire.`}
      </p>
    </div>
  );
}
