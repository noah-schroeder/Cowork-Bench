# Cowork Bench: the website

Results from the Cowork bench: which local models do a portfolio manager's work best inside MyRA Cowork.
A static site (no build step, no dependencies) for GitHub Pages.

## Updating the results

The bench runs inside a Cowork sandbox, which has no internet and cannot reach this folder, so a script on
your computer does the copying.

1. Once: make a file `bench-path.txt` in this folder holding the path to the `cowork-bench` folder inside
   your Cowork folder (the one with `start.sh` in it), on one line. Git ignores it, so your path stays private.
2. In this folder, run `sh publish.sh --watch` and leave it running.
3. In the bench, press **Push results to web**. Within a few seconds the button says what happened:
   "Website folder updated: N new or changed runs", "Nothing new", or why it could not.
4. Commit and push this folder when you are ready. The script never runs git.

`sh publish.sh` without `--watch` updates once, without the button.

The export (`tools/export.py`) only reads the bench's saved runs and writes `data/results.json`. It never
copies transcripts, files the models made, error text, session ids or paths. Each check carries the
grader's short note about the fictional folder ("said Amber", "14/18: missing A3, B4", "291 words"),
which the model-on-task pages show next to each missed check. It stops, leaving the old
results in place, if a task or check in the runs is not described in `content/tasks.json`, or if a score
differs from the bench's own `results/runs.csv`.

## When the bench changes

- **A new or renamed check or task:** describe it in `content/tasks.json` (the export says which).
- **New task weights:** copy them into `content/tasks.json`; the export checks them against the bench.
- **New MyRA tools:** add them to `cowork` in `content/tasks.json` (listed on the Method page), and to
  `TOOL_FAMILIES` in `assets/data.js` if they should not count as "MyRA folder, planning & other".

## The pages

The **Overview** is the short answer for someone who has just arrived: the top five models, what stands
out, the leader in each kind of work, and how it was tested. **Results** holds the evidence: the
leaderboard for any kind of work or file type, score against cost, and every model on every task. Model
pages, and a model's page for one task, open from there.

## Models that did not run every task

Only a model with a scored run on every task gets a score. Any other model (one that failed, or that you
stopped early because it did not look competitive) is only named, under "Also tested" on the Overview,
Results and Method pages, and its runs count nowhere else on the site. This is automatic: once such a model
has run every task, it moves onto the leaderboard. A task that no model has run yet does not count.

So when you add a task to the bench, a model drops to "Also tested" once another model has run the new
task and it has not. Publish after you have rerun the models you want on the leaderboard. To keep a model
off the site altogether, set `"hidden": true` for it in `data/models.json`.

## The "In short" findings

Findings are written from the numbers: the best model, a near-best one that is much faster or leaner,
what a slower setting of the same model buys, the check most models fail, the task that needs the most
context, and the leader in each kind of work. The Overview shows them for all work, leaving out the best
model and the leaders, which its standings and folders already show. On Results, picking a kind of work
or a file type adds a folded "In short" for those tasks. They update with every publish.

`content/findings.json` holds your own lines, shown above the automatic ones, and can hide automatic ones:

    {
      "notes": [{ "text": "Our pick for everyday Cowork work is ...", "sel": "all" }],
      "hide": ["lean"]
    }

`sel` is where a note shows: `all` on the Overview, or a tab on Results (`trackers`, `analysis`, `writing`,
`presentations`); `fmt`
optionally narrows it to a file type; `link` and `link_text` add a link. Automatic findings are hidden by
id: `best`, `fast`, `lean`, `variant`, `mistake`, `context`, `leaders`.

## Facts about each model

`data/models.json` holds what the bench cannot know, keyed by the exact name typed into the bench:
parameters, quantization, runtime, hardware, a link and a one-line note. Every field is optional.
`"hidden": true` keeps a model off the site. See `_example` in the file.

## Publishing on GitHub Pages

Settings → Pages → Deploy from a branch → `main`, folder `/ (root)`. `.nojekyll` makes Pages serve the
files as they are.

## Looking at it locally

Browsers do not let a page opened as a file load its data, so serve the folder:

    python3 -m http.server 8000

and open http://localhost:8000.

## Checking the numbers

    node dev/check.mjs data/results.json

checks that every run holds only the fields the export writes and that every task and check is described,
and says which models are scored and which are only named.
Given a leaderboard dumped from the bench (`store.leaderboard(TASKS)` as JSON) as a second argument, it also
checks that the site's arithmetic matches the bench's, cell by cell. Needs Node 22 or later.

## Files

| | |
|---|---|
| `index.html`, `assets/` | the site: `data.js` (the arithmetic), `charts.js` (SVG charts), `views.js` (pages), `app.js` (routing, state in the URL) |
| `content/tasks.json` | the words: categories, each task's trap and explanation, every check in plain English, the rubrics, the folder story |
| `content/findings.json` | your own lines for the "In short" block, and which automatic findings to hide |
| `data/results.json` | the results, written by `publish.sh` |
| `data/models.json` | optional facts about each model |
| `publish.sh`, `tools/export.py` | the update, run on your computer |

Headings are set in Newsreader, under the SIL Open Font License (`assets/fonts/OFL.txt`). Every name,
company and number in the bench's folder is invented.
