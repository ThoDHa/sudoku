#!/usr/bin/env python3
"""Generate the unified test-report portal page for GitHub Pages.

The deploy workflow publishes the Allure report to /test-report/ and the app to
the Pages root. Other reports (frontend StrykerJS and Go go-mutesting mutation,
and the Playwright profiling report) are produced by separate nightly workflows
and live in their artifacts. This script takes those fetched artifacts, copies
each report into the Pages `reports/` tree, and writes a `reports/index.html`
portal linking to Allure plus every report that is actually present.

It is deliberately best-effort and degrades gracefully: a missing artifacts
directory or a missing report simply omits that link, so a nightly run that has
not happened yet (or a failed job) never breaks the deploy or produces dead
links.

Usage:
    gen_report_portal.py --artifacts-dir <dir> --out-dir <pages-artifact/reports> \
        [--allure-rel ../test-report/]
"""

import argparse
import html
import os
import shutil

# Report collectors. Each rule matches a fetched artifact directory by its name
# (exact or prefix), finds the report's entry HTML inside it, and copies either
# that single self-contained file or the whole directory containing it.
#   section:  portal heading to group the link under
#   find:     entry HTML filename to locate within the artifact
#   copy:     "file" (self-contained HTML) or "dir" (report folder with assets)
#   dest:     subpath under the out dir; for prefix rules, {} is the name suffix
#   label:    link text; for prefix rules, {} is the name suffix
COLLECTORS = [
    {"match": "mutation-frontend", "prefix": False, "find": "mutation.html",
     "copy": "file", "section": "Mutation testing", "dest": "mutation/frontend",
     "label": "Frontend (StrykerJS)"},
    {"match": "mutation-go-", "prefix": True, "find": "go-mutesting-report.html",
     "copy": "file", "section": "Mutation testing", "dest": "mutation/{}",
     "label": "Go: {} (go-mutesting)"},
    {"match": "nightly-playwright-report", "prefix": False, "find": "index.html",
     "copy": "dir", "section": "Profiling", "dest": "profiling/playwright",
     "label": "Profiling (Playwright report)"},
    {"match": "coverage-frontend", "prefix": False, "find": "index.html",
     "copy": "dir", "section": "Coverage", "dest": "coverage/frontend",
     "label": "Frontend (Vitest)"},
    {"match": "coverage-go", "prefix": False, "find": "coverage.html",
     "copy": "file", "section": "Coverage", "dest": "coverage/go",
     "label": "Go (go tool cover)"},
]

# Portal section order.
SECTIONS = ["Test results", "Coverage", "Mutation testing", "Profiling"]


def find_file(root, filename):
    """Return the first path to `filename` anywhere under root, or None."""
    for dirpath, _dirs, files in os.walk(root):
        if filename in files:
            return os.path.join(dirpath, filename)
    return None


def collect_reports(artifacts_dir, out_dir):
    """Copy each found report into out_dir; return {section: [(label, href)]}."""
    found = {}
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
            found.setdefault(rule["section"], []).append((label, href))
            break

    return found


def render_page(sections):
    """sections: list of (heading, [(label, href)]). Returns the portal HTML."""
    items = []
    for heading, entries in sections:
        if not entries:
            continue
        rows = "\n".join(
            f'      <li><a href="{html.escape(href)}">{html.escape(label)}</a></li>'
            for label, href in entries
        )
        items.append(f"    <section>\n      <h2>{html.escape(heading)}</h2>\n"
                     f"      <ul>\n{rows}\n      </ul>\n    </section>")
    body = "\n".join(items) if items else "    <p>No reports available yet.</p>"
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
  </style>
</head>
<body>
  <h1>Sudoku Test Reports</h1>
  <p class="sub">One place for every quality report in the project.</p>
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
    found = collect_reports(args.artifacts_dir, args.out_dir)
    found.setdefault("Test results", []).insert(
        0, ("Allure (all tests: unit + Go + E2E + profiling)", args.allure_rel))

    ordered = [(section, found.get(section, [])) for section in SECTIONS]
    with open(os.path.join(args.out_dir, "index.html"), "w") as f:
        f.write(render_page(ordered))

    total = sum(len(v) for k, v in found.items() if k != "Test results")
    print(f"portal: wrote {args.out_dir}/index.html with {total} nightly report(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
