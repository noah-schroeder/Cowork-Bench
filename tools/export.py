"""Export the Cowork bench's saved runs as data/results.json for the website.

    python3 tools/export.py /path/to/cowork-bench data/results.json

Runs on your computer, not in Cowork. It only reads the bench folder: each run's result.json, pi's
session file (tool calls, tokens, prompt sizes, timings) and manifest.json (the folder's file list), and
the bench's results/runs.csv to check the scores. It never imports or runs the bench's code, and it
never exports transcripts, files, error text, session ids or paths.

Exits non-zero, writing nothing, when something does not add up: a task or check that
content/tasks.json does not describe, or a score that differs from the bench's own runs.csv.
Standard library only.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import os
import sys
from collections import Counter
from pathlib import Path

SCHEMA = 1
SITE = Path(__file__).resolve().parent.parent
CONTENT = SITE / "content" / "tasks.json"
SCORED = ("done", "timeout")       # the bench's store.SCORED
UNFINISHED = ("queued", "running")


class Problem(Exception):
    pass


def iso_time(epoch: float | None) -> str | None:
    if not epoch:
        return None
    return dt.datetime.fromtimestamp(epoch, dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def entry_time(entry: dict) -> float | None:
    """An entry's ISO timestamp, as seconds since the epoch."""
    ts = entry.get("timestamp")
    if not isinstance(ts, str):
        return None
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def total(det: float | None, judge: float | None, weights: list[float]) -> float | None:
    """A run's score, as the bench's store.total: checks and judge by the task's weights, or checks alone."""
    if det is None:
        return None
    if judge is None:
        return det
    return round(weights[0] * det + weights[1] * judge, 4)


def session_metrics(path: Path) -> dict | None:
    """What pi's session file says about a run: calls, tools, tokens, prompt sizes, time."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    entries = []
    for line in lines:
        try:
            entries.append(json.loads(line))
        except ValueError:
            continue
    calls, tool_calls, tool_errors, compactions = 0, 0, 0, 0
    tools: Counter = Counter()
    tok = {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0, "total": 0}
    reasoning, curve, compaction_prompts = None, [], 0
    model_s, tool_s, prev = 0.0, 0.0, None

    def add(u: dict) -> int:
        """Count one call's usage; return its prompt size."""
        nonlocal reasoning
        inp, cr, cw = (int(u.get(k) or 0) for k in ("input", "cacheRead", "cacheWrite"))
        tok["input"] += inp
        tok["output"] += int(u.get("output") or 0)
        tok["cache_read"] += cr
        tok["cache_write"] += cw
        tok["total"] += int(u.get("totalTokens") or 0)
        if isinstance(u.get("reasoning"), (int, float)):
            reasoning = (reasoning or 0) + int(u["reasoning"])
        return inp + cr + cw

    for e in entries:
        t = entry_time(e)
        if e.get("type") == "compaction":
            compactions += 1
            # The summarising call has its own usage: pi's stats count it, and so do the totals here.
            if isinstance(e.get("usage"), dict):
                compaction_prompts += add(e["usage"])
        m = e.get("message") if e.get("type") == "message" else None
        if isinstance(m, dict):
            role = m.get("role")
            if role == "assistant":
                calls += 1
                u = m.get("usage") or {}
                if u:
                    curve.append(add(u))
                # The message's own timestamp is when the call started; the entry's, when it ended.
                start = m.get("timestamp")
                if t and isinstance(start, (int, float)) and 0 <= t - start / 1000 < 86400:
                    model_s += t - start / 1000
                for part in m.get("content") or []:
                    if isinstance(part, dict) and part.get("type") == "toolCall":
                        tool_calls += 1
                        tools[str(part.get("name") or "?")] += 1
            elif role == "toolResult":
                if m.get("isError"):
                    tool_errors += 1
                if t and prev and t >= prev:
                    tool_s += t - prev
        if t:
            prev = t
    if not calls:
        return None
    tok["reasoning"] = reasoning
    return {
        "calls": calls, "tool_calls": tool_calls, "tool_errors": tool_errors, "tools": dict(sorted(tools.items())),
        "tokens": tok, "compactions": compactions,
        "prompt": {"start": curve[0] if curve else None, "peak": max(curve) if curve else None,
                   "sent": sum(curve) + compaction_prompts if curve else None},
        "prompt_curve": curve,
        "model_seconds": round(model_s, 1), "tool_seconds": round(tool_s, 1),
    }


def stats_metrics(row: dict) -> dict:
    """The fallback when a run has no session file: what the bench stored from pi's session stats."""
    s = row.get("stats") or {}
    t = s.get("tokens") if isinstance(s.get("tokens"), dict) else {}
    return {
        "calls": s.get("assistantMessages"), "tool_calls": s.get("toolCalls", row.get("tools_used")),
        "tool_errors": None, "tools": {}, "compactions": None,
        "tokens": {"input": t.get("input"), "output": t.get("output"), "cache_read": t.get("cacheRead"),
                   "cache_write": t.get("cacheWrite"), "total": t.get("total"), "reasoning": None},
        "prompt": {"start": None, "peak": None, "sent": None}, "prompt_curve": [],
        "model_seconds": None, "tool_seconds": None,
    }


def retries(run_dir: Path) -> int:
    """auto_retry_start events. Long events.jsonl lines are cut short, so match the text, not the JSON."""
    try:
        with open(run_dir / "events.jsonl", encoding="utf-8", errors="replace") as fh:
            return sum('"type": "auto_retry_start"' in line[:200] for line in fh)
    except OSError:
        return 0


def bench_scores(bench: Path) -> dict[str, float | None] | None:
    """Each run's "score %" from the bench's own results/runs.csv, or None if there is no such file."""
    path = bench / "results" / "runs.csv"
    if not path.is_file():
        return None
    out = {}
    with open(path, encoding="utf-8-sig", newline="") as fh:
        for r in csv.DictReader(fh):
            v = (r.get("score %") or "").strip()
            out[r.get("run", "")] = float(v) if v else None
    return out


def export(bench: Path) -> tuple[dict, list[str]]:
    content = json.loads(CONTENT.read_text(encoding="utf-8"))
    tasks = {t["id"]: t for t in content["tasks"]}
    runs_dir = bench / ".bench" / "runs"
    if not runs_dir.is_dir():
        raise Problem(f"{runs_dir} does not exist. BENCH_DIR should be the cowork-bench folder, the one with "
                      "start.sh and the hidden .bench folder in it.")
    notes: list[str] = []
    rows = []
    for f in sorted(runs_dir.glob("*/result.json")):
        try:
            r = json.loads(f.read_text(encoding="utf-8"))
        except (OSError, ValueError) as e:
            notes.append(f"skipped {f.parent.name}: unreadable result.json ({e})")
            continue
        if r.get("status") in UNFINISHED:
            continue
        rows.append((f.parent, r))
    if not rows:
        raise Problem(f"No finished runs in {runs_dir}.")

    unknown_tasks = sorted({r["task"] for _, r in rows if r.get("task") not in tasks})
    if unknown_tasks:
        raise Problem("These tasks are in the runs but not in content/tasks.json: " + ", ".join(unknown_tasks) +
                      ". Add them there (title, category, checks...) and export again.")
    unknown_checks = sorted({f"{r['task']}.{c.get('name')}" for _, r in rows for c in (r.get("checks") or [])
                             if c.get("name") not in tasks[r["task"]]["checks"]})
    if unknown_checks:
        raise Problem("These checks are in the runs but not described in content/tasks.json: " +
                      ", ".join(unknown_checks) + ". Describe them there and export again.")

    csv_scores = bench_scores(bench)
    if csv_scores is None:
        notes.append("no results/runs.csv in the bench folder, so scores were not cross-checked")
    out_runs, mismatched, latest = [], [], {}
    for run_dir, r in rows:
        task = tasks[r["task"]]
        score = total(r.get("det"), r.get("judge"), task["weights"])
        if csv_scores is not None:
            if r["id"] not in csv_scores:
                notes.append(f"run {r['id']} is not in results/runs.csv (it is written when the bench starts)")
            else:
                want = csv_scores[r["id"]]
                got = None if score is None else round(score * 100, 1)
                if (want is None) != (got is None) or (want is not None and abs(want - got) > 0.051):
                    mismatched.append(f"{r['id']}: bench {want}, export {got}")
        sessions = sorted((run_dir / "state" / "sessions").glob("*.jsonl"))
        m = (session_metrics(sessions[0]) if sessions else None) or stats_metrics(r)
        stored = ((r.get("stats") or {}).get("tokens") or {}).get("total")
        if stored and m["tokens"]["total"] and stored != m["tokens"]["total"]:
            notes.append(f"run {r['id']}: tokens {m['tokens']['total']} from the session file, {stored} in pi's stats")
        facts = r.get("facts") or {}
        judge = r.get("judge_detail") or {}
        par = r.get("parity") or {}
        out_runs.append({
            "id": r["id"], "model": r.get("model"), "task": r["task"], "status": r.get("status"),
            "scored": r.get("status") in SCORED and r.get("det") is not None,
            "score": score, "det": r.get("det"), "judge": r.get("judge"), "judge_model": r.get("judge_model"),
            "seconds": r.get("duration"), "minutes_allowed": r.get("minutes"),
            "finished": iso_time(r.get("finished")), "folder_dated": r.get("today"),
            "context_window": facts.get("contextWindow"), "max_tokens": facts.get("maxTokens"),
            "vision": facts.get("vision"),
            "parity": par.get("same") if par.get("checked") else None,
            # A check's detail is the grader's short note about the fictional folder ("said Amber",
            # "14/18: missing A3, B4", "291 words"): what the model got wrong, never what it wrote.
            "checks": [{"name": c.get("name"), "score": c.get("score"), "weight": c.get("weight", 1),
                        "detail": str(c.get("detail") or "")[:160]}
                       for c in (r.get("checks") or [])],
            "judge_criteria": ({k: v.get("score") for k, v in (judge.get("criteria") or {}).items()
                                if isinstance(v, dict)} or None),
            **m,
            "retries": retries(run_dir),
            "asked": len(r.get("asked") or []),
        })
        prev = latest.get(r["task"])
        if not prev or (r.get("finished") or 0) > (prev[1].get("finished") or 0):
            latest[r["task"]] = (run_dir, r)
    if mismatched:
        raise Problem("Scores differ from the bench's results/runs.csv, so the weights in content/tasks.json no "
                      "longer match bench/tasks.py: " + "; ".join(mismatched[:5]))

    # Each task's prompt as typed, and the folder's files, from that task's latest run.
    prompts = {tid: {"text": r.get("prompt"), "folder_dated": r.get("today")} for tid, (_, r) in latest.items()}
    newest_dir = max(latest.values(), key=lambda x: x[1].get("finished") or 0)[0]
    try:
        files = sorted(json.loads((newest_dir / "manifest.json").read_text(encoding="utf-8")))
    except (OSError, ValueError):
        files = []
    out_runs.sort(key=lambda x: x["id"])
    data = {
        "schema": SCHEMA,
        "updated": iso_time(max((r.get("finished") or 0) for _, r in rows)),
        "prompts": prompts,
        "folder_files": files,
        "runs": out_runs,
    }
    return data, notes


def dumps(data: dict) -> str:
    """Pretty at the top, one run per line: small, and a diff shows which runs changed."""
    head = {k: v for k, v in data.items() if k != "runs"}
    lines = ["{"]
    for k, v in head.items():
        lines.append(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)},")
    lines.append('  "runs": [')
    lines.append(",\n".join("    " + json.dumps(r, ensure_ascii=False) for r in data["runs"]))
    lines.append("  ]")
    lines.append("}")
    return "\n".join(lines) + "\n"


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print(__doc__.strip().splitlines()[2].strip(), file=sys.stderr)
        return 2
    bench, dest = Path(argv[1]).expanduser(), Path(argv[2])
    try:
        data, notes = export(bench)
    except Problem as e:
        print(f"export: {e}", file=sys.stderr)
        return 1
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(f".{dest.name}.tmp")
    tmp.write_text(dumps(data), encoding="utf-8")
    os.replace(tmp, dest)
    for n in notes:
        print(f"note: {n}", file=sys.stderr)
    models = {r["model"] for r in data["runs"]}
    print(f"{len(data['runs'])} runs, {len(models)} models, latest {data['updated']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
