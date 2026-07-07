// Render go-mutesting report.json files as a Stryker-style mutation report, the
// exact interactive dashboard (mutation-testing-elements) StrykerJS produces for
// the frontend, so the Go mutation report matches the frontend's exactly.
//
// Usage: node frontend/scripts/go-mutesting-to-stryker.mjs <out-html> <report.json...>
//   <out-html>       path to write the standalone mutation.html to
//   <report.json...> one or more go-mutesting report.json files (dp, human,
//                    transport-http, techniques shards); merged into one report
//
// go-mutesting gives, per mutant, the full original and mutated source plus a
// unified diff, but not Stryker's structured location/replacement. We recover
// those by diffing the two sources: go-mutesting reprints mutated files and can
// shift indentation of untouched lines, so the diff is trim-aware (a line that
// differs only in leading/trailing whitespace is reformatting noise, not the
// mutant) to pin the real change.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)

// mutation-testing-elements ships a self-registering browser bundle that Stryker
// inlines verbatim; resolve it from the installed package so hoisting can't break it.
const ELEMENTS_BUNDLE = require.resolve('mutation-testing-elements/dist/mutation-test-elements.js')

// Stryker high/low colour thresholds, matching the portal's mutation gate.
const THRESHOLDS = { high: 90, low: 80 }

// go-mutesting groups mutants by outcome array; map each to a Stryker status.
// killed/timeout count as detected, escaped as survived; errored mutants failed
// to compile or run and are shown but excluded from the score, like Stryker's own.
const STATUS_BY_ARRAY = {
  killed: 'Killed',
  timeouted: 'Timeout',
  escaped: 'Survived',
  errored: 'CompileError',
}

const firstNonWs = (line) => {
  const i = line.search(/\S/)
  return i >= 0 ? i : 0
}

// Recover a Stryker location + replacement from the original and mutated source
// of one mutant. Returns { location, replacement }.
function locate(original, mutated) {
  const O = original.split('\n')
  const M = mutated.split('\n')

  // Trim-aware front/back trimming isolates the changed region, skipping lines
  // that differ only in indentation (go-mutesting reformatting noise).
  const min = Math.min(O.length, M.length)
  let lo = 0
  while (lo < min && O[lo].trim() === M[lo].trim()) lo++
  let ho = O.length - 1
  let hm = M.length - 1
  while (ho >= lo && hm >= lo && O[ho].trim() === M[hm].trim()) { ho--; hm-- }

  // No content difference found (pure whitespace change or identical): fall back
  // to highlighting the first line so the mutant still lands somewhere sensible.
  if (lo >= O.length && lo >= M.length) {
    return { location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } }, replacement: '' }
  }

  // Single changed line on both sides: pin the exact changed span by stripping
  // the common prefix and suffix, so the highlight sits on the mutated token.
  if (ho === lo && hm === lo) {
    const a = O[lo]
    const b = M[lo]
    let p = 0
    while (p < a.length && p < b.length && a[p] === b[p]) p++
    let sa = a.length
    let sb = b.length
    while (sa > p && sb > p && a[sa - 1] === b[sb - 1]) { sa--; sb-- }
    return {
      location: { start: { line: lo + 1, column: p + 1 }, end: { line: lo + 1, column: sa + 1 } },
      replacement: b.slice(p, sb),
    }
  }

  // Multi-line change, insertion, or deletion: highlight the whole original
  // region (or a zero-width point for a pure insertion) and carry the mutated
  // lines as the replacement.
  const start = { line: lo + 1, column: firstNonWs((O[lo] ?? M[lo]) || '') + 1 }
  const end = ho >= lo
    ? { line: ho + 1, column: (O[ho]?.length ?? 0) + 1 }
    : { ...start }
  const replacement = hm >= lo ? M.slice(lo, hm + 1).join('\n') : ''
  return { location: { start, end }, replacement }
}

// Merge every mutant from one go-mutesting report into the shared files map.
function addReport(files, report, nextId) {
  for (const [arrayName, status] of Object.entries(STATUS_BY_ARRAY)) {
    for (const entry of report[arrayName] || []) {
      const mutator = entry.mutator || {}
      const filePath = mutator.originalFilePath
      const source = mutator.originalSourceCode
      if (!filePath || typeof source !== 'string') continue

      let file = files.get(filePath)
      if (!file) {
        file = { language: 'go', source, mutants: [] }
        files.set(filePath, file)
      }

      const { location, replacement } = locate(source, mutator.mutatedSourceCode ?? source)
      file.mutants.push({
        id: String(nextId()),
        mutatorName: mutator.mutatorName || 'Mutator',
        replacement,
        status,
        location,
      })
    }
  }
}

function buildReport(reportPaths) {
  const files = new Map()
  let id = 0
  const nextId = () => ++id
  let loaded = 0
  for (const p of reportPaths) {
    let report
    try {
      report = JSON.parse(fs.readFileSync(p, 'utf8'))
    } catch (err) {
      console.error(`go-mutesting-to-stryker: skipping ${p}: ${err.message}`)
      continue
    }
    addReport(files, report, nextId)
    loaded++
  }
  return {
    report: {
      schemaVersion: '1',
      thresholds: THRESHOLDS,
      files: Object.fromEntries([...files.entries()].sort(([a], [b]) => a.localeCompare(b))),
    },
    loaded,
    mutantCount: id,
  }
}

function renderHtml(report) {
  const bundle = fs.readFileSync(ELEMENTS_BUNDLE, 'utf8')
  // Match Stryker's own template: inline the self-registering bundle, then bind
  // the report to the <mutation-test-report-app> element and wire the theme.
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Sudoku Go Mutation Report</title>
<script>${bundle}</script>
</head>
<body>
<mutation-test-report-app titlePostfix="go-mutesting">
Your browser doesn't support <a href="https://caniuse.com/#search=custom%20elements">custom elements</a>.
Please use a latest version of an evergreen browser (Firefox, Chrome, Safari, Opera, Edge, etc).
</mutation-test-report-app>
<script>
const app = document.querySelector('mutation-test-report-app');
app.report = ${JSON.stringify(report)};
function updateTheme() { document.body.style.backgroundColor = app.themeBackgroundColor; }
app.addEventListener('theme-changed', updateTheme);
updateTheme();
</script>
</body>
</html>
`
}

function main(argv) {
  const [outHtml, ...reportPaths] = argv
  if (!outHtml || reportPaths.length === 0) {
    console.error('usage: go-mutesting-to-stryker.mjs <out-html> <report.json...>')
    return 2
  }
  const { report, loaded, mutantCount } = buildReport(reportPaths)
  if (loaded === 0) {
    console.error('go-mutesting-to-stryker: no readable reports; nothing written')
    return 1
  }
  fs.mkdirSync(path.dirname(outHtml), { recursive: true })
  fs.writeFileSync(outHtml, renderHtml(report))
  const fileCount = Object.keys(report.files).length
  console.log(`go-mutesting-to-stryker: wrote ${outHtml} (${fileCount} file(s), ${mutantCount} mutant(s) from ${loaded} report(s))`)
  return 0
}

// Exported for tests; run as a CLI otherwise.
export { locate, buildReport }

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main(process.argv.slice(2)))
}
