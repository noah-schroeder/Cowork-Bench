// The site's state lives in the URL, so every view can be linked:
//   #/results?sel=analysis&fmt=excel&x=tokens&h1=Model%20A&h2=Model%20B
// sel: kind of work (or all); fmt: file type (or any); x: the cost on the scatter; h1-h3: highlighted models,
// one per colour slot, so removing one never repaints the others; a, b: the two models on the compare page.
// A model on a task is #/perf/<model>/<task>.
import * as D from "./data.js";
import * as V from "./views.js";
import { SLOT, h } from "./charts.js";

const ROUTES = { overview: V.overview, results: V.results, model: V.model, perf: V.perf, compare: V.compare, mistakes: V.mistakes, tasks: V.tasks, task: V.task,
  usage: V.usage, method: V.method };
const NAV = [["overview", "Overview"], ["results", "Results"], ["compare", "Compare"], ["mistakes", "Mistakes"], ["tasks", "Tasks"], ["usage", "How they work"], ["method", "Method"]];
const main = document.getElementById("main");
let db = null;
let state = null;
let shown = "";

async function getJson(path, optional = false) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) { if (optional) return {}; throw new Error(`${path}: HTTP ${r.status}`); }
  return r.json();
}

function parse() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, query = ""] = raw.split("?");
  const parts = path.split("/").filter(Boolean);
  const route = ROUTES[parts[0]] ? parts[0] : "overview";
  const arg = parts[1] ? decodeURIComponent(parts[1]) : null;
  const arg2 = parts[2] ? decodeURIComponent(parts[2]) : null;
  const q = new URLSearchParams(query);
  const sel = q.get("sel") && (q.get("sel") === "all" || db.categories.some((c) => c.id === q.get("sel"))) ? q.get("sel") : "all";
  const fmt = q.get("fmt") && db.formats[q.get("fmt")] ? q.get("fmt") : "any";
  const x = D.METRICS[q.get("x")] ? q.get("x") : "minutes";
  const given = ["h1", "h2", "h3"].some((k) => q.has(k)) || q.has("nohl");
  let hl = ["h1", "h2", "h3"].map((k) => (db.models.includes(q.get(k)) ? q.get(k) : null));
  if (!given) {
    const top = D.board(db, db.tasks.map((t) => t.id)).slice(0, 3).map((b) => b.model);
    hl = [top[0] || null, top[1] || null, top[2] || null];
  }
  const pick = (k) => (db.models.includes(q.get(k)) ? q.get(k) : null);
  const ranked = D.board(db, db.tasks.map((t) => t.id)).map((r) => r.model);
  const a = pick("a") || hl.find(Boolean) || ranked[0] || null;
  const b = (pick("b") && pick("b") !== a ? pick("b") : null) || [...hl, ...ranked].find((m) => m && m !== a) || null;
  return { route, arg, arg2, sel, fmt, x, hl, a, b };
}

function query(st, route) {
  const q = new URLSearchParams();
  if (st.sel !== "all") q.set("sel", st.sel);
  if (st.fmt !== "any") q.set("fmt", st.fmt);
  if (st.x !== "minutes") q.set("x", st.x);
  st.hl.forEach((m, i) => { if (m) q.set(`h${i + 1}`, m); });
  if (!st.hl.some(Boolean)) q.set("nohl", "1");
  if (route === "compare") { if (st.a) q.set("a", st.a); if (st.b) q.set("b", st.b); }
  const s = q.toString();
  return s ? `?${s}` : "";
}

function hashFor(route, arg, arg2, st = state) {
  return `#/${route}${arg ? `/${encodeURIComponent(arg)}` : ""}${arg2 ? `/${encodeURIComponent(arg2)}` : ""}${query(st, route)}`;
}

const ctx = {
  get state() { return state; },
  link: (route, arg, arg2, patch) => hashFor(route, arg, arg2, patch ? { ...state, ...patch } : state),
  colorOf: (model) => { const i = state.hl.indexOf(model); return i < 0 ? null : SLOT[i]; },
  set(patch) {
    state = { ...state, ...patch };
    history.replaceState(null, "", hashFor(state.route, state.arg, state.arg2));
    render(false);
  },
  setSlot(i, model) {
    const hl = [...state.hl];
    hl[i] = model;
    ctx.set({ hl });
  },
};

function render(fromNavigation = true) {
  if (fromNavigation) state = parse();
  const view = ROUTES[state.route];
  let nodes;
  try {
    nodes = view(db, ctx, state.arg, state.arg2);
  } catch (e) {
    console.error(e);
    nodes = [h("p", { class: "empty", text: `Something went wrong drawing this page: ${e.message}` })];
  }
  const keepScroll = !fromNavigation || shown === `${state.route}/${state.arg}/${state.arg2}`;
  const y = window.scrollY;
  main.replaceChildren(...[nodes].flat());
  main.classList.toggle("enter", !keepScroll);
  if (!keepScroll) window.scrollTo(0, 0); else window.scrollTo(0, y);
  shown = `${state.route}/${state.arg}/${state.arg2}`;
  for (const a of document.querySelectorAll("[data-nav]")) {
    const on = a.dataset.nav === state.route || (a.dataset.nav === "tasks" && state.route === "task") || (a.dataset.nav === "results" && (state.route === "model" || state.route === "perf"));
    a.classList.toggle("on", on);
    a.setAttribute("href", hashFor(a.dataset.nav, null, null));
    if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  }
  const taskName = (id) => (db.taskById[id] ? db.taskById[id].title : "Task");
  const page = { overview: "Which local model for MyRA Cowork", results: "Results", model: state.arg, perf: `${state.arg} on ${taskName(state.arg2)}`, compare: state.a && state.b ? `${state.a} vs ${state.b}` : "Compare",
    mistakes: "Common mistakes", tasks: "Tasks", task: db.taskById[state.arg] ? db.taskById[state.arg].title : "Task", usage: "How they work", method: "Method" }[state.route];
  document.title = `${page} · Cowork Bench`;
}

// --- theme: auto (the system's), light or dark ---------------------------------------------------------------

const THEMES = ["auto", "light", "dark"];
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const b = document.getElementById("theme");
  b.textContent = { auto: "Theme: auto", light: "Theme: light", dark: "Theme: dark" }[t];
  b.dataset.mode = t;
}
function setupTheme() {
  let t = localStorage.getItem("cowork-bench.theme") || "auto";
  if (!THEMES.includes(t)) t = "auto";
  applyTheme(t);
  document.getElementById("theme").addEventListener("click", () => {
    t = THEMES[(THEMES.indexOf(t) + 1) % THEMES.length];
    localStorage.setItem("cowork-bench.theme", t);
    applyTheme(t);
    if (db) render(false);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (db && t === "auto") render(false); });
}

async function boot() {
  setupTheme();
  const nav = document.getElementById("nav");
  nav.replaceChildren(...NAV.map(([id, label]) => h("a", { href: `#/${id}`, "data-nav": id, text: label })));
  try {
    const [results, content, meta, notes] = await Promise.all([getJson("data/results.json"), getJson("content/tasks.json"),
      getJson("data/models.json", true), getJson("content/findings.json", true)]);
    db = D.prepare(results, content, meta);
    db.notes = notes;
  } catch (e) {
    main.replaceChildren(h("div", { class: "notice" }, h("strong", { text: "The results could not be loaded. " }),
      location.protocol === "file:" ? "Browsers do not let a page opened from a file read its data. In this folder run: python3 -m http.server, then open http://localhost:8000." : e.message));
    return;
  }
  document.getElementById("updated").textContent = db.updated
    ? `Results to ${new Date(db.updated).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : "";
  window.addEventListener("hashchange", () => render(true));
  render(true);
}

boot();
