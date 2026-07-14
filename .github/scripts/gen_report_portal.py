#!/usr/bin/env python3
"""Generate the unified test-report portal page for GitHub Pages.

The deploy workflow publishes the Allure report to /test-report/ and the app to
the Pages root. Other reports (frontend and Go mutation, and the profiling suite)
are produced by separate nightly workflows and live in their artifacts. The Go
mutation report is rendered as one unified mutation-testing-elements dashboard
(matching the frontend) by an earlier deploy step. This script copies each report
into the Pages `reports/` tree
and writes a `reports/index.html` portal that opens each section with a
health-colored banner (an overall figure) and breaks it down into per-report
tiles, plus a per-device profiling dashboard. The page links a sibling
`styles.css` and `app.js`, both copied next to it.

Everything is best-effort: a missing artifacts directory, report, or metric
simply omits that tile/link/stat, so a nightly run that has not happened yet
(or a failed job) never breaks the deploy or produces dead links.

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

# --- Health gates (from the project's real gates) ---
# Coverage line gate is 85 (frontend vitest + Go floors sit at/below this).
COVERAGE = {"ok": 85.0, "warn": 75.0}

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_frontend_mutation_gate(config_path=None):
    """Frontend mutation gate read from Stryker's own thresholds (high -> ok,
    low -> warn). Also drives the pooled overall mutation banner. Falls back to
    90/90 if the config is unreadable so the portal build never breaks."""
    path = config_path or os.path.join(_REPO_ROOT, "frontend", "stryker.config.json")
    try:
        with open(path) as f:
            th = json.load(f)["thresholds"]
        return {"ok": float(th["high"]), "warn": float(th["low"])}
    except (OSError, KeyError, ValueError, TypeError):
        return {"ok": 90.0, "warn": 90.0}


def _load_go_mutation_floors(floors_path=None):
    """Per-package Go mutation efficacy floors from the canonical
    api/mutation-floors.json (technique shards aggregate into one "techniques"
    scope). Falls back to the documented floors if the file is unreadable."""
    path = floors_path or os.path.join(_REPO_ROOT, "api", "mutation-floors.json")
    try:
        with open(path) as f:
            return {k: float(v) for k, v in json.load(f)["floors"].items()}
    except (OSError, KeyError, ValueError, TypeError):
        return {"dp": 95.0, "human": 85.0, "techniques": 85.0}


# Stryker high/low (used for the frontend tile and the pooled overall banner).
# The Go tile instead honors each package's own floor below, so a stricter
# package (dp) is not diluted by the pooled number.
MUTATION = _load_frontend_mutation_gate()
# Canonical in api/mutation-floors.json; api/Makefile and the nightly-mutation
# workflow mirror it and are drift-guarded against it in the portal's tests.
GO_MUTATION_FLOORS = _load_go_mutation_floors()
GO_MUTATION_DEFAULT_FLOOR = 85.0
# Profiling idle-thread health (wasm-cpu-profile VERDICT_THRESHOLDS).
IDLE = {"ok": 98.0, "warn": 95.0}
# Profiling memory overhead thresholds in MB (WARN at 10, FAIL at 30).
MEM_WARN_MB, MEM_FAIL_MB = 10.0, 30.0

GO_MUTATION_PREFIX = "mutation-go-"
VERDICT_RANK = {"PASS": 0, "WARN": 1, "FAIL": 2}
VERDICT_STATE = {"PASS": "ok", "WARN": "warn", "FAIL": "fail"}

_ASSET_DIR = os.path.dirname(os.path.abspath(__file__))
# The game's own icon (theme-aware light/dark variants), used for the portal
# header and favicon so the reports carry the game's identity.
_ICON_DIR = os.path.join(os.path.dirname(os.path.dirname(_ASSET_DIR)), "frontend", "public")
_ICONS = ("sudoku-icon.svg", "sudoku-icon-dark.svg")


def _esc(value):
    return html.escape(str(value))


def find_file(root, filename):
    """Return the first path to `filename` anywhere under root, or None."""
    for dirpath, _dirs, files in os.walk(root):
        if filename in files:
            return os.path.join(dirpath, filename)
    return None


def _read_json(path):
    if not path:
        return None
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _find_in_artifact(artifacts_dir, artifact_name, filename):
    if not artifacts_dir:
        return None
    art = os.path.join(artifacts_dir, artifact_name)
    return find_file(art, filename) if os.path.isdir(art) else None


def _artifact_names(artifacts_dir):
    if not artifacts_dir or not os.path.isdir(artifacts_dir):
        return []
    return sorted(os.listdir(artifacts_dir))


def health(value, gate):
    return "ok" if value >= gate["ok"] else "warn" if value >= gate["warn"] else "fail"


def _efficacy(detected, survived):
    denom = detected + survived
    return 100.0 * detected / denom if denom else None


# --- Copying reports and collecting their hrefs ---

def collect_reports(artifacts_dir, out_dir):
    """Copy each present report into out_dir and return its hrefs.

    hrefs maps a stable key to the report's relative href. The Go mutation report
    is not copied here: it is rendered as one unified mutation-testing-elements
    dashboard (matching the frontend) by the portal build step before this runs.
    """
    hrefs = {}
    for name in _artifact_names(artifacts_dir):
        art = os.path.join(artifacts_dir, name)
        if not os.path.isdir(art):
            continue

        def copy_file(find, dest_rel):
            src = find_file(art, find)
            if not src:
                return None
            dest_dir = os.path.join(out_dir, dest_rel)
            os.makedirs(dest_dir, exist_ok=True)
            shutil.copy2(src, os.path.join(dest_dir, find))
            return f"{dest_rel}/{find}"

        def copy_dir(find, dest_rel):
            src = find_file(art, find)
            if not src:
                return None
            dest_dir = os.path.join(out_dir, dest_rel)
            if os.path.exists(dest_dir):
                shutil.rmtree(dest_dir)
            shutil.copytree(os.path.dirname(src), dest_dir)
            return f"{dest_rel}/{find}"

        if name == "coverage-frontend":
            h = copy_dir("index.html", "coverage/frontend")
            if h:
                hrefs["coverage-frontend"] = h
        elif name == "mutation-frontend":
            h = copy_file("mutation.html", "mutation/frontend")
            if h:
                hrefs["mutation-frontend"] = h
        elif name == "nightly-playwright-report":
            h = copy_dir("index.html", "profiling/playwright")
            if h:
                hrefs["playwright"] = h

    return hrefs


def copy_assets(out_dir):
    """Copy the theme tokens, stylesheet, script, and game icons next to index.html."""
    for src_name, dest_name in (("report_portal.themes.css", "themes.css"),
                                ("report_portal.css", "styles.css"),
                                ("report_portal.js", "app.js")):
        src = os.path.join(_ASSET_DIR, src_name)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out_dir, dest_name))
    for icon in _ICONS:
        src = os.path.join(_ICON_DIR, icon)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(out_dir, icon))


# --- Metric readers ---

def allure_totals(summary_path):
    stat = (_read_json(summary_path) or {}).get("statistic") or {}
    if not stat:
        return None
    return {"passed": stat.get("passed", 0),
            "failed": stat.get("failed", 0) + stat.get("broken", 0),
            "total": stat.get("total", 0)}


def frontend_coverage_pct(artifacts_dir):
    data = _read_json(_find_in_artifact(artifacts_dir, "coverage-frontend", "coverage-summary.json"))
    try:
        return float(data["total"]["lines"]["pct"])
    except (TypeError, KeyError, ValueError):
        return None


def go_coverage_pct(artifacts_dir):
    path = _find_in_artifact(artifacts_dir, "coverage-go", "coverage.func.txt")
    if not path:
        return None
    try:
        with open(path) as f:
            text = f.read()
    except OSError:
        return None
    m = re.search(r"(\d+(?:\.\d+)?)%", text)
    return float(m.group(1)) if m else None


def _frontend_mutants(artifacts_dir):
    """(detected, survived) from Stryker mutation.json, efficacy-style (excludes no-coverage)."""
    data = _read_json(_find_in_artifact(artifacts_dir, "mutation-frontend", "mutation.json"))
    if not data:
        return None
    detected = survived = 0
    for file_result in (data.get("files") or {}).values():
        for mutant in file_result.get("mutants") or []:
            status = mutant.get("status")
            if status in ("Killed", "Timeout"):
                detected += 1
            elif status == "Survived":
                survived += 1
    return (detected, survived)


def _go_counts(artifacts_dir, artifact_name):
    """(detected, survived) from a Go go-mutesting report.json, or None."""
    stats = (_read_json(_find_in_artifact(artifacts_dir, artifact_name, "report.json")) or {}).get("stats") or {}
    if not stats:
        return None
    return (stats.get("killedCount", 0) + stats.get("timeOutCount", 0), stats.get("escapedCount", 0))


def _go_package_counts(artifacts_dir):
    """Map each Go package to its summed (detected, survived). Technique shards
    aggregate into one 'techniques' entry; other scopes map by their own name.
    Empty when no Go mutation report is present."""
    packages = {}
    for name in _artifact_names(artifacts_dir):
        if not name.startswith(GO_MUTATION_PREFIX):
            continue
        counts = _go_counts(artifacts_dir, name)
        if not counts:
            continue
        scope = name[len(GO_MUTATION_PREFIX):]
        pkg = "techniques" if scope.startswith("techniques-shard-") else scope
        det, surv = packages.get(pkg, (0, 0))
        packages[pkg] = (det + counts[0], surv + counts[1])
    return packages


def profiling_reports(artifacts_dir):
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
    verdicts = [(r.get("analysis") or {}).get("verdict") for r in reports]
    verdicts = [v for v in verdicts if v in VERDICT_RANK]
    return max(verdicts, key=lambda v: VERDICT_RANK[v]) if verdicts else None


# --- HTML builders ---

def _banner(state, value, kind, msg, links=None):
    links_html = ""
    if links:
        links_html = '<span class="links">' + "".join(
            f'<a href="{_esc(h)}">{_esc(t)} &rarr;</a>' for t, h in links) + "</span>"
    return (f'<div class="banner {state}"><span class="dot"></span>'
            f'<span class="{kind}">{_esc(value)}</span>'
            f'<span class="msg">{_esc(msg)}</span>{links_html}</div>')


def _tile(label, value, sub, state, href):
    cls = f"tile {state}" if state else "tile"
    return (f'<a class="{cls}" href="{_esc(href)}"><span class="k">{_esc(label)}</span>'
            f'<span class="v">{_esc(value)}</span><span class="d">{_esc(sub)}</span></a>')


def _link_tile(label, name, sub, href):
    return (f'<a class="tile link" href="{_esc(href)}"><span class="k">{_esc(label)}</span>'
            f'<span class="name">{_esc(name)}</span><span class="d">{_esc(sub)}</span></a>')


def _tiles(tiles):
    return '    <div class="tiles">\n' + "\n".join("      " + t for t in tiles) + "\n    </div>"


def _section(heading, count, blocks):
    count_html = f'<span class="count">{_esc(count)}</span>' if count else ""
    slug = re.sub(r"[^a-z0-9]+", "-", heading.lower()).strip("-")
    return (f'  <section id="{slug}">\n'
            f'    <div class="h2row"><h2>{_esc(heading)}</h2>{count_html}</div>\n'
            + "\n".join(blocks) + "\n  </section>")


def _meter(label, value, cap, fill_pct, state):
    mcls = f"meter {state}" if state and state != "ok" else "meter"
    return (f'        <div class="meterrow">\n'
            f'          <div class="meterhead"><span class="lbl">{_esc(label)}</span>'
            f'<span class="n">{_esc(value)} <span class="cap">{_esc(cap)}</span></span></div>\n'
            f'          <div class="{mcls}"><i style="width:{fill_pct:.1f}%"></i></div>\n'
            f'        </div>')


def _device_card(report):
    analysis = report.get("analysis") or {}
    name = report.get("deviceLabel") or report.get("device") or "device"
    verdict = analysis.get("verdict") or "?"
    state = VERDICT_STATE.get(verdict, "warn")

    rows = []
    idle = analysis.get("wasmIdlePercentage")
    if isinstance(idle, (int, float)):
        rows.append(_meter("WASM idle", f"{idle:.2f}%", "higher is better",
                           min(100.0, idle), health(idle, IDLE)))
    mem = analysis.get("memoryOverheadMB")
    if isinstance(mem, (int, float)):
        mem_state = "ok" if mem < MEM_WARN_MB else "warn" if mem < MEM_FAIL_MB else "fail"
        rows.append(_meter("Memory overhead", f"{mem:.2f} MB", f"of {MEM_WARN_MB:.0f} MB budget",
                           min(100.0, mem / MEM_WARN_MB * 100.0), mem_state))
    findings = analysis.get("findings") or []
    finding_text = findings[0] if findings else "No regressions"

    return (f'      <div class="pcard {state}">\n'
            f'        <div class="pcard-top"><h3>{_esc(name)}</h3>'
            f'<span class="badge {state}">{_esc(verdict)}</span></div>\n'
            + "\n".join(rows) + "\n"
            f'        <p class="findings"><span class="chk">&check;</span> {_esc(finding_text)}</p>\n'
            f'      </div>')


def build_sections(artifacts_dir, out_dir, allure_rel, hrefs):
    sections = []

    # Test results
    totals = allure_totals(os.path.join(out_dir, allure_rel, "widgets", "summary.json"))
    if totals:
        state = "fail" if totals["failed"] else "ok"
        tile = _tile("Tests", f"{totals['passed']:,}/{totals['total']:,}", "passed · Allure", state, allure_rel)
    else:
        tile = _link_tile("Tests", "Allure report", "unit + Go + E2E + profiling", allure_rel)
    sections.append(_section("Test results", None, [_tiles([tile])]))

    # Coverage
    cov_tiles, cov_vals = [], []
    fe_cov = frontend_coverage_pct(artifacts_dir)
    if fe_cov is not None and "coverage-frontend" in hrefs:
        cov_vals.append(fe_cov)
        cov_tiles.append(_tile("Frontend · Vitest", f"{fe_cov:.1f}%", "lines covered",
                               health(fe_cov, COVERAGE), hrefs["coverage-frontend"]))
    go_cov = go_coverage_pct(artifacts_dir)
    # The Go coverage report is rendered as an istanbul report (matching the
    # frontend's Vitest coverage) by the portal build before this runs.
    go_report_exists = os.path.exists(os.path.join(out_dir, "coverage", "go", "index.html"))
    if go_cov is not None and go_report_exists:
        cov_vals.append(go_cov)
        cov_tiles.append(_tile("Go · go test", f"{go_cov:.1f}%", "lines covered",
                               health(go_cov, COVERAGE), "coverage/go/index.html"))
    if cov_tiles:
        overall = sum(cov_vals) / len(cov_vals)
        blocks = [_banner(health(overall, COVERAGE), f"{overall:.1f}%", "score",
                          "Overall line coverage across the frontend and Go codebases."),
                  _tiles(cov_tiles)]
        sections.append(_section("Coverage", f"{len(cov_tiles)} suites", blocks))

    # Mutation testing
    mut_tiles, all_det, all_surv = [], 0, 0
    fe = _frontend_mutants(artifacts_dir)
    if fe and "mutation-frontend" in hrefs:
        score = _efficacy(*fe)
        if score is not None:
            all_det += fe[0]
            all_surv += fe[1]
            mut_tiles.append(_tile("Frontend · StrykerJS", f"{score:.1f}%", "mutation efficacy",
                                   health(score, MUTATION), hrefs["mutation-frontend"]))
    # The Go mutation report is rendered as one unified mutation-testing-elements
    # dashboard (every package and technique shard, matching the frontend) by the
    # portal build before this runs. The tile's health reflects each package's own
    # floor (dp is stricter at 95%), so one package's breach is not diluted across
    # the thousands of technique mutants in the pooled number.
    go_breach = False
    packages = _go_package_counts(artifacts_dir)
    if packages and os.path.exists(os.path.join(out_dir, "mutation/go/mutation.html")):
        go_det = sum(det for det, _ in packages.values())
        go_surv = sum(surv for _, surv in packages.values())
        score = _efficacy(go_det, go_surv)
        if score is not None:
            all_det += go_det
            all_surv += go_surv
            breaches = []
            for pkg, (det, surv) in sorted(packages.items()):
                eff = _efficacy(det, surv)
                floor = GO_MUTATION_FLOORS.get(pkg, GO_MUTATION_DEFAULT_FLOOR)
                if eff is not None and eff < floor:
                    breaches.append(f"{pkg} {eff:.0f}% < {floor:.0f}%")
            go_breach = bool(breaches)
            sub = "below floor: " + "; ".join(breaches) if breaches else "mutation efficacy"
            mut_tiles.append(_tile("Go · mutation", f"{score:.1f}%", sub,
                                   "fail" if go_breach else "ok", "mutation/go/mutation.html"))
    if mut_tiles:
        overall = _efficacy(all_det, all_surv)
        # A per-package floor breach fails the overall banner too, not just the tile.
        banner_state = "fail" if go_breach else health(overall, MUTATION)
        blocks = [_banner(banner_state, f"{overall:.1f}%", "score",
                          "Overall mutation efficacy, weighted by mutant count across all scopes."),
                  _tiles(mut_tiles)]
        sections.append(_section("Mutation testing", f"{len(mut_tiles)} scopes", blocks))

    # Profiling
    reports = profiling_reports(artifacts_dir)
    if reports:
        verdict = _worst_verdict(reports) or "PASS"
        state = VERDICT_STATE.get(verdict, "warn")
        msg = ("WASM CPU and memory within budget on every profiled device."
               if verdict == "PASS" else "One or more profiled devices need attention.")
        links = [("Playwright run", hrefs["playwright"])] if "playwright" in hrefs else None
        cards = "\n".join(_device_card(r) for r in reports)
        blocks = [_banner(state, verdict, "verdict", msg, links),
                  f'    <div class="devices">\n{cards}\n    </div>']
        sections.append(_section("Profiling", f"{len(reports)} devices", blocks))

    return sections


def render_page(sections):
    body = "\n".join(sections) if sections else "  <p>No reports available yet.</p>"
    return _DOC_HEAD + _LEGEND + "\n" + body + "\n" + _DOC_TAIL


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--artifacts-dir", default="")
    parser.add_argument("--out-dir", required=True)
    parser.add_argument("--allure-rel", default="../test-report/")
    args = parser.parse_args(argv)

    os.makedirs(args.out_dir, exist_ok=True)
    copy_assets(args.out_dir)
    hrefs = collect_reports(args.artifacts_dir, args.out_dir)
    sections = build_sections(args.artifacts_dir, args.out_dir, args.allure_rel, hrefs)
    with open(os.path.join(args.out_dir, "index.html"), "w") as f:
        f.write(render_page(sections))
    print(f"portal: wrote {args.out_dir}/index.html with {len(sections)} section(s)")
    return 0


# --- Static page chrome ---

_LEGEND = (
    '  <div class="legend">\n'
    '    <span><i class="sw ok"></i> meets gate</span>\n'
    '    <span><i class="sw warn"></i> watch</span>\n'
    '    <span><i class="sw fail"></i> below gate</span>\n'
    '    <span><span class="arrow">&rarr;</span> opens a report</span>\n'
    '  </div>')

_DOC_HEAD = (
    '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
    '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    '<title>Sudoku Test Reports</title>\n'
    '<link rel="icon" type="image/svg+xml" href="sudoku-icon.svg">\n'
    '<link rel="stylesheet" href="themes.css">\n'
    '<link rel="stylesheet" href="styles.css">\n'
    '</head>\n<body>\n'
    '<main class="wrap">\n'
    '  <header>\n    <span class="mark" role="img" aria-label="Sudoku"></span>\n'
    '    <div><h1>Sudoku Test Reports</h1>'
    '<p class="sub">Every quality signal for the project, in one place.</p></div>\n'
    '    <span class="grow"></span>\n'
    '    <button class="toggle" id="themeBtn" type="button" aria-label="Toggle theme">◐ Theme</button>\n'
    '  </header>\n')

_DOC_TAIL = (
    '  <footer>Generated by the deploy pipeline.</footer>\n'
    '</main>\n'
    '<script src="app.js"></script>\n'
    '</body>\n</html>\n')


if __name__ == "__main__":
    raise SystemExit(main())
