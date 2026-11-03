// The numbers behind every page: runs in, per-model and per-task figures out.
// Pure functions, no DOM, so dev/check.mjs can run them under node against the bench's own leaderboard.
// The scoring rules are the bench's (bench/store.py): a run counts when it finished ("done") or ran out of
// time ("timeout") and its checks ran; a task's score is the mean over its trials; a model's score over a
// set of tasks is the mean of its task scores, and only "complete" when it has run every task in the set.

export const SCORED_STATUSES = new Set(["done", "timeout"]);

// Tool families for the tool-mix chart: pi's own file tools, the shell, and MyRA's tools.
export const TOOL_FAMILIES = [
  { id: "files", name: "pi's file tools", tools: ["read", "ls", "find", "grep", "write", "edit"] },
  { id: "shell", name: "Shell (bash)", tools: ["bash"] },
  { id: "docs", name: "MyRA document tools", tools: ["read_document", "create_document", "look_at", "check_document",
    "compare_documents", "annotate_document", "save_as_pdf", "status_chart", "write_requirements_check"] },
  { id: "other", name: "MyRA folder, planning & other", tools: [] },   // everything else
];
const FAMILY_OF = new Map(TOOL_FAMILIES.flatMap((f) => f.tools.map((t) => [t, f.id])));
export const toolFamily = (name) => FAMILY_OF.get(name) || "other";

// The figures a reader can compare models on. `get` reads a leaderboard row; lower is better for all of them.
export const METRICS = {
  minutes: { label: "Wall time", unit: "min per task", get: (b) => b.minutes, log: false,
    fmt: (v) => fmtMinutes(v), about: "Mean wall-clock time of a run, from the prompt to the model's last word, including tool time." },
  tokens: { label: "Total tokens", unit: "per task", get: (b) => b.tokens, log: true, fmt: (v) => compact(v),
    about: "Every token of every model call in a run: prompts plus output, as the model's server reported them." },
  sent: { label: "Prompt tokens sent", unit: "per task", get: (b) => b.sent, log: true, fmt: (v) => compact(v),
    about: "The sum of every call's prompt. Each call re-sends the whole conversation, so this is the prompt-processing load. MyRA's route reports no cache use; a server that caches the prompt prefix does less work than this." },
  peak: { label: "Peak prompt", unit: "tokens", get: (b) => b.peak, log: false, fmt: (v) => compact(v),
    about: "The largest single prompt in a run: roughly the context window the task needs with this model." },
  output: { label: "Output tokens", unit: "per task", get: (b) => b.output, log: true, fmt: (v) => compact(v),
    about: "Tokens the model generated: its words, tool calls and code." },
  toolCalls: { label: "Tool calls", unit: "per task", get: (b) => b.toolCalls, log: false, fmt: (v) => fmtNum(v, 0),
    about: "How many times the model called a tool (read a file, ran a command, made a document...)." },
  calls: { label: "Model calls", unit: "per task", get: (b) => b.calls, log: false, fmt: (v) => fmtNum(v, 0),
    about: "How many times the model was called in a run: one per step, each step usually ending in tool calls." },
};

// ---------------------------------------------------------------------------------------------------------

export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const sum = (a) => a.reduce((s, x) => s + x, 0);
const present = (a) => a.filter((x) => x !== null && x !== undefined && !Number.isNaN(x));

export function fmtPct(v) {
  return v === null || v === undefined ? "–" : String(Math.round(v * 100));
}
export function fmtNum(v, digits = 1) {
  if (v === null || v === undefined) return "–";
  return v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}
export function compact(v) {
  if (v === null || v === undefined) return "–";
  const a = Math.abs(v);
  if (a >= 1e6) return `${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}K`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return String(Math.round(v));
}
export function fmtMinutes(v) {
  if (v === null || v === undefined) return "–";
  return v < 10 ? `${v.toFixed(1)} min` : `${Math.round(v)} min`;
}

// ---------------------------------------------------------------------------------------------------------

/** One model on one task: its runs, and the figures over the runs that count. */
function cellOf(runs) {
  const scored = runs.filter((r) => r.scored);
  const scores = present(scored.map((r) => r.score));
  const avg = (f) => mean(present(scored.map(f)));
  const judged = scored.filter((r) => r.judge !== null && r.judge !== undefined);
  const status = {};
  for (const r of runs) status[r.status] = (status[r.status] || 0) + 1;
  const tools = {};
  for (const r of scored) for (const [k, v] of Object.entries(r.tools || {})) tools[k] = (tools[k] || 0) + v;
  return {
    runs, scored, n: scores.length, scores,
    mean: scores.length ? mean(scores) : null,
    min: scores.length ? Math.min(...scores) : null,
    max: scores.length ? Math.max(...scores) : null,
    det: avg((r) => r.det),
    judge: judged.length ? mean(judged.map((r) => r.judge)) : null,
    judged: judged.length,
    seconds: avg((r) => r.seconds),
    tokens: avg((r) => r.tokens && r.tokens.total),
    output: avg((r) => r.tokens && r.tokens.output),
    input: avg((r) => r.tokens && r.tokens.input),
    reasoning: avg((r) => r.tokens && r.tokens.reasoning),
    peak: avg((r) => r.prompt && r.prompt.peak),
    peakMax: Math.max(0, ...present(scored.map((r) => r.prompt && r.prompt.peak))) || null,
    start: avg((r) => r.prompt && r.prompt.start),
    sent: avg((r) => r.prompt && r.prompt.sent),
    toolCalls: avg((r) => r.tool_calls),
    calls: avg((r) => r.calls),
    modelSeconds: avg((r) => r.model_seconds),
    toolSeconds: avg((r) => r.tool_seconds),
    toolErrors: sum(present(scored.map((r) => r.tool_errors))),
    toolCallsTotal: sum(present(scored.map((r) => r.tool_calls))),
    compactions: sum(present(scored.map((r) => r.compactions))),
    retries: sum(present(scored.map((r) => r.retries))),
    window: Math.max(0, ...present(runs.map((r) => r.context_window))) || null,
    status, tools,
  };
}

/** The data every page reads: tasks and categories from content/tasks.json, runs from data/results.json. */
function cellsOf(runs) {
  const byKey = new Map();
  for (const r of runs) {
    const k = `${r.model}\u0000${r.task}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(r);
  }
  return new Map([...byKey].map(([k, rs]) => [k, cellOf(rs)]));
}

/** A model that has not run every task (one that failed, or that did not look competitive after a few tasks
 *  and was not run further) is only named, as "also tested": it gets no score, and its runs count nowhere.
 *  A task no model has a scored run on yet is not required. allModels keeps them all, for checking the
 *  arithmetic against the bench's own leaderboard. */
export function prepare(results, content, meta = {}, { allModels = false } = {}) {
  const info = Object.fromEntries(Object.entries(meta || {}).filter(([k, v]) => !k.startsWith("_") && v));
  const hidden = new Set(Object.entries(info).filter(([, v]) => v.hidden).map(([k]) => k));
  const tasks = content.tasks;
  const taskById = Object.fromEntries(tasks.map((t) => [t.id, t]));
  const tried = (results.runs || []).filter((r) => !hidden.has(r.model) && taskById[r.task]);
  const named = [...new Set(tried.map((r) => r.model))].sort();
  const triedCells = cellsOf(tried);
  const ran = (m, t) => (triedCells.get(`${m}\u0000${t}`) || { n: 0 }).n > 0;
  const required = tasks.map((t) => t.id).filter((t) => named.some((m) => ran(m, t)));
  const stopped = allModels ? [] : named.filter((m) => !required.length || required.some((t) => !ran(m, t)));
  const runs = stopped.length ? tried.filter((r) => !stopped.includes(r.model)) : tried;
  const cells = stopped.length ? cellsOf(runs) : triedCells;
  const db = {
    updated: results.updated, prompts: results.prompts || {}, folderFiles: results.folder_files || [],
    content, tasks, taskById, categories: content.categories, formats: content.formats, info,
    runs, models: named.filter((m) => !stopped.includes(m)), stopped,
    cell: (model, task) => cells.get(`${model}\u0000${task}`) || null,
  };
  db.tasksIn = (cat) => tasks.filter((t) => t.category === cat).map((t) => t.id);
  return db;
}

/** The tasks a reader picked: a category (or all) and a file type (or any). */
export function selectTasks(db, sel = "all", fmt = "any") {
  return db.tasks.filter((t) => (sel === "all" || t.category === sel) && (fmt === "any" || t.format === fmt))
    .map((t) => t.id);
}

/** One row per model over a set of tasks, ranked the bench's way: complete models first, by score. */
export function board(db, taskIds) {
  const rows = db.models.map((model) => {
    const cells = taskIds.map((t) => [t, db.cell(model, t)]).filter(([, c]) => c && c.n > 0);
    const means = cells.map(([, c]) => c.mean);
    const complete = taskIds.length > 0 && cells.length === taskIds.length;
    const partial = means.length ? mean(means) : null;
    const avg = (f) => mean(present(cells.map(([, c]) => f(c))));
    const all = taskIds.flatMap((t) => (db.cell(model, t) || { runs: [] }).runs);
    const done = all.filter((r) => r.status === "done").length;
    const timeout = all.filter((r) => r.status === "timeout").length;
    const scored = cells.flatMap(([, c]) => c.scored);
    const toolErrors = sum(cells.map(([, c]) => c.toolErrors));
    const toolCallsTotal = sum(cells.map(([, c]) => c.toolCallsTotal));
    return {
      model, cells: Object.fromEntries(cells), complete, coverage: cells.length, of: taskIds.length,
      score: complete ? partial : null, partial,
      lo: means.length ? Math.min(...means) : null, hi: means.length ? Math.max(...means) : null,
      det: avg((c) => c.det), judge: avg((c) => c.judge),
      judgedAll: scored.length > 0 && scored.every((r) => r.judge !== null && r.judge !== undefined),
      judgedAny: scored.some((r) => r.judge !== null && r.judge !== undefined),
      minutes: avg((c) => (c.seconds === null ? null : c.seconds / 60)),
      tokens: avg((c) => c.tokens), output: avg((c) => c.output), input: avg((c) => c.input),
      sent: avg((c) => c.sent), peak: avg((c) => c.peak), start: avg((c) => c.start),
      peakMax: Math.max(0, ...present(cells.map(([, c]) => c.peakMax))) || null,
      toolCalls: avg((c) => c.toolCalls), calls: avg((c) => c.calls),
      modelMinutes: avg((c) => (c.modelSeconds === null ? null : c.modelSeconds / 60)),
      toolMinutes: avg((c) => (c.toolSeconds === null ? null : c.toolSeconds / 60)),
      toolErrorRate: toolCallsTotal ? toolErrors / toolCallsTotal : null,
      compactionsPerRun: scored.length ? sum(cells.map(([, c]) => c.compactions)) / scored.length : null,
      retries: sum(cells.map(([, c]) => c.retries)),
      finishRate: done + timeout ? done / (done + timeout) : null,
      runs: all.length, scoredRuns: scored.length,
      notCounted: all.filter((r) => !r.scored).length,
      trials: cells.length ? Math.min(...cells.map(([, c]) => c.n)) : 0,
      window: Math.max(0, ...present(cells.map(([, c]) => c.window))) || null,
      tools: cells.reduce((acc, [, c]) => { for (const [k, v] of Object.entries(c.tools)) acc[k] = (acc[k] || 0) + v; return acc; }, {}),
    };
  });
  rows.sort((a, b) => (a.complete === b.complete ? (b.partial ?? -1) - (a.partial ?? -1) : a.complete ? -1 : 1));
  rows.forEach((r, i) => { r.position = i + 1; });
  return rows;
}

/** Models no other model beats on both score and cost (lower x, higher y). */
export function frontier(points) {
  const pts = points.filter((p) => p.x !== null && p.y !== null).sort((a, b) => a.x - b.x || b.y - a.y);
  const out = [];
  let best = -Infinity;
  for (const p of pts) if (p.y > best) { out.push(p); best = p.y; }
  return out;
}

/** Per task and check: the share of a model's scored runs that passed it (mean check score). */
export function checkRates(db, model, taskId) {
  const c = db.cell(model, taskId);
  if (!c || !c.n) return null;
  const by = {};
  for (const r of c.scored) for (const k of r.checks || []) (by[k.name] ||= []).push(k.score);
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, mean(v)]));
}

// --- mistakes --------------------------------------------------------------------------------------------

/** Every check on the given tasks: each model's pass rate, the mean over models, and who usually misses it. */
export function checkStats(db, taskIds) {
  const out = [];
  for (const tid of taskIds) {
    const t = db.taskById[tid];
    const per = db.models.map((m) => [m, checkRates(db, m, tid)]).filter(([, r]) => r);
    for (const [name, text] of Object.entries(t.checks)) {
      const models = per.filter(([, r]) => r[name] !== undefined).map(([m, r]) => ({ model: m, rate: r[name] }));
      if (!models.length) continue;
      out.push({ task: tid, check: name, text, models, mean: mean(models.map((x) => x.rate)),
        miss: models.filter((x) => x.rate < 0.5).map((x) => x.model) });
    }
  }
  return out;
}

/** How the other models did on a check: their mean pass rate, or null when no other model ran the task. */
export function othersRate(stat, model) {
  const others = stat.models.filter((x) => x.model !== model);
  return others.length ? mean(others.map((x) => x.rate)) : null;
}

/** A model's mistake, put in context: does everyone miss this, or mostly just this model? */
export function mistakeKind(others) {
  if (others === null) return { id: "alone", label: "No other model has run this task" };
  if (others < 0.5) return { id: "common", label: "Most models miss this too" };
  if (others >= 0.75) return { id: "own", label: "Most other models get this right" };
  return { id: "mixed", label: "Other models are split on this" };
}

// --- findings ----------------------------------------------------------------------------------------------

// A last word that names a setting of a model rather than a model: reasoning effort or quantization.
const VARIANT = /^(x?low|medium|med|x?high|max|min|minimal|none|off|on|think(ing)?|no-?think|fast|slow|q\d\S*|iq\d\S*|fp\d+|bf16|f16|int[48]|awq|gptq|mlx|\d+-?bit)$/i;
export function familyOf(db, model) {
  const info = db.info[model] || {};
  if (info.family) return info.family;
  const parts = model.trim().split(/\s+/);
  return parts.length > 1 && VARIANT.test(parts[parts.length - 1]) ? parts.slice(0, -1).join(" ") : model;
}

const points = (d) => { const n = Math.round(Math.abs(d) * 100); return `${n} point${n === 1 ? "" : "s"}`; };
const times = (x) => `${x >= 10 ? Math.round(x) : x.toFixed(1)}×`;

/**
 * What the numbers say about a set of tasks, as sentences. Each finding has an id (so content/findings.json
 * can hide it), its text, and where to look for more. `scope` reads after a verb: "" or " on writing tasks".
 */
export function findings(db, ids, scope = "") {
  const rows = board(db, ids).filter((r) => r.coverage);
  if (!rows.length) return [];
  const val = (r) => r.score ?? r.partial;
  const pct = (r) => Math.round(val(r) * 100);
  const complete = rows.filter((r) => r.complete);
  const pool = complete.length ? complete : rows;
  const best = pool[0];
  const out = [];
  out.push({ id: "best", text: `${best.model} scores highest${scope}: ${pct(best)}` +
    (best.complete ? `${ids.length === 2 ? " across both tasks" : ids.length > 2 ? ` across all ${ids.length} tasks` : ""}.` : `, over the ${best.coverage} of ${best.of} tasks it has run.`),
    link: { route: "model", arg: best.model, label: `${best.model}'s results` } });

  const near = pool.filter((r) => r !== best && val(best) - val(r) <= 0.05);
  const gap = (r) => (val(best) - val(r) < 0.005 ? `matches ${best.model}` : `is within ${points(val(best) - val(r))} of ${best.model}`);
  const fast = near.filter((r) => r.minutes && best.minutes && r.minutes <= best.minutes / 1.5).sort((a, b) => a.minutes - b.minutes)[0];
  if (fast) out.push({ id: "fast", text: `${fast.model} ${gap(fast)} and is ${times(best.minutes / fast.minutes)} faster: ` +
    `${fmtMinutes(fast.minutes)} a task against ${fmtMinutes(best.minutes)}.`,
    link: { route: "compare", a: best.model, b: fast.model, label: "Compare the two" } });
  const lean = near.filter((r) => r !== fast && r.tokens && best.tokens && r.tokens <= best.tokens / 1.5).sort((a, b) => a.tokens - b.tokens)[0];
  if (lean) out.push({ id: "lean", text: `${lean.model} ${gap(lean)} on ${times(best.tokens / lean.tokens)} fewer tokens: ` +
    `${compact(lean.tokens)} a task against ${compact(best.tokens)}.`,
    link: { route: "compare", a: best.model, b: lean.model, label: "Compare the two" } });

  // Variants of one model (reasoning effort, quantization): is the slower setting worth it?
  const fams = {};
  for (const r of rows) (fams[familyOf(db, r.model)] ||= []).push(r);
  for (const group of Object.values(fams).filter((g) => g.length > 1).slice(0, 2)) {
    const timed = group.filter((r) => r.minutes);
    if (timed.length < 2) continue;
    timed.sort((a, b) => a.minutes - b.minutes);
    const f = timed[0], sl = timed[timed.length - 1];
    if (sl.minutes < f.minutes * 1.2) continue;
    const x = times(sl.minutes / f.minutes);
    const partial = !f.complete || !sl.complete ? " (on the tasks both have run)" : "";
    const text = val(sl) <= val(f)
      ? `${sl.model} takes ${x} as long as ${f.model} but scores ${val(sl) < val(f) - 0.005 ? `${points(val(f) - val(sl))} lower` : "no higher"}${partial}: ${pct(sl)} against ${pct(f)}.`
      : `${sl.model} scores ${points(val(sl) - val(f))} more than ${f.model} for ${x} the time${partial}: ${pct(sl)} against ${pct(f)}.`;
    out.push({ id: `variant:${familyOf(db, f.model)}`, text, link: { route: "compare", a: f.model, b: sl.model, label: "Compare the two" } });
  }

  // The check that catches the most models.
  const traps = checkStats(db, ids).filter((s) => s.models.length >= 2 && s.mean < 0.75).sort((a, b) => a.mean - b.mean || b.miss.length - a.miss.length);
  if (traps.length) {
    const t = traps[0];
    out.push({ id: "mistake", text: `The check most models fail${scope} is on “${db.taskById[t.task].title}”: ${t.text} ` +
      `${t.miss.length} of ${t.models.length} models usually miss it.`, link: { route: "mistakes", label: "All the common mistakes" } });
  }

  // The task that needs the most context.
  const ctxs = ids.map((tid) => {
    const cs = db.models.map((m) => db.cell(m, tid)).filter((c) => c && c.peak);
    const peaks = cs.map((c) => c.peak).sort((a, b) => a - b);
    return { tid, typical: peaks.length ? peaks[Math.floor(peaks.length / 2)] : 0, max: Math.max(0, ...cs.map((c) => c.peakMax || 0)) };
  }).filter((x) => x.typical).sort((a, b) => b.typical - a.typical);
  if (ctxs.length > 1) {
    const c = ctxs[0];
    out.push({ id: "context", text: `${db.taskById[c.tid].title} needs the most context${scope}: prompts typically peak near ${compact(c.typical)} tokens${c.max > c.typical * 1.1 ? `, and up to ${compact(c.max)}` : ""}.`,
      link: { route: "task", arg: c.tid, label: "How the prompt grows" } });
  }

  // Leaders by kind of work, when the selection spans more than one.
  const cats = db.categories.filter((c) => ids.some((t) => db.taskById[t].category === c.id));
  if (cats.length > 1) {
    const parts = cats.map((c) => {
      const b = board(db, ids.filter((t) => db.taskById[t].category === c.id)).filter((r) => r.coverage);
      const top = b.find((r) => r.complete) || b[0];
      return top ? `${c.name.toLowerCase()}, ${top.model} (${pct(top)}${top.complete ? "" : ", partial"})` : null;
    }).filter(Boolean);
    out.push({ id: "leaders", text: `Best by kind of work: ${parts.join("; ")}.` });
  }
  return out;
}

/** How the pieces of the site count trials: the typical number of trials per model and task. */
export function typicalTrials(db) {
  const ns = [];
  for (const m of db.models) for (const t of db.tasks) { const c = db.cell(m, t.id); if (c && c.n) ns.push(c.n); }
  ns.sort((a, b) => a - b);
  return ns.length ? ns[Math.floor(ns.length / 2)] : 0;
}
