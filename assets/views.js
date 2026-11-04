// The pages. Each view returns the nodes for <main>; app.js owns the state, the URL and re-rendering.
import * as D from "./data.js";
import { DEEMPH, FAMILY, SLOT, card, checkMark, dumbbell, h, heatmap, hbars, lines, meter, scatter, scoreBar, seq, seqLegend,
  stacked, strips, table, thinBar } from "./charts.js";

const pct = D.fmtPct;
const humanize = (name) => name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const dateText = (iso) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : "–");

function section(title, kicker, ...kids) {
  return h("section", { class: "block" },
    h("div", { class: "block-head" }, kicker ? h("p", { class: "kicker", text: kicker }) : null, h("h2", { text: title })), ...kids);
}
function trapNote(text) {
  return h("aside", { class: "trap" }, h("span", { class: "trap-label", text: "The trap" }), h("p", { text }));
}
function chip(text, cls = "") { return h("span", { class: `chip ${cls}`, text }); }
function scoreText(row) {
  if (row.score !== null) return `${pct(row.score)}${row.judgedAll ? "" : "*"}`;
  if (row.partial !== null) return `${pct(row.partial)}${row.judgedAll ? "" : "*"}`;
  return "–";
}
function stat(label, value, sub) {
  return h("div", { class: "stat" }, h("div", { class: "stat-label", text: label }), h("div", { class: "stat-value", text: value }),
    sub ? h("div", { class: "stat-sub", text: sub }) : null);
}
function modelLink(ctx, model) {
  const c = ctx.colorOf(model);
  return h("a", { href: ctx.link("model", model), class: "model-link" },
    h("span", { class: "swatch", style: { background: c || "transparent", borderColor: c || "var(--line-strong)" } }), model);
}
function taskTitle(db, id) { return db.taskById[id].short || db.taskById[id].title; }

// Models that did not run every task: named, never scored (see D.prepare).
const STOPPED_WHY = "Failed, or stopped early for not looking competitive, so not run on every task and not scored.";
function alsoTested(db) {
  if (!db.stopped.length) return null;
  return h("div", { class: "also" }, h("h3", { text: "Also tested" }),
    h("p", { class: "also-names" }, db.stopped.map((m) => h("span", { class: "chip", text: m }))),
    h("p", { class: "muted small", text: STOPPED_WHY }));
}

// --- the filter row: what the reader needs a model for, and which models stand out ------------------------

export function filterRow(db, ctx, { types = true } = {}) {
  const st = ctx.state;
  const tabs = [{ id: "all", name: "All work" }, ...db.categories];
  const tabRow = h("div", { class: "tabs", role: "tablist", "aria-label": "Kind of work" }, tabs.map((t) => {
    const n = t.id === "all" ? db.tasks.length : db.tasksIn(t.id).length;
    return h("button", { type: "button", role: "tab", class: `tab${st.sel === t.id ? " on" : ""}`, "aria-selected": String(st.sel === t.id),
      onclick: () => ctx.set({ sel: t.id, fmt: "any" }) }, h("span", { text: t.name }), h("span", { class: "tab-n", text: String(n) }));
  }));
  const formats = Object.entries(db.formats).filter(([id]) => db.tasks.some((t) => t.format === id && (st.sel === "all" || t.category === st.sel)));
  const typeSeg = types && formats.length > 1 ? h("div", { class: "fgroup" }, h("span", { class: "flabel", text: "File type" }),
    h("div", { class: "seg", role: "group", "aria-label": "File type" },
      [["any", "Any"], ...formats].map(([id, name]) => h("button", { type: "button", class: st.fmt === id ? "on" : "", "aria-pressed": String(st.fmt === id),
        text: name, onclick: () => ctx.set({ fmt: id }) })))) : null;
  const slots = h("div", { class: "fgroup" }, h("span", { class: "flabel", text: "Highlight" }),
    h("div", { class: "slots" }, st.hl.map((m, i) => {
      if (m) return h("span", { class: "slot-chip" }, h("span", { class: "swatch", style: { background: `var(--series-${i + 1})` } }),
        h("a", { href: ctx.link("model", m), text: m }),
        h("button", { type: "button", class: "x", "aria-label": `Stop highlighting ${m}`, text: "×", onclick: () => ctx.setSlot(i, null) }));
      const sel = h("select", { "aria-label": `Highlight a model in colour ${i + 1}`, onchange: (e) => e.target.value && ctx.setSlot(i, e.target.value) },
        h("option", { value: "", text: "Add a model…" }), db.models.filter((x) => !st.hl.includes(x)).map((x) => h("option", { value: x, text: x })));
      return h("span", { class: "slot-chip empty" }, h("span", { class: "swatch", style: { background: `var(--series-${i + 1})` } }), sel);
    })));
  const ids = D.selectTasks(db, st.sel, st.fmt);
  const scope = h("p", { class: "scope" }, ids.length
    ? `${ids.length} task${ids.length === 1 ? "" : "s"}: ${ids.map((t) => taskTitle(db, t)).join(" · ")}`
    : "No task matches this combination.");
  return h("div", { class: "filters" }, tabRow, h("div", { class: "filter-panel" }, h("div", { class: "frow" }, typeSeg, slots), scope));
}

// --- overview: the short answer, for someone who has just arrived -----------------------------------------------

const NUMBER_WORDS = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];
function tally(value, label) {
  return h("div", { class: "tally-item" }, h("dt", { text: label }), h("dd", { text: String(value) }));
}

export function overview(db, ctx) {
  const all = db.tasks.map((t) => t.id);
  const rows = D.board(db, all).filter((r) => r.coverage);
  const scoredRuns = db.runs.filter((r) => r.scored).length;
  const unjudged = db.runs.filter((r) => r.scored && (r.judge === null || r.judge === undefined)).length;
  const n = db.tasks.length;
  const head = h("header", { class: "front" },
    h("p", { class: "kicker", text: "Local models in MyRA Cowork" }),
    h("h1", { class: "front-title", text: "Which local model should do your Cowork work?" }),
    h("div", { class: "front-row" },
      h("p", { class: "front-dek" }, `${NUMBER_WORDS[n] || n} tasks a portfolio manager hands an assistant, run inside `, h("strong", { text: "MyRA Cowork" }),
        " with exactly the tools, prompt and settings Cowork gives its model. Each model is scored on what it got right, and timed and counted on what it took."),
      h("dl", { class: "tally" },
        tally(db.models.length + db.stopped.length, "models tested"),
        tally(n, `tasks in ${db.categories.length} kinds of work`),
        tally(scoredRuns, "scored runs"),
        tally(db.updated ? new Date(db.updated).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "–", "latest run"))));
  const disclaimer = h("div", { class: "bench-notice" },
    h("p", { class: "notice-title", text: "Note" }),
    h("p", {}, "This benchmark was written by Claude, has not been closely proofread by a human, and the scores are an informal indicator, not a ranking. The tasks are narrow, the hardware is one machine, and the judge is itself a local model. Read the numbers as a rough guide to how these models tend to behave in Cowork, not as a definitive comparison."));
  if (!rows.length) {
    return [head, disclaimer, h("section", { class: "standings solo" }, h("div", { class: "sec-head" }, h("h2", { text: "The standings" })),
      h("p", { class: "empty", text: "No model has run every task yet, so none is scored." }), alsoTested(db)), tested(db, ctx, scoredRuns, unjudged)];
  }
  const short = findingsBlock(db, ctx, all, { sel: "all", fmt: "any", drop: ["best", "leaders"], plain: true });
  return [
    head,
    disclaimer,
    h("div", { class: `front-grid${short ? "" : " one"}` }, standings(db, ctx, rows), short),
    byKind(db, ctx),
    tested(db, ctx, scoredRuns, unjudged),
  ];
}

function standings(db, ctx, rows) {
  const top = rows.slice(0, 5);
  const partial = top.find((r) => !r.complete);
  return h("section", { class: "standings" },
    h("div", { class: "sec-head" }, h("h2", { text: "The standings" }),
      h("p", { class: "muted small", text: `Score out of 100 over all ${db.tasks.length} tasks, and what a task takes on average.` })),
    h("ol", { class: "stand-list" }, top.map((r) => h("li", { class: "stand" },
      h("span", { class: "stand-rank", text: String(r.position) }),
      h("div", { class: "stand-who" }, modelLink(ctx, r.model),
        h("span", { class: "stand-meta" }, `${D.fmtMinutes(r.minutes)} a task · ${D.compact(r.tokens)} tokens`,
          r.complete ? null : h("span", { class: "badge", text: `${r.coverage} of ${r.of} tasks` }))),
      h("span", { class: "stand-bar" }, scoreBar(r.score ?? r.partial, null, null, 132)),
      h("strong", { class: "stand-score", text: scoreText(r) })))),
    h("p", { class: "stand-foot" }, h("a", { class: "cta", href: ctx.link("results"),
      text: rows.length > top.length ? `All ${rows.length} models, their costs and every task →` : "The full leaderboard, costs and every task →" })),
    partial ? h("p", { class: "muted small", text: `“${partial.coverage} of ${partial.of} tasks”: the model has not run them all, so it ranks below any model that has, and its score covers the tasks it ran.` }) : null,
    alsoTested(db));
}

function byKind(db, ctx) {
  return h("section", { class: "kinds" },
    h("div", { class: "sec-head" }, h("h2", { text: "Best for each kind of work" }),
      h("p", { class: "muted small", text: "The leader on each kind of task so far. Open a folder for its full leaderboard and charts." })),
    h("div", { class: "kind-grid" }, db.categories.map((c) => {
      const ids = db.tasksIn(c.id);
      const [first, second] = D.board(db, ids).filter((r) => r.coverage);
      const tasksRun = (r) => (r.complete ? "" : ` over ${r.coverage} of ${r.of} tasks`);
      return h("article", { class: "kind-card" },
        h("h3", { class: "kind-tab" }, c.name, h("span", { class: "tab-n", text: `${ids.length} task${ids.length === 1 ? "" : "s"}` })),
        h("div", { class: "kind-body" },
          h("p", { class: "kind-blurb", text: c.blurb }),
          h("div", { class: "kind-bottom" },
            first ? [
              h("p", { class: "kind-label", text: "Best so far" }),
              h("div", { class: "kind-lead" }, modelLink(ctx, first.model), h("strong", { class: "kind-score", text: scoreText(first) })),
              first.complete ? null : h("p", { class: "kind-next", text: `Over ${first.coverage} of its ${first.of} tasks.` }),
              second ? h("p", { class: "kind-next" }, "Next: ", h("a", { href: ctx.link("model", second.model), text: second.model }), `, ${scoreText(second)}${tasksRun(second)}`) : null,
            ] : h("p", { class: "kind-next", text: "No runs yet." }),
            h("a", { class: "more kind-more", href: ctx.link("results", null, null, { sel: c.id, fmt: "any" }), text: `The ${c.noun || c.name.toLowerCase()} leaderboard →` }))));
    })));
}

function tested(db, ctx, scoredRuns, unjudged) {
  const n = D.typicalTrials(db);
  return h("section", { class: "tested" },
    h("h2", { text: "How it was tested" }),
    h("p", {}, `Every run is on one desktop (Intel Core i5, 64 GB DDR5, one AMD Radeon R9700, llama.cpp on ROCm)${n ? `, typically ${n} trial${n === 1 ? "" : "s"} per model and task` : ""}. `,
      unjudged ? [h("strong", { text: unjudged === scoredRuns ? "* No run is judged yet: " : `* ${unjudged} of ${scoredRuns} runs are not judged yet: ` }),
        "those scores are the fact checks alone, which confirm the tested facts are there but do not catch wrong statements elsewhere; the judge's quality score is added once they are judged. "] : null,
      h("a", { href: ctx.link("method"), text: "The method →" })));
}

// --- results: every number, for the kind of work the reader picks -----------------------------------------------

export function results(db, ctx) {
  const st = ctx.state;
  const ids = D.selectTasks(db, st.sel, st.fmt);
  const rows = D.board(db, ids);
  const scoredRuns = db.runs.filter((r) => r.scored).length;
  const unjudged = db.runs.filter((r) => r.scored && (r.judge === null || r.judge === undefined)).length;
  const out = [
    h("header", { class: "page-head" }, h("p", { class: "kicker", text: "All the evidence" }), h("h1", { text: "Results" }),
      h("p", { class: "lede-text small", text: "Pick the kind of work you need, then weigh score against what it costs: time, tokens, prompt size. Every chart has a table view." })),
    filterRow(db, ctx),
  ];
  if (!db.models.length) return [out[0], h("p", { class: "empty", text: "No model has run every task yet, so none is scored." }), alsoTested(db)];
  if (unjudged) out.push(h("p", { class: "notice" }, h("strong", { text: unjudged === scoredRuns ? "No run is judged yet. " : `${unjudged} of ${scoredRuns} runs are not judged yet. ` }),
    "Their scores are the fact checks alone, marked *, which confirm the tested facts are there but do not catch wrong statements elsewhere. The judge's quality score is added once they are judged; see ", h("a", { href: ctx.link("method"), text: "Method" }), "."));
  if (!ids.length) return [...out, h("p", { class: "empty", text: "No task matches this combination of kind of work and file type." })];
  if (st.sel !== "all" || st.fmt !== "any") out.push(findingsBlock(db, ctx, ids, { collapsed: true }));
  out.push(leaderboard(db, ctx, rows, ids));
  out.push(costScatter(db, ctx, rows));
  out.push(modelTaskHeat(db, ctx, rows, ids));
  return out;
}

function leaderboard(db, ctx, rows, ids) {
  const st = ctx.state;
  const groups = st.sel === "all" && st.fmt === "any"
    ? db.categories.map((c) => ({ id: c.id, label: c.name, ids: db.tasksIn(c.id) }))
    : ids.map((t) => ({ id: t, label: taskTitle(db, t), ids: [t] }));
  const groupBoards = Object.fromEntries(groups.map((g) => [g.id, Object.fromEntries(D.board(db, g.ids).map((b) => [b.model, b]))]));
  const groupScore = (r, g) => {
    const b = groupBoards[g.id][r.model];
    return b ? { v: b.score ?? b.partial, partial: !b.complete && b.partial !== null } : { v: null };
  };
  const cols = [
    { key: "position", label: "#", num: true, get: (r) => r.position, cell: (r) => String(r.position) },
    { key: "model", label: "Model", get: (r) => r.model.toLowerCase(), cell: (r) => h("span", {}, modelLink(ctx, r.model),
      !r.complete ? h("span", { class: "badge", title: "Not every task in this selection has a run yet", text: `${r.coverage}/${r.of} tasks` }) : null) },
    { key: "score", label: "Score", num: true, get: (r) => r.score ?? (r.partial === null ? -1 : r.partial - 2), sortDefault: true,
      cell: (r) => h("span", { class: "score-cell" }, scoreBar(r.score ?? r.partial, r.lo, r.hi), h("strong", { text: scoreText(r) })) },
    ...groups.map((g) => ({ key: `g:${g.id}`, label: g.label, num: true, get: (r) => groupScore(r, g).v ?? -1,
      cell: (r) => { const x = groupScore(r, g); return x.v === null ? "–" : `${pct(x.v)}${x.partial ? "†" : ""}`; } })),
    { key: "minutes", label: "Min / task", num: true, get: (r) => r.minutes ?? 1e9, cell: (r) => D.fmtNum(r.minutes) },
    { key: "tokens", label: "Tokens / task", num: true, get: (r) => r.tokens ?? 1e15, cell: (r) => D.compact(r.tokens) },
    { key: "peak", label: "Peak prompt", num: true, get: (r) => r.peak ?? 1e15, cell: (r) => D.compact(r.peak) },
    { key: "toolCalls", label: "Tool calls", num: true, get: (r) => r.toolCalls ?? 1e9, cell: (r) => D.fmtNum(r.toolCalls, 0) },
    { key: "finishRate", label: "In time", num: true, get: (r) => r.finishRate ?? -1, cell: (r) => (r.finishRate === null ? "–" : `${pct(r.finishRate)}%`) },
  ];
  const wrap = h("div", { class: "table-wrap" });
  let sortKey = "score", desc = true;
  const lowerIsBetter = new Set(["minutes", "tokens", "peak", "toolCalls", "position", "model"]);
  const draw = () => {
    const col = cols.find((c) => c.key === sortKey);
    const sorted = sortKey === "score" ? [...rows] : [...rows].sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      return (x < y ? -1 : x > y ? 1 : 0) * (desc ? -1 : 1);
    });
    if (sortKey === "score" && !desc) sorted.reverse();
    const thead = h("thead", {}, h("tr", {}, cols.map((c) => h("th", { class: c.num ? "num" : "", "aria-sort": c.key === sortKey ? (desc ? "descending" : "ascending") : "none" },
      h("button", { type: "button", class: "sort", onclick: () => { if (sortKey === c.key) desc = !desc; else { sortKey = c.key; desc = !lowerIsBetter.has(c.key); } draw(); } },
        c.label, c.key === sortKey ? h("span", { class: "arrow", text: desc ? " ↓" : " ↑" }) : null)))));
    const tbody = h("tbody", {}, sorted.map((r) => h("tr", { class: ctx.colorOf(r.model) ? "hl" : "" },
      cols.map((c) => h("td", { class: c.num ? "num" : "" }, c.cell(r))))));
    wrap.replaceChildren(h("table", { class: "data board" }, thead, tbody));
  };
  draw();
  return h("figure", { class: "card wide" },
    h("div", { class: "card-head" }, h("div", { class: "card-titles" }, h("h3", { text: "Leaderboard" }),
      h("p", { class: "sub", text: "Score is the mean of task scores (each the mean over its trials), 0–100. The bar's whisker spans the model's weakest to strongest task. Costs are means per task. Click a column to sort." }))),
    wrap,
    h("figcaption", { class: "note" },
      rows.some((r) => !r.judgedAll) ? "* checks only: not judged yet. " : null,
      rows.some((r) => groups.some((g) => groupScore(r, g).partial)) ? "† not every task in the group has a run. " : null,
      rows.some((r) => !r.complete) ? "Models with every selected task run rank first. " : null,
      db.stopped.length ? `Also tested, not scored (failed, or stopped early for not looking competitive): ${db.stopped.join(", ")}. ` : null,
      h("a", { href: ctx.link("method"), text: "How scores and costs are measured" }), "."));
}

function costScatter(db, ctx, rows) {
  const st = ctx.state;
  const metric = D.METRICS[st.x] ? st.x : "minutes";
  const M = D.METRICS[metric];
  const anyComplete = rows.some((r) => r.complete);
  const points = rows.map((r) => ({
    id: r.model, label: r.model, x: M.get(r), y: r.score ?? r.partial, color: ctx.colorOf(r.model), partial: !r.complete,
    extra: [{ value: `${r.coverage}/${r.of}`, label: "tasks run" }, ...(r.complete ? [] : [{ value: "partial", label: "score over the tasks it has run" }])],
  }));
  const fr = D.frontier(points.filter((p) => !anyComplete || !p.partial)).map((p) => p.id);
  const select = h("label", { class: "inline-select" }, h("span", { class: "flabel", text: "Cost" }),
    h("select", { onchange: (e) => ctx.set({ x: e.target.value }) },
      Object.entries(D.METRICS).map(([k, m]) => h("option", { value: k, selected: k === metric, text: `${m.label} (${m.unit})` }))));
  return card({
    title: "Score against cost", sub: `${M.about} Up and to the left is better; the line joins the models nothing else beats on both.`,
    controls: [select],
    render: scatter({ points, xLabel: `${M.label}, ${M.unit}`, xFmt: M.fmt, xLog: M.log, frontierIds: fr,
      onClick: (p) => (location.hash = ctx.link("model", p.id)) }),
    legendItems: [...ctx.state.hl.map((m, i) => (m ? { label: m, color: `var(--series-${i + 1})` } : null)).filter(Boolean),
      { label: "Other models", color: DEEMPH }, { label: "Best trade-off line", color: "var(--ink-2)", kind: "line" }],
    tableView: () => table({ head: ["Model", "Score", `${M.label} (${M.unit})`, "Tasks run", "On the line"], numeric: [false, true, true, true, false],
      rows: rows.map((r) => [r.model, scoreText(r), M.fmt(M.get(r)), `${r.coverage}/${r.of}`, fr.includes(r.model) ? "yes" : ""]) }),
  });
}

function modelTaskHeat(db, ctx, rows, ids) {
  const byCat = db.categories.map((c) => ({ label: c.name, cols: ids.filter((t) => db.taskById[t].category === c.id)
    .map((t) => ({ id: t, label: taskTitle(db, t), href: ctx.link("task", t), title: db.taskById[t].title })) })).filter((g) => g.cols.length);
  return card({
    title: "Every model on every task", sub: "Mean score over the trials. Darker is better; a dot means not run yet. Click a cell for that model's runs and mistakes on the task.",
    legendItems: [], render: heatmap({
      corner: "Model",
      rows: rows.map((r) => ({ id: r.model, label: r.model, href: ctx.link("model", r.model), color: ctx.colorOf(r.model) })),
      groups: byCat,
      cell: (r, c) => {
        const x = db.cell(r.id, c.id);
        if (!x || !x.n) return null;
        return { v: x.mean, text: pct(x.mean), href: ctx.link("perf", r.id, c.id), title: `${r.label} · ${c.title}`,
          tip: [{ value: `${pct(x.mean)}${x.judged === x.n ? "" : "*"}`, label: x.n > 1 ? `mean of ${x.n} trials (${pct(x.min)}–${pct(x.max)})` : "1 trial" },
            { value: D.fmtMinutes(x.seconds / 60), label: "per run" }, { value: D.compact(x.tokens), label: "tokens per run" },
            { value: D.compact(x.peak), label: "peak prompt" }] };
      },
    }),
    note: seqLegend("0", "100", "score"),
    tableView: () => table({ head: ["Model", ...ids.map((t) => taskTitle(db, t))], numeric: [false, ...ids.map(() => true)],
      rows: rows.map((r) => [r.model, ...ids.map((t) => { const x = db.cell(r.model, t); return x && x.n ? `${pct(x.mean)} (${x.n})` : "–"; })]) }),
  });
}

// --- model page ----------------------------------------------------------------------------------------------

export function model(db, ctx, name) {
  if (!db.models.includes(name)) {
    return [h("p", { class: "empty", text: db.stopped.includes(name)
      ? `${name} was tested but failed or was stopped early, before running every task, so it has no scores here.` : `No runs for a model called “${name}”.` })];
  }
  const all = db.tasks.map((t) => t.id);
  const b = D.board(db, all).find((x) => x.model === name);
  const color = ctx.colorOf(name);
  const info = db.info[name] || {};
  const facts = [["Parameters", info.params], ["Active parameters", info.active], ["Quantization", info.quant], ["Runtime", info.runtime],
    ["Hardware", info.hardware], ["Context window", b.window ? `${D.compact(b.window)} tokens` : null]].filter(([, v]) => v);
  const out = [
    h("p", { class: "crumbs" }, h("a", { href: ctx.link("results"), text: "Results" }), " / Model"),
    h("header", { class: "page-head" },
      h("h1", {}, color ? h("span", { class: "swatch big", style: { background: color } }) : null, name),
      info.note ? h("p", { class: "lede-text", text: info.note }) : null,
      facts.length ? h("dl", { class: "facts" }, facts.flatMap(([k, v]) => [h("dt", { text: k }), h("dd", { text: v })])) : null,
      info.link ? h("p", {}, h("a", { href: info.link, rel: "noopener", text: "Model page" })) : null,
      h("div", { class: "page-actions" }, compareWith(db, ctx, name))),
    h("div", { class: "stats" },
      stat("Score, all tasks", scoreText(b), b.complete ? (b.judgedAll ? "judged" : "checks only so far") : `partial: ${b.coverage} of ${b.of} tasks run`),
      stat("Wall time", D.fmtMinutes(b.minutes), "per task"),
      stat("Tokens", D.compact(b.tokens), "per task"),
      stat("Peak prompt", D.compact(b.peakMax), b.window ? `largest; ${pct(b.peakMax / b.window)}% of its window` : "largest"),
      stat("Tool calls", D.fmtNum(b.toolCalls, 0), `per task; ${b.toolErrorRate === null ? "–" : `${D.fmtNum(b.toolErrorRate * 100)}%`} failed`)),
  ];
  const catRows = db.categories.map((c) => {
    const x = D.board(db, db.tasksIn(c.id)).find((r) => r.model === name);
    return { label: c.name, value: x.score ?? x.partial, lo: x.lo, hi: x.hi, color: color || undefined,
      text: x.score === null && x.partial !== null ? `${pct(x.partial)}†` : undefined, empty: "not run" };
  });
  out.push(h("div", { class: "grid2" },
    card({ title: "By kind of work", sub: "Mean score per category; the whisker spans its tasks. † partial.",
      render: hbars({ rows: catRows, label: "Score by kind of work", barColor: color || undefined }),
      tableView: () => table({ head: ["Kind of work", "Score"], numeric: [false, true], rows: catRows.map((r) => [r.label, r.value === null ? "–" : pct(r.value)]) }) }),
    card({ title: "Every trial", sub: "Each dot is one run; the tick is the mean. Spread means the model is inconsistent on that task.",
      render: strips({ color: color || "var(--bar)", label: "Trial scores per task", rows: db.tasks.map((t) => {
        const c = db.cell(name, t.id);
        return { label: t.short, values: c ? c.scores : [], mean: c ? c.mean : null, href: ctx.link("perf", name, t.id) };
      }) }),
      tableView: () => table({ head: ["Task", "Mean", "Trials"], numeric: [false, true, false],
        rows: db.tasks.map((t) => { const c = db.cell(name, t.id); return [t.title, c && c.n ? pct(c.mean) : "–", c ? c.scores.map(pct).join(", ") : ""]; }) }) })));
  out.push(card({ wide: true, title: "What each task cost", sub: "Means per run. Peak prompt is the largest single prompt; prompt tokens sent add up every call's prompt.",
    render: (host) => host.append(table({ head: ["Task", "Score", "Trials", "Minutes", "Tokens", "Prompt sent", "Peak prompt", "Model calls", "Tool calls", "Tool errors"],
      numeric: [false, true, true, true, true, true, true, true, true, true],
      rows: db.tasks.map((t) => { const c = db.cell(name, t.id);
        if (!c || !c.n) return [h("a", { href: ctx.link("perf", name, t.id), text: t.title }), "–", "0", "", "", "", "", "", "", ""];
        return [h("a", { href: ctx.link("perf", name, t.id), text: t.title }), `${pct(c.mean)}${c.judged === c.n ? "" : "*"}`, String(c.n), D.fmtNum(c.seconds / 60),
          D.compact(c.tokens), D.compact(c.sent), D.compact(c.peak), D.fmtNum(c.calls, 0), D.fmtNum(c.toolCalls, 0), String(c.toolErrors)]; }) })) }));
  out.push(modelMistakes(db, ctx, name));
  const fams = D.TOOL_FAMILIES.map((f, i) => ({ key: f.id, label: f.name, color: FAMILY[i], ink: i === 3 ? "#0b0b0b" : "#ffffff" }));
  const mixRow = (label, tools) => { const parts = {}; for (const [k, v] of Object.entries(tools)) parts[D.toolFamily(k)] = (parts[D.toolFamily(k)] || 0) + v; return { label, parts }; };
  const mixRows = db.tasks.map((t) => { const c = db.cell(name, t.id); return mixRow(t.short, c ? c.tools : {}); });
  out.push(card({ wide: true, title: "How it works on each task", sub: "Share of tool calls by kind: pi's own file tools, the shell, and MyRA's tools.",
    legendItems: fams.map((f) => ({ label: f.label, color: f.color, kind: "rect" })),
    render: stacked({ rows: mixRows, keys: fams, label: "Tool mix per task", fmt: (v) => `${v} calls` }),
    tableView: () => toolTable(db.tasks.map((t) => [t.title, (db.cell(name, t.id) || { tools: {} }).tools])) }));
  return out;
}

function toolTable(rows) {
  const names = [...new Set(rows.flatMap(([, tools]) => Object.keys(tools)))].sort();
  return table({ head: ["", ...names], numeric: [false, ...names.map(() => true)], rows: rows.map(([label, tools]) => [label, ...names.map((n) => String(tools[n] || 0))]) });
}

// --- tasks ---------------------------------------------------------------------------------------------------

export function tasks(db, ctx) {
  const f = db.content.folder;
  const tree = {};
  for (const p of db.folderFiles) { const top = p.includes("/") ? p.split("/")[0] + "/" : p; (tree[top] ||= []).push(p); }
  const out = [
    h("header", { class: "page-head" }, h("p", { class: "kicker", text: "The tasks" }), h("h1", { text: "Nine jobs from one manager's desk" }),
      h("p", { class: "lede-text", text: f.intro })),
    h("div", { class: "folder" },
      h("div", { class: "folder-tab", text: `${f.company} · ${f.persona}` }),
      h("div", { class: "folder-body" },
        h("div", { class: "grid2 tight" },
          h("div", {}, h("h3", { text: "The projects" }), table({ head: ["Project", "Phase", "Lead", "Notes written as", "Status now"],
            rows: f.projects.map((p) => [p.name, p.phase, p.lead, p.notes, p.status]) })),
          h("div", {}, h("h3", { text: "What is in the folder" }), h("dl", { class: "sources" }, f.sources.flatMap((x) => [h("dt", { class: "mono", text: x.name }), h("dd", { text: x.what })])),
            db.folderFiles.length ? h("details", { class: "files" }, h("summary", { text: `All ${db.folderFiles.length} files` }),
              h("ul", { class: "mono tree" }, Object.entries(tree).map(([top, files]) => h("li", {}, h("strong", { text: top }),
                files.length > 1 || files[0] !== top ? h("ul", {}, files.map((x) => h("li", { text: x.slice(top.length) || x }))) : null)))) : null)))),
  ];
  for (const c of db.categories) {
    out.push(section(c.name, "Kind of work", h("p", { class: "lede-text small", text: c.blurb }),
      h("div", { class: "task-grid" }, db.tasks.filter((t) => t.category === c.id).map((t) => taskCard(db, ctx, t)))));
  }
  return out;
}

function promptSize(db, id) {
  const cells = db.models.map((m) => db.cell(m, id)).filter((c) => c && c.n);
  if (!cells.length) return null;
  const peaks = cells.map((c) => c.peak).filter(Boolean).sort((a, b) => a - b);
  return { start: D.mean(cells.map((c) => c.start).filter(Boolean)), typical: peaks[Math.floor(peaks.length / 2)], max: Math.max(...cells.map((c) => c.peakMax || 0)) };
}

function taskCard(db, ctx, t) {
  const ps = promptSize(db, t.id);
  const best = D.board(db, [t.id]).filter((r) => r.complete)[0];
  const p = db.prompts[t.id];
  return h("article", { class: "task-card" },
    h("div", { class: "task-card-head" }, h("h3", {}, h("a", { href: ctx.link("task", t.id), text: t.title })),
      h("span", { class: "chips" }, chip(db.formats[t.format]), chip(t.output, "mono"))),
    p && p.text ? h("blockquote", { class: "ask", text: p.text }) : null,
    trapNote(t.trap),
    h("div", { class: "card-foot" },
      h("div", { class: "split" }, thinBar([{ label: "Checks", value: t.weights[0], color: "var(--series-1)" }, { label: "Judge", value: t.weights[1], color: "var(--series-2)" }]),
        h("span", { class: "muted", text: `Checks ${Math.round(t.weights[0] * 100)}% · judge ${Math.round(t.weights[1] * 100)}%` })),
      ps ? h("p", { class: "muted", text: `Prompt starts near ${D.compact(ps.start)} tokens, peaks near ${D.compact(ps.typical)} (largest ${D.compact(ps.max)}).` }) : null,
      best ? h("p", {}, h("span", { class: "muted", text: "Best so far: " }), modelLink(ctx, best.model), ` ${pct(best.score)}${best.judgedAll ? "" : "*"}`) : null));
}

export function task(db, ctx, id) {
  const t = db.taskById[id];
  if (!t) return [h("p", { class: "empty", text: "No such task." })];
  const cat = db.categories.find((c) => c.id === t.category);
  const rows = D.board(db, [id]);
  const ran = rows.filter((r) => r.coverage);
  const p = db.prompts[id];
  const out = [
    h("p", { class: "crumbs" }, h("a", { href: ctx.link("tasks"), text: "Tasks" }), ` / ${cat.name}`),
    h("header", { class: "page-head" }, h("h1", { text: t.title }),
      h("p", { class: "chips" }, chip(cat.name), chip(db.formats[t.format]), chip(t.output, "mono")),
      h("p", { class: "lede-text", text: t.about })),
    h("div", { class: "grid2 tight" },
      h("div", {}, h("h3", { text: "As typed into Cowork" }), h("blockquote", { class: "ask big", text: p && p.text ? p.text : "–" }),
        p && p.folder_dated ? h("p", { class: "muted small", text: `Dates in the prompt and folder are relative to the day of the run; this is the run of ${dateText(p.folder_dated)}.` }) : null),
      trapNote(t.trap)),
    h("div", { class: "grid2 tight" },
      h("div", {}, h("h3", { text: `What the checks test (${Math.round(t.weights[0] * 100)}% of the score)` }),
        h("p", { class: "muted small", text: "Code checks that these facts are there; it does not catch wrong statements elsewhere in the work." }),
        h("ol", { class: "checks" }, Object.entries(t.checks).map(([k, text]) => h("li", {}, h("span", { text }), h("code", { class: "muted", text: k }))))),
      h("div", {}, h("h3", { text: `What the judge scores (${Math.round(t.weights[1] * 100)}%)` }),
        h("p", { class: "muted small", text: "A strong model reads the result with the right answers in hand and scores each criterion 1 to 5." }),
        h("ul", { class: "rubric" }, t.rubric.map((r) => h("li", {}, h("strong", { text: humanize(r.name) }), h("span", { class: "muted", text: ` ×${r.weight}` }), h("p", { text: r.description })))))),
  ];
  if (!ran.length) return [...out, h("p", { class: "empty", text: "No runs of this task yet." })];
  const rankRows = ran.map((r) => { const c = r.cells[id];
    return { label: r.model, value: c.mean, lo: c.min, hi: c.max, color: ctx.colorOf(r.model) || undefined, href: ctx.link("perf", r.model, id), strong: !!ctx.colorOf(r.model),
      text: `${pct(c.mean)}${c.judged === c.n ? "" : "*"}`,
      tip: [{ value: `${pct(c.mean)}`, label: c.n > 1 ? `mean of ${c.n} trials, ${pct(c.min)}–${pct(c.max)}` : "1 trial", color: ctx.colorOf(r.model) || "var(--bar)" },
        { value: D.fmtMinutes(c.seconds / 60), label: "per run" }, { value: D.compact(c.tokens), label: "tokens" }] }; });
  out.push(h("div", { class: "grid2" },
    card({ title: "Ranking", sub: "Mean score; the whisker spans its trials. Click a model for its runs and mistakes.", render: hbars({ rows: rankRows, label: `Ranking on ${t.title}` }),
      tableView: () => table({ head: ["Model", "Score", "Trials", "Minutes", "Tokens", "Peak prompt"], numeric: [false, true, true, true, true, true],
        rows: ran.map((r) => { const c = r.cells[id]; return [r.model, pct(c.mean), c.scores.map(pct).join(", "), D.fmtNum(c.seconds / 60), D.compact(c.tokens), D.compact(c.peak)]; }) }) }),
    card({ title: "Who falls for what", sub: "Share of each model's runs that passed each check. Hover a cell for the check.",
      render: heatmap({ corner: "Model", rows: ran.map((r) => ({ id: r.model, label: r.model, href: ctx.link("model", r.model), color: ctx.colorOf(r.model) })),
        groups: [{ label: "", cols: Object.keys(t.checks).map((k, i) => ({ id: k, label: String(i + 1), title: t.checks[k] })) }],
        cell: (r, c) => { const rates = D.checkRates(db, r.id, id); const v = rates ? rates[c.id] : undefined;
          return v === undefined ? null : { v, text: pct(v), href: ctx.link("perf", r.id, id), title: `${r.label} · check ${c.label}`, tip: [{ value: `${pct(v)}%`, label: "of runs passed" }, { value: "", label: t.checks[c.id] }] }; } }),
      note: h("span", {}, seqLegend("0%", "100%", "passed"), h("span", { class: "muted small", text: "Columns are the numbered checks on the left." })),
      tableView: () => table({ head: ["Model", ...Object.keys(t.checks).map((k, i) => `${i + 1}`)], numeric: [false, ...Object.keys(t.checks).map(() => true)],
        rows: ran.map((r) => { const rates = D.checkRates(db, r.model, id) || {}; return [r.model, ...Object.keys(t.checks).map((k) => (rates[k] === undefined ? "–" : `${pct(rates[k])}%`))]; }) }) })));
  const series = ran.flatMap((r) => r.cells[id].scored.map((run) => ({ id: run.id, group: r.model, color: ctx.colorOf(r.model),
    points: (run.prompt_curve || []).map((v, i) => [i + 1, v]) })));
  const win = Math.max(0, ...ran.map((r) => r.cells[id].window || 0));
  out.push(card({ wide: true, title: "How the prompt grows", sub: "Every run's prompt size at each model call: the conversation so far, re-sent each time. A drop is pi compacting the conversation to fit.",
    legendItems: [...ctx.state.hl.map((m, i) => (m ? { label: m, color: `var(--series-${i + 1})`, kind: "line" } : null)).filter(Boolean),
      { label: "Other models", color: DEEMPH, kind: "line" }],
    render: lines({ series, xLabel: "Model call", yLabel: "Prompt tokens", yFmt: D.compact, refs: win ? [{ y: win, label: `Context window ${D.compact(win)}` }] : [] }),
    tableView: () => table({ head: ["Model", "Starting prompt", "Peak prompt", "Largest", "Prompt tokens sent", "Model calls"], numeric: [false, true, true, true, true, true],
      rows: ran.map((r) => { const c = r.cells[id]; return [r.model, D.compact(c.start), D.compact(c.peak), D.compact(c.peakMax), D.compact(c.sent), D.fmtNum(c.calls, 0)]; }) }) }));
  return out;
}

// --- how they work ------------------------------------------------------------------------------------------

export function usage(db, ctx) {
  const st = ctx.state;
  const ids = D.selectTasks(db, st.sel, st.fmt);
  const rows = D.board(db, ids).filter((r) => r.coverage);
  const out = [h("header", { class: "page-head" }, h("p", { class: "kicker", text: "How they work" }), h("h1", { text: "Tools, tokens and time" }),
    h("p", { class: "lede-text", text: "Everything here comes from pi's own session log of each run: every model call's token counts, every tool call, every compaction. Figures are means per task over the selected tasks." })),
    filterRow(db, ctx)];
  if (!rows.length) return [...out, h("p", { class: "empty", text: "No runs for this selection." })];
  const fams = D.TOOL_FAMILIES.map((f, i) => ({ key: f.id, label: f.name, color: FAMILY[i], ink: i === 3 ? "#0b0b0b" : "#ffffff" }));
  const mix = rows.map((r) => { const parts = {}; for (const [k, v] of Object.entries(r.tools)) parts[D.toolFamily(k)] = (parts[D.toolFamily(k)] || 0) + v; return { label: r.model, parts, r }; });
  out.push(card({ wide: true, title: "Which tools each model reaches for", sub: "Share of tool calls by kind. MyRA's document tools read and write Word, Excel, PowerPoint and PDF files directly; without them a model writes Python through the shell.",
    legendItems: fams.map((f) => ({ label: f.label, color: f.color, kind: "rect" })),
    render: stacked({ rows: mix, keys: fams, label: "Tool mix per model", fmt: (v) => `${v} calls`, totalFmt: (_, row) => `${D.fmtNum(row.r.toolCalls, 0)}/task` }),
    tableView: () => toolTable(rows.map((r) => [r.model, r.tools])) }));
  const promptRows = rows.map((r) => ({ label: r.model, value: r.peak, color: ctx.colorOf(r.model) || undefined, href: ctx.link("model", r.model),
    text: `${D.compact(r.peak)}${r.window ? ` · ${pct(r.peak / r.window)}%` : ""}`, lo: null, hi: null }));
  const maxPeak = Math.max(...rows.map((r) => r.peakMax || 0), 1);
  out.push(h("div", { class: "grid2" },
    card({ title: "Peak prompt", sub: "The largest single prompt in a run, mean per task, and as a share of the model's context window.",
      render: hbars({ rows: promptRows, max: Math.max(...rows.map((r) => r.window || 0), maxPeak), fmt: D.compact, label: "Peak prompt per model" }),
      tableView: () => table({ head: ["Model", "Starting prompt", "Peak prompt", "Largest", "Window"], numeric: [false, true, true, true, true],
        rows: rows.map((r) => [r.model, D.compact(r.start), D.compact(r.peak), D.compact(r.peakMax), D.compact(r.window)]) }) }),
    card({ title: "Prompt tokens sent", sub: "Every call's prompt added up, mean per task: the prompt-processing load on your machine.",
      render: hbars({ rows: rows.map((r) => ({ label: r.model, value: r.sent, color: ctx.colorOf(r.model) || undefined, text: D.compact(r.sent), href: ctx.link("model", r.model) })),
        max: Math.max(...rows.map((r) => r.sent || 0), 1), fmt: D.compact, label: "Prompt tokens sent per model" }),
      tableView: () => table({ head: ["Model", "Prompt tokens sent", "Output tokens", "Total tokens", "Model calls"], numeric: [false, true, true, true, true],
        rows: rows.map((r) => [r.model, D.compact(r.sent), D.compact(r.output), D.compact(r.tokens), D.fmtNum(r.calls, 0)]) }) })));
  const peakGroups = db.categories.map((c) => ({ label: c.name, cols: ids.filter((t) => db.taskById[t].category === c.id).map((t) => ({ id: t, label: taskTitle(db, t), href: ctx.link("task", t), title: db.taskById[t].title })) })).filter((g) => g.cols.length);
  out.push(card({ wide: true, title: "Prompt size by task", sub: "Mean peak prompt for each model and task: roughly the context window the task needs. Darker is larger.",
    render: heatmap({ corner: "Model", rows: rows.map((r) => ({ id: r.model, label: r.model, href: ctx.link("model", r.model), color: ctx.colorOf(r.model) })), groups: peakGroups,
      cell: (r, c) => { const x = db.cell(r.id, c.id); if (!x || !x.peak) return null;
        return { v: x.peak / maxPeak, text: D.compact(x.peak), title: `${r.label} · ${c.title}`, href: ctx.link("task", c.id),
          tip: [{ value: D.compact(x.peak), label: "mean peak prompt" }, { value: D.compact(x.peakMax), label: "largest" }, { value: D.compact(x.start), label: "starting prompt" },
            ...(x.window ? [{ value: `${pct(x.peak / x.window)}%`, label: "of the context window" }] : [])] }; } }),
    note: seqLegend("0", D.compact(maxPeak), "peak prompt, tokens"),
    tableView: () => table({ head: ["Model", ...ids.map((t) => taskTitle(db, t))], numeric: [false, ...ids.map(() => true)],
      rows: rows.map((r) => [r.model, ...ids.map((t) => D.compact((db.cell(r.model, t) || {}).peak))]) }) }));
  const split = [{ key: "model", label: "Model thinking and writing", color: "var(--series-1)", ink: "#ffffff" }, { key: "tools", label: "Tools running", color: "var(--series-2)", ink: "#ffffff" }];
  const speed = rows.map((r) => ({ label: r.model, value: r.modelMinutes ? r.output / (r.modelMinutes * 60) : null, color: ctx.colorOf(r.model) || undefined }));
  out.push(h("div", { class: "grid2" },
    card({ title: "Where the time goes", sub: "Minutes per task: waiting on the model (prompt processing plus generation) against running tools.",
      legendItems: split.map((x) => ({ label: x.label, color: x.color, kind: "rect" })),
      render: stacked({ rows: rows.map((r) => ({ label: r.model, parts: { model: r.modelMinutes || 0, tools: r.toolMinutes || 0 } })), keys: split, normalize: false,
        fmt: (v) => D.fmtMinutes(v), totalFmt: (tot) => D.fmtMinutes(tot), label: "Time split per model" }),
      tableView: () => table({ head: ["Model", "Model minutes", "Tool minutes", "Wall minutes"], numeric: [false, true, true, true],
        rows: rows.map((r) => [r.model, D.fmtNum(r.modelMinutes), D.fmtNum(r.toolMinutes), D.fmtNum(r.minutes)]) }) }),
    card({ title: "Approximate generation speed", sub: "Output tokens per second of model time. Model time includes reading the prompt, so long prompts pull this down; read it as the speed you will feel, not a raw benchmark.",
    render: hbars({ rows: speed.map((x) => ({ ...x, text: x.value === null ? "–" : `${D.fmtNum(x.value)} tok/s` })), max: Math.max(...speed.map((x) => x.value || 0), 1), fmt: (v) => D.fmtNum(v, 0), label: "Output tokens per model-second" }),
    tableView: () => table({ head: ["Model", "Output tokens per second"], numeric: [false, true], rows: speed.map((x) => [x.label, x.value === null ? "–" : D.fmtNum(x.value)]) }) })));
  out.push(card({ wide: true, title: "Reliability", sub: "How often tool calls fail, how often pi had to compact the conversation, and how many runs finished within the time limit.",
      render: (host) => host.append(table({ head: ["Model", "Tool calls failed", "Compactions per run", "Endpoint retries", "Finished in time"], numeric: [false, true, true, true, true],
        rows: rows.map((r) => [modelLink(ctx, r.model), r.toolErrorRate === null ? "–" : `${D.fmtNum(r.toolErrorRate * 100)}%`,
          r.compactionsPerRun === null ? "–" : D.fmtNum(r.compactionsPerRun, 2), String(r.retries), r.finishRate === null ? "–" : `${pct(r.finishRate)}%`]) })) }));
  return out;
}

// --- method --------------------------------------------------------------------------------------------------

function weighs(title, good, blind) {
  return h("div", { class: "card weigh" }, h("h3", { text: title }),
    h("p", { class: "kicker", text: "Good at" }), h("ul", {}, good.map((x) => h("li", {}, x))),
    h("p", { class: "kicker", text: "Blind spots" }), h("ul", {}, blind.map((x) => h("li", {}, x))));
}

export function method(db, ctx) {
  const cw = db.content.cowork;
  const scored = db.runs.filter((r) => r.scored);
  const judged = scored.filter((r) => r.judge !== null && r.judge !== undefined);
  const out = [
    h("header", { class: "page-head" }, h("p", { class: "kicker", text: "Method" }), h("h1", { text: "How a run works, and what the numbers mean" })),
    h("div", { class: "prose" },
      h("h2", { text: "Inside Cowork, not beside it" }),
      h("p", { text: "The bench runs inside a MyRA Cowork folder's own sandbox. Each task starts a fresh copy of the portfolio folder in a mount namespace of its own and drives the same pi agent Cowork uses, with the same flags, extensions, skills, system-prompt notes, model settings and model route. After every run the bench compares the system prompt and every tool definition the task's model saw with those of the folder's own Cowork chat; a run that differs is marked. Nobody answers the model's questions: Cowork's ask tool is answered “skipped”, as Cowork does when the person does not reply." }),
      h("p", { text: "So these results describe models working in MyRA Cowork. A model's score elsewhere, with other tools and another prompt, can differ." }),
      h("h2", { text: "What the model has" }),
      h("div", { class: "tools-grid" },
        h("div", {}, h("h3", { text: "pi's tools" }), h("ul", { class: "tools" }, cw.pi_tools.map((x) => h("li", {}, h("code", { text: x.name }), h("span", { text: x.label }))))),
        h("div", {}, h("h3", { text: "MyRA's tools" }), h("ul", { class: "tools" }, cw.myra_tools.map((x) => h("li", {}, h("code", { text: x.name }), h("span", { text: x.label })))))),
      h("p", {}, "Skills: ", cw.skills.map((x, i) => [i ? ", " : "", h("code", { text: x })]), ". The sandbox has no internet."),
      h("h2", { text: "The machine, and which models" }),
      h("p", { text: "Every run is on one desktop: an Intel Core i5, 64 GB of DDR5 and a single AMD Radeon R9700 GPU, running the models with llama.cpp on ROCm. Times and token speeds are what that machine gives; yours will differ with your hardware, each model's quantization and your runtime." }),
      h("p", { text: "Only models that can run locally are generally tested. A model that failed, or ran a few tasks and did not look competitive, was not run further, as finishing it was not worth the machine time. Such a model is named but not scored: a few runs are not a fair comparison with models that ran everything." }),
      db.stopped.length ? h("p", {}, "Tested but not scored: ", db.stopped.join(", "), ".") : null,
      h("h2", { text: "Scoring: checks and a judge" }),
      h("p", { text: "Each run is scored two ways. The checks are code: they read the file the model made and test it against facts planted in the folder. The judge is a strong model that reads the same file later, through the same route, with the right answers in hand, and scores it 1 to 5 on each criterion of the task's rubric." }),
      h("p", { class: "notice" }, h("strong", { text: "A high checks score does not mean the work has no mistakes. " }),
        "The checks confirm that the facts they test are there and that the traps were avoided. Beyond that they only check that dates of past events are real, so a task given to the wrong person, a wrong future date or an invented figure elsewhere goes unnoticed. Catching those is the judge's job. ",
        !judged.length ? "No run is judged yet, so every score on this site is the checks alone, marked *."
          : judged.length < scored.length ? `${judged.length} of ${scored.length} runs are judged; the rest are the checks alone, marked *.` : null),
      h("h3", { text: "What the checks test" }),
      h("ul", {}, h("li", { text: "Facts that must be there: each project's RAG status, a new go-live date, the USD 18,400 ask, each open action or decision from the notes." }),
        h("li", { text: "Traps that must be avoided: the closed project, actions done since, closed risks, the archive, a discussion that was never decided." }),
        h("li", { text: "Numbers, to a small tolerance: budget, actuals from the finance export, forecast at completion, variance." }),
        h("li", { text: "Form, where the prompt asks for it: the file's name and folder, the original kept, the RAID log's layout, slide and row counts, length." }),
        h("li", { text: "Dates of past events, in every task: each must be a date the folder holds, so a misstated or made-up date for something that already happened is caught. Dates ahead, such as a review date the model sets, are not checked." })),
      h("p", {}, "Every ", h("a", { href: ctx.link("tasks"), text: "task's page" }), " lists its checks in plain English. One example from these runs of what they miss: a reply to the sponsor scored 100% on its checks. It had the new date, the cause and the licence ask. It also asked the sponsor to take on two of the team's own tasks, one with a deadline already past. No check looks for that.")),
    h("div", { class: "grid2 compare" },
      weighs("The checks", [
        "Exact and repeatable: the same file always gets the same score, and stored runs are checked again whenever a grader is fixed.",
        "Every result is shown, with a short note (“said Amber”, “14/18: missing A3”).",
        "Length and polish do not help.",
        "Every model meets the same traps, tested the same way.",
      ], [
        [h("strong", { text: "Wrong or invented content. " }), "They test that the right facts are there, not that nothing wrong was added. Only dates of past events are checked against the folder: a wrong future date, a task given to the wrong person, a made-up figure, or a summary that contradicts its own table all pass."],
        [h("strong", { text: "Words, not meaning. " }), "A reason check looks for words such as “Northbeam” or “export” in Beacon's row. That shows the reason is named, not that it is stated correctly."],
        [h("strong", { text: "Quality. " }), "Tone, clarity, whether a deck asks for a decision, how the slides look."],
        [h("strong", { text: "Unusual forms. " }), "A right answer written in a form the grader does not read, such as an odd date format or a project named only by its code, can be marked wrong."],
      ]),
      weighs("The judge", [
        "It reads the whole piece against the right answers, so it can catch a misstated or invented fact, or a contradiction, anywhere in it.",
        "It scores what code cannot: tone, structure, whether a report is ready for leadership, and the slides themselves, shown as pictures when the judge model reads images.",
        "It can tell apart runs that all scored 100% on the checks.",
      ], [
        [h("strong", { text: "It is a model. " }), "It can miss a mistake or see one that is not there, and it can score the same work differently on another pass. Each run is judged once."],
        [h("strong", { text: "It may be a contestant. " }), "The judge is the strongest model on the test machine, so it may be one of the models being ranked, and it may favour work like its own."],
        [h("strong", { text: "It is generous. " }), "Local judges tend to give 4s and 5s, which narrows the gaps between runs."],
        [h("strong", { text: "It sees some work only in part. " }), "It reads spreadsheets as rows of text, so it cannot see their layout. Work longer than 16,000 characters is cut. It sees at most the first eight slides."],
      ])),
    h("div", { class: "prose" },
      h("p", { text: "So the checks carry most of the weight, and the judge counts for more where the work is prose or slides:" }),
      h("dl", { class: "glossary" }, [...new Set(db.tasks.map((t) => t.weights[1]))].sort((a, b) => b - a).flatMap((w) => [
        h("dt", { text: `Judge ${Math.round(w * 100)}%` }),
        h("dd", {}, db.tasks.filter((t) => t.weights[1] === w).map((t, i) => [i ? ", " : "", h("a", { href: ctx.link("task", t.id), text: t.title })]))])),
      h("p", { text: "A run's score is checks × w + judge × (1 − w), with w per task. Until a run is judged its score is the checks alone, marked *." }),
      h("p", { text: "A task's score is the mean over its trials. A model's score over several tasks is the mean of its task scores, and it ranks with the complete models only when every one of those tasks has a run. Runs that failed for reasons outside the model (the model's server erred, the run was stopped) are not scored; a run that ran out of time is scored on whatever it had made." }),
      h("h2", { text: "Costs" }),
      h("dl", { class: "glossary" }, Object.values(D.METRICS).flatMap((m) => [h("dt", { text: `${m.label} (${m.unit})` }), h("dd", { text: m.about })]),
        h("dt", { text: "Finished in time" }), h("dd", { text: "Runs that finished, out of those that finished or ran out of time." }),
        h("dt", { text: "Tool calls failed" }), h("dd", { text: "Tool calls whose result was an error, out of all tool calls." }),
        h("dt", { text: "Compactions" }), h("dd", { text: "Times pi summarised the conversation because it was nearing the context window." })),
      h("h2", { text: "Limits" }),
      h("ul", {}, h("li", { text: "One fictional folder. It is built to be realistic, with traps a careful person would catch, but it is one company's portfolio." }),
        h("li", { text: "One judge, itself a model, and one pass per run (see Scoring above)." }),
        h("li", { text: "One machine (above). Wall times and generation speeds depend on it, and on each model's quantization and llama.cpp's settings." }),
        h("li", { text: "Only models that ran every task are scored. A model stopped early might have done better on the tasks it never ran." }),
        h("li", { text: "The folder is dated relative to each run's day, so prompts mention different dates from run to run; the facts are the same." }))),
  ];
  if (judged.length >= 3) {
    out.push(card({ title: "Do the checks and the judge agree?", sub: "Each dot is a judged run: its checks score against its judge score.",
      render: scatter({ points: judged.map((r) => ({ id: r.id, label: `${r.model} · ${taskTitle(db, r.task)}`, x: r.det, y: r.judge, color: ctx.colorOf(r.model) })),
        xLabel: "Checks", yLabel: "Judge", xFmt: (v) => String(Math.round(v * 100)) }),
      tableView: () => table({ head: ["Model", "Task", "Checks", "Judge"], numeric: [false, false, true, true], rows: judged.map((r) => [r.model, taskTitle(db, r.task), pct(r.det), pct(r.judge)]) }) }));
  }
  return out;
}

// --- findings: what the numbers say, for the current selection -------------------------------------------

function scopeText(db, st) {
  const cat = db.categories.find((c) => c.id === st.sel);
  const fmt = st.fmt !== "any" ? db.formats[st.fmt] : null;
  if (!cat && !fmt) return "";
  return ` on ${cat ? `${cat.noun || cat.name.toLowerCase()} tasks` : "tasks"}${fmt ? ` in ${fmt}` : ""}`;
}

function findingLink(ctx, l) {
  if (!l) return null;
  const href = l.route === "compare" ? ctx.link("compare", null, null, { a: l.a, b: l.b }) : ctx.link(l.route, l.arg);
  return h("a", { class: "more", href, text: `${l.label} →` });
}

function findingsBlock(db, ctx, ids, { sel = ctx.state.sel, fmt = ctx.state.fmt, drop = [], plain = false, collapsed = false } = {}) {
  const notes = db.notes || {};
  const hide = new Set([...(notes.hide || []), ...drop]);
  const scope = scopeText(db, { sel, fmt });
  const own = (notes.notes || []).filter((n) => n && n.text && (n.sel || "all") === sel && (!n.fmt || n.fmt === fmt));
  const auto = D.findings(db, ids, scope).filter((f) => !hide.has(f.id) && !hide.has(f.id.split(":")[0]));
  if (!own.length && !auto.length) return null;
  const list = h("ol", { class: "findings-list" },
    own.map((n) => h("li", { class: "own" }, h("p", { text: n.text }), n.link ? h("a", { class: "more", href: n.link, text: `${n.link_text || "More"} →` }) : null)),
    auto.map((f) => h("li", { dataset: { id: f.id } }, h("p", { text: f.text }), findingLink(ctx, f.link))));
  const count = own.length + auto.length;
  if (collapsed) {
    return h("details", { class: "findings" },
      h("summary", {}, h("span", { class: "findings-title", text: `In short${scope}` }), h("span", { class: "muted small", text: `${count} finding${count === 1 ? "" : "s"}` })),
      list);
  }
  if (plain) {
    return h("section", { class: "findings plain" },
      h("div", { class: "sec-head" }, h("h2", { text: "In short" }),
        h("p", { class: "muted small", text: "What stands out in the results as they stand. It updates with every publish." })), list);
  }
  return h("section", { class: "findings" },
    h("div", { class: "findings-head" }, h("h2", { text: "In short" }),
      h("p", { class: "muted small", text: "Read from the results as they stand, for the tasks picked above. They update with every publish." })), list);
}

// --- mistakes, for one model --------------------------------------------------------------------------------

function modelChip(ctx, model, task) {
  const c = ctx.colorOf(model);
  return h("a", { class: "mchip", href: task ? ctx.link("perf", model, task) : ctx.link("model", model) },
    h("span", { class: "swatch", style: { background: c || "transparent", borderColor: c || "var(--line-strong)" } }), model);
}

function modelMistakes(db, ctx, name) {
  const cards = db.tasks.map((t) => {
    const c = db.cell(name, t.id);
    const head = h("h4", {}, h("a", { href: ctx.link("perf", name, t.id), text: t.title }));
    if (!c || !c.n) return h("div", { class: "trap-card quiet" }, head, h("p", { class: "muted", text: "Not run yet." }));
    const missed = D.checkStats(db, [t.id]).map((st) => ({ st, rate: (st.models.find((x) => x.model === name) || {}).rate }))
      .filter((x) => x.rate !== undefined && x.rate < 0.999).sort((a, b) => a.rate - b.rate);
    if (!missed.length) return h("div", { class: "trap-card quiet" }, head,
      h("p", { class: "clean" }, h("span", { class: "mark pass" }, h("span", { class: "mark-icon", text: "✓" })), ` No mistakes: every check passed in ${c.n === 1 ? "its run" : `all ${c.n} runs`}.`));
    return h("div", { class: "trap-card" }, head,
      h("ul", { class: "mistakes" }, missed.map(({ st, rate }) => {
        const kind = D.mistakeKind(D.othersRate(st, name));
        return h("li", {}, h("div", { class: "mistake-top" }, meter(rate, 56), h("span", { class: "rate-v", text: `${pct(rate)}% passed` }),
          h("span", { class: `kind ${kind.id}`, text: kind.label })), h("p", { text: st.text }));
      })),
      h("a", { class: "more", href: ctx.link("perf", name, t.id), text: "Every check, run by run →" }));
  });
  return section("Mistakes", "Check by check",
    h("p", { class: "lede-text small", text: "The checks this model did not always pass, task by task, and whether other models trip on the same thing. The bar is the share of its runs that passed." }),
    h("div", { class: "trap-grid" }, cards));
}

function compareWith(db, ctx, name) {
  return h("label", { class: "inline-select" }, h("span", { class: "flabel", text: "Compare with" }),
    h("select", { onchange: (e) => { if (e.target.value) location.hash = ctx.link("compare", null, null, { a: name, b: e.target.value }); } },
      h("option", { value: "", text: "another model…" }), db.models.filter((m) => m !== name).map((m) => h("option", { value: m, text: m }))));
}

// --- compare --------------------------------------------------------------------------------------------------

/** What tells two names apart: "low" and "xhigh" for "Qwen 3.8 27b low" and "Qwen 3.8 27b xhigh". */
function shortNames(a, b) {
  const wa = a.split(/\s+/), wb = b.split(/\s+/);
  let i = 0;
  while (i < wa.length - 1 && i < wb.length - 1 && wa[i] === wb[i]) i++;
  const x = wa.slice(i).join(" "), y = wb.slice(i).join(" ");
  return x.length <= 14 && y.length <= 14 ? [x, y] : [null, null];
}

export function compare(db, ctx) {
  const st = ctx.state;
  const { a, b } = st;
  if (!a || !b) {
    return [h("header", { class: "page-head" }, h("p", { class: "kicker", text: "Compare" }), h("h1", { text: "Two models, side by side" })),
      h("p", { class: "empty", text: "Comparing needs two models that have run every task." }), alsoTested(db)];
  }
  const used = [ctx.colorOf(a), ctx.colorOf(b)];
  const free = SLOT.filter((c) => !used.includes(c));
  const ca = ctx.colorOf(a) || free.shift(), cb = ctx.colorOf(b) || free.shift();
  const pick = (which, cur, other) => h("select", { "aria-label": which === "a" ? "First model" : "Second model", onchange: (e) => ctx.set({ [which]: e.target.value }) },
    db.models.map((m) => h("option", { value: m, selected: m === cur, disabled: m === other, text: m })));
  const out = [
    h("header", { class: "page-head" }, h("p", { class: "kicker", text: "Compare" }), h("h1", { text: "Two models, side by side" }),
      h("div", { class: "pickers" },
        h("span", { class: "picker" }, h("span", { class: "swatch big", style: { background: ca } }), pick("a", a, b)),
        h("button", { type: "button", class: "swap", "aria-label": "Swap the two models", text: "⇄", onclick: () => ctx.set({ a: b, b: a }) }),
        h("span", { class: "picker" }, h("span", { class: "swatch big", style: { background: cb } }), pick("b", b, a)))),
    filterRow(db, ctx),
  ];
  if (!a || !b || a === b) return [...out, h("p", { class: "empty", text: "Pick two different models." })];
  const ids = D.selectTasks(db, st.sel, st.fmt);
  const ra = D.board(db, ids).find((r) => r.model === a), rb = D.board(db, ids).find((r) => r.model === b);
  const shared = ids.filter((t) => ra.cells[t] && rb.cells[t]);
  const [sna, snb] = shortNames(a, b);
  const na = sna || a, nb = snb || b;
  const A = { label: a, short: sna, color: ca }, B = { label: b, short: snb, color: cb };
  if (!shared.length) out.push(h("p", { class: "notice", text: "These two have not run any of the same tasks in this selection yet, so there is nothing to compare like for like." }));
  else {
    const sa = D.board(db, shared).find((r) => r.model === a), sb = D.board(db, shared).find((r) => r.model === b);
    const va = sa.partial, vb = sb.partial;
    const lead = Math.abs(va - vb) < 0.005 ? `${a} and ${b} score the same, ${pct(va)}` :
      `${va > vb ? a : b} scores ${pct(Math.max(va, vb))} to ${pct(Math.min(va, vb))}`;
    const ratio = (x, y) => (x && y ? Math.max(x, y) / Math.min(x, y) : null);
    const tr = ratio(sa.minutes, sb.minutes), kr = ratio(sa.tokens, sb.tokens);
    const fast = tr && tr >= 1.15 ? (sa.minutes < sb.minutes ? a : b) : null;
    const lean = kr && kr >= 1.15 ? (sa.tokens < sb.tokens ? a : b) : null;
    let costs = "";
    if (fast && lean && fast === lean) costs = ` ${fast} is ${tr.toFixed(1)}× faster and uses ${kr.toFixed(1)}× fewer tokens.`;
    else costs = `${fast ? ` ${fast} is ${tr.toFixed(1)}× faster.` : ""}${lean ? ` ${lean} uses ${kr.toFixed(1)}× fewer tokens.` : ""}`;
    if (!fast && !lean) costs = " They cost about the same in time and tokens.";
    out.push(h("p", { class: "verdict" }, `On the ${shared.length === 1 ? "task" : `${shared.length} tasks`} both have run${scopeText(db, st)}, ${lead}.${costs}`));
    const diffPts = (x, y) => (x === null || y === null ? "–" : Math.abs(x - y) < 0.005 ? "same" : `${x > y ? na : nb} +${Math.round(Math.abs(x - y) * 100)}`);
    const diffCost = (x, y, fmt) => { if (!x || !y) return "–"; const r = Math.max(x, y) / Math.min(x, y); return r < 1.05 ? "about the same" : `${x < y ? na : nb} ${r.toFixed(1)}× less`; };
    const rows = [
      ["Score", `${pct(va)}${sa.judgedAll ? "" : "*"}`, `${pct(vb)}${sb.judgedAll ? "" : "*"}`, diffPts(va, vb)],
      ["Minutes per task", D.fmtNum(sa.minutes), D.fmtNum(sb.minutes), diffCost(sa.minutes, sb.minutes)],
      ["Tokens per task", D.compact(sa.tokens), D.compact(sb.tokens), diffCost(sa.tokens, sb.tokens)],
      ["Prompt tokens sent per task", D.compact(sa.sent), D.compact(sb.sent), diffCost(sa.sent, sb.sent)],
      ["Peak prompt (largest)", D.compact(sa.peakMax), D.compact(sb.peakMax), diffCost(sa.peakMax, sb.peakMax)],
      ["Tool calls per task", D.fmtNum(sa.toolCalls, 0), D.fmtNum(sb.toolCalls, 0), diffCost(sa.toolCalls, sb.toolCalls)],
      ["Tool calls failed", sa.toolErrorRate === null ? "–" : `${D.fmtNum(sa.toolErrorRate * 100)}%`, sb.toolErrorRate === null ? "–" : `${D.fmtNum(sb.toolErrorRate * 100)}%`, ""],
      ["Finished in time", sa.finishRate === null ? "–" : `${pct(sa.finishRate)}%`, sb.finishRate === null ? "–" : `${pct(sb.finishRate)}%`, ""],
    ];
    out.push(h("figure", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-titles" }, h("h3", { text: "Head to head" }),
      h("p", { class: "sub", text: `On the ${shared.length === 1 ? "task" : `${shared.length} tasks`} both have run. Costs are means per task; lower is better.` }))),
      h("div", { class: "h2h" }, table({ head: ["", a, b, "Difference"], numeric: [false, true, true, false], rows }))));
  }
  const cats = db.categories.filter((c) => ids.some((t) => db.taskById[t].category === c.id));
  const dRows = cats.flatMap((c) => [{ group: true, label: c.name }, ...ids.filter((t) => db.taskById[t].category === c.id).map((t) => {
    const xa = db.cell(a, t), xb = db.cell(b, t);
    return { label: db.taskById[t].short, va: xa && xa.n ? xa.mean : null, vb: xb && xb.n ? xb.mean : null, href: ctx.link("task", t),
      extra: [{ value: xa && xa.n ? D.fmtMinutes(xa.seconds / 60) : "–", label: `${na}, per run`, color: ca }, { value: xb && xb.n ? D.fmtMinutes(xb.seconds / 60) : "–", label: `${nb}, per run`, color: cb }] };
  })]);
  out.push(card({ title: "Task by task", sub: "Mean score on each task; the label on the right says who leads and by how much.",
    legendItems: [{ label: a, color: ca }, { label: b, color: cb }],
    render: dumbbell({ rows: dRows, a: A, b: B, label: `${a} against ${b}, task by task` }),
    tableView: () => table({ head: ["Task", a, b], numeric: [false, true, true], rows: ids.map((t) => {
      const xa = db.cell(a, t), xb = db.cell(b, t);
      return [db.taskById[t].title, xa && xa.n ? pct(xa.mean) : "–", xb && xb.n ? pct(xb.mean) : "–"]; }) }) }));
  // The checks that tell them apart.
  const diffCards = [];
  let same = 0;
  for (const t of shared) {
    const ra2 = D.checkRates(db, a, t) || {}, rb2 = D.checkRates(db, b, t) || {};
    const only = (x, y) => Object.keys(db.taskById[t].checks).filter((k) => x[k] !== undefined && y[k] !== undefined && x[k] >= 0.5 && y[k] < 0.5);
    const onlyA = only(ra2, rb2), onlyB = only(rb2, ra2);
    const both = Object.keys(db.taskById[t].checks).filter((k) => ra2[k] !== undefined && rb2[k] !== undefined && ra2[k] < 0.5 && rb2[k] < 0.5);
    if (!onlyA.length && !onlyB.length && !both.length) { same++; continue; }
    const list = (keys, who, color) => keys.length ? h("div", { class: "diff-col" }, h("h5", {}, color ? h("span", { class: "swatch", style: { background: color } }) : null, who),
      h("ul", {}, keys.map((k) => h("li", { text: db.taskById[t].checks[k] })))) : null;
    diffCards.push(h("div", { class: "trap-card" }, h("h4", {}, h("a", { href: ctx.link("task", t), text: db.taskById[t].title })),
      list(onlyA, `Only ${a} gets right`, ca), list(onlyB, `Only ${b} gets right`, cb), list(both, "Both usually miss", null)));
  }
  if (shared.length) out.push(section("Where they differ", "Check by check",
    h("p", { class: "lede-text small", text: `The checks one model usually passes and the other usually misses, on the tasks both have run.${same ? ` On ${same} more task${same === 1 ? "" : "s"} they pass and miss exactly the same checks.` : ""}` }),
    diffCards.length ? h("div", { class: "trap-grid" }, diffCards) : h("p", { class: "muted", text: "They pass and miss exactly the same checks." })));
  return out;
}

// --- common mistakes, across models ------------------------------------------------------------------------------

export function mistakes(db, ctx) {
  const st = ctx.state;
  const ids = D.selectTasks(db, st.sel, st.fmt);
  const stats = D.checkStats(db, ids);
  const out = [
    h("header", { class: "page-head" }, h("p", { class: "kicker", text: "Common mistakes" }), h("h1", { text: "Where local models trip" }),
      h("p", { class: "lede-text", text: "Every check the bench runs, ranked by how many models get it wrong. A model “usually misses” a check when it fails it in more than half of its runs. Click a model for its runs on that task." })),
    filterRow(db, ctx),
  ];
  if (!stats.length) return [...out, h("p", { class: "empty", text: "No runs for this selection." })];
  const top = stats.filter((x) => x.models.length >= 2 && x.mean < 0.75).sort((x, y) => x.mean - y.mean || y.miss.length - x.miss.length).slice(0, 10);
  out.push(section("The traps that catch the most models", "Ranked",
    top.length ? h("ol", { class: "trap-rank" }, top.map((x) => h("li", {},
      h("div", { class: "rank-meta" }, meter(x.mean, 90), h("span", { class: "rate-v", text: `${pct(x.mean)}% passed` }),
        h("span", { class: "muted", text: `${x.miss.length} of ${x.models.length} models usually miss it` })),
      h("p", { class: "rank-text", text: x.text }),
      h("p", { class: "rank-foot" }, h("a", { class: "task-link", href: ctx.link("task", x.task), text: db.taskById[x.task].title }),
        x.miss.length ? h("span", { class: "muted", text: " · missed by " }) : null, x.miss.map((m) => modelChip(ctx, m, x.task))))))
      : h("p", { class: "muted", text: "No check is missed by most models in this selection." })));
  for (const c of db.categories) {
    const tids = ids.filter((t) => db.taskById[t].category === c.id);
    if (!tids.length) continue;
    out.push(section(c.name, "Every check", h("div", { class: "trap-grid" }, tids.map((t) => {
      const rows = stats.filter((x) => x.task === t).sort((x, y) => x.mean - y.mean);
      return h("div", { class: "trap-card" }, h("h4", {}, h("a", { href: ctx.link("task", t), text: db.taskById[t].title })),
        rows.length ? h("ul", { class: "mistakes" }, rows.map((x) => h("li", {},
          h("div", { class: "mistake-top" }, meter(x.mean, 56), h("span", { class: "rate-v", text: `${pct(x.mean)}%` }),
            h("span", { class: "muted small", text: x.miss.length ? `usually missed by ${x.miss.length} of ${x.models.length}`
              : x.mean >= 0.999 ? `all ${x.models.length} always pass` : "no model usually misses it" })),
          h("p", { text: x.text }),
          x.miss.length ? h("p", { class: "chips-row" }, x.miss.map((m) => modelChip(ctx, m, t))) : null)))
          : h("p", { class: "muted", text: "Not run yet." }));
    }))));
  }
  return out;
}

// --- one model on one task: every check, run by run --------------------------------------------------------

export function perf(db, ctx, model, taskId) {
  const t = db.taskById[taskId];
  if (!t || !db.models.includes(model)) return [h("p", { class: "empty", text: "No such model or task." })];
  const cat = db.categories.find((c) => c.id === t.category);
  const c = db.cell(model, taskId);
  const color = ctx.colorOf(model);
  const out = [
    h("p", { class: "crumbs" }, h("a", { href: ctx.link("results"), text: "Results" }), " / ", h("a", { href: ctx.link("model", model), text: model }), " / ", t.title),
    h("header", { class: "page-head" },
      h("h1", {}, color ? h("span", { class: "swatch big", style: { background: color } }) : null, model),
      h("p", { class: "perf-sub" }, "on ", h("a", { href: ctx.link("task", taskId), text: t.title })),
      h("p", { class: "chips" }, chip(cat.name), chip(db.formats[t.format]), chip(t.output, "mono"))),
  ];
  if (!c || !c.runs.length) return [...out, h("p", { class: "empty", text: "This model has not run this task yet." })];
  const ranked = D.board(db, [taskId]).filter((r) => r.coverage);
  const pos = ranked.findIndex((r) => r.model === model) + 1;
  const best = ranked[0];
  const runs = [...c.runs].sort((x, y) => String(x.finished).localeCompare(String(y.finished)));
  const scored = runs.filter((r) => r.scored);
  if (c.n) out.push(h("div", { class: "stats" },
    stat("Score", `${pct(c.mean)}${c.judged === c.n ? "" : "*"}`, c.n > 1 ? `mean of ${c.n} runs, ${pct(c.min)}–${pct(c.max)}` : "1 run"),
    stat("Rank on this task", `${pos} of ${ranked.length}`, best.model === model ? "the best so far" : `best: ${best.model}, ${pct(best.partial)}`),
    stat("Wall time", D.fmtMinutes(c.seconds / 60), "per run"),
    stat("Tokens", D.compact(c.tokens), `per run; ${D.compact(c.sent)} prompt tokens sent`),
    stat("Peak prompt", D.compact(c.peakMax), c.window ? `${pct(c.peakMax / c.window)}% of its window` : "largest"),
    stat("Tool calls", D.fmtNum(c.toolCalls, 0), `per run; ${c.toolErrors} failed in all`)));
  // Checks, run by run, against how the other models did.
  const stats = Object.fromEntries(D.checkStats(db, [taskId]).map((x) => [x.check, x]));
  const rates = D.checkRates(db, model, taskId) || {};
  const names = Object.keys(t.checks);
  const always = names.filter((k) => rates[k] !== undefined && rates[k] >= 0.999).length;
  const missed = names.filter((k) => rates[k] !== undefined && rates[k] < 0.999);
  if (scored.length) out.push(h("p", { class: "verdict" }, `It passed ${always} of ${names.length} checks in every run`,
    missed.length ? `. It missed ${missed.length === 1 ? "one" : missed.length} at least once: ` : ": a clean sweep.",
    missed.length ? `check${missed.length === 1 ? "" : "s"} ${(() => { const n = missed.map((k) => names.indexOf(k) + 1); return n.length > 1 ? `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}` : String(n[0]); })()} below.` : ""));
  if (scored.length) {
    const head = ["", "Check", ...scored.map((r, i) => `Run ${i + 1}`), "This model", "Other models", ""];
    const body = names.map((k, i) => {
      const others = stats[k] ? D.othersRate(stats[k], model) : null;
      const rate = rates[k];
      const kind = rate !== undefined && rate < 0.999 ? D.mistakeKind(others) : null;
      return [String(i + 1), h("span", { class: "check-text", text: t.checks[k] }),
        ...scored.map((r) => { const x = (r.checks || []).find((y) => y.name === k);
          return x ? h("span", { class: "mark-cell" }, checkMark(x.score), x.score < 0.999 && x.detail ? h("span", { class: "detail", text: x.detail }) : null) : "–"; }),
        rate === undefined ? "–" : `${pct(rate)}%`, others === null ? "–" : `${pct(others)}%`,
        kind ? h("span", { class: `kind ${kind.id}`, text: kind.label }) : ""];
    });
    out.push(h("figure", { class: "card" }, h("div", { class: "card-head" }, h("div", { class: "card-titles" }, h("h3", { text: "Every check, run by run" }),
      h("p", { class: "sub", text: "✓ passed, ✕ missed, ◐ partly. The grader's note says what it found. “Other models” is the share of their runs that passed the same check." }))),
      h("div", { class: "table-wrap" }, h("table", { class: "data checks-table" },
        h("thead", {}, h("tr", {}, head.map((x, i) => h("th", { class: i >= head.length - 3 && i < head.length - 1 ? "num" : "", text: x })))),
        h("tbody", {}, body.map((r) => h("tr", {}, r.map((x, i) => h("td", { class: i >= r.length - 3 && i < r.length - 1 ? "num" : "" }, x)))))))));
    const judged = scored.filter((r) => r.judge_criteria);
    if (judged.length) out.push(card({ title: "What the judge said", sub: "Each criterion scored 1 to 5.",
      render: (host) => host.append(table({ head: ["Criterion", ...judged.map((r, i) => `Run ${scored.indexOf(r) + 1}`)], numeric: [false, ...judged.map(() => true)],
        rows: t.rubric.map((cr) => [humanize(cr.name), ...judged.map((r) => String((r.judge_criteria || {})[cr.name] ?? "–"))]) })) }));
  }
  const curves = runs.filter((r) => r.prompt_curve && r.prompt_curve.length);
  if (curves.length) out.push(card({ title: "How the prompt grew", sub: "Each run's prompt at every model call: the conversation so far, re-sent each time.",
    render: lines({ series: curves.map((r) => ({ id: r.id, group: `Run ${runs.indexOf(r) + 1}`, color: color || "var(--bar)", points: r.prompt_curve.map((v, i) => [i + 1, v]) })),
      xLabel: "Model call", yLabel: "Prompt tokens", yFmt: D.compact, refs: c.window ? [{ y: c.window, label: `Context window ${D.compact(c.window)}` }] : [] }),
    tableView: () => table({ head: ["Run", "Starting prompt", "Peak prompt", "Prompt tokens sent", "Model calls"], numeric: [false, true, true, true, true],
      rows: curves.map((r) => [`Run ${runs.indexOf(r) + 1}`, D.compact(r.prompt.start), D.compact(r.prompt.peak), D.compact(r.prompt.sent), String(r.calls)]) }) }));
  const toolNames = [...new Set(runs.flatMap((r) => Object.keys(r.tools || {})))].sort();
  out.push(card({ title: "The runs", sub: "Every run of this model on this task, including any that did not count (the model's server failed, or the run was stopped).",
    render: (host) => host.append(table({ head: ["Run", "Finished", "Status", "Score", "Checks", "Judge", "Minutes", "Tokens", "Peak prompt", "Model calls", "Tool calls", "Failed", "Compactions"],
      numeric: [false, false, false, true, true, true, true, true, true, true, true, true, true],
      rows: runs.map((r, i) => [`Run ${i + 1}`, r.finished ? dateText(r.finished) : "–", r.status, r.score === null ? "–" : pct(r.score), r.det === null ? "–" : pct(r.det),
        r.judge === null || r.judge === undefined ? "–" : pct(r.judge), D.fmtNum((r.seconds || 0) / 60), D.compact(r.tokens && r.tokens.total), D.compact(r.prompt && r.prompt.peak),
        String(r.calls ?? "–"), String(r.tool_calls ?? "–"), String(r.tool_errors ?? "–"), String(r.compactions ?? "–")]) })) }));
  if (toolNames.length) out.push(card({ title: "Tools it used", sub: "Calls per tool in each run.",
    render: (host) => host.append(table({ head: ["Tool", ...runs.map((r, i) => `Run ${i + 1}`)], numeric: [false, ...runs.map(() => true)],
      rows: toolNames.map((n) => [h("code", { text: n }), ...runs.map((r) => String((r.tools || {})[n] || 0))]) })) }));
  return out;
}
