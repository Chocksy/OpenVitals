"use strict";
// Session-only design fixtures. No medical inference, AI calls, device data or uploads.
const $ = (q, r = document) => r.querySelector(q);
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const I = (name, cls = "") =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ORBIT_ICONS[name] || ORBIT_ICONS.circle}</svg>`;
const B = (text, action, cls = "", attrs = "") =>
  `<button class="${cls}" data-action="${action}" ${attrs}>${text}</button>`;
const state = {
  cycleMode: "regular",
  lastCycleMode: "regular",
  cycleLength: 28,
  start: "2026-08-16",
  symptoms: ["Bloating", "Lower energy"],
  done: [true, true, true, false, false],
  weight: 68.4,
  weightGoal: 66,
  manualWeight: false,
  health: true,
  scope: { blood: true, life: true, cycle: true, genes: true },
  effort: 80,
  levers: [true, true, false],
  plan: null,
  reminder: false,
  notes: [],
  meals: [
    {
      id: 1,
      name: "Oats, berries & yogurt",
      time: "08:30",
      img: "img/02-oats.jpg",
      kcal: 380,
      p: 24,
      c: 48,
      f: 10,
      portion: 1,
      ingredients: "Oats, mixed berries, yogurt",
    },
    {
      id: 2,
      name: "Sardines on rye",
      time: "12:45",
      img: "img/03-sardines-rye.jpg",
      kcal: 420,
      p: 32,
      c: 34,
      f: 17,
      portion: 1,
      ingredients: "Sardines, rye bread, tomato, olive oil",
    },
  ],
};
const views = [
  {
    view: "whole",
    tab: "whole",
    node: "blood",
    lens: "all",
    day: 22,
    panel: null,
    topic: "overview",
    messages: [],
  },
  {
    view: "cycle",
    tab: "whole",
    node: "cycle",
    lens: "energy",
    day: 22,
    panel: null,
    topic: "overview",
    messages: [],
  },
  {
    view: "chat",
    tab: "chat",
    node: "blood",
    lens: "all",
    day: 22,
    panel: null,
    topic: "overview",
    messages: [],
  },
];
const habits = [
  {
    name: "Fibre-rich breakfast",
    sub: "Food · part of your cholesterol routine",
    group: "food",
    icon: "utensils",
  },
  {
    name: "A balanced lunch",
    sub: "Food · logged at 12:45",
    group: "food",
    icon: "utensils",
  },
  {
    name: "Morning movement",
    sub: "Movement · 20 minutes from Apple Health",
    group: "move",
    icon: "footprints",
  },
  {
    name: "A walk after lunch",
    sub: "Movement · 15 minutes, at your pace",
    group: "move",
    icon: "footprints",
  },
  {
    name: "Start winding down",
    sub: "Rest · your 22:30 reminder",
    group: "rest",
    icon: "moon",
  },
];
const groupColor = {
  food: "var(--copper)",
  move: "var(--blue)",
  rest: "var(--green)",
};
const markerRows = [
  {
    id: "ldl",
    name: "LDL cholesterol",
    v: 118,
    unit: "mg/dL",
    sub: "Above selected goal · under 100",
    ref: "Lab reference: below 130 mg/dL. Selected goal: under 100 mg/dL; discuss your personal target with your clinician.",
  },
  {
    id: "ferritin",
    name: "Ferritin",
    v: 24,
    unit: "ng/mL",
    sub: "Within lab interval · view context",
    ref: "Sample lab interval: 15–150 ng/mL. This value alone does not establish or exclude the cause of fatigue.",
  },
  {
    id: "hba1c",
    name: "HbA1c",
    v: 5.4,
    unit: "%",
    sub: "Within lab interval",
    ref: "Sample lab interval: 4.0–5.6%.",
  },
  {
    id: "hemoglobin",
    name: "Hemoglobin",
    v: 12.8,
    unit: "g/dL",
    sub: "Within lab interval",
    ref: "Sample lab interval: 12.0–15.5 g/dL.",
  },
  {
    id: "estradiol",
    name: "Estradiol",
    v: 151,
    unit: "pg/mL",
    sub: "Timing matters · view draw context",
    ref: "Interpretation depends on collection timing, cycle context, medications and the laboratory’s phase-specific intervals. No status assigned from this sample alone.",
  },
];
const sourceDefs = {
  blood: {
    name: "Blood results",
    sub: "5 sample markers · Sep 1",
    icon: "droplets",
  },
  life: {
    name: "Daily life",
    sub: "Sleep, movement, meals & weight",
    icon: "heart-pulse",
  },
  cycle: {
    name: "Cycle & symptoms",
    sub: "Period dates and your check-ins",
    icon: "flower-2",
  },
  genes: {
    name: "Genetic report",
    sub: "Sample report · interpretation pending",
    icon: "dna",
  },
};
const cycleOn = () => state.cycleMode !== "off";
const cycleDay = () =>
  Math.max(
    1,
    Math.round(
      (Date.UTC(2026, 8, 6) - new Date(state.start + "T00:00:00Z").getTime()) /
        86400000,
    ) + 1,
  );
const regular = () => state.cycleMode === "regular";
const countDone = () => state.done.filter(Boolean).length;
const availableScope = () =>
  Object.keys(sourceDefs).filter(
    (k) => state.scope[k] && (k !== "cycle" || cycleOn()),
  );
function row(title, sub, action, icon = "", value = "") {
  return B(
    `${icon ? I(icon) : ""}<span class="row-copy"><b>${title}</b><small>${sub}</small></span>${value ? `<span class="row-value">${value}</span>` : ""}${I("chevron-right")}`,
    action,
    "data-row",
  );
}
function heading(kicker, title, right = "") {
  return `<div class="top"><span class="eyeline">${kicker}</span>${right}</div><div class="heading"><h2>${title}</h2></div>`;
}
function back(label = "Whole you") {
  return B(`${I("chevron-left")}${label}`, "back", "back");
}
function pills(items, active) {
  return `<div class="segmented">${items.map(([label, action, key]) => B(label, action, key === active ? "selected" : "", `aria-pressed="${key === active}"`)).join("")}</div>`;
}
function ringCounts() {
  return ["food", "move", "rest"].map((g) => ({
    group: g,
    total: habits.filter((h) => h.group === g).length,
    done: habits.filter((h, i) => h.group === g && state.done[i]).length,
  }));
}
function rings(large = false) {
  const groups = ringCounts();
  return `<div class="rings ${large ? "ring-large" : ""}" role="img" aria-label="${countDone()} of 5 daily actions complete: ${groups.map((g) => `${g.group} ${g.done} of ${g.total}`).join(", ")}"><svg viewBox="0 0 120 120">${groups
    .map((g, i) => {
      const r = 51 - i * 12,
        c = 2 * Math.PI * r;
      return `<circle class="ring-track" cx="60" cy="60" r="${r}"/><circle class="ring-progress" cx="60" cy="60" r="${r}" stroke="${groupColor[g.group]}" stroke-dasharray="${g.done ? (g.done / g.total) * c : 0} ${c}" ${g.done ? "" : 'style="opacity:0"'}/>`;
    })
    .join(
      "",
    )}</svg><div class="rings-label"><b>${countDone()}<span style="font-size:.55em;color:var(--muted)">/5</span></b><small>actions</small></div></div>`;
}
function ringKey(detail = false) {
  return `<div class="ring-key">${ringCounts()
    .map(
      (g) =>
        `<span><i style="background:${groupColor[g.group]}"></i>${{ food: "Nourish", move: "Move", rest: "Rest" }[g.group]} ${detail ? `<b>${g.done}/${g.total}</b>` : ""}</span>`,
    )
    .join("")}</div>`;
}
function map(p) {
  const cyc = cycleOn();
  const nodes = [
    ["food", "utensils", "Food", "Your daily choices"],
    ["genes", "dna", "Genes", "Inherited context"],
    ["blood", "droplets", "Blood", "Sep 1 · measured"],
    [
      cyc ? "cycle" : "body",
      cyc ? "flower-2" : "scale",
      cyc ? "Cycle" : "Body",
      cyc
        ? regular()
          ? `Day ${cycleDay()} · estimated`
          : "Your context"
        : `${state.weight.toFixed(1)} kg`,
    ],
    ["move", "footprints", "Movement", "6,420 steps"],
    ["sleep", "moon", "Sleep", "6h 18m last night"],
  ];
  const related =
    p.lens === "energy"
      ? ["sleep", "cycle", "blood"]
      : p.lens === "heart"
        ? ["food", "blood", "move", "genes"]
        : [p.node];
  return `<div class="system-map" aria-label="Your connected health map"><svg class="map-lines" viewBox="0 0 330 255" aria-hidden="true"><ellipse cx="165" cy="128" rx="105" ry="87" fill="none" stroke="var(--line)" stroke-width=".7"/>${[
    ["food", "M65 43Q127 38 165 128"],
    ["genes", "M263 43Q204 42 165 128"],
    ["blood", "M56 124H165"],
    [cyc ? "cycle" : "body", "M274 124H165"],
    ["move", "M69 216Q129 204 165 128"],
    ["sleep", "M270 216Q211 207 165 128"],
  ]
    .map(
      ([n, d]) =>
        `<path d="${d}" class="${related.includes(n) ? "related" : ""} ${related.includes(n) && n === "cycle" ? "cycle-line" : ""}"/>`,
    )
    .join(
      "",
    )}</svg><div class="map-core"><span>Maya</span><small>Whole you</small></div>${nodes.map(([id, ic, name, sub]) => B(`<span class="node-icon">${I(ic)}</span><span><b>${name}</b><small>${sub}</small></span>`, `node:${id}`, `node n-${id === "body" ? "cycle" : id} ${p.node === id ? "selected" : ""}`, `aria-pressed="${p.node === id}" aria-label="${name}: ${sub}. Explore connection"`)).join("")}</div><div class="map-legend"><span><i></i>Your data</span><span><i class="dashed"></i>Possible connection</span></div>`;
}
function connection(p) {
  const stories = {
    blood: [
      "BLOOD + DAILY LIFE",
      "A blood result.<br>A place to start.",
      "Your LDL is 118. Explore how food and movement connect to your chosen goal.",
      "Explore this connection",
      "detail:heart",
    ],
    food: [
      "FOOD + BLOOD",
      "Your everyday plate,<br>your longer-term picture.",
      "Meals give your cholesterol plan a daily action. A repeat draw checks what changed.",
      "See food & blood together",
      "detail:heart",
    ],
    sleep: [
      "SLEEP + HOW YOU FEEL",
      "Before blaming one signal,<br>look at last night.",
      "You logged 6h 18m of sleep and lower energy. That is context, not proof of a cause.",
      "Ask about my energy",
      "ask:energy",
    ],
    move: [
      "MOVEMENT + RECOVERY",
      "Consistency can be gentle.",
      "6,420 steps so far. Keep your routine flexible around how you actually feel.",
      "Open today’s actions",
      "go:today",
    ],
    genes: [
      "GENES + MEASURED RESULTS",
      "An inherited clue.<br>Not a prediction.",
      "A genetic report needs interpretation alongside your actual results and history.",
      "Explore genetic context",
      "go:genes",
    ],
    cycle: [
      "CYCLE + DAILY LIFE",
      "Your timing adds context.",
      "Put symptom logs beside sleep and weight. Look for patterns across cycles, not a rule for every day.",
      "See my cycle in context",
      "go:cycle",
    ],
    body: [
      "BODY + DAILY LIFE",
      "Zoom out from one weigh-in.",
      "Your weight trend is one piece of the picture. Sleep, meals and movement sit alongside it.",
      "Explore body trends",
      "go:body",
    ],
  };
  const d = stories[p.node] || stories.blood;
  return `<div class="connection-story ${p.node === "cycle" ? "cycle-story" : ""}"><span class="eyeline">${d[0]}</span><h3>${d[1]}</h3><p>${d[2]}</p>${B(`${d[3]} ${I("arrow-up-right")}`, d[4], "inline-link")}</div>`;
}
function whole(p) {
  return `${heading("Sunday, September 6", "Good afternoon, <em>Maya.</em>", '<div class="avatar">M</div>')}<div class="daily-orbit">${rings()}<div class="daily-copy"><h3>Your day is taking shape.</h3><p>${5 - countDone() ? `${5 - countDone()} small actions still open.` : "Your planned actions are complete."}</p>${ringKey()}${B(`Open my day ${I("arrow-right")}`, "go:today", "inline-link")}</div></div><div class="section-head"><h3>Your connected picture</h3>${B(I("sliders-horizontal"), "panel:settings", "", 'aria-label="Customize your health context"')}</div>${pills(
    [
      ["Whole you", "lens:all", "all"],
      ["Energy", "lens:energy", "energy"],
      ["Heart health", "lens:heart", "heart"],
    ],
    p.lens,
  )}${map(p)}${connection(p)}${row("Your latest blood draw", `Sep 1 · ${cycleOn() ? "cycle context attached" : "5 measured markers"}`, "go:blood", "droplets")}${row("Explore your possible trajectory", "Weight, LDL and realistic routines", "go:plan", "chart-no-axes-combined")}${row("All records & connections", "Your information, with sources", "go:records", "file-text")}`;
}
function cycleDial(p) {
  const length = state.cycleLength,
    day = Math.min(p.day, length),
    current = cycleDay();
  return `<div class="cycle-dial"><svg viewBox="0 0 330 236" role="group" aria-label="Explore sample cycle days"><circle cx="165" cy="119" r="75" fill="none" stroke="var(--line)" stroke-width=".8" stroke-dasharray="1 5"/>${Array.from(
    { length },
    (_, i) => {
      const n = i + 1,
        a = (i / length) * Math.PI * 2 - Math.PI / 2,
        x = 165 + 99 * Math.cos(a),
        y = 119 + 99 * Math.sin(a),
        sel = day === n;
      return `<g class="cycle-day ${sel ? "selected" : ""}" role="button" tabindex="0" data-day="${n}" aria-label="Cycle day ${n}${n === current ? ", today" : ""}" aria-pressed="${sel}"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="12.5" fill="transparent"/><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${sel ? 12 : 9}" fill="${sel ? "var(--rose)" : n <= 5 ? "var(--rose-soft)" : n < current ? "var(--soft)" : "var(--surface)"}" stroke="${n > current ? "var(--line)" : "none"}" stroke-width=".7"/><text x="${x.toFixed(2)}" y="${y.toFixed(2)}" style="${sel ? "fill:var(--surface);font-weight:600" : ""}">${n}</text></g>`;
    },
  ).join(
    "",
  )}<path d="M146 43h38" stroke="var(--rose)" stroke-width="2" opacity=".4" stroke-linecap="round"/></svg><div class="dial-label"><small>${day === current ? "Today · cycle day" : "Exploring day"}</small><strong>${day}</strong><span>${day <= 5 ? "Period days · logged" : day < 15 ? "Earlier cycle · estimated" : "Later cycle · estimated"}</span></div></div>`;
}
const cycleModes = {
  regular: "Regular cycles",
  irregular: "Irregular cycles",
  contraception: "Hormonal contraception",
  perimenopause: "Perimenopause",
  menopause: "Menopause",
  off: "Cycle tracking off",
};
function cycle(p) {
  if (!regular() || cycleDay() > state.cycleLength) return cycleAlternative(p);
  const viewingToday = p.day === cycleDay();
  return `${heading("YOUR CYCLE / YOUR CONTEXT", "A rhythm that’s<br>uniquely yours.", B(I("settings-2"), "panel:settings", "", 'aria-label="Cycle settings"'))}<div class="cycle-summary"><div><h3>${viewingToday ? (cycleDay() <= 5 ? "Period days, logged." : cycleDay() < 15 ? "Earlier in your cycle." : "Later in your cycle.") : "Explore your timeline."}</h3><p>${viewingToday ? "Make room for how you feel today." : "Tap a day to explore the sample record."}</p></div><span class="pill rose-pill">Calendar estimate</span></div>${cycleDial(p)}<div class="dial-controls">${B(I("chevron-left"), "day:previous", "", `aria-label="Previous cycle day" ${p.day <= 1 ? "disabled" : ""}`)}<span>${p.day === cycleDay() ? "Today" : `Day ${p.day}`} · ${B("Return to today", "day:today", "inline-link")}</span>${B(I("chevron-right"), "day:next", "", `aria-label="Next cycle day" ${p.day >= state.cycleLength ? "disabled" : ""}`)}</div><div class="phase-key"><span><i style="background:var(--rose)"></i>Period logged</span><span><i style="background:#c7cbbf"></i>Past days</span><span><i style="border:1px solid #a8b0a5"></i>Estimated length</span></div><div class="cycle-context"><span class="eyeline">${viewingToday ? "YOUR CONTEXT, SIDE BY SIDE" : "DAY " + p.day + " · SAMPLE RECORD"}</span><h3>${viewingToday ? "The scale is only one signal." : p.day === 17 ? "Your blood draw belongs here." : "A day is a place for context."}</h3><p>${viewingToday ? (state.symptoms.length ? "You logged " + state.symptoms.join(", ").toLowerCase() + ". " : "No symptoms logged today. ") + "Keep your check-in and sleep beside the weight trend before drawing conclusions." : p.day === 17 ? "September 1 · blood panel collected on cycle day 17. Calendar timing does not confirm a hormonal phase." : "No symptom entry is available for this sample day. Missing data stays unknown."}</p>${viewingToday ? `<div class="context-pair"><div><b>${state.weight.toFixed(1)} <small style="display:inline">kg</small></b><small>Today · weight reading</small></div><div><b>6h 18m</b><small>Last night · sleep</small></div></div>` : ""}</div><div class="section-head"><h3>How are you feeling today?</h3><small>Private check-in</small></div>${symptomPicker(p)}${B(`${I("plus")} Save today’s check-in`, "save:symptoms", "primary rose-button")}<p class="fine">Calendar timing is estimated; ovulation is not confirmed. This view is not a fertility or contraception tool.</p>${row("Ask how these signals fit together", "Use my cycle, sleep and weight context", "ask:overview", "message-circle")}${row("September 1 blood draw", "Day 17 · timing attached to the result", "go:blood", "droplets")}`;
}
function symptomPicker(p) {
  const selected = p.draftSymptoms || state.symptoms;
  return `<div class="symptom-chips">${["Bloating", "Lower energy", "Cramps", "Headache", "Feeling good"].map((s) => B(`${selected.includes(s) ? I("check") : I("plus")}${s}`, `symptom:${s}`, selected.includes(s) ? "selected" : "", `aria-pressed="${selected.includes(s)}"`)).join("")}</div>`;
}
function cycleAlternative(p) {
  const mode = state.cycleMode;
  const copy = {
    regular: [
      "Your dates need<br>a little more context.",
      "Your last logged period is beyond the typical length you entered. We won’t restart the cycle or assign a phase without a new logged start.",
    ],
    irregular: [
      "Your experience,<br>without a fixed clock.",
      "We’ll show period dates and symptoms without assigning a phase or predicting a next period.",
    ],
    contraception: [
      "Your context.<br>Your pattern.",
      "Hormonal contraception can change bleeding patterns. Track what you notice without applying a standard cycle forecast.",
    ],
    perimenopause: [
      "Make room<br>for changing patterns.",
      "Follow symptoms and bleeding over time. This view does not infer a hormonal phase from a calendar.",
    ],
    menopause: [
      "Your health,<br>through a new chapter.",
      "Track sleep, symptoms and your wider health picture. A monthly cycle prediction does not apply here.",
    ],
    off: [
      "Your whole picture,<br>with your chosen layers.",
      "Sleep, food, movement, genes and measured results stay connected. Add cycle context only if it is useful to you.",
    ],
  }[mode];
  return `${heading("PERSONAL CONTEXT", copy[0], B(I("settings-2"), "panel:settings", "", 'aria-label="Context settings"'))}<div class="empty-orbit">${I(mode === "off" ? "orbit" : "flower-2")}</div><span class="pill rose-pill">${cycleModes[mode]}</span><p class="body-copy">${copy[1]}</p>${mode !== "off" ? `<div class="section-head"><h3>Today’s check-in</h3></div>${symptomPicker(p)}${B("Save check-in", "save:symptoms", "primary rose-button")}` : B("Choose my health context", "panel:settings", "primary")}<div class="connection-story" style="margin-top:20px"><span class="eyeline">THE REST OF YOU STILL MATTERS</span><h3>Sleep, movement and blood<br>belong in this picture too.</h3><p>Keep observations together without assuming one explains another.</p>${B(`See my connected picture ${I("arrow-right")}`, "go:whole", "inline-link")}</div>${row("Ask about the data I have", "Answers use the sources you allow", "ask:overview", "message-circle")}`;
}
function evidence(source, title, sub, detail) {
  return { source, title, sub, detail };
}
function makeAnswer(topic, question) {
  const scope = availableScope(),
    has = (k) => scope.includes(k);
  let lead,
    copy,
    items = [],
    limit,
    action;
  if (topic === "overview" || topic === "energy") {
    lead = has("life")
      ? "Look at the pattern,<br>not just the number."
      : "We’re missing part<br>of the picture.";
    copy = has("life")
      ? "Your recent records offer a few things to look at together. They don’t establish one cause."
      : "I can only use the sources you have enabled. I won’t fill the gaps with assumptions.";
    if (has("life")) {
      items.push(
        evidence(
          "life",
          "A shorter night",
          "6h 18m last night; your 30-day average is 7h 24m.",
          "sleep",
        ),
      );
      items.push(
        evidence(
          "life",
          "A change on the scale",
          `${state.weight.toFixed(1)} kg today, compared with 67.8 kg on Sep 2. A few days do not establish a trend.`,
          "weight",
        ),
      );
    }
    if (has("cycle"))
      items.push(
        evidence(
          "cycle",
          regular()
            ? `Cycle day ${cycleDay()} · estimated`
            : "Your personal context",
          `${cycleModes[state.cycleMode]}. ${state.symptoms.length ? "Logged: " + state.symptoms.join(", ") + "." : "No symptoms logged today."}`,
          "cycle",
        ),
      );
    if (!items.length && has("blood"))
      items.push(
        evidence(
          "blood",
          "Your September blood panel",
          "Sep 1 results are available, but a blood panel alone does not explain this change.",
          "blood",
        ),
      );
    limit =
      "This is context, not a diagnosis. " +
      (has("cycle")
        ? "Calendar timing does not prove that hormones caused the change."
        : "Cycle data is not included in this answer.");
    action = has("life")
      ? ["Look at my weight trend", "go:body"]
      : ["Choose the records to use", "panel:scope"];
  } else if (topic === "iron") {
    lead = has("blood")
      ? "A question worth<br>putting in context."
      : "I need the result<br>before discussing it.";
    copy = has("blood")
      ? "Your sample ferritin is 24 ng/mL, within the lab’s interval of 15–150. That number alone cannot explain fatigue."
      : "Blood results are excluded. Enable them if you want an answer grounded in your actual sample values.";
    if (has("blood")) {
      items.push(
        evidence(
          "blood",
          "Ferritin · 24 ng/mL",
          "Sep 1 · lab interval 15–150 ng/mL.",
          "ferritin",
        ),
      );
      items.push(
        evidence(
          "blood",
          "Hemoglobin · 12.8 g/dL",
          "Sep 1 · lab interval 12.0–15.5 g/dL.",
          "hemoglobin",
        ),
      );
    }
    if (has("cycle"))
      items.push(
        evidence(
          "cycle",
          "Bleeding history is incomplete",
          "Period dates are logged; heaviness and duration need a review.",
          "cycle",
        ),
      );
    limit =
      "Do not infer a deficiency or a supplement dose from this preview. Persistent symptoms deserve a clinician discussion.";
    action = has("blood")
      ? ["Review my ferritin result", "marker:ferritin"]
      : ["Manage answer sources", "panel:scope"];
  } else if (topic === "genes") {
    lead = "A genetic clue<br>needs a wider picture.";
    copy = has("genes")
      ? "Your sample report is awaiting interpretation. No verified risk result is available, so I won’t infer a genetic cause or adjust a forecast from it."
      : "Genetic data is excluded from this answer. Measured results and daily patterns can still be reviewed.";
    if (has("genes"))
      items.push(
        evidence(
          "genes",
          "Genetic report · interpretation pending",
          "Raw sample report present; no verified clinical finding.",
          "genes",
        ),
      );
    if (has("blood"))
      items.push(
        evidence(
          "blood",
          "LDL · 118 mg/dL",
          "Sep 1 · a measured result, independent of a genetic explanation.",
          "ldl",
        ),
      );
    limit =
      "Inherited risk is not destiny and does not guarantee a response to a lifestyle change.";
    action = ["Explore genetic context", "go:genes"];
  } else if (topic === "plan") {
    lead = "Start with a change<br>you can actually keep.";
    copy = has("blood")
      ? "Your sample LDL is above the selected goal. You can explore a food and movement routine, then check the outcome with another draw."
      : "Without blood data, I can discuss your routine but cannot connect it to a specific marker or target.";
    if (has("blood"))
      items.push(
        evidence(
          "blood",
          "LDL · 118 mg/dL",
          "Sep 1 · selected goal under 100 mg/dL.",
          "ldl",
        ),
      );
    if (has("life"))
      items.push(
        evidence(
          "life",
          "Your daily actions",
          `${countDone()} of 5 actions complete today. Adherence is an input, not a promised effect.`,
          "habits",
        ),
      );
    limit =
      "Scenario numbers in this prototype are illustrative. A future model needs validated effects and uncertainty.";
    action = has("blood")
      ? ["Explore my possible trajectory", "go:plan"]
      : ["Review my daily actions", "go:today"];
  } else {
    lead = "This needs a<br>real conversation.";
    copy =
      "This prototype is a scripted preview, so I can’t answer a new question reliably. The app would retrieve the relevant records, cite them and explain what remains uncertain.";
    limit = "No new health facts have been inferred from your question.";
    action = ["Choose a sample question", "panel:questions"];
  }
  if (!scope.length) {
    lead = "Your data is<br>yours to include.";
    copy =
      "All data sources are excluded. I won’t use values or context from your records until you choose a source.";
    items = [];
    limit = "No personal records used.";
    action = ["Choose sources for this answer", "panel:scope"];
  }
  return {
    question,
    topic,
    lead,
    copy,
    items,
    limit,
    action,
    scope: [...scope],
  };
}
const questions = {
  overview: "My weight is up and I feel tired. Is it all connected?",
  energy: "What might be relevant to my lower energy?",
  iron: "Could iron be part of the picture?",
  genes: "Do my genes change what I should do?",
  plan: "What could help my cholesterol over time?",
};
function answerHTML(a) {
  return `<div class="chat-question">${esc(a.question)}</div><div class="answer-heading">${I("orbit")} OpenVitals <span>·</span> <span>From your selected records</span></div><div class="answer-lead">${a.lead}</div><p class="answer-copy">${a.copy}</p><div class="evidence-stack">${a.items.map((x, i) => B(`<span class="source-index">${i + 1}</span><span><b>${x.title}</b><small>${x.sub}</small></span>${I("arrow-up-right")}`, `source:${x.detail}`, "evidence-item")).join("")}</div><p class="answer-limit">${I("circle-help")}<span>${a.limit}</span></p>${B(`${a.action[0]} ${I("arrow-right")}`, a.action[1], "answer-action")}`;
}
function chat(p) {
  const a = makeAnswer(
      p.topic,
      p.question || questions[p.topic] || questions.overview,
    ),
    n = availableScope().length;
  return `<div class="chat-heading"><div class="chat-avatar">${I("orbit")}</div><div><h2>Ask OpenVitals</h2><small><span class="online"></span> Your records, in the conversation</small></div></div>${B(
    `${I("shield-check")}<span><b>${n} of ${cycleOn() ? 4 : 3} sources included</b><small>${
      availableScope()
        .map(
          (k) =>
            ({
              blood: "Blood",
              life: "Daily life",
              cycle: "Cycle",
              genes: "Genes",
            })[k],
        )
        .join(" · ") || "No personal data included"
    }</small></span>${I("sliders-horizontal")}`,
    "panel:scope",
    "context-bar",
  )}${p.messages.length ? `<details class="accordion"><summary>${p.messages.length} earlier ${p.messages.length === 1 ? "question" : "questions"}</summary>${p.messages.map((m) => `<p>${esc(questions[m] || "Custom question · details hidden")}</p>`).join("")}</details>` : ""}${p.loading ? `<div class="chat-question">${esc(p.question)}</div><div class="loading" role="status">${I("loader-circle")} Looking through selected sample records…</div>` : answerHTML(a)}<div class="followups">${B("What about iron?", "ask:iron")}${B("And my genes?", "ask:genes")}</div><div class="composer"><form data-form="chat"><input name="question" placeholder="Ask about your whole picture…" aria-label="Ask about your health data" autocomplete="off"><button type="submit" aria-label="Send question">${I("arrow-up")}</button></form><small>Scripted preview · sources can be included or excluded</small></div>`;
}
function habitRow(h, i) {
  return `<div class="habit-row">${B(`<span>${I("check")}</span>`, `habit:${i}`, `check-control ${state.done[i] ? "done" : ""}`, `aria-pressed="${state.done[i]}" aria-label="${h.name}"`)}<div><b>${h.name}</b><small>${h.sub}</small></div>${I(h.icon)}</div>`;
}
function mealRow(m) {
  return B(
    `<img src="${m.img}" alt="${esc(m.name)}"><span><b>${esc(m.name)}</b><small>${m.time} · ${Math.round(m.kcal * m.portion)} kcal est.</small></span>${I("chevron-right")}`,
    `meal:${m.id}`,
    "meal-row",
  );
}
function today() {
  return `${heading("SUNDAY, SEPTEMBER 6", "Small actions.<br>A fuller day.", B(I("calendar-days"), "go:history", "", 'aria-label="View action history"'))}<div class="today-ring-section">${rings(true)}${ringKey(true)}</div><p class="fine">Nourish 2 actions · Move 2 actions · Rest 1 action. These rings track your routine, not your health status.</p><div class="section-head"><h3>Your daily rhythm</h3><small>${countDone()} of 5 complete</small></div>${habits.map(habitRow).join("")}<div class="section-head"><h3>On your plate</h3>${B("View all", "go:meals", "inline-link")}</div>${state.meals.slice(-1).map(mealRow).join("")}${state.notes.length ? `<div class="section-head"><h3>Your notes</h3></div>${state.notes.map((n) => `<p class="body-copy">${esc(n.text)}</p>`).join("")}` : ""}${
    state.plan
      ? `<div class="connection-story" style="margin-top:15px"><span class="eyeline">YOUR SAVED SCENARIO</span><h3>${state.plan.effort}% of days · ${state.plan.levers.filter(Boolean).length} changes</h3><p>${state.plan.levers
          .map((on, i) =>
            on
              ? ["Fibre-rich meals", "A daily walk", "Two strength sessions"][i]
              : "",
          )
          .filter(Boolean)
          .join(
            " · ",
          )}</p>${B("Adjust my scenario", "go:plan", "inline-link")}</div>`
      : ""
  }${row("Your next checkpoint", state.reminder ? "Lipid retest reminder · Nov 29" : "Plan a follow-up lipid panel", "panel:retest", "calendar-days")}`;
}
function history() {
  return `${back("Today")}${heading("YOUR ROUTINE", "Progress you<br>can come back to.")}<div class="today-ring-section">${rings(true)}<div><h3>5 active days<br>this week.</h3><p class="fine">A day counts when you<br>complete a planned action.</p></div></div><h3>September 2026</h3><div class="calendar-grid">${["M", "T", "W", "T", "F", "S", "S"].map((d) => `<small style="text-align:center">${d}</small>`).join("")}<span></span>${Array.from({ length: 30 }, (_, i) => `<span class="${i < 5 ? "logged" : ""} ${i === 5 ? "today" : ""}">${i + 1}</span>`).join("")}</div><p class="body-copy">A missed day leaves room to begin again. Your history shows the routine you actually followed.</p>${row("Explore a realistic plan", "Change the effort, see the scenario", "go:plan", "target")}`;
}
function blood() {
  return `${back()}${heading("BLOOD / SEPTEMBER 1", "A snapshot,<br>with its context.")}<div class="source-chips"><span>Fasting · logged</span><span>09:10 · collected</span>${cycleOn() ? "<span>Cycle day 17 · logged date</span>" : ""}</div><p class="body-copy">Timing stays attached to the sample. ${cycleOn() ? "Calendar day is known; hormonal phase is not confirmed." : "Five markers are available in your sample report."}</p>${markerRows.map((m) => row(m.name, m.sub, `marker:${m.id}`, m.id === "ldl" ? "heart-pulse" : "droplets", `${m.v}<small>${m.unit}</small>`)).join("")}${B(`${I("plus")} Add a blood panel`, "panel:lab", "primary")}${row("View original source", "Sample September report", "source:blood", "file-text")}`;
}
function marker(p) {
  const m = markerRows.find((x) => x.id === p.marker) || markerRows[0];
  return `${back("Blood results")}${heading("MEASURED · SEPTEMBER 1", m.name)}<div class="value-large">${m.v} <small>${m.unit}</small></div><p class="fine">${m.sub}</p><div class="source-chips"><span>Blood draw · 09:10</span><span>Fasting</span>${cycleOn() ? "<span>Cycle day 17</span>" : ""}</div><p class="body-copy">${m.ref}</p>${m.id === "ldl" ? `<svg class="mini-chart" viewBox="0 0 320 145" role="img" aria-label="LDL decreased from 126 in June to 118 in September"><path class="axis" d="M20 30H300 M20 75H300 M20 120H300"/><path d="M30 40 152 58 290 87" fill="none" stroke="var(--blue)" stroke-width="2"/><circle cx="30" cy="40" r="4" fill="var(--blue)"/><circle cx="152" cy="58" r="4" fill="var(--blue)"/><circle cx="290" cy="87" r="4" fill="var(--blue)"/><text x="20" y="25">126</text><text x="145" y="45">122</text><text x="274" y="72">118</text><text x="20" y="140">JUN 3</text><text x="130" y="140">AUG 1</text><text x="263" y="140">SEP 1</text></svg>${row("Connect this to daily life", "Food, movement and your selected goal", "detail:heart", "network")}` : ""}<details class="accordion" open><summary>Collection context</summary><p>September 1, 2026 · 09:10 · fasting status logged. ${cycleOn() ? "Period start logged Aug 16, placing this draw on day 17. Calendar timing does not confirm ovulation or hormonal phase." : "Cycle context is not included in this view."}</p></details><details class="accordion"><summary>Reference interval & uncertainty</summary><p>${m.ref} A reference interval is not the same as a personal treatment target.</p></details>${row("Open source record", "Sample lab result and collection details", `source:${m.id}`, "file-text")}${B(`Ask about this result ${I("message-circle")}`, `ask:${m.id === "ferritin" || m.id === "hemoglobin" ? "iron" : "plan"}`, "primary")}`;
}
function detail() {
  return `${back()}${heading("FOOD + MOVEMENT + BLOOD", "One system.<br>Several useful levers.")}<div class="source-chips"><span>Measured LDL · 118</span><span>Selected goal · &lt;100</span></div><div class="connection-story" style="margin-top:18px"><span class="eyeline">START WITH WHAT YOU CAN DO</span><h3>Your meal and your walk<br>belong in the same plan.</h3><p>Daily actions supply context. A new blood draw verifies whether the marker changed.</p></div>${row("Food quality", "Your logged meals and adopted food actions", "go:meals", "utensils")}${row("Movement", "6,420 steps · your daily routine", "go:today", "footprints")}${row("Measured result", "LDL · Sep 1, 2026", "marker:ldl", "droplets")}${row("Inherited context", "Genetic report · interpretation pending", "go:genes", "dna")}<p class="body-copy">Connections indicate what to explore together. They do not prove that one factor caused another.</p>${B("Explore a possible trajectory", "go:plan", "primary")}${B("Ask how these fit together", "ask:plan", "secondary")}`;
}
function genes() {
  return `${back()}${heading("GENES / THE LONG VIEW", "A starting point.<br>Not a verdict.")}<div class="empty-orbit">${I("dna")}</div><span class="pill">Interpretation pending</span><p class="body-copy">A sample genetic report is present, but no verified clinical finding is available. Your actual blood results and daily patterns remain the useful starting point.</p><details class="accordion" open><summary>How genetics fits the system</summary><p>A supported finding may add context to a clinician discussion. It does not guarantee an outcome or multiply your predicted response to a habit.</p></details><details class="accordion"><summary>What needs to be verified</summary><p>Variant identity, test quality, relevant evidence and personal context. Consumer raw data alone is not a diagnosis.</p></details>${row("View report status", "Sample genetic file · not interpreted", "source:genes", "file-text")}${row("Return to measured markers", "September baseline", "go:blood", "droplets")}${B("Ask about my genetic context", "ask:genes", "primary")}`;
}
function body() {
  const readings = [68.8, 68.2, 68, 67.8, state.weight];
  const minimum = Math.min(...readings) - .2, maximum = Math.max(...readings) + .2;
  const y = value => 20 + (maximum - value) / (maximum - minimum) * 90;
  const positions = [22, 88, 150, 222, 298];
  const points = readings.map((v, i) => positions[i] + " " + y(v)).join(" ");
  return `${back()}${heading("BODY / DAILY LIFE", "Look at the trend.<br>Keep the context.")}<div class="value-large">${state.weight.toFixed(1)} <small>kg · today</small></div><p class="fine">${state.manualWeight ? "Manual entry" : "Apple Health · 08:05"} · ${cycleOn() && regular() ? `cycle day ${cycleDay()}` : "daily reading"}</p><svg class="mini-chart" viewBox="0 0 320 145" role="img" aria-label="Sample weight 68.8 kg Aug 10, 68.2 Aug 17, 68.0 Aug 24, 67.8 Sep 2 and today's reading"><path class="axis" d="M15 30H305 M15 80H305 M15 125H305"/><path d="M${points}" fill="none" stroke="var(--blue)" stroke-width="2"/><circle cx="298" cy="${y(state.weight)}" r="4" fill="var(--blue)"/><text x="12" y="22">68.8</text><text x="209" y="114">67.8</text><text x="268" y="${y(state.weight) - 12}">${state.weight.toFixed(1)}</text><text x="15" y="140">AUG 10</text><text x="212" y="140">SEP 2</text><text x="273" y="140">TODAY</text></svg><div class="metrics"><div><b>6h 18</b><small>Sleep last night</small></div><div><b>6,420</b><small>Steps today</small></div><div><b>2</b><small>Workouts / week</small></div></div>${cycleOn() ? `<div class="connection-story cycle-story"><span class="eyeline">ANOTHER LAYER OF CONTEXT</span><h3>${regular() ? `Day ${cycleDay()} of your cycle.` : cycleModes[state.cycleMode]}</h3><p>${state.symptoms.length ? "Logged: " + state.symptoms.join(", ") + "." : "No symptoms logged today."} Keep this alongside your trend; it doesn’t establish a cause.</p>${B("Explore cycle context", "go:cycle", "inline-link")}</div>` : ""}${row("Meals & daily nutrition", "Estimates from your log", "go:meals", "utensils")}${row("Add today’s weight", "A manual reading", "panel:weight", "scale")}${row("Selected weight goal", "A personal target, not a prediction", "panel:goal", "target", `${state.weightGoal}<small>kg</small>`)}${B("Ask about this pattern", "ask:overview", "primary")}`;
}
function meals() {
  const total = (k) =>
    Math.round(state.meals.reduce((s, m) => s + m[k] * m.portion, 0));
  return `${back("Today")}${heading("MEALS / TODAY", "Your day,<br>on a plate.")}<div class="value-large">${total("kcal")} <small>kcal estimated</small></div><div class="metrics">${[
    ["p", "Protein"],
    ["c", "Carbs"],
    ["f", "Fat"],
  ]
    .map(([k, l]) => `<div><b>${total(k)}g</b><small>${l}</small></div>`)
    .join(
      "",
    )}</div>${state.meals.length ? state.meals.map(mealRow).join("") : '<p class="body-copy">Your first meal starts with a photo or a few words. Tap below to begin.</p>'}${B(`${I("plus")} Add a meal`, "panel:add", "primary")}<p class="fine">Food entries are estimates. They supply context for your routine, not measured blood-marker changes.</p>${row("How food connects to your plan", "Meals, LDL and a future checkpoint", "detail:heart", "network")}`;
}
function meal(p) {
  const m = state.meals.find((m) => m.id === p.meal);
  if (!m) return meals();
  return `${back("Meals")}${heading("MEAL / ESTIMATED", esc(m.name))}<img class="meal-photo" src="${m.img}" alt="${esc(m.name)}"><small>${m.time} · Sunday, Sep 6</small><div class="portion"><span>Portions</span><div class="stepper">${B("−", "portion:-0.5", "", `aria-label="Decrease portion" ${m.portion <= 0.5 ? "disabled" : ""}`)}<output>${m.portion}</output>${B("+", "portion:0.5", "", 'aria-label="Increase portion"')}</div></div><div class="value-large">${Math.round(m.kcal * m.portion)} <small>kcal est.</small></div><div class="metrics">${[
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
    )}</div><h3>Ingredients</h3><p class="body-copy">${esc(m.ingredients)}</p>${B(`${I("pencil")} Edit or fix the estimate`, "panel:mealedit", "secondary")}${B("Delete meal", "panel:delete", "danger")}<p class="fine">Saved in this prototype · not written to Apple Health</p>`;
}
function plan(p) {
  const metric = p.metric || "LDL",
    weight = metric === "Weight",
    from = weight ? state.weight : 118,
    raw =
      (state.levers.reduce(
        (s, on, i) => s + (on ? (weight ? [0.7, 1.4, 1.6] : [12, 4, 3])[i] : 0),
        0,
      ) *
        state.effort) /
      100,
    end = from - raw,
    spread = raw ? (weight ? 0.8 : 5) : 0,
    format = (n) => (weight ? n.toFixed(1) : Math.round(n)),
    chartScale = weight ? 20 : 3,
    chartEnd = 35 + raw * chartScale,
    chartLow = chartEnd + spread * chartScale,
    chartHigh = chartEnd - spread * chartScale;
  return `${back()}${heading("YOUR POSSIBLE TRAJECTORY", "What could<br>your routine change?")}${pills(
    [
      ["LDL", "metric:LDL", "LDL"],
      ["Weight", "metric:Weight", "Weight"],
    ],
    metric,
  )}<div class="forecast"><span class="eyeline">IN 12 WEEKS · ILLUSTRATIVE SCENARIO</span><div class="value-large">${format(end - spread)}–${format(end + spread)} <small>${weight ? "kg" : "mg/dL"}</small></div><svg viewBox="0 0 300 130" role="img" aria-label="Illustrative range in 12 weeks"><path d="M15 35H285 M15 85H285" stroke="#51656a" stroke-width=".6"/><path d="M15 35H285" stroke="#a9b9ba" stroke-width="1" stroke-dasharray="3 4"/><path d="M15 35Q130 ${chartHigh} 285 ${chartHigh}L285 ${chartLow}Q130 ${chartLow} 15 35Z" fill="#bfcfac" opacity=".15"/><path d="M15 35Q140 ${chartEnd} 285 ${chartEnd}" fill="none" stroke="#dae6c8" stroke-width="2"/><text x="15" y="22">${format(from)}</text><text x="258" y="${chartEnd - 10}">${format(end)}</text><text x="15" y="125">TODAY</text><text x="243" y="125">12 WEEKS</text></svg><p class="fine">Selected goal ${weight ? state.weightGoal : "under 100"} ${weight ? "kg" : "mg/dL"}. More time may be needed.</p></div><label class="range-label" for="effort-${views.indexOf(p)}">A realistic routine <output>${state.effort}% of days</output></label><input id="effort-${views.indexOf(p)}" type="range" min="20" max="100" step="10" value="${state.effort}" aria-label="Planned adherence">${[
    ["Fibre-rich meals", "Daily food quality"],
    ["A walk after lunch", "15 minutes, most days"],
    ["Two strength sessions", "30 minutes each week"],
  ]
    .map(([h, s], i) => switchRow(h, s, `lever:${i}`, state.levers[i]))
    .join(
      "",
    )}${B(state.plan ? "Update my scenario" : "Save this scenario", "save:plan", "primary", state.levers.every((v) => !v) ? "disabled" : "")}<p class="fine">Invented UI scenario, not a medical model. Genetics and cycle phase are not numerical multipliers.</p>${row("What goes into an estimate?", "Baseline, evidence, adherence and uncertainty", "panel:method", "circle-help")}`;
}
function records() {
  return `${back()}${heading("YOUR RECORDS", "Every signal<br>has a source.")}${row("Apple Health", state.health ? "Connected · last synced 11:32" : "Disconnected · previous readings retained", "toggle:health", "heart-pulse", state.health ? "On" : "Off")}${row("September blood panel", "Sep 1 · 5 sample observations", "source:blood", "file-text")}${row("Genetic report", "Sample file · interpretation pending", "source:genes", "dna")}${cycleOn() ? row("Cycle & symptoms", `${cycleModes[state.cycleMode]} · logged dates`, "source:cycle", "flower-2") : ""}${row("Your daily entries", `${state.meals.length} meals · ${state.notes.length} notes`, "go:today", "utensils")}${row("Personal context", "Cycle settings and life stage", "panel:settings", "settings-2")}${B(`${I("download")} Export sample summary`, "export", "secondary")}<p class="fine">This is a local prototype. Connections, reports and device readings are simulated.</p>`;
}
function render(i) {
  const p = views[i],
    el = $(`#orbit${i}`),
    old = $(".content", el)?.scrollTop || 0;
  const previousRings = [...el.querySelectorAll(".ring-progress")].map(r => r.getAttribute("stroke-dasharray"));
  const renderers = {
    whole,
    cycle,
    chat,
    today,
    history,
    blood,
    marker,
    detail,
    genes,
    body,
    meals,
    meal,
    plan,
    records,
  };
  el.innerHTML = `<div class="status"><span>9:41</span><div class="island"></div><span class="status-right">${I("signal")}${I("wifi")}${I("battery-full")}</span></div><div class="content"><div class="screen">${(renderers[p.view] || whole)(p)}</div></div><nav class="bottom-nav" aria-label="Preview ${i + 1} navigation">${[
    ["network", "Whole you", "whole"],
    ["circle-dot", "Today", "today"],
    ["message-circle", "Ask", "chat"],
  ]
    .map(([ic, label, v]) =>
      B(
        `${I(ic)}<span>${label}</span>`,
        `go:${v}`,
        p.tab === v ? "active" : "",
        p.tab === v ? 'aria-current="page"' : "",
      ),
    )
    .join(
      "",
    )}${B(I("plus"), "panel:add", "add", 'aria-label="Add a meal, check-in, weight or record"')}</nav>`;
  $(".content", el).scrollTop = p.reset ? 0 : old;
  p.reset = false;
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.querySelectorAll(".ring-progress").forEach((ring, index) => {
      const target = ring.getAttribute("stroke-dasharray");
      if (previousRings[index] && previousRings[index] !== target) {
        ring.style.transition = "none";
        ring.setAttribute("stroke-dasharray", previousRings[index]);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          if (!ring.isConnected) return;
          ring.style.transition = "";
          ring.setAttribute("stroke-dasharray", target);
        }));
      }
    });
  }
  if (p.panel) renderPanel(i);
}
function renderAll() {
  views.forEach((_, i) => render(i));
  $("#cycle-toggle").setAttribute("aria-pressed", String(cycleOn()));
  $("#cycle-toggle b").textContent = cycleOn() ? "on" : "off";
  $('[data-preview="1"]').textContent = cycleOn()
    ? "Your cycle"
    : "Your context";
}
function go(i, v) {
  const p = views[i];
  p.view = v;
  p.tab =
    v === "chat"
      ? "chat"
      : ["today", "history", "meals", "meal"].includes(v)
        ? "today"
        : "whole";
  p.panel = null;
  p.reset = true;
  if (v === "cycle") p.day = Math.min(cycleDay(), state.cycleLength);
  render(i);
}
function openPanel(i, name) {
  views[i].panel = name;
  renderPanel(i);
  $(".panel-head button", $(`#orbit${i}`))?.focus({ preventScroll: true });
}
function closePanel(i) {
  views[i].panel = null;
  render(i);
  $(".bottom-nav .add", $(`#orbit${i}`))?.focus({ preventScroll: true });
}
function toast(i, msg, undo) {
  const el = $(`#orbit${i}`);
  $(".toast", el)?.remove();
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(msg)}</span>${undo ? "<button>Undo</button>" : ""}`;
  el.append(t);
  if (undo)
    $("button", t).onclick = () => {
      undo();
      t.remove();
    };
  setTimeout(() => t.remove(), 5000);
}
function switchRow(title, sub, action, on) {
  return `<div class="switch-row"><div><b>${title}</b><small>${sub}</small></div>${B("<span></span>", action, `switch ${on ? "on" : ""}`, `role="switch" aria-label="${title}" aria-checked="${on}"`)}</div>`;
}
function field(label, name, value, type = "text", attrs = "") {
  return `<label class="field">${label}<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
}
function sourceContent(key) {
  const m = markerRows.find((m) => m.id === key);
  if (m)
    return `<span class="pill">Measured · sample lab report</span><div class="value-large">${m.v} <small>${m.unit}</small></div><p class="body-copy"><b>${m.name}</b><br>Collected Sep 1, 2026 · 09:10<br>${m.ref}</p>${cycleOn() ? '<div class="source-chips"><span>Cycle day 17 · logged dates</span><span>Hormonal phase unconfirmed</span></div>' : ""}`;
  const bodies = {
    blood: `<span class="pill">Sample laboratory record</span><p class="body-copy">September 1, 2026 · collected 09:10 · fasting status logged.</p>${markerRows.map((m) => `<div class="data-row"><span class="row-copy"><b>${m.name}</b><small>${m.unit}</small></span><span class="row-value">${m.v}</span></div>`).join("")}`,
    sleep:
      '<span class="pill">Apple Health · sample record</span><div class="value-large">6h 18m</div><p class="body-copy">September 5–6 · 00:14–06:32<br>30-day nightly average: 7h 24m.<br>Imported sleep duration; no cause inferred.</p>',
    weight: `<span class="pill">${state.manualWeight ? "Manual entry" : "Apple Health"} · sample record</span><div class="value-large">${state.weight.toFixed(1)} <small>kg</small></div><p class="body-copy">September 6 · 08:05<br>September 2 comparison: 67.8 kg.<br>Single readings do not establish a long-term trend.</p>`,
    cycle: `<span class="pill">User logs · sample record</span><p class="body-copy">Context: ${cycleModes[state.cycleMode]}<br>Period start: ${esc(state.start)}<br>${regular() ? `Today: day ${cycleDay()} · calendar estimate<br>` : ""}Symptoms: ${state.symptoms.length ? state.symptoms.join(", ") : "none logged"}.<br>Ovulation and hormonal phase are not confirmed.</p>`,
    genes:
      '<span class="pill">Interpretation pending</span><p class="body-copy">Sample genetic report present.<br>No verified variant interpretation or clinical risk result.<br>This source does not contribute a response multiplier to your scenario.</p>',
    habits: `<span class="pill">Your daily routine</span><p class="body-copy">${countDone()} of 5 adopted actions complete today.</p>${habits.map((h, i) => `<div class="data-row"><span class="row-copy"><b>${h.name}</b><small>${state.done[i] ? "Complete" : "Still open"}</small></span>${I(state.done[i] ? "circle-check" : "circle")}</div>`).join("")}`,
  };
  return bodies[key] || bodies.blood;
}
function renderPanel(i) {
  const p = views[i],
    el = $(`#orbit${i}`);
  $(".panel", el)?.remove();
  let title = "",
    body = "";
  const name = p.panel,
    m = state.meals.find((m) => m.id === p.meal);
  if (name === "settings") {
    title = "Your personal context";
    body = `<p class="body-copy">Choose what belongs in your picture. Cycle context is optional; a calendar forecast does not fit every person or life stage.</p><form data-form="settings"><label class="field">Cycle & life-stage context<select name="mode">${Object.entries(
      cycleModes,
    )
      .map(
        ([v, l]) =>
          `<option value="${v}" ${state.cycleMode === v ? "selected" : ""}>${l}</option>`,
      )
      .join(
        "",
      )}</select></label>${field("Last logged period start", "start", state.start, "date", 'max="2026-09-06" min="2025-01-01"')}${field("Typical cycle length (days)", "length", state.cycleLength, "number", 'min="21" max="40"')}<p class="fine">Length is used only in the regular-cycle example. Irregular cycles, contraception, perimenopause and menopause show observations without a phase forecast.</p><button class="primary" type="submit">Update my picture</button><p class="fine form-error" role="alert"></p></form>`;
  }
  if (name === "scope") {
    title = "What can this answer use?";
    body = `<p class="body-copy">Keep control of the context. Excluded sources are not used in the sample answer, including their values and symptom details.</p>${Object.entries(
      sourceDefs,
    )
      .filter(([k]) => k !== "cycle" || cycleOn())
      .map(([k, d]) => switchRow(d.name, d.sub, `scope:${k}`, state.scope[k]))
      .join(
        "",
      )}<p class="fine">The answer updates when you return. Excluding data here does not delete the underlying record.</p>${B("Return to my answer", "scope:done", "primary")}`;
  }
  if (name === "questions") {
    title = "Explore a question";
    body = Object.entries(questions)
      .map(([k, q]) =>
        row(
          q,
          "Use the sample records you include",
          `ask:${k}`,
          "message-circle",
        ),
      )
      .join("");
  }
  if (name === "source") {
    title =
      p.source === "blood"
        ? "September blood panel"
        : "The record behind the answer";
    body =
      sourceContent(p.source) +
      `<p class="fine">Sample data · original-record view. Nothing here is a new medical conclusion.</p>`;
  }
  if (name === "add") {
    title = "Add a little context";
    body = `<div class="panel-title">Your whole picture<br>starts with little things.</div><div class="log-options">${B(`${I("camera")}<span>Meal photo</span><small>Try a sample scan</small>`, "capture:photo")}${B(`${I("mic")}<span>Voice note</span><small>Try a sample transcript</small>`, "capture:voice")}${B(`${I("scale")}<span>Weigh-in</span><small>Log a measurement</small>`, "panel:weight")}${B(`${I(cycleOn() ? "flower-2" : "heart-pulse")}<span>Daily check-in</span><small>How you feel today</small>`, "panel:checkin")}</div><form data-form="note"><label class="field">Or write it down<textarea name="note" placeholder="A meal, a symptom, something you noticed…" required></textarea></label><button type="submit" class="primary">Keep this note</button></form>${row("Add a lab report", "Preview extraction and source review", "panel:lab", "file-text")}<p class="fine">Photo, voice and import flows use samples. No files or device data are accessed.</p>`;
  }
  if (name === "checkin") {
    title = "How are you feeling?";
    body = `<p class="body-copy">Log what you notice. The app keeps your words and symptoms alongside your other data.</p>${symptomPicker(p)}${B("Save today’s check-in", "save:symptoms", "primary rose-button")}<p class="fine">${cycleOn() ? "Saved with your selected cycle context." : "Saved as a daily-life check-in. Cycle tracking is off."}</p>`;
  }
  if (name === "weight" || name === "goal") {
    const goal = name === "goal";
    title = goal ? "Your selected weight goal" : "Log a weigh-in";
    body = `<p class="body-copy">${goal ? "A goal is your chosen direction. It is separate from a forecast." : "A measurement adds to the picture. Look at trends over time."}</p><form data-form="${name}">${field(goal ? "Goal (kg)" : "Weight (kg)", name, goal ? state.weightGoal : state.weight, "number", 'step="0.1" min="20" max="350" required')}<button type="submit" class="primary">${goal ? "Save goal" : "Save weigh-in"}</button><p class="fine form-error" role="alert"></p></form>`;
  }
  if (name === "reading") {
    title =
      p.capture === "photo"
        ? "Looking at the sample meal"
        : "Reading the sample transcript";
    body = `${p.capture === "photo" ? '<img class="meal-photo" src="img/03-sardines-rye.jpg" alt="Sample sardines on rye">' : '<p class="body-copy">“Sardines on rye, with tomato and a little olive oil.”</p>'}<div class="loading" role="status">${I("loader-circle")} Preparing a meal estimate to review…</div>`;
  }
  if (name === "review") {
    title = "Check before keeping";
    body = `<img class="meal-photo" src="img/03-sardines-rye.jpg" alt="Sample sardines on rye"><span class="pill">Sample ${p.capture === "photo" ? "photo" : "voice transcript"} · estimated</span><h2 style="margin-top:15px">Sardines on rye</h2><p class="body-copy">One can of sardines, rye bread, tomato and olive oil.</p><div class="metrics"><div><b>420</b><small>kcal est.</small></div><div><b>32g</b><small>Protein</small></div><div><b>34g</b><small>Carbs</small></div></div>${B("Keep this meal", "save:meal", "primary")}<p class="fine">You can edit the portion, ingredients and estimate after saving.</p>`;
  }
  if (name === "receipt") {
    title = "Kept in your day";
    body = `<div class="receipt-mark">${I("check")}</div><div class="panel-title">A little more<br>of your story.</div><p class="body-copy">${p.receipt === "meal" ? "Sardines on rye · 420 kcal est.<br>Saved with portion, ingredients and sample nutrition." : esc(p.noteText)}</p><span class="pill">${p.receipt === "meal" ? "Meal estimate" : "Daily note"} · September 6</span>${B("Back to my day", "receipt:done", "primary")}${B("Undo this entry", "receipt:undo", "danger")}`;
  }
  if (name === "mealedit" && m) {
    title = "Edit meal";
    body = `<form data-form="meal">${field("Meal name", "name", m.name, "text", "required")}${field("Calories per portion", "kcal", m.kcal, "number", 'min="0" step="1" required')}<div class="input-grid">${field("Protein (g)", "p", m.p, "number", 'min="0" step="0.1" required')}${field("Carbs (g)", "c", m.c, "number", 'min="0" step="0.1" required')}</div>${field("Fat (g)", "f", m.f, "number", 'min="0" step="0.1" required')}<label class="field">Ingredients<textarea name="ingredients">${esc(m.ingredients)}</textarea></label><button type="submit" class="primary">Save changes</button><p class="fine form-error" role="alert"></p></form>`;
  }
  if (name === "delete" && m) {
    title = "Delete this meal?";
    body = `<p class="body-copy">${esc(m.name)} will be removed from your day and estimated nutrition totals.</p>${B("Delete meal", "delete:confirm", "primary")}${B("Keep meal", "close", "secondary")}`;
  }
  if (name === "lab") {
    title = "Add a blood panel";
    body = `<div class="panel-title">A result needs<br>its original context.</div><p class="body-copy">Preview the review step before adding extracted values to your record.</p><div class="connection-story"><span class="eyeline">SAMPLE FILE</span><h3>September-panel.pdf</h3><p>Sep 1 · 5 markers · fasting logged</p></div>${B("Review sample extraction", "panel:labreview", "primary")}<p class="fine">This preview uses an existing sample report. It does not upload files.</p>`;
  }
  if (name === "labreview") {
    title = "Review sample results";
    body = `<span class="pill">Sample extraction · review required</span>${markerRows.map((m) => `<div class="data-row"><span class="row-copy"><b>${m.name}</b><small>Sep 1 · ${m.unit}</small></span><span>${m.v}</span></div>`).join("")}${cycleOn() ? '<p class="body-copy">Collection context: cycle day 17 from the logged Aug 16 start date. Hormonal phase not confirmed.</p>' : ""}${B("View existing sample panel", "go:blood", "primary")}<p class="fine">These values already exist in this demo. Opening the panel does not create duplicate observations.</p>`;
  }
  if (name === "retest") {
    title = "Close the loop";
    body = `<div class="panel-title">A new measurement.<br>A better conversation.</div><p class="body-copy">Compare your future lipid result with your September baseline and the routine you actually followed.</p><span class="pill">Suggested checkpoint · Nov 29, 2026</span>${B(state.reminder ? "Reminder saved ✓" : "Save a retest reminder", "save:retest", "primary")}<p class="fine">A sample in-app reminder. No calendar event is created.</p>`;
  }
  if (name === "method") {
    title = "Behind the scenario";
    body = `<p class="body-copy">The numbers in this prototype are invented UI fixtures. A real prediction engine needs a validated model.</p>${[
      [
        "Measured baseline",
        "Use dated blood results and repeated weight measurements. Keep actual readings separate from estimates.",
      ],
      [
        "Evidence & overlap",
        "Model validated effects, uncertainty and time to response. Do not simply add overlapping benefits.",
      ],
      [
        "Real-world adherence",
        "Use observed completion over time as well as planned effort. One completed ring does not imply a clinical response.",
      ],
      [
        "Personal context",
        "Cycle logs can contextualize measurement timing. Genetics may inform interpretation when supported. Neither is a deterministic response multiplier.",
      ],
      [
        "Verify and adjust",
        "A new blood draw checks the marker. Observed trends update the plan.",
      ],
    ]
      .map(
        ([h, t]) =>
          `<details class="accordion" open><summary>${h}</summary><p>${t}</p></details>`,
      )
      .join("")}`;
  }
  const panel = document.createElement("section");
  panel.className = "panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", title);
  panel.innerHTML = `<div class="panel-head"><h3>${title}</h3>${B(I("x"), "close", "", 'aria-label="Close panel"')}</div>${body}`;
  el.append(panel);
  for (const child of el.children)
    if (child !== panel && !child.classList.contains("toast"))
      child.inert = true;
}
function ask(i, topic, question) {
  const p = views[i];
  if (p.question) p.messages.push(p.topic);
  p.topic = topic;
  p.question = question || questions[topic] || questions.overview;
  p.loading = true;
  go(i, "chat");
  p.request = (p.request || 0) + 1;
  const request = p.request;
  setTimeout(() => {
    if (p.request !== request) return;
    p.loading = false;
    if (p.view === "chat") render(i);
  }, 650);
}
function syncCycle(mode) {
  state.cycleMode = mode;
  if (mode !== "off") state.lastCycleMode = mode;
  views.forEach((p) => {
    if (p.node === "cycle" && !cycleOn()) p.node = "body";
    if (p.node === "body" && cycleOn()) p.node = "cycle";
    p.day = Math.min(cycleDay(), state.cycleLength);
  });
}
document.addEventListener("click", (e) => {
  const day = e.target.closest("[data-day]");
  if (day) {
    const el = day.closest(".phone"),
      i = Number(el.id.slice(-1));
    views[i].day = Number(day.dataset.day);
    render(i);
    return;
  }
  const button = e.target.closest("[data-action]");
  if (!button || button.disabled) return;
  const el = button.closest(".phone");
  if (!el) return;
  const i = Number(el.id.slice(-1)),
    p = views[i],
    [a, ...rest] = button.dataset.action.split(":"),
    v = rest.join(":");
  if (a === "go") go(i, v);
  if (a === "day") {
    p.day =
      v === "today"
        ? Math.min(cycleDay(), state.cycleLength)
        : Math.max(
            1,
            Math.min(state.cycleLength, p.day + (v === "next" ? 1 : -1)),
          );
    render(i);
    $('[data-action="day:' + v + '"]', $("#orbit" + i))?.focus({
      preventScroll: true,
    });
  }
  if (a === "back")
    go(
      i,
      {
        history: "today",
        blood: "whole",
        marker: "blood",
        detail: "whole",
        genes: "whole",
        body: "whole",
        meals: "today",
        meal: "meals",
        plan: "whole",
        records: "whole",
      }[p.view] || "whole",
    );
  if (a === "panel") openPanel(i, v);
  if (a === "close") closePanel(i);
  if (a === "node") {
    p.node = v;
    render(i);
  }
  if (a === "lens") {
    p.lens = v;
    p.node =
      v === "energy"
        ? cycleOn()
          ? "cycle"
          : "sleep"
        : v === "heart"
          ? "food"
          : "blood";
    render(i);
  }
  if (a === "detail") go(i, "detail");
  if (a === "marker") {
    p.marker = v;
    go(i, "marker");
  }
  if (a === "meal") {
    p.meal = +v;
    go(i, "meal");
  }
  if (a === "source") {
    p.source = v;
    openPanel(i, "source");
  }
  if (a === "ask") ask(i, v);
  if (a === "scope") {
    if (v === "done") {
      p.panel = null;
      go(i, "chat");
    } else {
      state.scope[v] = !state.scope[v];
      renderAll();
      $(
        '.switch-row [aria-label="' + sourceDefs[v].name + '"]',
        $(`#orbit${i}`),
      )?.focus({ preventScroll: true });
    }
  }
  if (a === "habit") {
    state.done[+v] = !state.done[+v];
    renderAll();
    $(`[data-action="habit:${v}"]`, $(`#orbit${i}`))?.focus({
      preventScroll: true,
    });
  }
  if (a === "symptom") {
    p.draftSymptoms = [...(p.draftSymptoms || state.symptoms)];
    const ix = p.draftSymptoms.indexOf(v);
    if (ix >= 0) p.draftSymptoms.splice(ix, 1);
    else if (v === "Feeling good") p.draftSymptoms = ["Feeling good"];
    else {
      p.draftSymptoms = p.draftSymptoms.filter((s) => s !== "Feeling good");
      p.draftSymptoms.push(v);
    }
    render(i);
    $(`[data-action="symptom:${v}"]`, $(`#orbit${i}`))?.focus({
      preventScroll: true,
    });
  }
  if (a === "metric") {
    p.metric = v;
    render(i);
  }
  if (a === "lever") {
    state.levers[+v] = !state.levers[+v];
    renderAll();
  }
  if (a === "save") {
    if (v === "symptoms") {
      state.symptoms = [...(p.draftSymptoms || state.symptoms)];
      views.forEach((v) => {
        delete v.draftSymptoms;
      });
      p.panel = null;
      renderAll();
      toast(i, "Today’s check-in saved");
    }
    if (v === "plan") {
      state.plan = { effort: state.effort, levers: [...state.levers] };
      go(i, "today");
      renderAll();
      toast(i, "Scenario saved with your chosen effort");
    }
    if (v === "retest") {
      state.reminder = true;
      closePanel(i);
      toast(i, "Retest reminder saved for November 29");
    }
    if (v === "meal") {
      const id = Date.now();
      state.meals.push({
        id,
        name: "Sardines on rye",
        time: "13:10",
        img: "img/03-sardines-rye.jpg",
        kcal: 420,
        p: 32,
        c: 34,
        f: 17,
        portion: 1,
        ingredients: "Sardines, rye bread, tomato, olive oil",
      });
      p.savedId = id;
      p.receipt = "meal";
      p.panel = "receipt";
      renderAll();
    }
  }
  if (a === "capture") {
    p.capture = v;
    openPanel(i, "reading");
    p.captureRequest = (p.captureRequest || 0) + 1;
    const id = p.captureRequest;
    setTimeout(() => {
      if (p.panel === "reading" && p.captureRequest === id)
        openPanel(i, "review");
    }, 1200);
  }
  if (a === "receipt") {
    if (v === "undo") {
      if (p.receipt === "meal")
        state.meals = state.meals.filter((m) => m.id !== p.savedId);
      else state.notes = state.notes.filter((n) => n.id !== p.savedId);
    }
    go(i, "today");
    renderAll();
    if (v === "undo") toast(i, "Entry removed");
  }
  if (a === "portion") {
    const m = state.meals.find((m) => m.id === p.meal);
    if (m) {
      m.portion = Math.max(0.5, Math.min(10, m.portion + Number(v)));
      renderAll();
    }
  }
  if (a === "delete" && v === "confirm") {
    const index = state.meals.findIndex((m) => m.id === p.meal);
    if (index >= 0) {
      const removed = state.meals.splice(index, 1)[0];
      go(i, "meals");
      renderAll();
      toast(i, "Meal deleted", () => {
        state.meals.splice(index, 0, removed);
        renderAll();
      });
    }
  }
  if (a === "toggle" && v === "health") {
    state.health = !state.health;
    renderAll();
    toast(
      i,
      state.health
        ? "Sample Health connection enabled"
        : "Disconnected; prior readings retained",
    );
  }
  if (a === "export") {
    const data = {
      notice: "OpenVitals Orbit design fixture, not a medical record",
      weight: state.weight,
      markers: markerRows,
      cycleContext: cycleOn()
        ? {
            mode: state.cycleMode,
            start: state.start,
            symptoms: state.symptoms,
          }
        : null,
      plan: state.plan,
      notes: state.notes,
    };
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "openvitals-orbit-sample.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(i, "Sample summary downloaded");
  }
});
document.addEventListener("submit", (e) => {
  const form = e.target.closest("[data-form]");
  if (!form) return;
  e.preventDefault();
  const i = Number(form.closest(".phone").id.slice(-1)),
    p = views[i],
    data = new FormData(form),
    kind = form.dataset.form;
  if (kind === "chat") {
    const q = String(data.get("question")).trim();
    if (!q) return;
    const topic = /iron|ferritin|anemi/i.test(q)
      ? "iron"
      : /gene|genetic|dna/i.test(q)
        ? "genes"
        : /cholesterol|ldl|routine|plan/i.test(q)
          ? "plan"
          : /weight|tired|energy|sleep|cycle|bloat/i.test(q)
            ? "overview"
            : "custom";
    ask(i, topic, q);
    return;
  }
  if (kind === "settings") {
    const mode = String(data.get("mode")),
      length = Number(data.get("length")),
      start = String(data.get("start"));
    if (
      !cycleModes[mode] ||
      !start ||
      !Number.isFinite(length) ||
      length < 21 ||
      length > 40 ||
      new Date(start + "T00:00:00Z") > new Date("2026-09-06T00:00:00Z")
    ) {
      $(".form-error", form).textContent =
        "Choose a valid start date and a length between 21 and 40 days.";
      return;
    }
    state.cycleLength = length;
    state.start = start;
    syncCycle(mode);
    p.panel = null;
    renderAll();
    toast(i, "Your health context is updated");
    return;
  }
  if (kind === "weight" || kind === "goal") {
    const value = Number(data.get(kind));
    if (!Number.isFinite(value) || value < 20 || value > 350) {
      $(".form-error", form).textContent =
        "Enter a value between 20 and 350 kg.";
      return;
    }
    if (kind === "weight") {
      state.weight = value;
      state.manualWeight = true;
    } else state.weightGoal = value;
    p.panel = null;
    renderAll();
    toast(i, kind === "weight" ? "Weigh-in saved" : "Goal updated");
    return;
  }
  if (kind === "note") {
    const value = String(data.get("note")).trim();
    if (!value) return;
    const id = Date.now();
    state.notes.push({ id, text: value });
    p.savedId = id;
    p.noteText = value;
    p.receipt = "note";
    p.panel = "receipt";
    renderAll();
    return;
  }
  if (kind === "meal") {
    const m = state.meals.find((m) => m.id === p.meal);
    if (!m) return;
    const name = String(data.get("name")).trim(),
      nums = ["kcal", "p", "c", "f"].map((k) => Number(data.get(k)));
    if (!name || nums.some((n) => !Number.isFinite(n) || n < 0)) {
      $(".form-error", form).textContent =
        "Enter a name and valid nonnegative nutrition values.";
      return;
    }
    m.name = name;
    m.ingredients = String(data.get("ingredients"));
    ["kcal", "p", "c", "f"].forEach((k, j) => (m[k] = nums[j]));
    p.panel = null;
    renderAll();
    toast(i, "Meal and daily totals updated");
  }
});
document.addEventListener("input", (e) => {
  if (e.target.type !== "range") return;
  const el = e.target.closest(".phone");
  if (!el) return;
  state.effort = Number(e.target.value);
  views.forEach((p, i) => {
    if (p.view !== "plan") return;
    const host = $("#orbit" + i),
      temp = document.createElement("div");
    temp.innerHTML = plan(p);
    $(".forecast", host).innerHTML = $(".forecast", temp).innerHTML;
    $(".range-label output", host).textContent = state.effort + "% of days";
    $("input[type=range]", host).value = state.effort;
  });
});
document.addEventListener("keydown", (e) => {
  const day = e.target.closest("[data-day]");
  if (day && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    day.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return;
  }
  if (e.key === "Escape") {
    const el = e.target.closest(".phone");
    if (el) {
      const i = Number(el.id.slice(-1));
      if (views[i].panel) closePanel(i);
    }
  }
  if (e.key === "Tab") {
    const panel = e.target.closest(".panel");
    if (!panel) return;
    const controls = [
        ...panel.querySelectorAll(
          "button:not(:disabled),a[href],input,select,textarea,summary",
        ),
      ],
      first = controls[0],
      last = controls[controls.length - 1];
    if (e.shiftKey && e.target === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && e.target === last) {
      e.preventDefault();
      first.focus();
    }
  }
});
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = I(el.dataset.icon)));
$("#theme-toggle").onclick = () => {
  const dark = document.body.classList.toggle("dark");
  $("#theme-toggle").setAttribute("aria-pressed", String(dark));
  $("#theme-toggle").innerHTML = I(dark ? "sun" : "moon");
};
$("#cycle-toggle").onclick = () => {
  syncCycle(cycleOn() ? "off" : state.lastCycleMode);
  renderAll();
};
document.querySelectorAll("[data-preview]").forEach(
  (b) =>
    (b.onclick = () => {
      document
        .querySelectorAll("[data-preview]")
        .forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      document
        .querySelectorAll(".study")
        .forEach((el) =>
          el.classList.toggle(
            "visible",
            el.dataset.study === b.dataset.preview,
          ),
        );
    }),
);
renderAll();
