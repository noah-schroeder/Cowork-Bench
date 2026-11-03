#!/bin/sh
# Copy the Cowork bench's latest results into this website folder.
#
#   sh publish.sh           update data/results.json once
#   sh publish.sh --watch   keep running, and update whenever "Push results to web" is pressed in the bench
#
# Run it on your computer, in this folder, not in Cowork: the Cowork sandbox has no internet and cannot
# reach this folder. It only reads the bench's saved runs (tools/export.py) and never runs git: commit
# and push this folder yourself when you are ready. Needs python3.

set -u
SITE=$(cd "$(dirname "$0")" && pwd)

# Where the bench is: the cowork-bench folder inside your Cowork folder (the one with start.sh in it).
# Put that path on the first line of bench-path.txt, in this folder. Git ignores that file, so the path,
# and the user name in it, never goes public. BENCH_DIR set in the environment wins over the file.
if [ -z "${BENCH_DIR:-}" ] && [ -f "$SITE/bench-path.txt" ]; then
  BENCH_DIR=$(head -n 1 "$SITE/bench-path.txt" | tr -d '\r' | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
fi
BENCH_DIR="${BENCH_DIR:-}"
case "$BENCH_DIR" in "~/"*) BENCH_DIR="$HOME/${BENCH_DIR#"~/"}" ;; esac
RESULTS="$SITE/data/results.json"
NEW="$SITE/data/.results.json.new"
PUBLISH="$BENCH_DIR/.bench/publish"
INTERVAL=5

# Tell the bench's page how it went: it shows this under the button.
report() {
  [ -d "$BENCH_DIR/.bench" ] || return 0
  mkdir -p "$PUBLISH"
  python3 - "$PUBLISH/status.json" "$1" "$2" <<'EOF'
import json, os, sys, time
path, ok, message = sys.argv[1], sys.argv[2] == "ok", sys.argv[3]
tmp = path + ".tmp"
with open(tmp, "w", encoding="utf-8") as f:
    json.dump({"at": time.time(), "ok": ok, "message": message}, f)
os.replace(tmp, path)
EOF
}

check_bench() {
  if [ -z "$BENCH_DIR" ]; then
    echo "Where is the bench? Put the path to your cowork-bench folder (the one with start.sh in it) in"
    echo "$SITE/bench-path.txt"
    return 1
  fi
  if [ ! -d "$BENCH_DIR/.bench" ]; then
    echo "No bench results at $BENCH_DIR/.bench."
    echo "Check the path in bench-path.txt: it should be your cowork-bench folder (the one with start.sh in it)."
    return 1
  fi
}

publish_once() {
  check_bench || return 1
  if ! out=$(python3 "$SITE/tools/export.py" "$BENCH_DIR" "$NEW" 2>&1); then
    rm -f "$NEW"
    echo "$out"
    report fail "Not updated: $(printf '%s\n' "$out" | tail -n 1)"
    return 1
  fi
  [ -n "$out" ] && printf '%s\n' "$out"
  if [ -f "$RESULTS" ] && cmp -s "$NEW" "$RESULTS"; then
    rm -f "$NEW"
    msg="Nothing new: the website folder already has these results."
  else
    changed=$(python3 - "$RESULTS" "$NEW" <<'EOF'
import json, sys
def runs(p):
    try:
        return {r["id"]: r for r in json.load(open(p, encoding="utf-8"))["runs"]}
    except (OSError, ValueError, KeyError):
        return {}
old, new = runs(sys.argv[1]), runs(sys.argv[2])
print(sum(1 for k, v in new.items() if old.get(k) != v))
EOF
)
    mv "$NEW" "$RESULTS"
    msg="Website folder updated: $changed new or changed runs. Commit and push it when you are ready."
  fi
  echo "$msg"
  report ok "$msg"
}

if [ "${1:-}" = "--watch" ]; then
  check_bench || exit 1
  echo "Watching for the bench's \"Push results to web\" button. Ctrl-C to stop."
  while :; do
    # A request newer than the last status (or no status yet) is one not answered. Only the file's
    # time is looked at, never its contents.
    if [ -f "$PUBLISH/request.json" ] && { [ ! -f "$PUBLISH/status.json" ] || [ -n "$(find "$PUBLISH/request.json" -newer "$PUBLISH/status.json" 2>/dev/null)" ]; }; then
      echo "$(date '+%H:%M:%S') button pressed"
      publish_once || true
    fi
    sleep "$INTERVAL"
  done
fi

publish_once
