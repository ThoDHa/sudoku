// Render an lcov file as an istanbul HTML coverage report, the exact reporter
// Vitest uses, so the Go coverage report matches the frontend's exactly.
//
// Usage: node frontend/scripts/lcov-to-istanbul.mjs <lcov> <src-root> <out-dir>
//   <lcov>      path to an lcov .info file (Go coverage via gcov2lcov)
//   <src-root>  directory the lcov SF paths are relative to (repo root)
//   <out-dir>   directory to write the istanbul HTML report into
//
// lcov only carries line hits (DA), which is all Go coverage provides, so each
// covered line becomes one istanbul "statement"; functions/branches are left
// empty. That is enough for the file table and the green/red source view.
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

const require = createRequire(import.meta.url)
const libCoverage = require('istanbul-lib-coverage')
const libReport = require('istanbul-lib-report')
const reports = require('istanbul-reports')

const [, , lcovPath, srcRoot, outDir] = process.argv
if (!lcovPath || !srcRoot || !outDir) {
  console.error('usage: lcov-to-istanbul.mjs <lcov> <src-root> <out-dir>')
  process.exit(2)
}

// gcov2lcov may root SF paths at the repo (api/internal/...) or the module
// (internal/...); try both so the source view resolves either way.
const readSource = (file) => {
  for (const candidate of [path.join(srcRoot, file), path.join(srcRoot, 'api', file)]) {
    try {
      return fs.readFileSync(candidate, 'utf8')
    } catch {
      /* try next */
    }
  }
  return null
}

const data = {}
for (const record of fs.readFileSync(lcovPath, 'utf8').split(/^end_of_record$/m)) {
  const sf = record.match(/^SF:(.+)$/m)
  if (!sf) continue
  const file = sf[1].trim()
  const lines = (readSource(file) || '').split('\n')
  const fc = { path: file, statementMap: {}, fnMap: {}, branchMap: {}, s: {}, f: {}, b: {} }
  let i = 0
  for (const m of record.matchAll(/^DA:(\d+),(\d+)/gm)) {
    const line = Number(m[1])
    const src = lines[line - 1] || ''
    const startCol = src.search(/\S/)
    fc.statementMap[i] = {
      start: { line, column: startCol >= 0 ? startCol : 0 },
      end: { line, column: src.length || 1 },
    }
    fc.s[i] = Number(m[2])
    i++
  }
  if (i > 0) data[file] = fc
}

const coverageMap = libCoverage.createCoverageMap(data)
const context = libReport.createContext({
  dir: outDir,
  coverageMap,
  sourceFinder: (file) => readSource(file) ?? '',
})
reports.create('html', {}).execute(context)
console.log(`lcov-to-istanbul: wrote ${Object.keys(data).length} file(s) to ${outDir}`)
