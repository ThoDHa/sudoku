#!/usr/bin/env python3
"""Generate the unified test-report portal page for GitHub Pages.

The deploy workflow publishes the Allure report to /test-report/ and the app to
the Pages root. Other reports (frontend StrykerJS and Go go-mutesting mutation,
and the profiling suite) are produced by separate nightly workflows and live in
their artifacts. This script takes those fetched artifacts, copies each report
into the Pages `reports/` tree, and writes a `reports/index.html` portal that
opens with a high-level results strip (test totals, coverage, mutation score,
profiling verdict) and then links to Allure plus every report actually present.

It is deliberately best-effort and degrades gracefully: a missing artifacts
directory, report, or metric simply omits that link or stat, so a nightly run
that has not happened yet (or a failed job) never breaks the deploy or produces
dead links.

Usage:
    gen_report_portal.py --artifacts-dir <dir> --out-dir <pages-artifact/reports> \
        [--allure-rel ../test-report/]
"""

import argparse
import html
import json
import os
import re
import shutil

# Report collectors. Each rule matches a fetched artifact directory by its name
# (exact or prefix), finds the report's entry HTML inside it, and copies either
# that single self-contained file or the whole directory containing it.
#   section:  portal heading to group the link under
#   find:     entry HTML filename to locate within the artifact
#   copy:     "file" (self-contained HTML) or "dir" (report folder with assets)
#   dest:     subpath under the out dir; for prefix rules, {} is the name suffix
#   label:    link text; for prefix rules, {} is the name suffix
#   extra:    optional list of {find, label} extra self-contained files from the
#             same artifact, copied to the same dest and linked in the same
#             section; each is skipped if absent (the main find must be present)
COLLECTORS = [
    {"match": "mutation-frontend", "prefix": False, "find": "mutation.html",
     "copy": "file", "section": "Mutation testing", "dest": "mutation/frontend",
     "label": "Frontend (StrykerJS)"},
    {"match": "mutation-go-", "prefix": True, "find": "go-mutesting-report.html",
     "copy": "file", "section": "Mutation testing", "dest": "mutation/{}",
     "label": "Go: {} (go-mutesting)"},
    # The Playwright report is the generic test-runner output (pass/fail per
    # spec), not the profiling analysis. Label it honestly; the profiling
    # verdict + metrics are surfaced separately from the results JSON below.
    {"match": "nightly-playwright-report", "prefix": False, "find": "index.html",
     "copy": "dir", "section": "Profiling", "dest": "profiling/playwright",
     "label": "Profiling test run (Playwright report)"},
    {"match": "coverage-frontend", "prefix": False, "find": "index.html",
     "copy": "dir", "section": "Coverage", "dest": "coverage/frontend",
     "label": "Frontend (Vitest)"},
    {"match": "coverage-go", "prefix": False, "find": "coverage.html",
     "copy": "file", "section": "Coverage", "dest": "coverage/go",
     "label": "Go (go tool cover)",
     "extra": [{"find": "coverage.svg", "label": "Go (treemap)"}]},
]

# Portal section order.
SECTIONS = ["Test results", "Coverage", "Mutation testing", "Profiling"]

# Techniques mutation is sharded one file per shard (mutation-go-techniques-shard-*);
# collapse those into one group so 22 links don't flood the Mutation section.
TECHNIQUES_PREFIX = "techniques-shard-"
TECHNIQUES_ARTIFACT_PREFIX = "mutation-go-techniques-shard-"
GROUP_MARKER = "__group__"

# Profiling verdict ordering, worst wins for the combined headline.
VERDICT_RANK = {"PASS": 0, "WARN": 1, "FAIL": 2}
VERDICT_STATE = {"PASS": "ok", "WARN": "warn", "FAIL": "fail"}


def find_file(root, filename):
    """Return the first path to `filename` anywhere under root, or None."""
    for dirpath, _dirs, files in os.walk(root):
        if filename in files:
            return os.path.join(dirpath, filename)
    return None


def _read_json(path):
    """Best-effort JSON load; None on any missing/unreadable/invalid file."""
    if not path:
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _find_in_artifact(artifacts_dir, artifact_name, filename):
    """Locate `filename` inside a named fetched artifact directory, or None."""
    if not artifacts_dir:
        return None
    art = os.path.join(artifacts_dir, artifact_name)
    return find_file(art, filename) if os.path.isdir(art) else None


# --- High-level metric readers (all best-effort, return None when absent) ---

def techniques_score(artifacts_dir):
    """Combined techniques mutation efficacy across all present shards.

    Sums the per-shard report.json counts and applies the same efficacy formula
    as the CI gate (api/scripts/mutation_aggregate.py): killed+timeouts over
    killed+timeouts+escaped. Returns (percent, shard_count) or None.
    """
    if not artifacts_dir or not os.path.isdir(artifacts_dir):
        return None
    killed = timeouts = escaped = shards = 0
    for name in sorted(os.listdir(artifacts_dir)):
        if not name.startswith(TECHNIQUES_ARTIFACT_PREFIX):
            continue
        stats = (_read_json(_find_in_artifact(artifacts_dir, name, "report.json"))
                 or {}).get("stats") or {}
        if not stats:
            continue
        killed += stats.get("killedCount", 0)
        timeouts += stats.get("timeOutCount", 0)
        escaped += stats.get("escapedCount", 0)
        shards += 1
    denom = killed + timeouts + escaped
    if shards == 0 or denom == 0:
        return None
    return (100.0 * (killed + timeouts) / denom, shards)


def frontend_mutation_score(artifacts_dir):
    """StrykerJS mutation score from mutation.json, or None.

    Score = (killed+timeout) / (killed+timeout+survived+no-coverage), the
    standard mutation score including undetected mutants.
    """
    data = _read_json(_find_in_artifact(artifacts_dir, "mutation-frontend", "mutation.json"))
    if not data:
        return None
    detected = undetected = 0
    for file_result in (data.get("files") or {}).values():
        for mutant in file_result.get("mutants") or []:
            status = mutant.get("status")
            if status in ("Killed", "Timeout"):
                detected += 1
            elif status in ("Survived", "NoCoverage"):
                undetected += 1
    total = detected + undetected
    if total == 0:
        return None
    return 100.0 * detected / total


def frontend_coverage_pct(artifacts_dir):
    """Frontend line-coverage percent from Vitest coverage-summary.json, or None."""
    data = _read_json(_find_in_artifact(artifacts_dir, "coverage-frontend", "coverage-summary.json"))
    try:
        return float(data["total"]["lines"]["pct"])
    except (TypeError, KeyError, ValueError):
        return None


def go_coverage_pct(artifacts_dir):
    """Go total coverage percent from the uploaded `go tool cover -func` total line."""
    path = _find_in_artifact(artifacts_dir, "coverage-go", "coverage.func.txt")
    if not path:
        return None
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return None
    match = re.search(r"(\d+(?:\.\d+)?)%", text)
    return float(match.group(1)) if match else None


def allure_totals(summary_path):
    """Test pass/fail totals from Allure widgets/summary.json, or None."""
    stat = (_read_json(summary_path) or {}).get("statistic") or {}
    if not stat:
        return None
    return {
        "passed": stat.get("passed", 0),
        "failed": stat.get("failed", 0) + stat.get("broken", 0),
        "total": stat.get("total", 0),
    }


def profiling_reports(artifacts_dir):
    """All parsed <device>-comparison-report.json from the profiling artifact."""
    art = os.path.join(artifacts_dir, "nightly-profiling-results") if artifacts_dir else ""
    reports = []
    if art and os.path.isdir(art):
        for dirpath, _dirs, files in os.walk(art):
            for name in sorted(files):
                if name.endswith("-comparison-report.json"):
                    data = _read_json(os.path.join(dirpath, name))
                    if data:
                        reports.append(data)
    return reports


def _worst_verdict(reports):
    """The worst analysis.verdict across reports (FAIL > WARN > PASS), or None."""
    verdicts = [(r.get("analysis") or {}).get("verdict") for r in reports]
    verdicts = [v for v in verdicts if v in VERDICT_RANK]
    return max(verdicts, key=lambda v: VERDICT_RANK[v]) if verdicts else None


def write_profiling_summary(artifacts_dir, out_dir):
    """Render a per-device profiling summary page from the results JSON.

    Returns (href, worst_verdict) or None when no profiling results are present.
    The generic Playwright report shows pass/fail; this surfaces the actual
    profiling verdict and metrics the gate cares about.
    """
    reports = profiling_reports(artifacts_dir)
    if not reports:
        return None
    verdict = _worst_verdict(reports)

    cards = []
    for report in reports:
        analysis = report.get("analysis") or {}
        device = report.get("deviceLabel") or report.get("device") or "device"
        dev_verdict = analysis.get("verdict") or "?"
        state = VERDICT_STATE.get(dev_verdict, "")
        metrics = []
        idle = analysis.get("wasmIdlePercentage")
        if isinstance(idle, (int, float)):
            metrics.append(("WASM idle", f"{idle:.2f}%"))
        mem = analysis.get("memoryOverheadMB")
        if isinstance(mem, (int, float)):
            metrics.append(("Memory overhead", f"{mem:.2f} MB"))
        cpu = analysis.get("wasmCpuOverhead")
        if isinstance(cpu, (int, float)):
            metrics.append(("WASM CPU overhead", f"{cpu:.2f}"))
        metric_rows = "".join(
            f"        <tr><td>{html.escape(k)}</td><td>{html.escape(v)}</td></tr>\n"
            for k, v in metrics)
        findings = analysis.get("findings") or []
        finding_items = "".join(
            f"        <li>{html.escape(str(x))}</li>\n" for x in findings)
        findings_html = (f"      <p class=\"muted\">Findings</p>\n      <ul>\n{finding_items}      </ul>\n"
                         if finding_items else "")
        cards.append(
            f"    <section class=\"card {state}\">\n"
            f"      <h2>{html.escape(str(device))} "
            f"<span class=\"badge {state}\">{html.escape(dev_verdict)}</span></h2>\n"
            f"      <table>\n{metric_rows}      </table>\n"
            f"{findings_html}"
            f"    </section>")

    page = _PROFILING_PAGE.format(body="\n".join(cards))
    dest_dir = os.path.join(out_dir, "profiling")
    os.makedirs(dest_dir, exist_ok=True)
    with open(os.path.join(dest_dir, "summary.html"), "w") as f:
        f.write(page)
    return ("profiling/summary.html", verdict)


def build_summary(artifacts_dir, out_dir, allure_rel, profiling, techniques):
    """Assemble the high-level stat strip. Each present metric becomes one stat.

    profiling is the (href, verdict) from write_profiling_summary (or None);
    techniques is the (percent, shards) from techniques_score (or None).
    """
    stats = []

    totals = allure_totals(os.path.join(out_dir, allure_rel, "widgets", "summary.json"))
    if totals:
        stats.append({
            "label": "Tests",
            "value": f"{totals['passed']}/{totals['total']} passed",
            "state": "fail" if totals["failed"] else "ok",
            "href": allure_rel,
        })

    fe_cov = frontend_coverage_pct(artifacts_dir)
    if fe_cov is not None:
        stats.append({"label": "Frontend coverage", "value": f"{fe_cov:.1f}%",
                      "state": "", "href": "coverage/frontend/index.html"})

    go_cov = go_coverage_pct(artifacts_dir)
    if go_cov is not None:
        stats.append({"label": "Go coverage", "value": f"{go_cov:.1f}%",
                      "state": "", "href": "coverage/go/coverage.html"})

    fe_mut = frontend_mutation_score(artifacts_dir)
    if fe_mut is not None:
        stats.append({"label": "Frontend mutation", "value": f"{fe_mut:.1f}%",
                      "state": "", "href": "mutation/frontend/mutation.html"})

    if techniques:
        pct, _shards = techniques
        stats.append({"label": "Go techniques mutation", "value": f"{pct:.1f}%",
                      "state": "", "href": "#mutation-testing"})

    if profiling:
        href, verdict = profiling
        if verdict:
            stats.append({"label": "Profiling", "value": verdict,
                          "state": VERDICT_STATE.get(verdict, ""), "href": href})

    return stats


def collect_reports(artifacts_dir, out_dir, techniques):
    """Copy each found report into out_dir; return {section: [entry]}.

    An entry is either a flat ``(label, href)`` link or a collapsible group
    ``(GROUP_MARKER, title, [(label, href), ...])``. The per-file techniques
    mutation reports are collapsed into one group whose title carries the
    combined score (`techniques` = (percent, shards) or None).
    """
    found = {}
    tech_links = []
    if not artifacts_dir or not os.path.isdir(artifacts_dir):
        return found

    for name in sorted(os.listdir(artifacts_dir)):
        artifact_path = os.path.join(artifacts_dir, name)
        if not os.path.isdir(artifact_path):
            continue

        for rule in COLLECTORS:
            suffix = None
            if rule["prefix"]:
                if not name.startswith(rule["match"]):
                    continue
                suffix = name[len(rule["match"]):]
            elif name != rule["match"]:
                continue

            entry = find_file(artifact_path, rule["find"])
            if not entry:
                break  # matched the rule but has no report; nothing else matches

            dest_rel = rule["dest"].format(suffix) if suffix is not None else rule["dest"]
            label = rule["label"].format(suffix) if suffix is not None else rule["label"]
            dest_dir = os.path.join(out_dir, dest_rel)

            if rule["copy"] == "dir":
                if os.path.exists(dest_dir):
                    shutil.rmtree(dest_dir)
                shutil.copytree(os.path.dirname(entry), dest_dir)
            else:
                os.makedirs(dest_dir, exist_ok=True)
                shutil.copy2(entry, os.path.join(dest_dir, rule["find"]))

            href = f"{dest_rel}/{rule['find']}"
            if suffix and suffix.startswith(TECHNIQUES_PREFIX):
                # Collapse the per-file techniques shards; label = technique name.
                tech_links.append((suffix[len(TECHNIQUES_PREFIX):], href))
            else:
                found.setdefault(rule["section"], []).append((label, href))

            # Optional sibling files from the same artifact (e.g. a treemap SVG
            # alongside the line-coverage HTML), each linked in the same section.
            for ex in rule.get("extra", []):
                ex_entry = find_file(artifact_path, ex["find"])
                if not ex_entry:
                    continue
                shutil.copy2(ex_entry, os.path.join(dest_dir, ex["find"]))
                found.setdefault(rule["section"], []).append(
                    (ex["label"], f"{dest_rel}/{ex['find']}"))
            break

    if tech_links:
        # One aggregated result: the combined score as the group title, with the
        # per-shard reports preserved inside for drill-down.
        if techniques:
            pct, shards = techniques
            title = f"Techniques: {pct:.1f}% killed ({shards} shards)"
        else:
            title = f"Techniques ({len(tech_links)} files)"
        found.setdefault("Mutation testing", []).append(
            (GROUP_MARKER, title, sorted(tech_links)))
    return found


def _slug(heading):
    return re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")


def _stat_html(stat):
    cls = "stat " + stat["state"] if stat["state"] else "stat"
    inner = (f'<span class="stat-label">{html.escape(stat["label"])}</span>'
             f'<span class="stat-value">{html.escape(stat["value"])}</span>')
    if stat.get("href"):
        return f'    <a class="{cls}" href="{html.escape(stat["href"])}">{inner}</a>'
    return f'    <div class="{cls}">{inner}</div>'


def render_page(sections, summary):
    """sections: list of (heading, [entry]); summary: list of stat dicts."""
    def link(label, href):
        return f'<a href="{html.escape(href)}">{html.escape(label)}</a>'

    items = []
    for heading, entries in sections:
        if not entries:
            continue
        rows = []
        for entry in entries:
            if entry[0] == GROUP_MARKER:
                _, title, sub = entry
                sub_rows = "\n".join(
                    f"          <li>{link(l, h)}</li>" for l, h in sub)
                rows.append(
                    f"      <li><details><summary>{html.escape(title)}</summary>\n"
                    f"        <ul>\n{sub_rows}\n        </ul>\n      </details></li>")
            else:
                label, href = entry
                rows.append(f"      <li>{link(label, href)}</li>")
        items.append(f'    <section id="{_slug(heading)}">\n      <h2>{html.escape(heading)}</h2>\n'
                     f"      <ul>\n" + "\n".join(rows) + "\n      </ul>\n    </section>")
    body = "\n".join(items) if items else "    <p>No reports available yet.</p>"

    summary_html = ""
    if summary:
        cards = "\n".join(_stat_html(s) for s in summary)
        summary_html = f'  <div class="summary">\n{cards}\n  </div>\n'

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Sudoku Test Reports</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ font-family: system-ui, sans-serif; max-width: 48rem; margin: 3rem auto;
           padding: 0 1rem; line-height: 1.5; }}
    h1 {{ margin-bottom: 0.25rem; }}
    p.sub {{ color: gray; margin-top: 0; }}
    section {{ margin: 1.5rem 0; }}
    ul {{ padding-left: 1.25rem; }}
    a {{ color: #3b82f6; }}
    .summary {{ display: flex; flex-wrap: wrap; gap: 0.75rem; margin: 1.25rem 0 0.5rem; }}
    .stat {{ display: flex; flex-direction: column; gap: 0.15rem; padding: 0.5rem 0.85rem;
            border: 1px solid rgba(128,128,128,0.35); border-left-width: 4px;
            border-radius: 6px; min-width: 7rem; text-decoration: none; color: inherit; }}
    .stat:hover {{ border-color: #3b82f6; }}
    .stat-label {{ font-size: 0.72rem; color: gray; text-transform: uppercase;
                  letter-spacing: 0.03em; }}
    .stat-value {{ font-size: 1.15rem; font-weight: 600; }}
    .stat.ok {{ border-left-color: #22c55e; }}
    .stat.warn {{ border-left-color: #f59e0b; }}
    .stat.fail {{ border-left-color: #ef4444; }}
  </style>
</head>
<body>
  <h1>Sudoku Test Reports</h1>
  <p class="sub">One place for every quality report in the project.</p>
{summary_html}{body}
</body>
</html>
"""


# Standalone profiling summary page (self-contained, theme-aware).
_PROFILING_PAGE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Profiling Results</title>
  <style>
    :root {{ color-scheme: light dark; }}
    body {{ font-family: system-ui, sans-serif; max-width: 48rem; margin: 3rem auto;
           padding: 0 1rem; line-height: 1.5; }}
    h1 {{ margin-bottom: 0.25rem; }}
    p.sub, p.muted {{ color: gray; }}
    .card {{ border: 1px solid rgba(128,128,128,0.35); border-left-width: 4px;
            border-radius: 6px; padding: 0.5rem 1rem; margin: 1rem 0; }}
    .card.ok {{ border-left-color: #22c55e; }}
    .card.warn {{ border-left-color: #f59e0b; }}
    .card.fail {{ border-left-color: #ef4444; }}
    .badge {{ font-size: 0.75rem; padding: 0.1rem 0.5rem; border-radius: 999px;
             vertical-align: middle; border: 1px solid currentColor; }}
    .badge.ok {{ color: #16a34a; }}
    .badge.warn {{ color: #d97706; }}
    .badge.fail {{ color: #dc2626; }}
    table {{ border-collapse: collapse; }}
    td {{ padding: 0.15rem 1.25rem 0.15rem 0; }}
    td:last-child {{ font-variant-numeric: tabular-nums; font-weight: 600; }}
    a {{ color: #3b82f6; }}
  </style>
</head>
<body>
  <h1>Profiling Results</h1>
  <p class="sub">WASM CPU / memory verdicts from the nightly profiling suite. <a href="index.html">Back to reports</a></p>
{body}
</body>
</html>
"""


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts-dir", default="",
                        help="Directory of fetched nightly report artifacts.")
    parser.add_argument("--out-dir", required=True,
                        help="Pages reports directory to populate (e.g. pages-artifact/reports).")
    parser.add_argument("--allure-rel", default="../test-report/",
                        help="Relative href from the portal to the Allure report.")
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)

    techniques = techniques_score(args.artifacts_dir)
    found = collect_reports(args.artifacts_dir, args.out_dir, techniques)

    profiling = write_profiling_summary(args.artifacts_dir, args.out_dir)
    if profiling:
        href, verdict = profiling
        found.setdefault("Profiling", []).insert(
            0, (f"Profiling verdict: {verdict} (metrics)", href))

    found.setdefault("Test results", []).insert(
        0, ("Allure (all tests: unit + Go + E2E + profiling)", args.allure_rel))

    summary = build_summary(args.artifacts_dir, args.out_dir, args.allure_rel,
                            profiling, techniques)
    ordered = [(section, found.get(section, [])) for section in SECTIONS]
    with open(os.path.join(args.out_dir, "index.html"), "w") as f:
        f.write(render_page(ordered, summary))

    total = sum(len(v) for k, v in found.items() if k != "Test results")
    print(f"portal: wrote {args.out_dir}/index.html with {total} nightly report(s), "
          f"{len(summary)} summary stat(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
