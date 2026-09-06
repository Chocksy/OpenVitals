"use strict";
// Isolated design fixture. No backend, medical estimator, recording or uploads.
const icons = {
  home: "M3 10 12 3l9 7v10H3Z M9 20v-7h6v7",
  path: "M4 20c0-9 16-7 16-16 M4 20h5 M20 4h-5 M4 20v-5 M20 4v5",
  you: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0 M4 21v-3a8 8 0 0 1 16 0v3",
  plus: "M12 4v16 M4 12h16",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  chevron: "m9 5 7 7-7 7",
  back: "m14 5-7 7 7 7",
  check: "m5 12 4 4L19 6",
  fire: "M12 3c2 5 7 7 7 12a7 7 0 0 1-14 0c0-3 2-5 4-7 0 4 2 4 3 5 2-3 2-6 0-10Z",
  heart: "M12 20S2 14 2 8a5 5 0 0 1 10-1A5 5 0 0 1 22 8c0 6-10 12-10 12Z",
  camera: "M3 7h4l2-3h6l2 3h4v13H3Z M8 13a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Z M5 10v2a7 7 0 0 0 14 0v-2 M12 19v3 M8 22h8",
  file: "M5 2h9l5 5v15H5Z M14 2v6h5 M8 13h8 M8 17h6",
  blood: "M12 2S5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13Z",
  dna: "M6 2c0 10 12 10 12 20 M18 2C18 12 6 12 6 22 M7 5h10 M9 9h6 M9 15h6 M7 19h10",
  book: "M3 4h7l2 2 2-2h7v16h-7l-2 2-2-2H3Z M12 6v16",
  sync: "M20 9a8 8 0 0 0-14-4L3 8 M3 3v5h5 M4 15a8 8 0 0 0 14 4l3-3 M16 16h5v5",
  signal: "M4 19v-3 M9 19v-6 M14 19V9 M19 19V5",
  battery: "M2 7h17v10H2Z M22 10v4 M5 10h11v4H5Z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M12 2v2 M12 20v2 M2 12h2 M20 12h2 M5 5l1 1 M18 18l1 1 M5 19l1-1 M18 6l1-1",
  walk: "M13 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4 M8 22l3-8 3 3v5 M6 13l3-4h4l3 4h4 M12 9l-1 5",
};
const icon = (n) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n] || icons.arrow}"/></svg>`;
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const state = {
  done: [true, true, false, false],
  effort: 80,
  levers: [true, true, false],
  adopted: false,
  meals: [
    {
      id: 1,
      name: "Oats, berries & yogurt",
      kcal: 380,
      p: 24,
      c: 48,
      f: 10,
      portion: 1,
      time: "08:30",
      img: "img/02-oats.jpg",
    },
    {
      id: 2,
      name: "Sardines on rye",
      kcal: 420,
      p: 32,
      c: 34,
      f: 17,
      portion: 1,
      time: "12:45",
      img: "img/03-sardines-rye.jpg",
    },
  ],
  weight: 84.2,
  weightGoal: 80,
  reminder: false,
  health: true,
};
const phones = [
  { tab: "today", view: "today", metric: "LDL", sheet: null },
  { tab: "path", view: "path", metric: "LDL", sheet: null },
  { tab: "you", view: "you", metric: "LDL", sheet: null },
];
const habits = [
  ["Fibre with breakfast", "Food · part of your cholesterol plan"],
  ["Morning weigh-in", "84.2 kg · from Apple Health"],
  ["Walk after lunch", "15 minutes · your next small step"],
  ["Strength session", "30 minutes · 2 of 3 this week"],
];
const markerData = [
  ["LDL cholesterol", "118", "mg/dL", "Above your target", "LDL"],
  ["ApoB", "96", "mg/dL", "Track with your next draw", "ApoB"],
  ["HbA1c", "5.4", "%", "Within lab range", "HbA1c"],
  ["HDL cholesterol", "52", "mg/dL", "Within lab range", "HDL"],
  ["Triglycerides", "112", "mg/dL", "Within lab range", "Triglycerides"],
  ["Vitamin D", "24", "ng/mL", "Review with your clinician", "Vitamin D"],
  ["Ferritin", "86", "ng/mL", "Within lab range", "Ferritin"],
];
const $ = (q, root = document) => root.querySelector(q);
function activeHabits() {
  return state.adopted
    ? [1, ...[0, 2, 3].filter((id, j) => state.savedPlan.levers[j])]
    : [0, 1, 2, 3];
}
function completed() {
  return activeHabits().filter((i) => state.done[i]).length;
}
function extraPlan() {
  return state.vitaminAdopted ? habit(4) : "";
}
function btn(label, action, cls = "", extra = "") {
  return `<button class="${cls}" data-action="${action}" ${extra}>${label}</button>`;
}
function row(title, sub, action, right = "", ico = "") {
  return btn(
    `${ico ? icon(ico) : ""}<span class="row-copy"><b>${title}</b><small>${sub}</small></span>${right ? `<span class="row-number">${right}</span>` : ""}${icon("chevron")}`,
    action,
    "row",
  );
}
function head(kicker, title, aside = "") {
  return `<div class="topline"><span class="kicker">${kicker}</span>${aside}</div><h2>${title}</h2>`;
}
function back(p, label = "Back") {
  return btn(`${icon("back")}${label}`, "back", "back");
}
function progress() {
  const n = completed();
  return `<svg class="mini-progress" viewBox="0 0 30 30" aria-label="${n} of ${activeHabits().length} complete"><circle cx="15" cy="15" r="11" fill="none" stroke="var(--line)" stroke-width="3"/><circle cx="15" cy="15" r="11" fill="none" stroke="var(--green)" stroke-width="3" stroke-dasharray="${(n / activeHabits().length) * 69} 69"/></svg>`;
}
function habit(i) {
  return `<div class="habit">${btn(`<span>${icon("check")}</span>`, `habit:${i}`, `check ${state.done[i] ? "done" : ""}`, `aria-label="${esc(habits[i][0])}" aria-pressed="${state.done[i]}"`)}<div class="habit-text"><b>${habits[i][0]}</b><small>${i === 1 ? `${state.weight.toFixed(1)} kg · ${state.manualWeight ? "manual entry" : "from Apple Health"}` : habits[i][1]}</small></div>${i === 1 ? icon("sync") : ""}</div>`;
}
function mealRow(m) {
  return btn(
    `<img src="${m.img}" alt="${esc(m.name)}"><span><b>${esc(m.name)}</b><small>${m.time} · ${Math.round(m.kcal * m.portion)} kcal <span class="muted">est.</span></small></span>${icon("chevron")}`,
    `meal:${m.id}`,
    "meal-teaser",
  );
}
function today() {
  return `${head("Sunday, September 6", "A little better,<br>every day.", `<span class="streak">${icon("fire")} 6 days</span>`)}<div class="week">${["M", "T", "W", "T", "F", "S", "S"].map((d, i) => `<div class="day ${i === 6 ? "current" : ""}">${d}<i>${i === 6 ? "6" : "✓"}</i></div>`).join("")}</div><div class="focus"><span class="kicker">YOUR FOCUS · CHOLESTEROL</span><h3>Start with lunch.<br>Your future self<br>will thank you.</h3><p>A fibre-rich meal. A short walk.<br>Two small steps in your LDL plan.</p><svg class="leaf-art" viewBox="0 0 100 100" aria-hidden="true"><path d="M25 100Q40 60 75 10 M42 63Q10 15 75 10Q105 60 42 63 M48 52L47 22 M55 42L83 36 M40 68Q8 45 15 24Q45 25 40 68"/></svg>${btn(`See where this could take you ${icon("arrow")}`, "go:path", "focus-link")}</div><div class="section-head"><h3>Your daily rhythm</h3><span style="display:flex;align-items:center;gap:7px"><small>${completed()}/${activeHabits().length}</small>${progress()}</span></div>${activeHabits().map(habit).join("")}${extraPlan()}<div class="section-head"><h3>On your plate</h3>${btn("View day ↗", "go:body", "text-btn")}</div>${state.meals.length ? mealRow(state.meals[state.meals.length - 1]) : '<p class="explain">Your first meal starts here. Tap + to add it.</p>'}${state.note ? `<div class="research-note"><span class="kicker">YOUR DAILY NOTE</span><p>${esc(state.note)}</p></div>` : ""}<div class="research-note"><span class="kicker">SINCE YOUR LAST VISIT</span><b>Your September labs are ready.</b><p>Seven markers to explore. Start with the one connected to your plan.</p>${btn("Read your blood story →", "go:blood")}</div>`;
}
function scenario(metric) {
  const e = state.effort / 100;
  const l = state.levers;
  const drop =
    metric === "Weight"
      ? (l[0] * 0.7 + l[1] * 1.4 + l[2] * 1.6) * e
      : metric === "ApoB"
        ? (l[0] * 7 + l[1] * 3 + l[2] * 2) * e
        : (l[0] * 12 + l[1] * 4 + l[2] * 3) * e;
  const start =
    metric === "Weight" ? state.weight : metric === "ApoB" ? 96 : 118;
  const center = start - drop;
  const spread = (metric === "Weight" ? 0.8 : 5) * Math.min(1, drop);
  return {
    start,
    end: center,
    low: center - spread,
    high: center + spread,
    unit: metric === "Weight" ? "kg" : "mg/dL",
    drop,
  };
}
function fmt(n, metric) {
  return metric === "Weight" ? n.toFixed(1) : Math.round(n);
}
function chart(metric) {
  const s = scenario(metric),
    extent = metric === "Weight" ? 7 : 35,
    y = (v) => 35 + ((s.start - v) / extent) * 105,
    mid = y(s.end),
    lo = y(s.high),
    hi = y(s.low);
  return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 310 187" role="img" aria-label="Illustrative ${metric} scenario, ${fmt(s.start, metric)} now, ${fmt(s.low, metric)} to ${fmt(s.high, metric)} ${s.unit} in 12 weeks"><path d="M15 42H296 M15 95H296 M15 148H296" stroke="#43564e" stroke-width=".6"/><path d="M15 48L35 42L54 45L75 33L96 35" fill="none" stroke="#ecf0e5" stroke-width="2"/><path d="M96 35Q175 38 293 42" fill="none" stroke="#9caea5" stroke-width="1.2" stroke-dasharray="4 5"/><path d="M96 35Q180 ${lo} 293 ${lo}L293 ${hi}Q180 ${hi} 96 35Z" fill="#c1d99a" opacity=".18"/><path d="M96 35Q176 ${mid} 293 ${mid}" fill="none" stroke="#d4e6b0" stroke-width="2.5"/><path d="M96 23V150" stroke="#83968a" stroke-width=".8" stroke-dasharray="2 4"/><circle cx="96" cy="35" r="4" fill="#edf1e4"/><circle cx="293" cy="${mid}" r="4" fill="#d4e6b0"/><text x="75" y="17" class="label">${fmt(s.start, metric)}</text><text x="15" y="175">AUG</text><text x="80" y="175">TODAY</text><text x="178" y="175">6 WKS</text><text x="260" y="175">12 WKS</text><text x="255" y="${Math.max(62, mid - 12)}" class="label">${fmt(s.end, metric)}</text></svg></div>`;
}
function forecast(p) {
  const m = p.metric,
    s = scenario(m);
  return `<div class="forecast-title"><span class="kicker">12 WEEKS FROM TODAY</span><span class="badge">Illustrative</span></div><h3>${fmt(s.low, m)}–${fmt(s.high, m)} <span style="font-size:12px">${s.unit}</span></h3><p>${m === "Weight" ? "Weight" : m === "LDL" ? "LDL cholesterol" : "ApoB"} · possible range with this routine</p>${chart(m)}<div class="chart-readout">Selected goal ${m === "Weight" ? state.weightGoal : m === "ApoB" ? "under 90" : "under 100"} ${s.unit} · ${s.low > (m === "Weight" ? state.weightGoal : m === "ApoB" ? 90 : 100) ? "more time may be needed" : "compare at your next check"}</div><div class="legend"><span><i></i>Your scenario</span><span><i class="dashed"></i>Baseline</span><span><i class="band"></i>Range</span></div><div class="metric-tabs" aria-label="Scenario metric">${["LDL", "Weight", "ApoB"].map((x) => btn(x, `metric:${x}`, m === x ? "selected" : "", `aria-pressed="${m === x}"`)).join("")}</div>`;
}
function path(p) {
  return `${head("YOUR PATH", "What if you<br>kept this up?")}${tabs(
    [
      ["Explore", "path"],
      ["My plan", "plan"],
      ["History", "calendar"],
    ],
    p.view,
  )}<div class="forecast">${forecast(p)}</div><div class="effort"><label>How often feels realistic? <output class="effort-value">${state.effort}% of days</output></label><input type="range" min="20" max="100" step="10" value="${state.effort}" aria-label="Planned adherence"><div class="range-labels"><span>A little, often</span><span>Almost every day</span></div></div>${[
    ["Make breakfast fibre-rich", "Oats, beans, whole grains · food quality"],
    ["Walk after your largest meal", "15 minutes · daily movement"],
    ["Add two strength sessions", "30 minutes each · weekly routine"],
  ]
    .map(
      (l, i) =>
        `<div class="lever"><div><b>${l[0]}</b><small>${l[1]}</small></div>${btn("<span></span>", `lever:${i}`, `switch ${state.levers[i] ? "on" : ""}`, `role="switch" aria-label="${l[0]}" aria-checked="${state.levers[i]}"`)}</div>`,
    )
    .join(
      "",
    )}${btn(`${state.adopted ? "Update my plan" : "Make this my plan"} ${icon("arrow")}`, "adopt", "primary", state.levers.every((x) => !x) ? "disabled" : "")}<p class="fine">A scenario, not a promise. Your next blood draw checks what actually changed.</p>${btn("What goes into this estimate? ↗", "sheet:method", "text-btn")}`;
}
function tabs(items, active) {
  return `<div class="segmented">${items.map(([label, v]) => btn(label, `go:${v}`, active === v ? "selected" : "", `aria-pressed="${active === v}"`)).join("")}</div>`;
}
function you() {
  return `${head("YOUR BIOLOGY", "Many signals.<br>One you.", '<div class="avatar">R</div>')}<div class="biology-map" aria-hidden="true"><svg viewBox="0 0 300 140"><ellipse cx="147" cy="70" rx="115" ry="45" fill="none" stroke="var(--line)" transform="rotate(-17 147 70)"/><ellipse cx="147" cy="70" rx="83" ry="53" fill="none" stroke="var(--line)" transform="rotate(28 147 70)"/><path d="M50 25 147 70 260 55 M147 70 75 128" fill="none" stroke="var(--line)" stroke-dasharray="2 4"/><circle cx="49" cy="40" r="4" fill="var(--green)"/><circle cx="258" cy="59" r="4" fill="var(--orange)"/><circle cx="77" cy="119" r="4" fill="var(--green)"/></svg><div class="biology-core">you</div><span class="orbit a">Blood</span><span class="orbit b">Genes</span><span class="orbit c">Daily life</span></div><div class="insight"><span class="kicker">THE STORY WORTH YOUR ATTENTION</span><h3>Your cholesterol has<br>room to move.</h3><p>LDL is above your selected target. Your meals and movement give you a place to start; your next draw tells us more.</p><div class="chips"><span class="chip">Blood · Sep 1</span><span class="chip">Body · Today</span><span class="chip">Genetics · Context</span></div></div>${row("Blood markers", "7 markers · latest draw Sep 1", "go:blood", "118<small>LDL · mg/dL</small>", "blood")}${row("Body & daily life", "Meals, weight, sleep & movement", "go:body", `${state.weight.toFixed(1)}<small>kg · today</small>`, "heart")}${row("Your genetic context", "Inherited signals, explained", "go:genes", "", "dna")}${row("Research & sources", "What supports your plan", "go:research", "", "book")}<div class="research-note"><span class="kicker">CONNECT THE DOTS</span><b>Why start with food and movement?</b><p>Explore how your current results connect to your routine.</p>${btn("Ask about my plan →", "sheet:chat")}</div>${row("Connections & records", state.health ? "Apple Health connected · 11:32" : "Apple Health disconnected", "go:connections", "", "sync")}`;
}
function plan(p) {
  return `${head("YOUR PATH", "A routine that<br>fits your life.")}${tabs(
    [
      ["Explore", "path"],
      ["My plan", "plan"],
      ["History", "calendar"],
    ],
    p.view,
  )}<div class="section-head"><h3>Doing today</h3><small>${completed()} of ${activeHabits().length} done</small></div><p class="fine">Adopted actions can be checked off here.</p>${activeHabits().map(habit).join("")}${extraPlan()}${
    state.adopted
      ? `<div class="research-note"><span class="kicker">YOUR CHOSEN SCENARIO</span><b>${state.savedPlan.effort}% of days · ${state.savedPlan.levers.filter(Boolean).length} changes</b><p>${state.savedPlan.levers
          .map((on, i) =>
            on
              ? [
                  "Fibre-rich breakfasts",
                  "15-minute walks",
                  "Two strength sessions",
                ][i]
              : "",
          )
          .filter(Boolean)
          .join(" · ")}</p>${btn("Adjust scenario →", "go:path")}</div>`
      : ""
  }<div class="section-head"><h3>Worth considering</h3></div><p class="fine">Suggestions become checkable after you adopt them.</p>${row("Review vitamin D with your clinician", "Based on your Sep 1 result · 24 ng/mL", "sheet:suggestion", "", "sun")}<div class="research-note"><span class="kicker">CLOSE THE LOOP</span><b>Retest, then adjust.</b><p>Recheck your lipid panel around Nov 29 to compare the scenario with measured results.</p>${btn(state.reminder ? "Reminder added ✓" : "Add a retest reminder →", "reminder")}</div>`;
}
function calendar(p) {
  return `${head("YOUR PATH", "Consistency,<br>not perfection.")}${tabs(
    [
      ["Explore", "path"],
      ["My plan", "plan"],
      ["History", "calendar"],
    ],
    p.view,
  )}<div class="section-head"><h3>September 2026</h3><span class="streak">${icon("fire")} 6 days</span></div><div class="calendar">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<small style="text-align:center">${d}</small>`).join("")}<span></span>${Array.from({ length: 30 }, (_, i) => `<span class="${i < 6 ? "complete" : ""} ${i === 5 ? "now" : ""}">${i + 1}${i < 5 ? " ✓" : ""}</span>`).join("")}</div><p class="explain">A day counts when you complete at least one planned action. A missed day doesn’t erase your progress.</p><h3>Your last 7 days</h3><div class="health-grid"><div><small>Daily energy</small><strong>1,940</strong> <em>kcal</em></div><div><small>Protein</small><strong>112</strong> <em>g / day</em></div><div><small>Steps</small><strong>7,420</strong> <em>/ day</em></div><div><small>Sleep</small><strong>7h 24</strong> <em>min</em></div></div>${row("See your weight trend", "Measured readings and an optional scenario", "go:trends", "", "path")}`;
}
function blood() {
  return `${back(null, "Your biology")}${head("LAB RESULTS · SEP 1", "Start with<br>what matters.")}<p class="explain">Your cholesterol connects directly to your current plan. Explore everything else at your own pace.</p><div class="section-head"><h3>Your current focus</h3><span class="badge">Measured</span></div>${markerData.map((m, i) => row(m[0], `<span class="dot ${[2, 3, 4, 6].includes(i) ? "good" : ""}"></span>${m[3]}`, `marker:${m[4]}`, `${m[1]}<small>${m[2]}</small>`)).join("")}${btn(`${icon("plus")} Add a lab result`, "sheet:lab", "primary")}${row("Original lab report", "Sep 1, 2026 · sample source record", "sheet:source", "", "file")}`;
}
function marker(p) {
  const m = markerData.find((m) => m[4] === p.marker) || markerData[0];
  const ldl = m[4] === "LDL";
  return `${back(null, "Blood markers")}${head("MEASURED · SEP 1, 2026", m[0])}<div class="detail-value">${m[1]} <span>${m[2]}</span></div><p class="fine">${m[3]} · sample lab report</p>${ldl ? '<div class="ruler"></div><div class="ruler-labels"><span>Lower</span><span>Your goal &lt;100</span><span>160 mg/dL</span></div>' : ""}<p class="explain">${ldl ? "<b>A result is a starting point.</b> Your latest LDL is 118, down from 126 in June. The next question is which changes you can sustain—and what your next test shows." : "This measurement is one part of your story. Compare it with prior results, the laboratory reference interval and your clinician’s interpretation."}</p>${ldl ? row("Explore your LDL scenario", "Food, movement and realistic consistency", "go:path", "", "path") : ""}<details class="accordion"><summary>Past measurements</summary><p>${ldl ? "Jun 3: 126 mg/dL · Aug 1: 122 mg/dL · Sep 1: 118 mg/dL" : "Sep 1: " + m[1] + " " + m[2] + ". No earlier readings in this demo."}</p></details><details class="accordion"><summary>Why this is in your plan</summary><p>${ldl ? "Your selected goal is below 100 mg/dL. Personal targets depend on your overall risk and should be agreed with your clinician." : "This marker is included in your September baseline. It is not used to calculate your weight scenario."}</p></details><details class="accordion"><summary>Source & measurement quality</summary><p>Demo lab report · Sep 1, 2026 · fasting sample. Values in this prototype are fixtures. In the app, this opens the original report and extraction record.</p></details>${row("Does genetics change the picture?", "See the context, with its limits", "go:genes", "", "dna")}${btn("Ask about this result", "sheet:chat", "primary")}`;
}
function body() {
  const total = state.meals.reduce((s, m) => s + m.kcal * m.portion, 0);
  return `${back(null, "Your biology")}${head("BODY & DAILY LIFE", "The everyday<br>part of the story.")}${tabs(
    [
      ["Today", "body"],
      ["Trends", "trends"],
    ],
    "body",
  )}<div class="health-grid"><div><small>Weight · today</small><strong>${state.weight.toFixed(1)}</strong> <em>kg</em></div><div><small>Movement</small><strong>6,420</strong> <em>steps</em></div><div><small>Sleep last night</small><strong>7h 42</strong> <em>min</em></div><div><small>Strength this week</small><strong>2 / 3</strong> <em>sessions</em></div></div><p class="fine">${state.health ? "↻ Apple Health · synced at 11:32" : "Apple Health disconnected · showing last synced data"}</p><div class="section-head"><h3>Today’s meals</h3>${btn("+ Add", "sheet:add", "text-btn")}</div>${state.meals.length ? state.meals.map(mealRow).join("") : '<p class="explain">Nothing logged yet. Add a meal with a photo or a few words.</p>'}<div class="section-head"><span>Logged so far</span><b>${Math.round(total)} <small>kcal est.</small></b></div><div class="macros">${[
    ["p", "Protein"],
    ["c", "Carbs"],
    ["f", "Fat"],
  ]
    .map(
      ([k, n]) =>
        `<div><b>${Math.round(state.meals.reduce((s, m) => s + m[k] * m.portion, 0))}g</b><small>${n}</small></div>`,
    )
    .join(
      "",
    )}</div>${row("Log a weigh-in", "A single measurement or a weekly trend", "sheet:weight", "", "plus")}${row("Connected health data", "Manage sync and data sources", "go:connections", "", "sync")}`;
}
function trends(p) {
  return `${back(null, "Body & daily life")}${head("BODY / TRENDS", "A direction.<br>Not a daily verdict.")}${tabs(
    [
      ["Today", "body"],
      ["Trends", "trends"],
    ],
    "trends",
  )}<div class="detail-value">${state.weight.toFixed(1)} <span>kg · today</span></div><p class="explain">Down 1.2 kg since August 1.<br>Daily fluctuations are part of the picture.</p><div class="forecast">${forecast({ ...p, metric: "Weight" })}</div><p class="fine">Solid history: measured. Shaded future: illustrative scenario.</p>${row("Weight goal", "Selected goal · adjustable", "sheet:goal", `${state.weightGoal}<small>kg</small>`)}${row("Review the habits behind this", "Adjust your scenario and consistency", "go:path", "", "path")}${row("Log today’s weight", "Add a manual reading", "sheet:weight", "", "plus")}`;
}
function genes() {
  return `${back(null, "Your biology")}${head("GENETIC CONTEXT", "A clue.<br>Not your destiny.")}<div class="biology-map" style="height:115px"><div class="biology-core">${icon("dna")}</div></div><h3>What you inherit is only<br>part of the picture.</h3><p class="explain">Your measured blood markers tell us what is happening now. Genetic findings can add context to the conversation about risk.</p><div class="research-note"><span class="kicker">EXAMPLE · LIPID METABOLISM</span><b>APOE · a place to look deeper</b><p>No genotype or risk result is asserted in this demo. A real report would show the tested variant, evidence and its limits.</p></div><details class="accordion"><summary>How this would influence my plan</summary><p>A supported genetic finding may help prioritize a clinician discussion or follow-up testing. It does not guarantee a dietary response and does not multiply your forecast.</p></details><details class="accordion"><summary>What we need before interpreting</summary><p>Verified variant calls, test quality, ancestry context, relevant evidence and your medical history. A raw consumer file alone is not a diagnosis.</p></details>${row("Connect a genetic report", "Preview import and review", "sheet:genefile", "", "file")}${row("Return to measured markers", "Your September baseline", "go:blood", "", "blood")}`;
}
function research() {
  return `${back(null, "Your biology")}${head("RESEARCH & SOURCES", "Show me<br>the reasoning.")}<p class="explain">The evidence behind each suggestion belongs next to the action it supports.</p>${[
    ["Food quality & cholesterol", "Dietary patterns · guidance"],
    ["Movement & consistency", "Activity · guidance"],
    ["Why genetic risk is not a forecast", "Genetics · interpretation"],
  ]
    .map(([t, s], i) => row(t, s, `paper:${i}`, "", "book"))
    .join(
      "",
    )}<div class="research-note"><span class="kicker">YOUR DATA, TRACEABLE</span><b>Every signal has a source.</b><p>Sep 1 blood panel · daily Apple Health readings · your meal estimates. A meal estimate never becomes a measured lab result.</p></div>${row("September lab report", "Sample document record", "sheet:source", "", "file")}${btn("Ask how this connects to me", "sheet:chat", "primary")}`;
}
function connections() {
  return `${back(null, "Your biology")}${head("CONNECTIONS", "Your inputs,<br>in one place.")}${row("Apple Health", state.health ? "Connected · synced 11:32" : "Disconnected · old readings retained", "health", state.health ? "On" : "Off", "heart")}${row("Lab reports", "1 sample report · 7 markers", "sheet:lab", "", "blood")}${row("Genetic report", "No verified report imported", "sheet:genefile", "", "dna")}<p class="explain">This prototype simulates connections. Your device data and files are never accessed.</p>${btn("Export sample summary", "export", "primary")}`;
}
function meal(p) {
  const m = state.meals.find((m) => m.id === p.meal);
  if (!m) return body();
  return `${back(null, "Today’s meals")}<span class="kicker">MEAL DETAIL · ESTIMATED</span><img class="meal-photo" src="${m.img}" alt="${esc(m.name)}"><h2>${esc(m.name)}</h2><small>${m.time} · Sunday, September 6</small><div class="portion"><span>Portions</span><div class="stepper">${btn("−", "portion:-0.5", "", `aria-label="Decrease portion" ${m.portion <= 0.5 ? "disabled" : ""}`)}<output>${m.portion}</output>${btn("+", "portion:0.5", "", 'aria-label="Increase portion"')}</div></div><div class="detail-value">${Math.round(m.kcal * m.portion)} <span>kcal est.</span></div><div class="macros">${[
    ["p", "Protein"],
    ["c", "Carbs"],
    ["f", "Fat"],
  ]
    .map(
      ([k, l]) =>
        `<div><b>${Math.round(m[k] * m.portion)}g</b><small>${l}</small></div>`,
    )
    .join(
      "",
    )}</div><p class="fine">Estimated from a sample meal. Portion changes update the whole day.</p>${row("Edit meal & nutrition", "Name, ingredients and estimated values", "sheet:editmeal", "", "file")}${row("Fix the estimate", "Tell us what we missed", "sheet:fix", "", "plus")}<p class="fine">Saved in this prototype · not written to Apple Health</p>${btn("Delete meal", "sheet:delete", "danger")}`;
}
function render(i) {
  const p = phones[i],
    el = $(`#phone${i}`),
    scroll = $(".content", el)?.scrollTop || 0;
  const views = {
    today,
    path,
    you,
    plan,
    calendar,
    blood,
    marker,
    body,
    trends,
    genes,
    research,
    connections,
    meal,
  };
  el.innerHTML = `<div class="status"><span>9:41</span><div class="island"></div><span class="status-icons">${icon("signal")}${icon("battery")}</span></div><div class="content"><div class="screen">${(views[p.view] || today)(p)}</div></div><nav class="nav" aria-label="Phone ${i + 1} navigation">${[
    ["home", "Today", "today"],
    ["path", "Path", "path"],
    ["you", "You", "you"],
  ]
    .map(([ic, t, v]) =>
      btn(
        `${icon(ic)}<span>${t}</span>`,
        `go:${v}`,
        p.tab === v ? "active" : "",
        p.tab === v ? 'aria-current="page"' : "",
      ),
    )
    .join(
      "",
    )}${btn(icon("plus"), "sheet:add", "add", 'aria-label="Add a meal, weight, note or record"')}</nav>`;
  $(".content", el).scrollTop = p.resetScroll ? 0 : scroll;
  p.resetScroll = false;
  if (p.sheet) renderSheet(i);
}
function renderAll() {
  phones.forEach((_, i) => render(i));
}
function go(i, v) {
  const p = phones[i];
  p.view = v;
  p.tab = ["today"].includes(v)
    ? "today"
    : ["path", "plan", "calendar"].includes(v)
      ? "path"
      : "you";
  p.sheet = null;
  p.resetScroll = true;
  render(i);
}
function toast(i, message, undo) {
  const el = $(`#phone${i}`);
  $(".toast", el)?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(message)}</span>${undo ? "<button>Undo</button>" : ""}`;
  el.append(t);
  if (undo)
    $("button", t).onclick = () => {
      undo();
      t.remove();
    };
  setTimeout(() => t.remove(), 4500);
}
function field(label, name, value, type = "text") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === "number" ? 'min="0" step="any"' : ""}></label>`;
}
function renderSheet(i) {
  const p = phones[i],
    el = $(`#phone${i}`);
  $(".sheet", el)?.remove();
  const s = p.sheet,
    m = state.meals.find((m) => m.id === p.meal);
  let title = "",
    body = "";
  if (s === "add") {
    title = "Add to your day";
    body = `<p class="intro-text">A meal. A moment.<br>A little more context.</p><label class="field">What would you like to log?<textarea id="note-${i}" placeholder="Sardines on rye for lunch, then a 15-minute walk…"></textarea></label>${btn(`Review entry ${icon("arrow")}`, "read:text", "primary", `disabled id="send-${i}"`)}<div class="add-options">${btn(`${icon("camera")} Meal photo`, "read:photo")}${btn(`${icon("mic")} Voice demo`, "read:voice")}${btn(`${icon("plus")} Weight`, "sheet:weight")}${btn(`${icon("file")} Lab report`, "sheet:lab")}</div><p class="fine">Demo entries stay in this page. Photo and voice use a sample, with a review before saving.</p>`;
  }
  if (s === "reading") {
    title = "Making sense of it";
    body = `${p.capture === "photo" ? '<img class="meal-photo" src="img/03-sardines-rye.jpg" alt="Sample sardines on rye meal">' : ""}<div class="processing"><div class="spinner"></div><b>${p.capture === "photo" ? "Looking at the sample plate…" : p.capture === "voice" ? "Transcribing sample audio…" : "Reading your entry…"}</b><small>Preparing an estimate for you to review</small></div>`;
  }
  if (s === "review") {
    title = "Check before keeping";
    body =
      p.capture === "text"
        ? `<span class="badge">Note · ready to save</span><p class="question">${esc(p.entry)}</p><p class="explain">Keep your exact words as a daily note. Your words remain a note in this demo. Meal extraction is available in the sample photo and voice flows.</p>${btn("Keep this note", "keep:note", "primary")}`
        : `<img class="meal-photo" src="img/03-sardines-rye.jpg" alt="Sample sardines on rye"><span class="kicker">${p.capture === "voice" ? "SAMPLE TRANSCRIPT" : "SAMPLE PHOTO"} · ESTIMATE</span><h2 style="margin-top:10px">Sardines on rye</h2><p class="explain">One can of sardines, two slices of rye, tomato and a little olive oil.</p><div class="macros"><div><b>420</b><small>kcal est.</small></div><div><b>32g</b><small>Protein</small></div><div><b>34g</b><small>Carbs</small></div></div><p class="fine">Check the portion and ingredients after saving. This is a preset demo estimate.</p>${btn("Keep this meal", "keep:meal", "primary")}`;
  }
  if (s === "receipt") {
    title = "Kept in your day";
    body = `<div class="receipt-icon">✓</div><h2>A little more<br>of the picture.</h2><div class="chips"><span class="chip">${p.kept === "meal" ? "Meal · 420 kcal est." : "Daily note"}</span><span class="chip">Today</span></div><p class="explain">${p.kept === "meal" ? "Your meal and its estimate are now in today’s log. You can edit or delete it any time." : "Your exact words have been saved for this session."}</p><p class="fine">Kept: ${p.kept === "meal" ? "name, portion and sample nutrition" : esc(p.entry)}</p>${btn("Back to my day", "receipt:done", "primary")}${btn("Undo this entry", "receipt:undo", "danger")}`;
  }
  if (s === "weight") {
    title = "Log your weight";
    body = `<p class="explain">One reading is a data point. The trend tells the story.</p><form data-form="weight">${field("Weight (kg)", "weight", state.weight, "number")}<p class="fine">Today · manual entry</p><button class="primary" type="submit">Save weigh-in</button><p class="fine form-error" role="alert"></p></form>`;
  }
  if (s === "method") {
    title = "Behind the scenario";
    body = `<h2>Honest about<br>what we don’t know.</h2><p class="explain">This is a design demonstration. Its ranges are illustrative, not calibrated clinical predictions.</p>${[
      [
        "Your baseline",
        "Latest measured blood result, weight history and the dates they were collected.",
      ],
      [
        "A realistic routine",
        "Selected habits and the proportion of days you expect to follow them. Sliders express intention, not measured adherence.",
      ],
      [
        "Evidence, with limits",
        "A production model needs validated effects, timing and overlap between interventions. It must not just add every benefit together.",
      ],
      [
        "Genetic context",
        "Useful context when supported. Not a guaranteed response or a numeric multiplier.",
      ],
      [
        "The feedback loop",
        "Compare the scenario with actual weight trends and a new blood draw. Update the plan from measured change.",
      ],
    ]
      .map(
        ([h, t]) =>
          `<details class="accordion" open><summary>${h}</summary><p>${t}</p></details>`,
      )
      .join("")}`;
  }
  if (s === "lab" || s === "genefile") {
    title = s === "lab" ? "Add a blood panel" : "Add a genetic report";
    body = `<p class="intro-text">The source comes first.</p><p class="explain">Preview how a ${s === "lab" ? "lab report becomes a reviewed set of results" : "genetic report is checked before interpretation"}.</p><div class="research-note"><span class="kicker">SAMPLE FILE</span><b>${s === "lab" ? "September-panel.pdf" : "Genetic-report.pdf"}</b><p>${s === "lab" ? "7 markers · September 1, 2026" : "Quality and variant review required"}</p></div>${btn("Preview sample review", s === "lab" ? "sheet:labreview" : "sheet:genereview", "primary")}<p class="fine">This prototype doesn’t upload or read your files.</p>`;
  }
  if (s === "labreview") {
    title = "Review extracted results";
    body = `<span class="badge">Sample · review required</span>${markerData
      .slice(0, 3)
      .map(
        (m) =>
          `<div class="row"><span class="row-copy"><b>${m[0]}</b><small>Sep 1 · extracted from sample PDF</small></span><span>${m[1]} ${m[2]}</span></div>`,
      )
      .join(
        "",
      )}<p class="explain">In the app, confirm dates, units and extraction against the source before saving.</p>${btn("View existing sample panel", "go:blood", "primary")}<p class="fine">These sample values are already in the prototype. No duplicate panel will be created.</p>`;
  }
  if (s === "genereview") {
    title = "Report needs review";
    body = `<span class="badge">Interpretation paused</span><p class="intro-text">Let’s verify<br>the foundation.</p><p class="explain">Before showing an inherited risk, the app needs verified variant calls and test quality. This sample contains no actual genotype.</p>${btn("Explore genetic context", "go:genes", "primary")}`;
  }
  if (s === "source") {
    title = "Original source";
    body = `<span class="kicker">SAMPLE DOCUMENT RECORD</span><h2 style="margin-top:16px">September<br>blood panel</h2><p class="explain">Collected Sep 1, 2026 · fasting<br>7 sample observations · demo fixture</p>${markerData.map((m) => `<div class="row"><span class="row-copy"><b>${m[0]}</b></span><span>${m[1]} ${m[2]}</span></div>`).join("")}<p class="fine">In the app this view includes the original PDF, extraction details and correction history.</p>`;
  }
  if (s === "chat") {
    title = "Ask OpenVitals";
    body = `<span class="kicker">CONTEXT · YOUR PLAN & SEPTEMBER LABS</span><p class="intro-text">Make the connection.</p>${btn("Why focus on cholesterol?", "answer:cholesterol", "row")}${btn("How does weight affect the forecast?", "answer:weight", "row")}${btn("What do my genes change?", "answer:genes", "row")}<label class="field">Ask a question<textarea id="question-${i}" placeholder="What would you like to understand?"></textarea></label>${btn("Ask about my data", "answer:custom", "primary")}<p class="fine">Scripted assistant preview · not a live AI response.</p>`;
  }
  if (s === "answer") {
    title = "Your data, explained";
    body = `<span class="badge">Scripted preview</span><div class="question">${esc(p.question)}</div><div class="answer">${p.answer}</div><div class="chips"><span class="chip">1 · Sep 1 blood panel</span><span class="chip">2 · Current scenario</span></div>${btn("Ask another question", "sheet:chat", "primary")}`;
  }
  if (s === "suggestion") {
    title = "A suggested next step";
    body = `<span class="kicker">BASED ON YOUR BLOOD PANEL</span><h2 style="margin-top:15px">Review your<br>vitamin D result.</h2><p class="explain">Your sample result is 24 ng/mL. Discuss its significance and any next steps with your clinician.</p><p class="fine">Adopting adds a conversation reminder, not a supplement prescription.</p>${btn(state.vitaminAdopted ? "Reminder adopted ✓" : "Add to my plan", "adopt:vitamin", "primary")}`;
  }
  if (s === "goal") {
    title = "Your weight goal";
    body = `<form data-form="goal">${field("Selected weight goal (kg)", "goal", state.weightGoal, "number")}<button type="submit" class="primary">Save goal</button><p class="fine form-error" role="alert"></p></form><p class="explain">Your scenario and your goal are different things. The scenario shows a possible range; it doesn’t promise to reach this target.</p>${btn("Explore what feels realistic", "go:path", "primary")}`;
  }
  if (s === "editmeal" && m) {
    title = "Edit meal";
    body = `<form data-form="meal">${field("Meal name", "name", m.name)}${field("Calories per portion", "kcal", m.kcal, "number")}${field("Protein (g) per portion", "p", m.p, "number")}${field("Carbs (g) per portion", "c", m.c, "number")}${field("Fat (g) per portion", "f", m.f, "number")}<label class="field">Ingredients<textarea name="ingredients">${esc(m.ingredients || "Sardines, rye bread, tomato, olive oil")}</textarea></label><button type="submit" class="primary">Save changes</button><p class="fine form-error" role="alert"></p></form>`;
  }
  if (s === "fix" && m) {
    title = "Fix the estimate";
    body = `<p class="explain">In the app, describe a correction for the AI to review. Here you can directly edit the estimate and ingredients.</p>${btn("Edit nutrition & ingredients", "sheet:editmeal", "primary")}`;
  }
  if (s === "delete" && m) {
    title = "Delete this meal?";
    body = `<p class="explain">${esc(m.name)} will be removed from today’s log and nutrition totals.</p>${btn("Delete meal", "delete:confirm", "primary")}${btn("Keep meal", "close", "text-btn")}`;
  }
  if (s === "paper") {
    title = "Evidence note";
    const n = p.paper;
    body = `<span class="kicker">GUIDANCE · EXTERNAL SOURCE</span><h2 style="margin-top:15px">${["Food quality<br>& cholesterol", "Movement<br>& consistency", "Genetic risk<br>& its limits"][n]}</h2><p class="explain">${["Dietary guidance provides context for a food-first conversation. It does not validate the numerical effects shown in this mockup.", "Activity guidance can inform a routine. A particular walk or workout does not imply a guaranteed change in a blood marker.", "A genetic finding is one component of risk assessment. It is not a prediction of a particular individual’s response to a lifestyle change."][n]}</p><a class="primary" href="${["https://www.heart.org/en/healthy-living/healthy-eating/eat-smart/nutrition-basics/aha-diet-and-lifestyle-recommendations", "https://www.who.int/news-room/fact-sheets/detail/physical-activity", "https://www.genome.gov/Health/Genomics-and-Medicine/Polygenic-risk-scores"][n]}" target="_blank" rel="noopener noreferrer">Open ${["American Heart Association", "World Health Organization", "National Human Genome Research Institute"][n]} ↗</a><p class="fine">External guidance; not a source for the prototype’s invented scenario numbers.</p>`;
  }
  const sheet = document.createElement("section");
  sheet.className = "sheet";
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-label", title);
  sheet.innerHTML = `<div class="sheet-header"><h3>${title}</h3>${btn("×", "close", "", 'aria-label="Close panel"')}</div>${body}`;
  el.append(sheet);
  for (const child of el.children) {
    if (child !== sheet && !child.classList.contains("toast"))
      child.inert = true;
  }
}
function openSheet(i, s) {
  phones[i].sheet = s;
  renderSheet(i);
  $(".sheet-header button", $(`#phone${i}`))?.focus({ preventScroll: true });
}
function refreshForecast() {
  phones.forEach((p, i) => {
    if (p.view === "path") {
      const el = $(`#phone${i}`);
      $(".forecast", el).innerHTML = forecast(p);
      $(".effort-value", el).textContent = `${state.effort}% of days`;
      $("input[type=range]", el).value = state.effort;
    }
  });
}
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  const phone = b.closest(".phone");
  if (!phone) return;
  const i = Number(phone.id.slice(-1)),
    p = phones[i],
    [a, ...parts] = b.dataset.action.split(":"),
    v = parts.join(":");
  if (a === "go") go(i, v);
  if (a === "back") {
    go(
      i,
      {
        marker: "blood",
        meal: "body",
        trends: "body",
        blood: "you",
        body: "you",
        genes: "you",
        research: "you",
        connections: "you",
      }[p.view] || p.tab,
    );
  }
  if (a === "sheet") openSheet(i, v);
  if (a === "close") {
    p.sheet = null;
    render(i);
    $(".nav .add", phone)?.focus({ preventScroll: true });
  }
  if (a === "habit") {
    const j = +v;
    state.done[j] = !state.done[j];
    renderAll();
  }
  if (a === "metric") {
    if (p.view === "trends") {
      go(i, "path");
    }
    p.metric = v;
    render(i);
  }
  if (a === "lever") {
    state.levers[+v] = !state.levers[+v];
    renderAll();
  }
  if (a === "adopt") {
    if (v === "vitamin") {
      if (!state.vitaminAdopted) {
        state.vitaminAdopted = true;
        state.done[4] = false;
        habits.push([
          "Discuss vitamin D result",
          "Conversation reminder · next appointment",
        ]);
      }
      p.sheet = null;
      renderAll();
      toast(i, "Vitamin D discussion added to your plan");
    } else {
      state.adopted = true;
      state.savedPlan = { effort: state.effort, levers: [...state.levers] };
      go(i, "plan");
      toast(i, "Your chosen routine is saved");
    }
  }
  if (a === "reminder") {
    state.reminder = true;
    renderAll();
    toast(i, "Retest reminder set for November 29");
  }
  if (a === "marker") {
    p.marker = v;
    go(i, "marker");
  }
  if (a === "meal") {
    p.meal = +v;
    go(i, "meal");
  }
  if (a === "portion") {
    const m = state.meals.find((m) => m.id === p.meal);
    m.portion = Math.min(10, Math.max(0.5, m.portion + Number(v)));
    renderAll();
  }
  if (a === "read") {
    p.capture = v;
    p.entry = v === "text" ? $(`#note-${i}`).value.trim() : "";
    if (v === "text" && !p.entry) return;
    openSheet(i, "reading");
    setTimeout(() => {
      if (p.sheet === "reading") {
        openSheet(i, "review");
      }
    }, 1400);
  }
  if (a === "keep") {
    p.kept = v;
    if (v === "meal") {
      const m = {
        id: Date.now(),
        name: "Sardines on rye",
        kcal: 420,
        p: 32,
        c: 34,
        f: 17,
        portion: 1,
        time: "13:10",
        img: "img/03-sardines-rye.jpg",
      };
      p.newMeal = m.id;
      state.meals.push(m);
    } else {
      p.previousNote = state.note;
      state.note = p.entry;
    }
    p.sheet = "receipt";
    renderAll();
  }
  if (a === "receipt") {
    if (v === "undo") {
      if (p.kept === "meal")
        state.meals = state.meals.filter((m) => m.id !== p.newMeal);
      else state.note = p.previousNote;
    }
    go(i, "today");
    renderAll();
    if (v === "undo") toast(i, "Entry removed");
  }
  if (a === "delete" && v === "confirm") {
    const index = state.meals.findIndex((m) => m.id === p.meal),
      removed = state.meals.splice(index, 1)[0];
    go(i, "body");
    renderAll();
    toast(i, "Meal deleted", () => {
      state.meals.splice(index, 0, removed);
      renderAll();
    });
  }
  if (a === "answer") {
    const questions = {
      cholesterol: "Why focus on cholesterol?",
      weight: "How does weight affect the forecast?",
      genes: "What do my genes change?",
    };
    p.question = questions[v] || $(`#question-${i}`).value.trim();
    if (!p.question) return;
    const answers = {
      cholesterol:
        "Your sample LDL is <b>118 mg/dL</b> [1], above the selected goal. The plan starts with a manageable food and movement routine [2]. A repeat lipid panel checks whether your actual result changes.",
      weight:
        "Your current sample weight is <b>" +
        state.weight.toFixed(1) +
        " kg</b>. Weight trends are a useful input, but the forecast here is illustrative [2]. A real model would account for baseline, observed change and overlapping effects instead of assuming that every kilogram produces a fixed LDL reduction.",
      genes:
        "No verified genotype is present in this prototype. A real genetic result could add context to risk, but it should not be used as a guaranteed lifestyle-response multiplier [2].",
    };
    p.answer =
      answers[v] ||
      "This is a scripted preview, so it cannot answer a new question. In the app, the assistant would retrieve relevant records and cite them. Try one of the three sample questions to explore that interaction.";
    openSheet(i, "answer");
  }
  if (a === "paper") {
    p.paper = +v;
    openSheet(i, "paper");
  }
  if (a === "health") {
    state.health = !state.health;
    renderAll();
    toast(
      i,
      state.health
        ? "Sample Health connection enabled"
        : "Sample Health connection disabled",
    );
  }
  if (a === "export") {
    const data = {
      notice: "OpenVitals design prototype — sample data only",
      weightKg: state.weight,
      markers: markerData.map((m) => ({
        name: m[0],
        value: m[1],
        unit: m[2],
        date: "2026-09-01",
      })),
      plan: state.savedPlan || null,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "openvitals-sample-summary.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(i, "Sample summary downloaded");
  }
});
document.addEventListener("input", (e) => {
  const el = e.target,
    phone = el.closest(".phone");
  if (!phone) return;
  const i = Number(phone.id.slice(-1));
  if (el.type === "range") {
    state.effort = Number(el.value);
    refreshForecast();
  }
  if (el.id === `note-${i}`) $(`#send-${i}`).disabled = !el.value.trim();
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const i = Number(form.closest(".phone").id.slice(-1)),
    p = phones[i],
    data = new FormData(form);
  if (form.dataset.form === "goal") {
    const g = Number(data.get("goal"));
    if (!Number.isFinite(g) || g < 20 || g > 350) {
      $(".form-error", form).textContent =
        "Enter a goal between 20 and 350 kg.";
      return;
    }
    state.weightGoal = g;
  } else if (form.dataset.form === "weight") {
    const w = Number(data.get("weight"));
    if (!Number.isFinite(w) || w < 20 || w > 350) {
      $(".form-error", form).textContent =
        "Enter a weight between 20 and 350 kg.";
      return;
    }
    state.weight = w;
    state.done[1] = true;
    state.manualWeight = true;
  } else {
    const m = state.meals.find((m) => m.id === p.meal);
    if (!String(data.get("name")).trim()) {
      $(".form-error", form).textContent = "Give this meal a name.";
      return;
    }
    m.name = String(data.get("name")).trim();
    m.ingredients = String(data.get("ingredients"));
    for (const k of ["kcal", "p", "c", "f"])
      m[k] = Math.max(0, Number(data.get(k)));
  }
  p.sheet = null;
  renderAll();
  toast(
    i,
    form.dataset.form === "goal"
      ? "Goal updated"
      : form.dataset.form === "weight"
        ? "Weigh-in saved"
        : "Meal updated",
  );
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    const sheet = e.target.closest(".sheet");
    if (sheet) {
      const items = [
        ...sheet.querySelectorAll(
          "button:not(:disabled),a[href],input,textarea,select,summary",
        ),
      ];
      const first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && e.target === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && e.target === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  if (e.key === "Escape") {
    phones.forEach((p, i) => {
      if (p.sheet) {
        p.sheet = null;
        render(i);
        $(".nav .add", $(`#phone${i}`))?.focus({ preventScroll: true });
      }
    });
  }
});
$("#theme").onclick = () => {
  const dark = document.body.classList.toggle("dark");
  $("#theme").setAttribute("aria-pressed", String(dark));
};
document.querySelectorAll("[data-preview]").forEach(
  (b) =>
    (b.onclick = () => {
      document.querySelectorAll("[data-preview]").forEach((x) => {
        x.classList.toggle("selected", x === b);
        x.setAttribute("aria-pressed", String(x === b));
      });
      document
        .querySelectorAll(".study")
        .forEach((x) =>
          x.classList.toggle("visible", x.dataset.study === b.dataset.preview),
        );
    }),
);
$(".study").classList.add("visible");
renderAll();
