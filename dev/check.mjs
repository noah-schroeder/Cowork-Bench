// Checks data/results.json and the site's arithmetic.
//
//   node dev/check.mjs data/results.json [bench-leaderboard.json]
//
// 1. Every run holds only the fields the export is meant to write: nothing else can reach the site.
// 2. Every task and check in the runs is described in content/tasks.json.
// 3. With a leaderboard from the bench itself (store.leaderboard(TASKS), dumped as JSON), the site's
//    aggregation over all tasks gives the same figures per model and task.
import { readFileSync } from "node:fs";
import { board, checkStats, findings, prepare, selectTasks } from "../assets/data.js";

const RUN_KEYS = new Set(["id", "model", "task", "status", "scored", "score", "det", "judge", "judge_model", "seconds",
  "minutes_allowed", "finished", "folder_dated", "context_window", "max_tokens", "vision", "parity", "checks",
  "judge_criteria", "calls", "tool_calls", "tool_errors", "tools", "tokens", "compactions", "prompt",
  "prompt_curve", "model_seconds", "tool_seconds", "retries", "asked"]);
const TOP_KEYS = new Set(["schema", "updated", "prompts", "folder_files", "runs"]);

const [resultsPath, benchPath] = process.argv.slice(2);
if (!resultsPath) { console.error("usage: node dev/check.mjs data/results.json [bench-leaderboard.json]"); process.exit(2); }
const results = JSON.parse(readFileSync(resultsPath, "utf8"));
const content = JSON.parse(readFileSync(new URL("../content/tasks.json", import.meta.url), "utf8"));
const problems = [];

for (const k of Object.keys(results)) if (!TOP_KEYS.has(k)) problems.push(`unexpected top-level field ${k}`);
if (results.schema !== 1) problems.push(`schema ${results.schema}, expected 1`);
const tasks = Object.fromEntries(content.tasks.map((t) => [t.id, t]));
for (const r of results.runs) {
  for (const k of Object.keys(r)) if (!RUN_KEYS.has(k)) problems.push(`run ${r.id}: unexpected field ${k}`);
  if (!tasks[r.task]) { problems.push(`run ${r.id}: task ${r.task} not in content/tasks.json`); continue; }
  for (const c of r.checks) if (!(c.name in tasks[r.task].checks)) problems.push(`run ${r.id}: check ${c.name} not described`);
}

let compared = 0;
if (benchPath) {
  const bench = JSON.parse(readFileSync(benchPath, "utf8"));
  // Every model, also those the site names without scores, so the arithmetic is checked for all of them.
  const db = prepare(results, content, {}, { allModels: true });
  const mine = Object.fromEntries(board(db, content.tasks.map((t) => t.id)).map((b) => [b.model, b]));
  const close = (a, b, tol) => (a === null || a === undefined ? b === null || b === undefined : Math.abs(a - b) <= tol);
  for (const b of bench) {
    const m = mine[b.model];
    if (!m) { if (Object.keys(b.cells).length) problems.push(`model ${b.model} missing from the site`); continue; }
    if (!close(m.score, b.overall, 1e-4)) problems.push(`${b.model}: overall ${m.score} vs bench ${b.overall}`);
    if (!close(m.partial, b.partial, 1e-4)) problems.push(`${b.model}: partial ${m.partial} vs bench ${b.partial}`);
    if (m.complete !== b.complete) problems.push(`${b.model}: complete ${m.complete} vs bench ${b.complete}`);
    for (const [task, c] of Object.entries(b.cells)) {
      const x = m.cells[task];
      if (!x) { problems.push(`${b.model}/${task}: no cell on the site`); continue; }
      if (!close(x.mean, c.mean, 1e-4)) problems.push(`${b.model}/${task}: mean ${x.mean} vs ${c.mean}`);
      if (x.n !== c.n) problems.push(`${b.model}/${task}: n ${x.n} vs ${c.n}`);
      if (!close(x.min, c.min, 1e-9) || !close(x.max, c.max, 1e-9)) problems.push(`${b.model}/${task}: range differs`);
      if (!close(x.seconds, c.seconds, 0.51)) problems.push(`${b.model}/${task}: seconds ${x.seconds} vs ${c.seconds}`);
      if (c.tokens !== null && !close(x.tokens, c.tokens, 0.51)) problems.push(`${b.model}/${task}: tokens ${x.tokens} vs ${c.tokens}`);
      compared += 1;
    }
    for (const task of Object.keys(m.cells)) if (!(task in b.cells)) problems.push(`${b.model}/${task}: extra cell on the site`);
  }
}

// The findings and the mistakes pages are computed in the browser: make sure they run on these results.
try {
  const db = prepare(results, content);
  for (const sel of ["all", ...content.categories.map((c) => c.id)]) {
    const ids = selectTasks(db, sel);
    findings(db, ids);
    checkStats(db, ids);
  }
} catch (e) {
  problems.push(`findings or mistakes fail on these results: ${e.message}`);
}

if (problems.length) {
  console.error(`${problems.length} problem(s):\n- ` + problems.slice(0, 40).join("\n- "));
  process.exit(1);
}
const shown = prepare(results, content);
console.log(`ok: ${results.runs.length} runs, fields as expected` + (benchPath ? `, ${compared} model×task cells match the bench` : "") +
  `\n${shown.models.length} model(s) scored, ${shown.stopped.length} named as also tested (did not run every task)` +
  (shown.stopped.length ? `: ${shown.stopped.join(", ")}` : ""));
