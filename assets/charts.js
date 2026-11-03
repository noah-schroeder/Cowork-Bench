// Charts, hand-built in SVG and HTML: scatter, heatmap, bars, stacked bars, strip plot, lines.
// Mark specs follow the dataviz method: bars <= 24px with 4px rounded data ends, 2px lines, >= 8px dots with a
// 2px surface ring, hairline solid grid, 24px hit targets, a hover/focus tooltip, and a table view for every
// chart. Every string from the data goes in with textContent, never innerHTML.

const SVGNS = "http://www.w3.org/2000/svg";

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "class") e.className = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(e.dataset, v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k !== null && k !== undefined && k !== false) e.append(k.nodeType ? k : document.createTextNode(String(k)));
  return e;
}

export function s(tag, attrs = {}, ...kids) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "text") e.textContent = v;
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("on") && typeof v === "function") e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids.flat(Infinity)) if (k) e.append(k);
  return e;
}

// --- colour --------------------------------------------------------------------------------------------------

export const SLOT = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
export const DEEMPH = "var(--deemph)";
export const FAMILY = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)"];
export const STATUS = {
  done: { color: "var(--good)", icon: "✓", label: "Finished" },
  timeout: { color: "var(--warning)", icon: "◷", label: "Timed out" },
  flagged: { color: "var(--serious)", icon: "⚑", label: "Flagged" },
  error: { color: "var(--critical)", icon: "✕", label: "Endpoint error" },
  stopped: { color: "var(--deemph)", icon: "■", label: "Stopped" },
  interrupted: { color: "var(--deemph)", icon: "■", label: "Interrupted" },
};

// The documented sequential blue, 100 -> 700. Light mode: near zero is light; dark mode flips the anchor.
const RAMP = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf",
  "#1c5cab", "#184f95", "#104281", "#0d366b"];
export function isDark() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark") return true;
  if (t === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
export function seq(v) {
  const i = Math.max(0, Math.min(12, Math.round(v * 12)));
  const idx = isDark() ? 12 - i : i;
  return { bg: RAMP[idx], ink: idx >= 7 ? "#ffffff" : "#0b0b0b" };
}
export function seqLegend(lo, hi, label) {
  const stops = RAMP.map((_, i) => seq(i / 12).bg);
  return h("div", { class: "scale-legend" },
    h("span", { class: "muted", text: lo }),
    h("span", { class: "scale-bar", style: { background: `linear-gradient(90deg, ${stops.join(",")})` } }),
    h("span", { class: "muted", text: hi }),
    label ? h("span", { class: "muted scale-label", text: label }) : null);
}

// --- scales -----------------------------------------------------------------------------------------------

function linear([d0, d1], [r0, r1]) {
  const f = (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
  f.domain = [d0, d1];
  return f;
}
function logScale([d0, d1], [r0, r1]) {
  const l0 = Math.log10(d0), l1 = Math.log10(d1);
  const f = (v) => r0 + ((Math.log10(Math.max(v, d0)) - l0) / (l1 - l0 || 1)) * (r1 - r0);
  f.domain = [d0, d1];
  return f;
}
export function niceTicks(lo, hi, count = 5) {
  const span = hi - lo || Math.abs(hi) || 1;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((x) => x >= step0) || 10 * mag;
  const start = Math.floor(lo / step) * step, end = Math.ceil(hi / step) * step;
  const out = [];
  for (let v = start; v <= end + step / 2; v += step) out.push(+v.toFixed(10));
  return out;
}
function logTicks(lo, hi) {
  const out = [];
  for (let p = Math.floor(Math.log10(lo)); p <= Math.ceil(Math.log10(hi)); p++) {
    for (const m of [1, 2, 5]) { const v = m * 10 ** p; if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); }
  }
  return out;
}

// --- tooltip ----------------------------------------------------------------------------------------------

function tooltip(host) {
  const tip = h("div", { class: "tip", role: "status", "aria-live": "polite" });
  host.append(tip);
  return {
    show(x, y, title, rows) {
      tip.replaceChildren();
      if (title) tip.append(h("div", { class: "tip-title", text: title }));
      for (const r of rows) {
        tip.append(h("div", { class: "tip-row" },
          r.color ? h("span", { class: "tip-key", style: { background: r.color } }) : h("span", { class: "tip-key none" }),
          h("strong", { text: r.value }), h("span", { class: "tip-label", text: r.label || "" })));
      }
      tip.classList.add("on");
      const W = host.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
      let left = x + 14, top = y - th - 10;
      if (left + tw > W - 4) left = Math.max(4, x - tw - 14);
      if (top < 4) top = y + 16;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
    },
    hide() { tip.classList.remove("on"); },
  };
}

function bindTip(target, tip, host, fn) {
  const at = (ev) => {
    const hb = host.getBoundingClientRect();
    if (ev && ev.clientX !== undefined && ev.type !== "focus") return [ev.clientX - hb.left, ev.clientY - hb.top];
    const tb = target.getBoundingClientRect();
    return [tb.left + tb.width / 2 - hb.left, tb.top - hb.top];
  };
  const show = (ev) => { const [x, y] = at(ev); const { title, rows } = fn(); tip.show(x, y, title, rows); target.classList.add("hot"); };
  const hide = () => { tip.hide(); target.classList.remove("hot"); };
  target.addEventListener("pointermove", show);
  target.addEventListener("pointerleave", hide);
  target.addEventListener("focus", show);
  target.addEventListener("blur", hide);
}

// --- card: title, chart/table toggle, legend, note -----------------------------------------------------------

export function table({ head, rows, numeric = [] }) {
  return h("div", { class: "table-wrap" }, h("table", { class: "data" },
    h("thead", {}, h("tr", {}, head.map((c, i) => h("th", { class: numeric[i] ? "num" : "", text: c })))),
    h("tbody", {}, rows.map((r) => h("tr", {}, r.map((c, i) => h("td", { class: numeric[i] ? "num" : "" }, c ?? "–")))))));
}

export function legend(items) {
  return h("ul", { class: "legend" }, items.map((it) =>
    h("li", {}, h("span", { class: `key ${it.kind || "dot"}`, style: { background: it.color } }),
      it.icon ? h("span", { class: "legend-icon", text: it.icon }) : null, h("span", { text: it.label }))));
}

export function card({ title, sub, controls = [], render, tableView, legendItems, note, wide, id }) {
  const body = h("div", { class: "viz-body" });
  const tbl = h("div", { class: "viz-table", hidden: true });
  const toggle = tableView ? h("div", { class: "seg small", role: "group", "aria-label": "View" },
    h("button", { type: "button", class: "on", "aria-pressed": "true", text: "Chart", onclick: (e) => flip(e, false) }),
    h("button", { type: "button", "aria-pressed": "false", text: "Table", onclick: (e) => flip(e, true) })) : null;
  function flip(e, showTable) {
    const [a, b] = toggle.children;
    a.classList.toggle("on", !showTable); b.classList.toggle("on", showTable);
    a.setAttribute("aria-pressed", String(!showTable)); b.setAttribute("aria-pressed", String(showTable));
    body.hidden = showTable; tbl.hidden = !showTable;
    if (legendEl) legendEl.hidden = showTable;
    if (showTable && !tbl.firstChild) tbl.append(tableView());
  }
  const legendEl = legendItems && legendItems.length ? legend(legendItems) : null;
  const fig = h("figure", { class: `card viz${wide ? " wide" : ""}`, id },
    h("div", { class: "card-head" },
      h("div", { class: "card-titles" }, h("h3", { text: title }), sub ? h("p", { class: "sub", text: sub }) : null),
      h("div", { class: "card-tools" }, ...controls, toggle)),
    legendEl, body, tbl, note ? h("figcaption", { class: "note" }, note) : null);
  let lastW = 0;
  const draw = () => {
    const w = Math.floor(body.clientWidth);
    if (!w || Math.abs(w - lastW) < 2) return;
    lastW = w;
    body.replaceChildren();
    render(body, w);
  };
  fig.redraw = () => { lastW = 0; draw(); };
  new ResizeObserver(() => requestAnimationFrame(draw)).observe(body);
  return fig;
}

// --- axes -------------------------------------------------------------------------------------------------

function yGrid(g, ticks, y, x0, x1, fmt) {
  for (const t of ticks) {
    g.append(s("line", { x1: x0, x2: x1, y1: y(t), y2: y(t), class: "grid" }));
    g.append(s("text", { x: x0 - 8, y: y(t) + 4, class: "tick", "text-anchor": "end", text: fmt(t) }));
  }
}
function xTicks(g, ticks, x, y0, fmt) {
  for (const t of ticks) {
    g.append(s("line", { x1: x(t), x2: x(t), y1: y0, y2: y0 + 4, class: "axis" }));
    g.append(s("text", { x: x(t), y: y0 + 17, class: "tick", "text-anchor": "middle", text: fmt(t) }));
  }
}

// --- scatter: score against a cost, with the frontier -----------------------------------------------------

export function scatter({ points, xLabel, yLabel = "Score", xFmt, xLog, yFmt = (v) => `${Math.round(v * 100)}`,
  frontierIds = [], onClick, height = 380 }) {
  return (host, W) => {
    const pts = points.filter((p) => p.x !== null && p.y !== null && p.x !== undefined);
    if (!pts.length) { host.append(h("p", { class: "empty", text: "No runs to show for this selection." })); return; }
    const H = height, m = { l: 44, r: 28, t: 14, b: 46 };
    const xs = pts.map((p) => p.x);
    let lo = Math.min(...xs), hi = Math.max(...xs);
    if (xLog) { lo = lo / 1.5; hi = hi * 1.5; } else { const pad = (hi - lo || hi || 1) * 0.12; lo = Math.max(0, lo - pad); hi += pad; }
    const x = (xLog ? logScale : linear)([lo, hi], [m.l, W - m.r]);
    // A dot plot needs no zero baseline: start just below the lowest score, on a round tenth.
    const yLo = Math.max(0, Math.floor((Math.min(...pts.map((p) => p.y)) - 0.05) * 10) / 10);
    const y = linear([yLo, 1], [H - m.b, m.t]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${yLabel} against ${xLabel}` });
    const g = s("g");
    yGrid(g, niceTicks(yLo, 1, 5).filter((t) => t >= yLo - 1e-9 && t <= 1 + 1e-9), y, m.l, W - m.r, yFmt);
    g.append(s("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "baseline" }));
    xTicks(g, xLog ? logTicks(lo, hi) : niceTicks(lo, hi, Math.max(3, Math.floor(W / 110))).filter((t) => t >= lo && t <= hi), x, H - m.b, xFmt);
    g.append(s("text", { x: W - m.r, y: H - 6, class: "axis-label", "text-anchor": "end", text: `${xLabel} →` }));
    g.append(s("text", { x: m.l, y: m.t - 2, class: "axis-label", text: `↑ ${yLabel}` }));
    svg.append(g);
    const fr = pts.filter((p) => frontierIds.includes(p.id)).sort((a, b) => a.x - b.x);
    if (fr.length > 1) svg.append(s("polyline", { class: "frontier", points: fr.map((p) => `${x(p.x)},${y(p.y)}`).join(" ") }));
    const tip = tooltip(host);
    const order = [...pts].sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));
    const placed = [];
    for (const p of order) {
      const cx = x(p.x), cy = y(p.y);
      // A partial model (not every task run) is a hollow ring: its score covers fewer tasks.
      svg.append(s("circle", { cx, cy, r: p.color ? 5.5 : 4.5, class: `dot${p.partial ? " partial" : ""}`,
        style: p.partial ? { fill: "var(--surface)", stroke: p.color || DEEMPH } : { fill: p.color || DEEMPH } }));
      const hit = s("circle", { cx, cy, r: 12, class: "hit", tabindex: 0, role: "button", "aria-label": `${p.label}: ${yLabel} ${yFmt(p.y)}, ${xLabel} ${xFmt(p.x)}` });
      bindTip(hit, tip, host, () => ({ title: p.label, rows: [{ value: yFmt(p.y), label: yLabel, color: p.color || DEEMPH },
        { value: xFmt(p.x), label: xLabel }, ...(p.extra || [])] }));
      if (onClick) { hit.addEventListener("click", () => onClick(p)); hit.addEventListener("keydown", (e) => { if (e.key === "Enter") onClick(p); }); }
      svg.append(hit);
    }
    // Direct labels: highlighted models and the frontier, skipping any that would collide.
    const labelled = [...pts.filter((p) => p.color), ...fr.filter((p) => !p.color)];
    for (const p of labelled) {
      const cx = x(p.x), cy = y(p.y), w = p.label.length * 6.6 + 4;
      const right = cx + 10 + w < W - 2;
      const lx = right ? cx + 10 : cx - 10 - w;
      const box = [lx, cy - 9, lx + w, cy + 5];
      if (placed.some((b) => !(box[2] < b[0] || box[0] > b[2] || box[3] < b[1] || box[1] > b[3]))) continue;
      placed.push(box);
      svg.append(s("text", { x: right ? cx + 10 : cx - 10, y: cy + 4, class: `dlabel${p.color ? " strong" : ""}`, "text-anchor": right ? "start" : "end", text: p.label }));
    }
    host.append(svg);
  };
}

// --- heatmap: rows × columns, grouped columns, one sequential hue -----------------------------------------

export function heatmap({ rows, groups, cell, corner = "", onCell }) {
  return (host) => {
    const tip = tooltip(host);
    const head1 = h("tr", {}, h("th", { class: "corner", rowspan: groups.some((g) => g.label) ? 2 : 1, text: corner }));
    const head2 = h("tr");
    const hasGroups = groups.some((g) => g.label);
    for (const g of groups) {
      if (hasGroups) head1.append(h("th", { class: "group", colspan: g.cols.length, text: g.label || "" }));
      for (const c of g.cols) (hasGroups ? head2 : head1).append(h("th", { class: "col", title: c.title || c.label },
        c.href ? h("a", { href: c.href, text: c.label }) : c.label));
    }
    const tbody = h("tbody");
    for (const r of rows) {
      const tr = h("tr", {}, h("th", { class: "row", scope: "row" },
        r.color ? h("span", { class: "swatch", style: { background: r.color } }) : null,
        r.href ? h("a", { href: r.href, text: r.label }) : h("span", { text: r.label }),
        r.note ? h("span", { class: "row-note", text: r.note }) : null));
      for (const g of groups) for (const c of g.cols) {
        const v = cell(r, c);
        if (!v || v.v === null || v.v === undefined) {
          tr.append(h("td", { class: "hm none", title: v && v.empty ? v.empty : "not run" }, h("span", { text: "·" })));
          continue;
        }
        const { bg, ink } = seq(v.v);
        const td = h("td", { class: "hm", tabindex: 0, style: { background: bg, color: ink } }, h("span", { text: v.text }));
        bindTip(td, tip, host, () => ({ title: v.title || `${r.label} · ${c.label}`, rows: v.tip || [{ value: v.text }] }));
        if (onCell || v.href) {
          td.classList.add("click");
          const go = () => (onCell ? onCell(r, c) : (location.hash = v.href));
          td.addEventListener("click", go);
          td.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
        }
        tr.append(td);
      }
      tbody.append(tr);
    }
    host.append(h("div", { class: "hm-wrap" }, h("table", { class: "heat" }, h("thead", {}, head1, hasGroups ? head2 : null), tbody)));
  };
}

// --- horizontal bars, with an optional range whisker ---------------------------------------------------------

export function hbars({ rows, max = 1, fmt = (v) => `${Math.round(v * 100)}`, label = "", labelWidth = 150, barColor }) {
  return (host, W) => {
    // The value column is as wide as the longest value label, so no label runs off the card.
    const longest = Math.max(4, ...rows.map((r) => String(r.text ?? (r.value === null || r.value === undefined ? "" : fmt(r.value))).length));
    const rowH = 30, m = { t: 6, b: 24 }, lw = Math.min(labelWidth, W * 0.38), vw = longest * 6.8 + 14;
    const H = m.t + rows.length * rowH + m.b;
    const x = linear([0, max], [lw, W - vw]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    const tip = tooltip(host);
    for (const t of niceTicks(0, max, 4).filter((t) => t <= max)) {
      svg.append(s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: "grid" }));
      svg.append(s("text", { x: x(t), y: H - 6, class: "tick", "text-anchor": "middle", text: fmt(t) }));
    }
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      const name = s("text", { x: lw - 10, y: cy + 4, class: `rlabel${r.strong ? " strong" : ""}`, "text-anchor": "end", text: r.label });
      svg.append(name);
      if (r.value === null || r.value === undefined) {
        svg.append(s("text", { x: lw + 4, y: cy + 4, class: "tick", text: r.empty || "not run" }));
        return;
      }
      const bw = Math.max(2, x(r.value) - lw), bh = 14;
      svg.append(s("path", { d: roundedBar(lw, cy - bh / 2, bw, bh, 4), style: { fill: r.color || barColor || "var(--bar)" } }));
      if (r.lo !== null && r.lo !== undefined && r.hi > r.lo) {
        svg.append(s("line", { x1: x(r.lo), x2: x(r.hi), y1: cy, y2: cy, class: "whisker" }));
        for (const v of [r.lo, r.hi]) svg.append(s("line", { x1: x(v), x2: x(v), y1: cy - 4, y2: cy + 4, class: "whisker" }));
      }
      svg.append(s("text", { x: Math.max(x(r.value), r.hi ? x(r.hi) : 0) + 6, y: cy + 4, class: "value", text: r.text ?? fmt(r.value) }));
      const hit = s("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit", tabindex: 0, "aria-label": `${r.label}: ${r.text ?? fmt(r.value)}` });
      bindTip(hit, tip, host, () => ({ title: r.label, rows: r.tip || [{ value: r.text ?? fmt(r.value), color: r.color || barColor || "var(--bar)" }] }));
      if (r.href) { hit.classList.add("click"); hit.addEventListener("click", () => (location.hash = r.href)); hit.addEventListener("keydown", (e) => { if (e.key === "Enter") location.hash = r.href; }); }
      svg.append(hit);
    });
    host.append(svg);
  };
}

function roundedBar(x, y, w, hgt, r) {
  r = Math.min(r, w / 2, hgt / 2);
  return `M${x},${y} h${w - r} a${r},${r} 0 0 1 ${r},${r} v${hgt - 2 * r} a${r},${r} 0 0 1 -${r},${r} h-${w - r} z`;
}

// --- stacked horizontal bars (parts of a whole), 2px surface gaps ---------------------------------------

export function stacked({ rows, keys, normalize = true, fmt, label = "", labelWidth = 150, totalFmt }) {
  return (host, W) => {
    const rowH = 30, m = { t: 6, b: normalize ? 24 : 24 }, lw = Math.min(labelWidth, W * 0.38), vw = totalFmt ? 64 : 12;
    const H = m.t + rows.length * rowH + m.b;
    const max = normalize ? 1 : Math.max(...rows.map((r) => keys.reduce((a, k) => a + (r.parts[k.key] || 0), 0)), 1e-9);
    const x = linear([0, max], [lw, W - vw]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    const tip = tooltip(host);
    for (const t of niceTicks(0, max, 4).filter((t) => t <= max * 1.0001)) {
      svg.append(s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: "grid" }));
      svg.append(s("text", { x: x(t), y: H - 6, class: "tick", "text-anchor": "middle", text: normalize ? `${Math.round(t * 100)}%` : fmt(t) }));
    }
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2, bh = 16;
      svg.append(s("text", { x: lw - 10, y: cy + 4, class: "rlabel", "text-anchor": "end", text: r.label }));
      const tot = keys.reduce((a, k) => a + (r.parts[k.key] || 0), 0);
      if (!tot) { svg.append(s("text", { x: lw + 4, y: cy + 4, class: "tick", text: "no data" })); return; }
      let at = 0;
      const segs = keys.filter((k) => r.parts[k.key] > 0);
      segs.forEach((k, j) => {
        const v = r.parts[k.key], share = v / tot, val = normalize ? share : v;
        const x0 = x(at) + (j ? 1 : 0), x1 = x(at + val) - (j < segs.length - 1 ? 1 : 0);
        at += val;
        const w = Math.max(0.5, x1 - x0);
        const isLast = j === segs.length - 1;
        const seg = s("path", { d: isLast ? roundedBar(x0, cy - bh / 2, w, bh, 4) : `M${x0},${cy - bh / 2}h${w}v${bh}h-${w}z`,
          style: { fill: k.color }, class: "seg-part", tabindex: 0, "aria-label": `${r.label}, ${k.label}: ${Math.round(share * 100)}%` });
        bindTip(seg, tip, host, () => ({ title: r.label, rows: keys.filter((kk) => r.parts[kk.key] > 0).map((kk) => ({
          value: normalize ? `${Math.round((r.parts[kk.key] / tot) * 100)}%` : fmt(r.parts[kk.key]),
          label: kk.label + (normalize && fmt ? ` (${fmt(r.parts[kk.key])})` : ""), color: kk.color })) }));
        svg.append(seg);
        const text = `${Math.round(share * 100)}%`;
        if (w > text.length * 7 + 10) svg.append(s("text", { x: x0 + 5, y: cy + 4, class: "inlabel", style: { fill: k.ink || "#ffffff" }, text }));
      });
      if (totalFmt) svg.append(s("text", { x: x(normalize ? 1 : tot) + 6, y: cy + 4, class: "value", text: totalFmt(tot, r) }));
    });
    host.append(svg);
  };
}

// --- strip plot: every trial as a dot, the mean as a tick ------------------------------------------------

export function strips({ rows, color = "var(--bar)", label = "", labelWidth = 150 }) {
  return (host, W) => {
    const rowH = 30, m = { t: 6, b: 24 }, lw = Math.min(labelWidth, W * 0.38), vw = 44;
    const H = m.t + rows.length * rowH + m.b;
    const x = linear([0, 1], [lw, W - vw]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    const tip = tooltip(host);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: "grid" }));
      svg.append(s("text", { x: x(t), y: H - 6, class: "tick", "text-anchor": "middle", text: String(t * 100) }));
    }
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      svg.append(s("text", { x: lw - 10, y: cy + 4, class: "rlabel", "text-anchor": "end", text: r.label }));
      if (!r.values.length) { svg.append(s("text", { x: lw + 4, y: cy + 4, class: "tick", text: "not run" })); return; }
      svg.append(s("line", { x1: x(0), x2: x(1), y1: cy, y2: cy, class: "track" }));
      if (r.mean !== null) svg.append(s("line", { x1: x(r.mean), x2: x(r.mean), y1: cy - 8, y2: cy + 8, class: "mean-tick" }));
      for (const v of r.values) svg.append(s("circle", { cx: x(v), cy, r: 4.5, class: "dot", style: { fill: color } }));
      svg.append(s("text", { x: W - vw + 8, y: cy + 4, class: "value", text: r.mean === null ? "" : String(Math.round(r.mean * 100)) }));
      const hit = s("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit", tabindex: 0, "aria-label": `${r.label}: mean ${Math.round(r.mean * 100)}` });
      bindTip(hit, tip, host, () => ({ title: r.label, rows: [{ value: String(Math.round(r.mean * 100)), label: `mean of ${r.values.length} trial${r.values.length === 1 ? "" : "s"}`, color },
        { value: r.values.map((v) => Math.round(v * 100)).join(", "), label: "each trial" }] }));
      if (r.href) { hit.classList.add("click"); hit.addEventListener("click", () => (location.hash = r.href)); }
      svg.append(hit);
    });
    host.append(svg);
  };
}

// --- lines: one per run, crosshair readout by model -------------------------------------------------------

export function lines({ series, xLabel, yLabel, yFmt, refs = [], height = 320 }) {
  return (host, W) => {
    const all = series.flatMap((sr) => sr.points);
    if (!all.length) { host.append(h("p", { class: "empty", text: "No runs to show." })); return; }
    const H = height, m = { l: 52, r: 18, t: 18, b: 42 };
    const xMax = Math.max(...all.map((p) => p[0]));
    const yMax = Math.max(...all.map((p) => p[1]), ...refs.map((r) => r.y)) * 1.06;
    const x = linear([1, Math.max(2, xMax)], [m.l, W - m.r]);
    const y = linear([0, yMax], [H - m.b, m.t]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${yLabel} by ${xLabel}` });
    yGrid(svg, niceTicks(0, yMax, 5).filter((t) => t <= yMax), y, m.l, W - m.r, yFmt);
    svg.append(s("line", { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: "baseline" }));
    xTicks(svg, niceTicks(1, xMax, Math.max(3, Math.floor(W / 90))).filter((t) => t >= 1 && t <= xMax && Number.isInteger(t)), x, H - m.b, String);
    svg.append(s("text", { x: W - m.r, y: H - 6, class: "axis-label", "text-anchor": "end", text: `${xLabel} →` }));
    svg.append(s("text", { x: m.l, y: m.t - 6, class: "axis-label", text: `↑ ${yLabel}` }));
    for (const r of refs) {
      svg.append(s("line", { x1: m.l, x2: W - m.r, y1: y(r.y), y2: y(r.y), class: "ref" }));
      svg.append(s("text", { x: W - m.r, y: y(r.y) - 5, class: "ref-label", "text-anchor": "end", text: r.label }));
    }
    const ordered = [...series].sort((a, b) => (a.color ? 1 : 0) - (b.color ? 1 : 0));
    for (const sr of ordered) {
      if (!sr.points.length) continue;
      svg.append(s("polyline", { class: `line${sr.color ? "" : " faint"}`, style: { stroke: sr.color || DEEMPH },
        points: sr.points.map(([a, b]) => `${x(a)},${y(b)}`).join(" ") }));
      const [ex, ey] = sr.points[sr.points.length - 1];
      svg.append(s("circle", { cx: x(ex), cy: y(ey), r: sr.color ? 4.5 : 3, class: "dot", style: { fill: sr.color || DEEMPH } }));
    }
    const tip = tooltip(host);
    const cross = s("line", { y1: m.t, y2: H - m.b, class: "crosshair", visibility: "hidden" });
    svg.append(cross);
    const overlay = s("rect", { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, class: "hit", tabindex: 0,
      "aria-label": `${yLabel} by ${xLabel}; use the table view for every value` });
    const groups = [...new Set(series.map((sr) => sr.group))];
    const readout = (step) => {
      const rows = [];
      for (const gname of groups) {
        const vals = series.filter((sr) => sr.group === gname).map((sr) => (sr.points.find((p) => p[0] === step) || [])[1]).filter((v) => v !== undefined);
        if (!vals.length) continue;
        const sr0 = series.find((sr) => sr.group === gname);
        rows.push({ value: yFmt(vals.reduce((a, b) => a + b, 0) / vals.length), label: `${gname}${vals.length > 1 ? ` (mean of ${vals.length} runs)` : ""}`, color: sr0.color || DEEMPH, sort: sr0.color ? 0 : 1 });
      }
      rows.sort((a, b) => a.sort - b.sort);
      return rows.slice(0, 8);
    };
    const move = (ev) => {
      const b = svg.getBoundingClientRect();
      const px = ev.clientX - b.left;
      const step = Math.max(1, Math.min(xMax, Math.round(((px - m.l) / (W - m.l - m.r)) * (Math.max(2, xMax) - 1) + 1)));
      cross.setAttribute("x1", x(step)); cross.setAttribute("x2", x(step)); cross.setAttribute("visibility", "visible");
      tip.show(x(step), ev.clientY - b.top, `${xLabel} ${step}`, readout(step));
    };
    overlay.addEventListener("pointermove", move);
    overlay.addEventListener("pointerleave", () => { tip.hide(); cross.setAttribute("visibility", "hidden"); });
    svg.append(overlay);
    host.append(svg);
  };
}

// --- small pieces ---------------------------------------------------------------------------------------

/** A thin segmented bar, no text: the text beside it carries the figures. */
export function thinBar(parts) {
  const tot = parts.reduce((a, p) => a + p.value, 0) || 1;
  return h("span", { class: "thinbar", role: "img", "aria-label": parts.map((p) => `${p.label} ${Math.round((p.value / tot) * 100)}%`).join(", ") },
    parts.filter((p) => p.value > 0).map((p) => h("span", { style: { width: `${(p.value / tot) * 100}%`, background: p.color } })));
}

/** A score as a bar on a 0–100 track, with the range across tasks as a whisker. For table rows. */
export function scoreBar(v, lo, hi, W = 96) {
  const H = 14, x = (t) => 1 + t * (W - 2);
  const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: "scorebar", "aria-hidden": "true" });
  svg.append(s("line", { x1: x(0), x2: x(1), y1: H / 2, y2: H / 2, class: "track" }));
  if (v !== null && v !== undefined) svg.append(s("path", { d: roundedBar(x(0), H / 2 - 4, Math.max(2, x(v) - x(0)), 8, 4), class: "bar-fill" }));
  if (lo !== null && hi !== null && hi > lo) {
    svg.append(s("line", { x1: x(lo), x2: x(hi), y1: H / 2, y2: H / 2, class: "whisker" }));
    for (const t of [lo, hi]) svg.append(s("line", { x1: x(t), x2: x(t), y1: 2, y2: H - 2, class: "whisker" }));
  }
  return svg;
}

// --- dumbbell: two models on each row, a dot each, joined by a line ---------------------------------------------

export function dumbbell({ rows, a, b, label = "", labelWidth = 170, fmt = (v) => String(Math.round(v * 100)) }) {
  return (host, W) => {
    // The verdict says who leads: by a short name when there is one, else by a dot in the leader's colour (the
    // legend above names both; the tooltip and the table view carry the rest).
    const named = a.short && b.short;
    const longest = named ? Math.max(a.short.length, b.short.length) + 6 : 6;
    const rowH = 32, m = { t: 6, b: 24 }, lw = Math.min(labelWidth, W * 0.34), vw = Math.min(W * 0.3, longest * 6.8 + 22);
    const H = m.t + rows.length * rowH + m.b;
    const x = linear([0, 1], [lw, W - vw]);
    const svg = s("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": label });
    const tip = tooltip(host);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append(s("line", { x1: x(t), x2: x(t), y1: m.t, y2: H - m.b, class: "grid" }));
      svg.append(s("text", { x: x(t), y: H - 6, class: "tick", "text-anchor": "middle", text: String(t * 100) }));
    }
    rows.forEach((r, i) => {
      const cy = m.t + i * rowH + rowH / 2;
      if (r.group) {
        svg.append(s("text", { x: 0, y: cy + 5, class: "group-label", text: r.label }));
        return;
      }
      svg.append(s("text", { x: lw - 10, y: cy + 4, class: "rlabel", "text-anchor": "end", text: r.label }));
      const has = [r.va, r.vb].filter((v) => v !== null && v !== undefined);
      if (!has.length) { svg.append(s("text", { x: lw + 4, y: cy + 4, class: "tick", text: "neither has run it" })); return; }
      if (has.length === 2) svg.append(s("line", { x1: x(r.va), x2: x(r.vb), y1: cy, y2: cy, class: "connector" }));
      if (r.va !== null && r.va !== undefined) svg.append(s("circle", { cx: x(r.va), cy, r: 6, class: "dot", style: { fill: a.color } }));
      if (r.vb !== null && r.vb !== undefined) svg.append(s("circle", { cx: x(r.vb), cy, r: 6, class: "dot", style: { fill: b.color } }));
      const lone = has.length < 2 ? (r.va === null || r.va === undefined ? b : a) : null;
      const tie = !lone && Math.abs(r.va - r.vb) < 0.005;
      const lead = lone || (tie ? null : r.va > r.vb ? a : b);
      const amount = lone ? "only" : tie ? "tie" : `+${Math.round(Math.abs(r.va - r.vb) * 100)}`;
      if (named) svg.append(s("text", { x: W - vw + 10, y: cy + 4, class: "value", text: lead ? (lone ? `only ${lead.short}` : `${lead.short} ${amount}`) : amount }));
      else {
        if (lead) svg.append(s("circle", { cx: W - vw + 15, cy, r: 4.5, class: "dot", style: { fill: lead.color } }));
        svg.append(s("text", { x: W - vw + (lead ? 25 : 10), y: cy + 4, class: "value", text: amount }));
      }
      const hit = s("rect", { x: 0, y: cy - rowH / 2, width: W, height: rowH, class: "hit", tabindex: 0,
        "aria-label": `${r.label}: ${a.label} ${r.va === null || r.va === undefined ? "not run" : fmt(r.va)}, ${b.label} ${r.vb === null || r.vb === undefined ? "not run" : fmt(r.vb)}` });
      bindTip(hit, tip, host, () => ({ title: r.label, rows: [
        { value: r.va === null || r.va === undefined ? "not run" : fmt(r.va), label: a.label, color: a.color },
        { value: r.vb === null || r.vb === undefined ? "not run" : fmt(r.vb), label: b.label, color: b.color }, ...(r.extra || [])] }));
      if (r.href) { hit.classList.add("click"); hit.addEventListener("click", () => (location.hash = r.href)); hit.addEventListener("keydown", (e) => { if (e.key === "Enter") location.hash = r.href; }); }
      svg.append(hit);
    });
    host.append(svg);
  };
}

/** A pass rate as a small meter: the fill on a lighter track of the same blue. */
export function meter(v, width = 72) {
  return h("span", { class: "meter", style: { width: `${width}px` }, role: "img", "aria-label": `${Math.round(v * 100)}% passed` },
    h("span", { style: { width: `${Math.max(0, Math.min(1, v)) * 100}%` } }));
}

/** One run's result on one check: a status mark with its icon, so colour never carries it alone. */
export function checkMark(score) {
  if (score === null || score === undefined) return h("span", { class: "mark none", text: "–" });
  if (score >= 0.999) return h("span", { class: "mark pass", title: "passed" }, h("span", { class: "mark-icon", text: "✓" }));
  if (score <= 0.001) return h("span", { class: "mark fail", title: "missed" }, h("span", { class: "mark-icon", text: "✕" }));
  return h("span", { class: "mark part", title: `${Math.round(score * 100)}% of it` }, h("span", { class: "mark-icon", text: "◐" }), `${Math.round(score * 100)}%`);
}
