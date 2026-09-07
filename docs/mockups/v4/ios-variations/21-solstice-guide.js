/* Local, disposable prototype state. No API, health writes or recording. */
(() => {
  "use strict";
  const design = document.body.dataset.design;
  const directions = {
    tidal: {
      n: 18,
      name: "Tidal",
      line: "Find your rhythm. Keep your course.",
      note: "Sea-glass colour. A tide-shaped day. One next action, always within reach.",
      first: "A little structure. More flow.",
      caption: "A day with a clear next step",
      detail:
        "Time flows left to right. The next action stays below the fold of the chart.",
      mode: "text",
    },
    solstice: {
      n: 19,
      name: "Solstice",
      line: "A whole day, beautifully in view.",
      note: "Warm light. A living day dial. Food that looks like food.",
      first: "Your day, coming together.",
      caption: "A day you can read at a glance",
      detail:
        "Sleep, meals and movement each have a distinct shape. Tap the dial to explore your day.",
      mode: "photo",
    },
    strata: {
      n: 20,
      name: "Strata",
      line: "See the layers. Know your next move.",
      note: "Mineral tones. Clinical clarity. The measured and the possible, clearly separated.",
      first: "Small changes, deeper progress.",
      caption: "Your biology, with perspective",
      detail:
        "Measured results lead. Daily actions and possible trajectories sit alongside them.",
      mode: "text",
    },
  };
  const d = {
    ...directions[design],
    n: 21,
    name: "Solstice · Guide",
    line: "A day taking shape. A little guidance along the way.",
    caption: "Your day, with a next step",
    detail:
      "Plan completion, sleep, and relevant guidance around the day circle.",
  };
  const paths = {
    plus: "M12 5v14M5 12h14",
    check: "m5 12 4 4L19 6",
    close: "m6 6 12 12M6 18 18 6",
    arrow: "m9 5 7 7-7 7",
    back: "m15 5-7 7 7 7",
    home: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z",
    plan: "M9 5h11M9 12h11M9 19h11m-18-7 2 2 3-4M3 5h1M3 19h1",
    blood: "M12 3s-7 8-7 12a7 7 0 0 0 14 0c0-4-7-12-7-12Zm-3 12a3 3 0 0 0 3 3",
    chart: "M3 3v18h18M6 15l4-5 4 3 6-8",
    camera:
      "M8 5l2-2h4l2 2h4a1 1 0 0 1 1 1v13H3V6a1 1 0 0 1 1-1h4Zm8 7a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z",
    mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0Zm-3 6v1a6 6 0 0 0 12 0v-1m-6 7v4m-3 0h6",
    text: "M4 5h16M12 5v15M8 20h8",
    moon: "M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z",
    sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 0-8 0 4 4 0 0 0 8 0Z",
    flame:
      "M12 3c1 5-4 5-2 10 2-1 3-3 3-5 5 4 7 7 5 11a7 7 0 0 1-12-1c-2-4 1-7 3-9 0 3 1 3 1 3 1-3 2-5 2-9Z",
    food: "M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 3c-4 2-4 7 0 9v9M19 3v9",
    walk: "M13 4h.01M10 7l3-1 3 5 4 1M8 13l2-6-5 3M13 7l-1 7 5 7M12 14l-4 7",
    sync: "M20 7v5h-5M4 17v-5h5M5 8a8 8 0 0 1 14-3l1 2M4 17l1 2a8 8 0 0 0 14-3",
    heart: "M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 0 9 8 15 8-6 12-11 8-15Z",
    leaf: "M20 3C8 2 2 7 5 15s16 4 15-12ZM5 20 16 9",
    strength: "m3 8 5-5m8 18 5-5M5 10 10 5m4 14 5-5M8 8l8 8",
    play: "m8 4 12 8-12 8Z",
    undo: "M3 10h11a6 6 0 0 1 0 12M3 10l5-5M3 10l5 5",
    info: "M12 10v7m0-10h.01M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0Z",
    wifi: "M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 20h.01",
    settings:
      "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2",
  };
  const icon = (n) =>
    `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[n] || paths.info}"/></svg>`;
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const fixtures = [
    {
      id: 1,
      name: "Oats & berries",
      kcal: 412,
      p: 25,
      c: 60,
      f: 8,
      img: "oats",
      time: "08:30",
      portion: 1,
    },
    {
      id: 2,
      name: "Sardines on rye",
      kcal: 462,
      p: 34,
      c: 41,
      f: 18,
      img: "sardines-rye",
      time: "12:45",
      portion: 1,
    },
    {
      id: 3,
      name: "Pork belly & bread",
      kcal: 623,
      p: 34,
      c: 43,
      f: 35,
      img: "porkbelly",
      time: "18:30",
      portion: 1,
    },
  ];
  const habits = [
    {
      title: "Fibre-rich breakfast",
      note: "Oats · food quality",
      icon: "leaf",
    },
    {
      title: "Walk after dinner",
      note: "15 minutes · daily movement",
      icon: "walk",
    },
    {
      title: "Vitamin D",
      note: "Your adopted plan · with a meal",
      icon: "sun",
    },
    { title: "Daily steps", note: "10,935 steps · Apple Health", icon: "sync" },
    {
      title: "Strength session",
      note: "3 this week · Apple Health",
      icon: "strength",
    },
  ];
  const fresh = () => ({
    meals: structuredClone(fixtures),
    done: [true, false, false, true, false],
    day: 5,
    synced: false,
    walkTomorrow: false,
    supplement: "unknown",
    foodDismissed: false,
    foodPlanned: null,
    goal: "ldl",
    rested: null,
    adopted: false,
    effort: 80,
    rules: [true, true],
    screens: ["today", "plan", "progress"],
    mode: d.mode,
    text: "",
    photos: [],
    photo: "sardines-rye",
    stage: "idle",
    draft: null,
    editId: null,
    toast: null,
    undo: null,
  });
  let state = fresh(),
    timers = [],
    modal = null,
    restoreFocus = null,
    uid = 0;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const total = (key) =>
    Math.round(state.meals.reduce((a, m) => a + m[key] * m.portion, 0));
  const doneCount = () =>
    state.done.filter((done, i) => done && !(i === 1 && state.walkTomorrow))
      .length;
  const landing = () =>
    Math.round(
      131 -
        ((state.rules[0] ? 18 : 0) * state.effort) / 100 -
        ((state.rules[1] ? 8 : 0) * state.effort) / 100,
    );
  const img = (name, cls = "", alt = "") =>
    `<img class="${cls}" src="beyond-assets/${name}.webp" alt="${alt}" draggable="false">`;
  function dayStatus(i) {
    return i === 5
      ? doneCount() === dueCount()
        ? "complete"
        : "partial"
      : [
          "complete",
          "complete",
          "partial",
          "rest",
          "complete",
          "partial",
          "future",
        ][i];
  }
  function dueCount() {
    return state.done.length - (state.walkTomorrow ? 1 : 0);
  }
  function planSnapshot() {
    return {
      kind: "plan",
      done: [...state.done],
      walkTomorrow: state.walkTomorrow,
      supplement: state.supplement,
      foodDismissed: state.foodDismissed,
      foodPlanned: state.foodPlanned,
    };
  }
  function planUndo() {
    const p = state.undo;
    if (!p || p.kind !== "plan") return false;
    state.done = p.done;
    state.walkTomorrow = p.walkTomorrow;
    state.supplement = p.supplement;
    state.foodDismissed = p.foodDismissed;
    state.foodPlanned = p.foodPlanned;
    state.undo = null;
    state.toast = "Plan change undone.";
    return true;
  }
  function fishLogged() {
    return state.meals.some((m) => m.img === "sardines-rye");
  }
  function weightLanding() {
    return (84.2 - (2.4 * state.effort) / 100).toFixed(1);
  }
  function sleepSignal() {
    return `<div class="sleep-signal"><span class="signal-icon">${icon("moon")}</span><span><b>7h 24m <em>last night</em></b><small>${state.rested ? "Feeling " + state.rested.toLowerCase() + " · your check-in" : "6 min short of your 7h 30m target"}</small></span><button class="icon-btn" data-action="sleep-info" aria-label="Sleep source and how you feel">${icon("info")}</button></div>`;
  }
  function completion() {
    return `<div class="completion-line"><span>${doneCount() === dueCount() ? icon("check") : icon("plan")}<b>${doneCount()} of ${dueCount()}</b> actions complete</span><button class="text-btn" data-action="navigate" data-screen="plan">Your plan ${icon("arrow")}</button></div><div class="rail"><span style="width:${(100 * doneCount()) / dueCount()}%"></span></div>`;
  }
  function guidance() {
    if (!state.done[1] && !state.walkTomorrow)
      return {
        kind: "walk",
        title: "A little walk to close the day.",
        copy:
          state.rested === "Low"
            ? "Low on rest? Keep your planned walk easy, or move it to tomorrow."
            : "Your 15-minute dinner walk is still open.",
        action: "Mark walk done",
        event: "finish-walk",
        icon: "walk",
      };
    if (state.supplement === "unknown")
      return {
        kind: "supplement",
        title: "One small check-in.",
        copy: "Did you take your planned vitamin D today?",
        action: "Answer check-in",
        event: "supplement",
        icon: "sun",
      };
    if (!state.synced)
      return {
        kind: "sync",
        title: "Your workout may already count.",
        copy: "A new strength session is ready in the sync demo.",
        action: "Sync workout · demo",
        event: "sync",
        icon: "strength",
      };
    if (!state.foodDismissed)
      return {
        kind: "food",
        title: fishLogged()
          ? "Fish is covered. Think fibre next."
          : "A fish meal later this week?",
        copy: fishLogged()
          ? "You logged sardines today. Beans or vegetables could round out your next meal."
          : "No fish appears in this week’s sample log. Consider a fish meal if it fits your preferences.",
        action: "Plan for tomorrow",
        event: "food-plan",
        icon: "leaf",
      };
    return {
      kind: "clear",
      title:
        doneCount() === dueCount()
          ? "Your plan is complete. Enjoy your evening."
          : "You’ve made room for tomorrow.",
      copy: state.walkTomorrow
        ? "Your walk is planned for tomorrow, not counted as done."
        : "Your next check is tomorrow. Your lab results stay unchanged.",
      action: "See your goals",
      event: "go-goals",
      icon: "check",
    };
  }
  function nextCard() {
    const g = guidance();
    return `<section class="next-card" data-guidance="${g.kind}"><div class="spread"><span class="caps">Your next small step</span>${icon(g.icon)}</div><h3>${g.title}</h3><p>${g.copy}</p><div class="next-actions"><button class="primary" data-action="${g.event}">${g.action}${icon("arrow")}</button>${g.kind === "walk" ? '<button class="text-btn" data-action="reschedule">Tomorrow works better</button>' : g.kind === "food" ? '<button class="text-btn" data-action="food-dismiss">Not now</button>' : ""}</div><button class="text-btn why-button" data-action="why" data-kind="${g.kind}">Why this suggestion? ${icon("info")}</button></section>${state.foodPlanned ? `<div class="tomorrow-card"><b>Tomorrow · ${state.foodPlanned}</b><small>Meal idea saved, not eaten or completed</small></div>` : ""}`;
  }
  function goalSwitcher() {
    return `<div class="goal-switcher" aria-label="Choose a goal">${[
      ["ldl", "LDL"],
      ["weight", "Weight"],
      ["consistency", "Your rhythm"],
    ]
      .map(
        ([g, l]) =>
          `<button data-action="goal" data-goal="${g}" aria-pressed="${state.goal === g}" aria-selected="${state.goal === g}">${l}</button>`,
      )
      .join("")}</div>`;
  }
  function goalMini() {
    return `<section class="goal-mini"><div class="spread"><span class="caps">The longer view</span><button class="text-btn" data-action="navigate" data-screen="progress">Explore ${icon("arrow")}</button></div>${goalSwitcher()}<div class="goal-reading">${state.goal === "ldl" ? `<b>131<small>mg/dL · measured Aug 1</small></b><span>8-week scenario<strong><span data-mini-ldl>${landing()}</span> mg/dL</strong><small>Goal 70–100</small></span>` : state.goal === "weight" ? `<b>84.2<small>kg · demo weigh-in</small></b><span>8-week scenario<strong><span data-mini-weight>${weightLanding()}</span> kg</strong><small>Goal 80 kg</small></span>` : `<b>${3 + (dayStatus(5) === "complete" ? 1 : 0)}<small>complete days this week</small></b><span>Also in your plan<strong>1 rest day</strong><small>Rest is part of the rhythm</small></span>`}</div><p class="scenario-note">${state.goal === "consistency" ? "Completion tracks adopted actions, not a health score." : "Illustrative outlook. Confirm change with a new measurement."}</p></section>`;
  }
  function connectedContext() {
    return `<details class="context-block"><summary class="context-toggle">${icon("heart")} What your guide is using ${icon("arrow")}</summary><div class="context-detail"><div><b>Apple Health · ${state.synced ? "synced 19:05" : "synced 18:42"}</b><small>7h 24m sleep · 10,935 steps · ${state.synced ? 3 : 2} workouts this week</small></div><div><b>Food log · this sample week</b><small>${state.meals.length} meals · ${fishLogged() ? "sardines logged today" : "no fish meal logged"} · incomplete logs can miss meals</small></div><div><b>Blood results · Aug 1</b><small>LDL 131 mg/dL, above the 70–100 goal. Vitamin D and ferritin remain visible in Blood.</small></div><div><b>Genetics · imported Aug 28</b><small>APOE e2/e3 on file. Background context, not a daily score or a prediction of your response.</small></div><div><b>Your preferences</b><small>Missing diet or recovery context is asked about, not assumed.</small></div></div></details>`;
  }
  function historicalDay() {
    const labels = [
        "Monday, August 31",
        "Tuesday, September 1",
        "Wednesday, September 2",
        "Thursday, September 3",
        "Friday, September 4",
        "Saturday, September 5",
        "Sunday, September 6",
      ],
      status = dayStatus(state.day);
    return `${header(labels[state.day], state.day < 5 ? "Demo history · read only" : "Tomorrow · planned", "profile")}${week()}<div class="locked-day">${icon(status === "rest" ? "moon" : status === "complete" ? "check" : "plan")}<h3>${{ complete: "A complete day.", partial: "A little progress counts.", rest: "A planned rest day.", future: "A little room for tomorrow." }[status]}</h3><p>${{ complete: "All 5 adopted actions were completed.", partial: "3 of 5 adopted actions were completed.", rest: "No actions were due. Rest is not a missed day.", future: state.walkTomorrow ? "Your dinner walk is planned here. It has not been completed." : "Your next day has not started. No completion is expected." }[status]}</p>${state.day === 6 && state.foodPlanned ? `<div class="tomorrow-card"><b>${state.foodPlanned}</b><small>Meal idea saved · not completed</small></div>` : ""}<button class="secondary" data-action="day" data-id="5">Return to today</button></div>`;
  }

  function cancelTimers() {
    timers.forEach(clearTimeout);
    timers = [];
  }
  function later(fn, ms) {
    timers.push(setTimeout(fn, ms));
  }
  function announce(s) {
    document.getElementById("announcement").textContent = s;
  }
  function setToast(text, undo = null) {
    state.toast = text;
    state.undo = undo;
  }
  function week() {
    return `<div class="week guide-week" aria-label="Demo week, August 31 to September 6">${["Mon 31", "Tue 1", "Wed 2", "Thu 3", "Fri 4", "Sat 5", "Sun 6"].map((label, i) => `<button class="week-day status-${dayStatus(i)} ${state.day === i ? "selected" : ""}" data-action="day" data-id="${i}" aria-label="${label}, ${dayStatus(i)}" aria-pressed="${state.day === i}"><span>${label.split(" ")[0]}</span><i>${dayStatus(i) === "complete" ? icon("check") : label.split(" ")[1]}</i><small>${{ complete: "Done", partial: "Partial", rest: "Rest", future: "Planned" }[dayStatus(i)]}</small></button>`).join("")}</div>`;
  }

  function header(title, subtitle = "Saturday, September 5", right = "streak") {
    return `<div class="app-header"><div><small>${subtitle}</small><h2>${title}</h2></div>${right === "capture" ? `<button class="icon-btn" data-action="navigate" data-screen="today" aria-label="Close capture">${icon("close")}</button>` : right === "streak" ? `<span class="streak">${icon("check")}${3 + (dayStatus(5) === "complete" ? 1 : 0)} days done</span>` : `<button class="icon-btn" data-action="profile" aria-label="Profile and sources">${icon("settings")}</button>`}</div>`;
  }
  function dayWave() {
    return `<svg class="wave-chart" viewBox="0 0 330 115" role="img" aria-label="Daily rhythm: sleep, breakfast, walking, lunch, strength and dinner"><defs><linearGradient id="wave${++uid}" x1="0" x2="1"><stop stop-color="#afdbcc"/><stop offset="1" stop-color="#e7edd1"/></linearGradient></defs><path d="M0 82C35 82 30 34 65 34S94 72 121 63 150 15 180 30 212 88 240 67 285 11 330 26L330 115H0Z" fill="#b9e4ce" opacity=".11"/><path d="M0 82C35 82 30 34 65 34S94 72 121 63 150 15 180 30 212 88 240 67 285 11 330 26" fill="none" stroke="url(#wave${uid})" stroke-width="2"/><path d="M232 17v78" stroke="#cbe5d1" stroke-dasharray="2 4" opacity=".5"/><circle cx="232" cy="73" r="4" fill="#edf4dd"/><text x="21" y="106">06:00</text><text x="105" y="106">12:00</text><text x="220" y="106">18:00</text><text x="295" y="106">24:00</text></svg>`;
  }
  function tideHero() {
    return `<div class="hero"><div class="spread"><span class="caps">Your daily rhythm</span>${icon("moon")}</div><div class="hero-number number">${doneCount()}<small>of ${state.done.length} actions</small></div>${dayWave()}<div class="hero-foot"><span>Sleep 7h 24m</span><span>${!state.done[1] ? "Next · 15-minute walk" : !state.done[2] ? "Next · Vitamin D" : "Your evening is clear"}</span></div></div>`;
  }
  function actionRows(all = true) {
    return habits
      .map((h, i) => {
        const moved = i === 1 && state.walkTomorrow,
          auto = i === 3 || i === 4;
        return `<button class="action-row" data-action="${i === 2 ? "supplement" : "tick"}" data-id="${i}" aria-pressed="${state.done[i]}" ${moved || auto ? "disabled" : ""}><span class="check-box">${icon("check")}</span><span><strong>${h.title}</strong><small>${moved ? "Planned tomorrow · not complete" : i === 2 ? { unknown: "Needs your confirmation", taken: "Confirmed by you · today", later: "Not yet · check later", skipped: "Skipped today · not completed" }[state.supplement] : i === 4 ? (state.synced ? "3 this week · Apple Health · 19:05" : "Waiting for Apple Health · 2 this week") : h.note}</small></span>${icon(h.icon)}</button>`;
      })
      .join("");
  }

  function nutrition() {
    return `<div class="nutrition"><div class="spread"><div class="row"><span class="number">${total("kcal").toLocaleString("en-US")}</span><small>/ 2,100 kcal</small></div><button class="text-btn" data-action="navigate" data-screen="meals">Meals ${icon("arrow")}</button></div><div class="rail"><span style="width:${Math.min(100, total("kcal") / 21)}%"></span></div><div class="spread small muted"><span>Estimated intake</span><span>${Math.max(0, 2100 - total("kcal"))} to target</span></div></div>`;
  }
  function miniMetrics() {
    return `<div class="mini-metrics"><div><b>${total("p")}<small>g protein / 120</small></b></div><div><b>10,935<small>steps today</small></b></div><div><b>${state.synced ? 3 : 2}<small>workouts this week</small></b></div></div>`;
  }
  function arcPath(r, start, end) {
    const p = (a) => [
      150 + r * Math.cos(((a - 90) * Math.PI) / 180),
      150 + r * Math.sin(((a - 90) * Math.PI) / 180),
    ];
    const a = p(start),
      b = p(end);
    return `M${a[0]},${a[1]}A${r},${r} 0 ${end - start > 180 ? 1 : 0} 1 ${b[0]},${b[1]}`;
  }
  function dial() {
    const id = ++uid;
    return `<div class="dial"><svg viewBox="0 0 300 300" role="img" aria-label="24-hour day: sleep at night, meals at 08:30, 12:45 and 18:30, ${doneCount()} of ${dueCount()} actions done"><defs><linearGradient id="dial${id}"><stop stop-color="var(--start)"/><stop offset="1" stop-color="var(--end)"/></linearGradient></defs><circle cx="150" cy="150" r="123" fill="none" stroke="var(--line)" stroke-width="1"/>${Array.from(
      { length: 48 },
      (_, i) => {
        const a = i * 7.5;
        return `<path d="M150 20v${i % 2 ? 3 : 6}" transform="rotate(${a} 150 150)" stroke="var(--muted)" opacity=".4"/>`;
      },
    ).join(
      "",
    )}<path d="${arcPath(110, 3, 108)}" fill="none" stroke="#788b91" stroke-width="13" stroke-linecap="round"/><path d="${arcPath(110, 109, 111)}" fill="none" stroke="#788b91" stroke-width="13" stroke-linecap="round"/><path d="${arcPath(110, 117, 138)}" fill="none" stroke="url(#dial${id})" stroke-width="21" stroke-linecap="round"/><path d="${arcPath(110, 179, 204)}" fill="none" stroke="url(#dial${id})" stroke-width="21" stroke-linecap="round"/><path d="${arcPath(110, 260, 295)}" fill="none" stroke="url(#dial${id})" stroke-width="21" stroke-linecap="round"/><path d="${arcPath(87, 240, 256)}" fill="none" stroke="var(--ink)" stroke-width="6" stroke-linecap="round"/>${state.done.map((on, i) => `<path d="${arcPath(87, 130 + i * 23, 135 + i * 23)}" fill="none" stroke="${on ? "var(--accent)" : "var(--line)"}" stroke-width="6" stroke-linecap="round"/>`).join("")}<text x="143" y="11">00</text><text x="286" y="153">06</text><text x="143" y="295">12</text><text x="0" y="153">18</text></svg><div class="dial-core"><span class="caps">A well-fed day</span><span class="number">${total("kcal").toLocaleString("en-US")}</span><small>of 2,100 kcal · est.</small></div>${img("oats", "dial-plate oats")}${img("sardines-rye", "dial-plate sardines")}${img("porkbelly", "dial-plate pork")}</div>`;
  }
  function mealRows(limit = 99) {
    return state.meals
      .slice(0, limit)
      .map(
        (m) =>
          `<button class="meal-strip" data-action="edit-meal" data-id="${m.id}">${img(m.img, "", m.name)}<span><b>${esc(m.name)}</b><small>${m.time} · ${Math.round(m.kcal * m.portion)} kcal est.</small></span>${icon("arrow")}</button>`,
      )
      .join("");
  }
  function chart(compact = false) {
    const id = ++uid,
      v = landing(),
      y = 36 + (180 - v) * 1.18;
    return `<div class="chart-wrap"><svg class="chart" viewBox="0 0 300 190" role="img" tabindex="0" aria-label="LDL measured 168 in December, 131 in August; illustrative 8-week scenario ${v} mg/dL. Arrow keys explore chart." data-chart="${id}"><defs><linearGradient id="area${id}" x1="0" y1="0" x2="0" y2="1"><stop stop-color="var(--accent)" stop-opacity=".23"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient><linearGradient id="line${id}"><stop stop-color="var(--start)"/><stop offset="1" stop-color="var(--end)"/></linearGradient></defs><rect class="goal-band" x="21" y="130" width="259" height="32" rx="3"/><text x="27" y="155">Goal 70–100</text><path class="axis-line" d="M21 31V169H282"/><text x="0" y="35">180</text><text x="0" y="97">130</text><path d="M22 50C76 66 118 85 172 94L172 168H22Z" fill="url(#area${id})"/><path d="M22 50C76 66 118 85 172 94" fill="none" stroke="url(#line${id})" stroke-width="2.5"/><path class="projection" d="M172 94C207 96 237 ${y - 10} 278 ${y}" fill="none" stroke="var(--accent)" stroke-dasharray="3 5" stroke-width="2"/><circle cx="22" cy="50" r="3" fill="var(--accent)"/><circle cx="172" cy="94" r="4" fill="var(--accent)"/><circle class="landing-dot" cx="278" cy="${y}" r="4" fill="var(--accent)"/><text x="21" y="184">DEC ’25</text><text x="154" y="184">AUG ’26</text><text x="247" y="184">+8 WK</text>${compact ? "" : `<text x="28" y="42">168</text><text x="159" y="80">131</text>`}</svg><div class="chart-tip" hidden></div></div>`;
  }
  function scenario() {
    return `<div class="scenario"><div class="spread"><span class="caps">8-week scenario</span><span class="landing"><span data-landing>${landing()}</span> <small>mg/dL</small></span></div><label>Plan consistency <output data-effort>${state.effort}%</output></label><input type="range" min="0" max="100" step="10" value="${state.effort}" data-effort-input aria-label="Plan consistency"><div class="rule-toggles"><button data-action="rule" data-id="0" aria-pressed="${state.rules[0]}">More fibre</button><button data-action="rule" data-id="1" aria-pressed="${state.rules[1]}">Daily walk</button></div><p class="scenario-note">Illustrative scenario, not a prediction. A new blood test measures what actually changed.</p></div>`;
  }
  function nextActions() {
    return `<div class="section-top"><h3>Next, at your pace</h3><button class="text-btn" data-action="navigate" data-screen="plan">${doneCount()} / ${state.done.length} ${icon("arrow")}</button></div>${actionRows()}`;
  }
  function today() {
    if (state.day !== 5) return historicalDay();
    return `${header("Good evening, Razvan")}${week()}<div class="solstice-title"><h3>A day taking shape.</h3></div><button class="dial-button" data-action="navigate" data-screen="meals" aria-label="Explore meals on your day circle">${dial()}</button>${completion()}${sleepSignal()}${state.synced ? '<div class="sync-celebration">' + icon("strength") + "<span><b>Your strength session is in.</b><small>3 workouts this week · confirmed by Apple Health demo</small></span></div>" : ""}${nextCard()}${state.walkTomorrow ? '<div class="tomorrow-card"><b>Tomorrow · dinner walk</b><small>Rescheduled, not complete</small><button class="text-btn" data-action="return-walk">Move back to today</button></div>' : ""}${goalMini()}${connectedContext()}`;
  }

  function insight() {
    return `<div class="insight">${icon("chart")}<span><b>LDL, moving in the right direction.</b><br>168 → 131 mg/dL since December.<br><button class="text-btn" data-action="navigate" data-screen="progress">Explore your trajectory ${icon("arrow")}</button></span></div>`;
  }
  function progress() {
    return `${header("Your longer view", "Measurements and possibilities", "profile")}${goalSwitcher()}${state.goal === "ldl" ? `<div class="spread"><span class="caps">LDL cholesterol</span><span class="small muted">Goal 70–100</span></div><div class="metric-heading"><div class="number">131 <small>mg/dL · measured Aug 1</small></div><div class="delta">↓ 37<br><span class="muted">since Dec 9</span></div></div>${chart()}<div class="chart-note"><span>Measured</span><span>Illustrative scenario</span></div>${scenario()}<p class="input-note">Retest to verify: discuss the next blood draw at your next review. No test is booked.</p>` : state.goal === "weight" ? `<div class="metric-heading"><div class="number">84.2 <small>kg · demo weigh-in</small></div><span class="delta">Goal 80 kg</span></div><div class="weight-chart"><svg viewBox="0 0 300 150" role="img" aria-label="Illustrative weight trajectory from 84.2 to ${weightLanding()} kilograms"><path data-weight-path d="M20 40Q145 50 280 ${40 + state.effort * 0.75}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 5"/><circle cx="20" cy="40" r="4" fill="var(--accent)"/><text x="20" y="25">84.2 kg</text><text x="210" y="140" data-weight-chart>${weightLanding()} kg scenario</text></svg></div><div class="scenario"><div class="spread"><span class="caps">8-week scenario</span><b data-mini-weight>${weightLanding()} kg</b></div><label>Plan consistency <output data-effort>${state.effort}%</output></label><input type="range" min="0" max="100" step="10" data-effort-input value="${state.effort}" aria-label="Plan consistency"><p class="scenario-note">Demo weight and illustrative arithmetic, not a forecast. Your target and your possible trajectory are different things.</p></div>` : `<div class="metric-heading"><div class="number">${3 + (dayStatus(5) === "complete" ? 1 : 0)} <small>complete days this week</small></div><span class="delta">1 planned rest day</span></div>${week()}<div class="suggestion"><strong>Consistency, without a perfect streak.</strong><p>Complete means all adopted actions due that day were done. A rest day has none due. A partial day still records what you did.</p></div>${completion()}`}<div class="insight">${icon("info")}<span>A completed action can change your plan progress. It does not change a measured lab result or immediately improve this scenario.</span></div>${connectedContext()}`;
  }

  function plan() {
    if (state.day !== 5) return historicalDay();
    return `${header("Little things, adding up.", "Your adopted plan", "profile")}${week()}${completion()}${actionRows()}${!state.synced ? '<button class="secondary" data-action="sync">' + icon("sync") + "Sync workout · demo</button>" : ""}${state.walkTomorrow ? '<div class="tomorrow-card"><b>Dinner walk · tomorrow</b><small>Not counted as complete today</small><button class="text-btn" data-action="return-walk">Move back to today</button></div>' : ""}<div class="section-top"><h3>A suggestion, at the right time</h3></div>${nextCard()}${connectedContext()}`;
  }

  function blood() {
    return `${header("Your biology", "Latest available measurements", "profile")}<div class="blood-summary"><span class="number">52</span> <small>markers measured · 7 outside range</small></div>${[
      ["LDL cholesterol", "131", "mg/dL", "Above goal", "70–100", 68],
      ["Thyroid antibodies · TPO", "320", "IU/mL", "Elevated", "< 35", 87],
      ["Vitamin D", "19", "ng/mL", "Below range", "30–50", 21],
      [
        "Ferritin",
        "22",
        "ng/mL",
        "Low iron stores",
        "Review with your clinician",
        25,
      ],
    ]
      .map(
        (m) =>
          `<div class="marker-row"><div class="spread"><span>${m[0]}</span><span class="value">${m[1]} <small>${m[2]}</small></span></div><div class="ruler" style="--pos:${m[5]}%"></div><div class="spread"><small>${m[3]}</small><small>${m[4]}</small></div></div>`,
      )
      .join(
        "",
      )}<button class="secondary" data-action="navigate" data-screen="progress">Explore LDL over time</button><div class="insight">${icon("info")}<span>Four featured results from your records. Range guides are marker-specific. Discuss changes to care with your clinician.</span></div><button class="health-lane" data-action="research"><span class="lane-icon">${icon("text")}</span><span class="lane-copy"><b>Research & your context</b><small>Understand the sources behind your plan</small></span>${icon("arrow")}</button>`;
  }
  function meals() {
    return `${header("On your plate", "Saturday, September 5")}${nutrition()}${miniMetrics()}<div class="section-top"><h3>Today’s meals</h3><button class="text-btn" data-action="navigate" data-screen="capture">Add ${icon("plus")}</button></div>${mealRows()}${state.meals.length ? "" : '<p class="small muted">No meals yet. Add a photo or a quick note.</p>'}<div class="total-label">Daily total · ${total("p")} g protein · ${total("c")} g carbs · ${total("f")} g fat. All nutrition is estimated.</div><button class="health-lane" data-action="profile"><span class="lane-icon">${icon("heart")}</span><span class="lane-copy"><b>Apple Health</b><small>10,935 steps · 7h 24m sleep · 3 workouts</small></span>${icon("arrow")}</button>`;
  }
  function modes(tiles = false) {
    return `<div class="${tiles ? "capture-tiles" : "mode-switch"}" aria-label="Capture input">${[
      ["photo", "camera", "Photo"],
      ["voice", "mic", "Voice"],
      ["text", "text", "Text"],
    ]
      .map(
        ([m, i, t]) =>
          `<button data-action="mode" data-mode="${m}" aria-pressed="${state.mode === m}">${icon(i)}${t}</button>`,
      )
      .join("")}</div>`;
  }
  function photoPanel(reading = false) {
    return `<div class="capture-photo ${state.photos.length ? "selected" : ""} ${reading ? "reading" : ""}">${img(state.photo, "", "Example plate of food")}<span class="photo-tag">Demo photo</span>${reading ? '<div class="scan-line"></div>' : '<span class="photo-prompt">Choose an example below to try capture</span>'}</div>${reading ? "" : `<div class="photo-picker">${["sardines-rye", "oats", "salad"].map((n) => `<button data-action="photo" data-photo="${n}" aria-label="${n.replaceAll("-", " ")} example photo" aria-pressed="${state.photos.includes(n)}">${img(n)}</button>`).join("")}<span>${state.photos.length ? `${state.photos.length} selected` : "Choose photos"}</span></div>`}`;
  }
  function capture() {
    ++uid;
    const top = header("Add a meal", "A little detail, kept.", "capture");
    if (state.stage === "reading")
      return `${top}${photoPanel(true)}<div class="reading-copy"><span class="reading-dots">● ● ●</span><p>Reading your ${state.mode === "photo" ? "plate" : "note"}…</p><p class="input-note">${state.mode === "photo" ? "Finding ingredients and portions" : "Preparing an editable meal estimate"}</p></div><button class="secondary" data-action="cancel-capture">Cancel</button>`;
    if (state.stage === "review") return `${top}${editForm(false)}`;
    if (state.stage === "saved")
      return `${top}<div class="receipt">${icon("check")}<h3>A little detail, kept.</h3><p>${esc(state.draft.name)}<br>${Math.round(state.draft.kcal * state.draft.portion)} kcal est. · ${Math.round(state.draft.p * state.draft.portion)} g protein</p><button class="primary" data-action="navigate" data-screen="meals">See today’s meals ${icon("arrow")}</button><button class="secondary" data-action="undo">Undo meal</button></div><button class="text-btn" data-action="new-capture">Add another</button>`;
    const ready =
      state.mode === "photo"
        ? state.photos.length > 0
        : state.text.trim().length > 0;
    return `${top}<p class="capture-intro">${design === "solstice" ? "A photo, then a quick check." : design === "strata" ? "Choose how you want to capture this meal." : "A photo or a few words is enough."}</p>${modes(design === "strata")}${state.mode === "photo" ? photoPanel() : state.mode === "voice" ? `<div class="voice-panel">${icon("mic")}${state.stage === "listening" ? `<div class="waveform">${Array.from({ length: 21 }, (_, i) => `<i style="--h:${10 + ((i * 17) % 29)}px;--d:${i * 0.03}s"></i>`).join("")}</div>` : `<p>${state.text ? esc(state.text) : "Say it in your own words."}</p>`}<button class="secondary" data-action="voice" ${state.stage === "listening" ? "disabled" : ""}>${state.text ? "Replay demo voice" : "Try demo voice"}</button></div><p class="input-note">A sample recording flow. Your microphone stays off.</p>` : `<label class="field-label" for="note-${uid}">What did you have?</label><textarea class="text-entry" id="note-${uid}" data-capture-text placeholder="Sardines on rye, a little olive oil…">${esc(state.text)}</textarea><p class="input-note">Review and edit the estimate before it joins your day.</p><button class="text-btn" data-action="sample-text">Use an example ${icon("arrow")}</button>`}<button class="primary lime" data-action="submit" ${ready ? "" : "disabled"}>Review meal ${icon("arrow")}</button><button class="secondary" data-action="play">${icon("play")} Play capture demo</button><p class="input-note" style="text-align:center;margin-top:13px">Demo estimates · saved only in this page</p>`;
  }
  function editForm(existing) {
    const formId = ++uid,
      m = state.draft;
    if (!m) return "";
    return `${img(m.img, "edit-photo", m.name)}<label class="field-label" for="meal-name-${formId}">Meal name</label><input id="meal-name-${formId}" class="edit-name" value="${esc(m.name)}" data-meal-name maxlength="120"><div class="portion"><span class="small muted">Portion</span><div class="stepper"><button data-action="portion" data-delta="-0.5" aria-label="Decrease portion" ${m.portion <= 0.5 ? "disabled" : ""}>−</button><output>${m.portion}</output><button data-action="portion" data-delta="0.5" aria-label="Increase portion" ${m.portion >= 4 ? "disabled" : ""}>+</button></div></div><div class="spread"><span class="edit-kcal number">${Math.round(m.kcal * m.portion)} <span class="estimate">kcal</span></span><span class="estimate">${existing ? "Saved" : "Example"} estimate · editable</span></div><div class="macro-row">${[
      ["p", "Protein"],
      ["c", "Carbs"],
      ["f", "Fat"],
    ]
      .map(
        ([key, label]) =>
          `<div><strong>${Math.round(m[key] * m.portion)}<small> g</small></strong><small>${label}</small></div>`,
      )
      .join(
        "",
      )}</div><p class="input-note">${existing ? "Edit the name or portion." : "This prototype uses a sample estimate. Check the name and portion."}</p><button class="primary lime" data-action="save-meal">${existing ? "Save changes" : "Keep this meal"} ${icon("check")}</button>${existing ? `<button class="secondary danger" data-action="delete-meal">Delete meal</button>` : `<button class="secondary" data-action="cancel-capture">Back to input</button>`}`;
  }
  function nav(screen) {
    return `<nav class="tabbar" aria-label="App navigation">${[
      ["today", "home", "Today"],
      ["plan", "plan", "Plan"],
      ["capture", "plus", "Add"],
      ["blood", "blood", "Blood"],
      ["progress", "chart", "Trends"],
    ]
      .map(
        ([s, i, label]) =>
          `<button data-action="navigate" data-screen="${s}" ${s === "capture" ? 'class="add-btn"' : ""} ${screen === s ? 'aria-current="page"' : ""} aria-label="${label}">${icon(i)}${s === "capture" ? "" : label}</button>`,
      )
      .join("")}</nav>`;
  }
  function screenHtml(s) {
    return { today, progress, plan, blood, meals, capture }[s]();
  }
  function renderDevice(i, preserve = true) {
    const device = document.getElementById(`phone-${i}`),
      old = device.querySelector(".screen"),
      scroll = preserve && old ? old.scrollTop : 0;
    device.innerHTML = `<div class="statusbar"><span>9:41</span><div class="island"></div><span class="status-icons">${icon("wifi")}<i class="battery"></i></span></div><div class="screen">${screenHtml(state.screens[i])}</div>${nav(state.screens[i])}${state.toast && i === activePhone() ? toastHtml() : ""}`;
    device.querySelector(".screen").scrollTop = scroll;
  }
  function activePhone() {
    return Number(document.querySelector(".study.active")?.dataset.study || 0);
  }
  function toastHtml() {
    return `<div class="toast" role="status"><span>${esc(state.toast)}</span>${state.undo ? '<button data-action="undo">Undo</button>' : ""}<button class="close-toast" data-action="dismiss" aria-label="Dismiss notification">×</button></div>`;
  }
  function renderAll(preserve = true) {
    const focused = document.activeElement,
      host = focused?.closest(".device")?.id || "web-preview",
      selector = focused?.dataset.action
        ? '[data-action="' +
          CSS.escape(focused.dataset.action) +
          '"]' +
          ["id", "mode", "photo", "delta", "screen"]
            .filter((k) => focused.dataset[k] !== undefined)
            .map(
              (k) =>
                "[data-" + k + '="' + CSS.escape(focused.dataset[k]) + '"]',
            )
            .join("")
        : null;
    [0, 1, 2].forEach((i) => renderDevice(i, preserve));
    renderWeb();
    if (modal) renderModal();
    else if (selector)
      document
        .getElementById(host)
        ?.querySelector(selector)
        ?.focus({ preventScroll: true });
  }
  function webHero() {
    return design === "solstice" ? dial() : tideHero();
  }
  function renderWeb() {
    if (state.day !== 5) {
      document.getElementById("web-preview").innerHTML =
        `<div class="web-main" style="grid-column:1/-1">${historicalDay()}</div>`;
      document
        .querySelectorAll(".demo-status")
        .forEach(
          (e) =>
            (e.textContent = state.synced
              ? "3 workouts · up to date"
              : "2 workouts · 1 ready to sync"),
        );
      return;
    }

    document.getElementById("web-preview").innerHTML =
      `<aside class="web-sidebar"><div class="brand">${icon("heart")} openvitals</div>${[
        ["today", "home", "Today"],
        ["plan", "plan", "Your plan"],
        ["progress", "chart", "Goals"],
        ["meals", "food", "Meals"],
      ]
        .map(
          ([v, i, l]) =>
            `<button data-action="web-nav" data-screen="${v}">${icon(i)}${l}</button>`,
        )
        .join(
          "",
        )}</aside><div class="web-main"><header><div><span class="caps muted">Saturday, September 5 · sample day</span><h3>Your day, connected.</h3></div><button class="primary lime" data-action="web-nav" data-screen="capture">${icon("plus")}Add a detail</button></header><div class="web-guide-grid"><div>${dial()}${completion()}${sleepSignal()}</div><div>${nextCard()}${connectedContext()}</div><div>${goalMini()}${actionRows()}</div></div></div>`;
    document
      .querySelectorAll(".demo-status")
      .forEach(
        (e) =>
          (e.textContent = state.synced
            ? "3 workouts · up to date"
            : "2 workouts · 1 ready to sync"),
      );
  }
  function renderModal() {
    document.querySelectorAll(".overlay").forEach((e) => e.remove());
    if (!modal) return;
    let html = "",
      title = "";
    if (modal.type === "edit") {
      title = "A closer look";
      html = editForm(true);
    }
    if (modal.type === "delete") {
      title = "Delete this meal?";
      html = `<p>${esc(state.draft.name)} will be removed from today’s totals.</p><button class="primary" data-action="confirm-delete">Delete meal</button><button class="secondary" data-action="cancel-delete">Keep meal</button>`;
    }
    if (modal.type === "profile") {
      title = "Your connected sources";
      html = `<p>Razvan · personal profile</p><div class="suggestion"><strong>Apple Health</strong><p>Last synced 18:42 · 10,935 steps · 7h 24m sleep · ${state.synced ? 3 : 2} workouts this week.</p></div><div class="suggestion"><strong>Blood results</strong><p>52 markers with values. LDL measured Aug 1, 2026. Nutrition records are estimates.</p></div><p>This is an interactive design prototype with local sample state. Nothing is sent to your account.</p>`;
    }
    if (modal.type === "research") {
      title = "Evidence, in context";
      html = `<p>Your daily plan connects food quality, movement and measured results.</p><div class="suggestion"><strong>Soluble fibre & lipid health</strong><p>Basis: dietary evidence. This prototype does not load research papers or personalise clinical advice.</p></div><div class="suggestion"><strong>Measure the change</strong><p>Use repeat blood results to assess progress. The scenario chart is illustrative.</p></div>`;
    }
    if (modal.type === "supplement") {
      title = "Taken as planned?";
      html = `<p>Vitamin D is already on your adopted plan. Confirm what happened today.</p>${[
        ["taken", "Yes, taken"],
        ["later", "Not yet"],
        ["skipped", "Skip today"],
      ]
        .map(
          ([v, l]) =>
            `<button class="secondary" data-action="supplement-answer" data-answer="${v}">${l}</button>`,
        )
        .join(
          "",
        )}<p class="input-note">Skipping records a choice. It does not complete the action or change your prescribed plan.</p>`;
    }
    if (modal.type === "why") {
      const g = guidance();
      title = "Why this suggestion?";
      html = `<div class="suggestion"><strong>${g.title}</strong><p>${g.kind === "walk" ? "Your adopted dinner walk is due and has no completion yet. No reminder is sent after it is done or moved." : g.kind === "supplement" ? "There is no answer for your planned supplement. We ask you instead of inferring it from a meal." : g.kind === "sync" ? "A sample strength workout is waiting to sync. One source event can complete the matching plan action only once." : fishLogged() ? "Your meal log already includes sardines. A second fish reminder is suppressed; this optional suggestion looks at meal variety." : "The sample food log has no fish meal. Missing logs may be the reason, so this is optional."}</p></div><div class="context-detail"><div><b>Plan · due today</b><small>${doneCount()} of ${dueCount()} actions complete</small></div><div><b>Apple Health · ${state.synced ? "19:05" : "18:42"}</b><small>10,935 steps · ${state.synced ? 3 : 2} workouts this week</small></div><div><b>Meals · latest 18:30</b><small>${state.meals.length} logged today. This sample week contains only these meal records.</small></div><div><b>LDL · measured Aug 1</b><small>131 mg/dL. Used as longer-term context, not proof of today's response.</small></div><div><b>Genetics · imported Aug 28</b><small>APOE e2/e3 on file. Not a reason to add a dose or award completion points.</small></div></div>`;
    }
    if (modal.type === "sleep") {
      title = "How was your night?";
      html = `<p>Apple Health recorded 7h 24m of sleep, synced at 07:18. Your personal target is 7h 30m.</p><p>Duration does not tell us how rested you feel.</p>${["Low", "Okay", "Good"].map((v) => `<button class="secondary" data-action="rested" data-answer="${v}" aria-pressed="${state.rested === v}">${v}</button>`).join("")}<p class="input-note">A personal check-in, not a recovery score.</p>`;
    }
    const overlay = document.createElement("div");
    overlay.className = "overlay";
    overlay.innerHTML = `<section class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title" tabindex="-1"><div class="sheet-head"><h3 id="sheet-title">${title}</h3><button class="icon-btn" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>${html}</section>`;
    document.getElementById(`phone-${modal.phone}`).append(overlay);
    overlay.querySelector(".sheet").focus({ preventScroll: true });
  }
  function openModal(type, phone) {
    restoreFocus = document.activeElement;
    modal = { type, phone };
    renderModal();
  }
  function closeModal() {
    modal = null;
    document.querySelectorAll(".overlay").forEach((e) => e.remove());
    if (restoreFocus?.isConnected) restoreFocus.focus({ preventScroll: true });
    else
      document
        .querySelector(`#phone-${activePhone()} [data-screen="today"]`)
        ?.focus({ preventScroll: true });
  }
  function chooseStudy(i) {
    document
      .querySelectorAll(".study")
      .forEach((e, j) => e.classList.toggle("active", j === i));
    document
      .querySelectorAll('[data-action="preview"]')
      .forEach((e, j) => e.setAttribute("aria-pressed", String(j === i)));
  }
  function navigate(i, s) {
    closeModal();
    if (state.screens[i] === "capture" && s !== "capture") {
      cancelTimers();
      if (["reading", "listening"].includes(state.stage)) state.stage = "idle";
    }
    if (["capture", "meals"].includes(s)) {
      state.day = 5;
      renderAll();
    }
    state.screens[i] = s;
    renderDevice(i, false);
  }
  function prepareDraft() {
    const names = {
      oats: fixtures[0],
      "sardines-rye": fixtures[1],
      salad: {
        name: "Mixed salad",
        kcal: 260,
        p: 9,
        c: 24,
        f: 14,
        img: "salad",
        portion: 1,
      },
    };
    const base =
      state.mode === "photo" ? names[state.photo] || fixtures[1] : fixtures[1];
    state.draft = { ...base, id: Date.now(), time: "19:05", portion: 1 };
    if (state.mode !== "photo" && state.text.trim())
      state.draft.name = state.text.trim().slice(0, 120);
    if (state.mode === "photo" && state.photos.length > 1) {
      const selected = state.photos.map((n) => names[n]);
      state.draft.name = selected.map((m) => m.name).join(" + ");
      for (const k of ["kcal", "p", "c", "f"])
        state.draft[k] = selected.reduce((a, m) => a + m[k], 0);
    }
    state.editId = null;
  }
  function submitCapture(auto = false) {
    cancelTimers();
    prepareDraft();
    state.stage = "reading";
    renderAll();
    announce("Reading example meal");
    later(
      () => {
        state.stage = "review";
        renderAll();
        announce("Estimate ready for review");
        if (auto) later(() => saveMeal(), reduce ? 250 : 1700);
      },
      reduce ? 300 : 2200,
    );
  }
  function saveMeal() {
    if (!state.draft || !state.draft.name.trim()) return;
    const previous = structuredClone(state.meals),
      existing = state.editId !== null;
    if (existing)
      state.meals = state.meals.map((m) =>
        m.id === state.editId ? { ...state.draft } : m,
      );
    else state.meals.push({ ...state.draft });
    state.stage = "saved";
    state.editId = null;
    closeModal();
    setToast(existing ? "Meal updated." : "Meal added to your day.", previous);
    renderAll();
    announce("Meal saved; daily totals updated");
  }
  function startDemo(i) {
    cancelTimers();
    state.screens[i] = "capture";
    state.stage = "idle";
    state.mode = "photo";
    state.photos = ["sardines-rye"];
    state.photo = "sardines-rye";
    state.text = "";
    renderAll();
    later(() => submitCapture(true), reduce ? 100 : 900);
  }
  function updateProjection() {
    document
      .querySelectorAll("[data-landing]")
      .forEach((e) => (e.textContent = landing()));
    document
      .querySelectorAll("[data-effort]")
      .forEach((e) => (e.textContent = state.effort + "%"));
    document
      .querySelectorAll("[data-effort-input]")
      .forEach((e) => (e.value = state.effort));
    document
      .querySelectorAll("[data-mini-ldl]")
      .forEach((e) => (e.textContent = landing()));
    document
      .querySelectorAll("[data-mini-weight]")
      .forEach((e) => (e.textContent = weightLanding()));
    document
      .querySelectorAll("[data-weight-chart]")
      .forEach((e) => (e.textContent = weightLanding() + " kg scenario"));
    document.querySelectorAll("[data-weight-path]").forEach((e) => {
      e.setAttribute("d", `M20 40Q145 50 280 ${40 + state.effort * 0.75}`);
      e.closest("svg").setAttribute(
        "aria-label",
        `Illustrative weight trajectory from 84.2 to ${weightLanding()} kilograms`,
      );
    });
    document.querySelectorAll(".chart").forEach((svg) => {
      const y = 36 + (180 - landing()) * 1.18;
      svg
        .querySelector(".projection")
        .setAttribute("d", `M172 94C207 96 237 ${y - 10} 278 ${y}`);
      svg.querySelector(".landing-dot").setAttribute("cy", y);
      svg.setAttribute(
        "aria-label",
        `LDL measured 168 in December, 131 in August; illustrative 8-week scenario ${landing()} mg/dL. Arrow keys explore chart.`,
      );
    });
  }
  document.getElementById("app").innerHTML =
    `<header class="mast"><a class="brand" href="index.html"><span class="brand-mark">${icon("plus")}</span>openvitals</a><div class="mast-right"><nav class="design-links" aria-label="Design options">${Object.entries(
      directions,
    )
      .map(
        ([key, v]) =>
          `<a href="${key === "solstice" ? "21-solstice-guide.html" : v.n + "-" + key + ".html"}" ${key === design ? 'aria-current="page"' : ""}>${v.name}</a>`,
      )
      .join(
        "",
      )}</nav><button class="icon-btn" data-action="theme" aria-label="Toggle dark mode" aria-pressed="false">${icon("moon")}</button></div></header><section class="intro"><div><span class="round">iOS study ${d.n} · design beyond</span><h1>${d.name}</h1><p>${d.line}</p></div><p class="direction">${d.note}</p></section><div class="demo-controls"><span class="caps">Interactive demo</span><button class="primary" data-action="sync">${icon("sync")}Sync Apple Health</button><button class="secondary" data-action="reset">Reset</button><span class="demo-status">2 workouts · 1 ready to sync</span></div><div class="preview-tabs" aria-label="Preview screen">${["Your day", "Your plan", "Your goals"].map((s, i) => `<button data-action="preview" data-id="${i}" aria-pressed="${i === 0}">${s}</button>`).join("")}</div><main class="showcase">${[
      [d.caption, d.detail],
      [
        "Guidance with context",
        "Adopted actions, an honest completion count, and questions only where a fact is missing.",
      ],
      [
        "Progress with perspective",
        "Explore a scenario. Keep measured results and possible outcomes visually distinct.",
      ],
    ]
      .map(
        ([title, caption], i) =>
          `<article class="study ${i === 0 ? "active" : ""}" data-study="${i}"><div class="study-label"><span>0${i + 1} / ${["TODAY", "PLAN", "GOALS"][i]}</span><b>${["A daily rhythm", "A lighter habit", "A longer view"][i]}</b></div><div class="device" id="phone-${i}" aria-label="${["Today", "Plan", "Goals"][i]} interactive preview"></div><p class="study-caption"><strong>${title}</strong>${caption}</p></article>`,
      )
      .join(
        "",
      )}</main><section class="desktop-section"><header><h2>The same rhythm, with room to breathe.</h2><p>Desktop Home · shared data and interactions</p></header><div class="web-preview" id="web-preview"></div></section><footer class="notes"><div><strong>Direction</strong>${d.note} Geist typography, Fibonacci spacing, readable charts and a single lime capture action.</div><div><strong>Motion</strong>Tick: 240ms. Sheet: 300ms. Chart: 500ms. Capture: 2.2s reading demo. Reduced motion removes animation and shortens the demo.</div><div><strong>Try it</strong>Check an action. Change the scenario. Add, edit or remove a meal. Switch themes. <button class="text-btn" data-action="reset">Reset prototype ${icon("undo")}</button></div></footer><div id="announcement" class="screen-reader" role="status" aria-live="polite"></div>`;
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("overlay")) {
      closeModal();
      return;
    }
    const b = e.target.closest("[data-action]");
    if (!b || b.disabled) return;
    const a = b.dataset.action,
      phone = Number(b.closest(".device")?.id.split("-")[1] || activePhone()),
      id = Number(b.dataset.id);
    switch (a) {
      case "preview":
        chooseStudy(id);
        break;
      case "theme":
        document.body.classList.toggle("dark");
        b.setAttribute(
          "aria-pressed",
          String(document.body.classList.contains("dark")),
        );
        b.innerHTML = icon(
          document.body.classList.contains("dark") ? "sun" : "moon",
        );
        break;
      case "navigate":
        navigate(phone, b.dataset.screen);
        break;
      case "web-nav":
        chooseStudy(0);
        navigate(0, b.dataset.screen);
        document.getElementById("phone-0").scrollIntoView({
          behavior: reduce ? "instant" : "smooth",
          block: "start",
        });
        break;
      case "day":
        if (["reading", "listening"].includes(state.stage))
          state.stage = "idle";
        cancelTimers();
        closeModal();
        state.day = id;
        state.toast = null;
        renderAll(false);
        break;
      case "sync":
        if (state.synced) {
          setToast("Already up to date. No duplicate workout.");
        } else {
          state.synced = true;
          state.done[4] = true;
          setToast("Strength session synced. That makes 3 this week.");
        }
        announce(state.toast);
        if (state.toast.startsWith("Strength session")) state.toast = null;
        renderAll();
        break;
      case "goal":
        state.goal = b.dataset.goal;
        renderAll();
        break;
      case "sleep-info":
        openModal("sleep", phone);
        break;
      case "rested":
        state.rested = b.dataset.answer;
        closeModal();
        setToast("Check-in saved: " + state.rested.toLowerCase() + ".");
        renderAll();
        break;
      case "why":
        openModal("why", phone);
        break;
      case "go-goals":
        navigate(phone, "progress");
        break;
      case "supplement":
        if (state.day === 5) openModal("supplement", phone);
        break;
      case "supplement-answer": {
        const prev = planSnapshot();
        state.supplement = b.dataset.answer;
        state.done[2] = state.supplement === "taken";
        closeModal();
        setToast(
          state.supplement === "taken"
            ? "Vitamin D confirmed."
            : state.supplement === "skipped"
              ? "Skipped today. Not counted as complete."
              : "Not yet. We’ll keep it open.",
          prev,
        );
        renderAll();
        break;
      }
      case "finish-walk":
      case "tick":
        if (state.day !== 5 || id === 3 || id === 4) break;
        {
          const index = a === "finish-walk" ? 1 : id;
          if (index === 1 && state.walkTomorrow) break;
          const prev = planSnapshot();
          state.done[index] = a === "finish-walk" ? true : !state.done[index];
          setToast("Plan updated.", prev);
          renderAll();
          announce(`${doneCount()} of ${dueCount()} actions complete`);
          break;
        }
      case "reschedule":
      case "return-walk": {
        if (state.day !== 5) break;
        const prev = planSnapshot();
        state.walkTomorrow = a === "reschedule";
        if (state.walkTomorrow) state.done[1] = false;
        setToast(
          state.walkTomorrow
            ? "Walk planned tomorrow. Not completed."
            : "Walk returned to today.",
          prev,
        );
        renderAll();
        break;
      }
      case "food-plan":
      case "food-dismiss": {
        const prev = planSnapshot();
        state.foodDismissed = true;
        if (a === "food-plan")
          state.foodPlanned = fishLogged()
            ? "Beans or a vegetable side"
            : "A fish meal";
        setToast(
          a === "food-plan"
            ? "Meal idea saved for tomorrow."
            : "Suggestion set aside.",
          prev,
        );
        renderAll();
        break;
      }
      case "adopt":
        state.adopted = true;
        state.done.push(false);
        renderAll();
        announce("Beans at lunch added to your daily plan");
        break;
      case "rule":
        state.rules[id] = !state.rules[id];
        document
          .querySelectorAll(`[data-action="rule"][data-id="${id}"]`)
          .forEach((e) =>
            e.setAttribute("aria-pressed", String(state.rules[id])),
          );
        updateProjection();
        announce(`Illustrative scenario ${landing()} milligrams per decilitre`);
        break;
      case "mode":
        cancelTimers();
        state.stage = "idle";
        state.mode = b.dataset.mode;
        renderAll();
        break;
      case "photo":
        state.photo = b.dataset.photo;
        state.photos = state.photos.includes(state.photo)
          ? state.photos.filter((n) => n !== state.photo)
          : [...state.photos, state.photo];
        renderAll();
        break;
      case "sample-text":
        state.text = "Sardines on rye, a little olive oil";
        renderAll();
        break;
      case "voice":
        cancelTimers();
        state.stage = "listening";
        state.text = "";
        renderAll();
        later(
          () => {
            state.stage = "idle";
            state.text = "Sardines on rye, a little olive oil";
            renderAll();
            announce("Example transcript ready");
          },
          reduce ? 200 : 1800,
        );
        break;
      case "submit":
        if (
          (state.mode === "photo" && state.photos.length) ||
          (state.mode !== "photo" && state.text.trim())
        )
          submitCapture();
        break;
      case "play":
        startDemo(phone);
        break;
      case "cancel-capture":
      case "new-capture":
        cancelTimers();
        state.stage = "idle";
        state.editId = null;
        state.draft = null;
        if (a === "new-capture") {
          state.text = "";
          state.photos = [];
        }
        renderAll();
        break;
      case "portion":
        state.draft.portion = Math.min(
          4,
          Math.max(0.5, state.draft.portion + Number(b.dataset.delta)),
        );
        if (modal) renderModal();
        else renderAll();
        break;
      case "save-meal":
        saveMeal();
        break;
      case "edit-meal":
        state.draft = structuredClone(state.meals.find((m) => m.id === id));
        state.editId = id;
        openModal("edit", phone);
        break;
      case "delete-meal":
        modal.type = "delete";
        renderModal();
        break;
      case "cancel-delete":
        modal.type = "edit";
        renderModal();
        break;
      case "confirm-delete": {
        const prev = structuredClone(state.meals);
        state.meals = state.meals.filter((m) => m.id !== state.editId);
        state.editId = null;
        closeModal();
        setToast("Meal removed from today.", prev);
        renderAll();
        break;
      }
      case "undo":
        if (planUndo()) {
          renderAll();
          announce("Plan change undone");
          break;
        }
        if (state.undo) {
          state.meals = state.undo;
          state.undo = null;
          state.toast = "Change undone.";
          state.stage = "idle";
          state.draft = null;
          renderAll();
          announce("Meal change undone");
        }
        break;
      case "dismiss":
        state.toast = null;
        renderAll();
        break;
      case "profile":
        openModal("profile", phone);
        break;
      case "research":
        openModal("research", phone);
        break;
      case "close":
        closeModal();
        break;
      case "reset":
        cancelTimers();
        closeModal();
        state = fresh();
        renderAll(false);
        announce("Prototype reset");
        break;
    }
  });
  document.addEventListener("input", (e) => {
    if (e.target.matches("[data-capture-text]")) {
      state.text = e.target.value;
      document
        .querySelectorAll('[data-action="submit"]')
        .forEach((b) => (b.disabled = !state.text.trim()));
    }
    if (e.target.matches("[data-meal-name]")) {
      state.draft.name = e.target.value;
      document
        .querySelectorAll('[data-action="save-meal"]')
        .forEach((b) => (b.disabled = !state.draft.name.trim()));
    }
    if (e.target.matches("[data-effort-input]")) {
      state.effort = Number(e.target.value);
      updateProjection();
    }
  });
  function chartTooltip(svg, x) {
    const wrap = svg.closest(".chart-wrap"),
      tip = wrap.querySelector(".chart-tip"),
      pos = Math.min(1, Math.max(0, x));
    tip.hidden = false;
    tip.textContent =
      pos < 0.33
        ? "168 mg/dL · Dec 9, 2025"
        : pos < 0.76
          ? "131 mg/dL · Aug 1, 2026"
          : `${landing()} mg/dL · 8-week scenario`;
    tip.style.left =
      Math.min(
        Math.max(0, pos * wrap.clientWidth - 70),
        Math.max(0, wrap.clientWidth - 170),
      ) + "px";
  }
  document.addEventListener("pointermove", (e) => {
    const svg = e.target.closest("[data-chart]");
    if (svg) {
      const r = svg.getBoundingClientRect();
      chartTooltip(svg, (e.clientX - r.left) / r.width);
    }
  });
  document.addEventListener("pointerout", (e) => {
    const wrap = e.target.closest(".chart-wrap");
    if (wrap && !wrap.contains(e.relatedTarget))
      wrap.querySelector(".chart-tip").hidden = true;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeModal();
      document.querySelectorAll(".chart-tip").forEach((t) => (t.hidden = true));
    }
    if (modal && e.key === "Tab") {
      const sheet = document.querySelector(".sheet"),
        items = [
          ...sheet.querySelectorAll(
            "button:not(:disabled),input:not(:disabled),textarea,a[href]",
          ),
        ],
        first = items[0],
        last = items.at(-1);
      if (
        e.shiftKey &&
        (document.activeElement === first || document.activeElement === sheet)
      ) {
        e.preventDefault();
        last?.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last || document.activeElement === sheet)
      ) {
        e.preventDefault();
        first?.focus();
      }
    }
    if (
      e.target.matches("[data-chart]") &&
      ["ArrowLeft", "ArrowRight"].includes(e.key)
    ) {
      e.preventDefault();
      const svg = e.target,
        p = Math.min(
          1,
          Math.max(
            0,
            Number(svg.dataset.pos || 0.5) +
              (e.key === "ArrowRight" ? 0.1 : -0.1),
          ),
        );
      svg.dataset.pos = p;
      chartTooltip(svg, p);
    }
  });
  renderAll(false);
})();
