// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { locate, buildReport, renderHtml } from './go-mutesting-to-stryker.mjs'

describe('locate', () => {
  it('pins the exact changed token on a single-line change', () => {
    const orig = ['a', '\tx := p+q', 'b'].join('\n')
    const mut = ['a', '\tx := p-q', 'b'].join('\n')
    expect(locate(orig, mut)).toEqual({
      location: { start: { line: 2, column: 8 }, end: { line: 2, column: 9 } },
      replacement: '-',
    })
  })

  it('ignores reindentation noise and finds the real change', () => {
    // go-mutesting reprints the file and can shift indentation of untouched
    // lines; only the operator on line 2 is the actual mutant.
    const orig = ['func f() {', '\tx := a+b', '\tif y {', '\t\tz()', '\t}', '}'].join('\n')
    const mut = ['func f() {', '\tx := a-b', '\t\tif y {', '\t\t\tz()', '\t\t}', '}'].join('\n')
    const { location, replacement } = locate(orig, mut)
    expect(location.start.line).toBe(2)
    expect(location.end.line).toBe(2)
    expect(replacement).toBe('-')
  })

  it('spans multiple original lines for a block deletion', () => {
    const orig = ['if c {', '\tfoo()', '\tbar()', '}'].join('\n')
    const mut = ['if c {', '}'].join('\n')
    const { location, replacement } = locate(orig, mut)
    expect(location.start.line).toBe(2)
    expect(location.end.line).toBe(3)
    expect(replacement).toBe('')
  })

  it('marks a zero-width point for a pure insertion', () => {
    const orig = ['a', 'b'].join('\n')
    const mut = ['a', 'INSERTED', 'b'].join('\n')
    expect(locate(orig, mut)).toEqual({
      location: { start: { line: 2, column: 1 }, end: { line: 2, column: 1 } },
      replacement: 'INSERTED',
    })
  })

  it('falls back to line 1 when source and mutant are identical', () => {
    expect(locate('a\nb', 'a\nb')).toEqual({
      location: { start: { line: 1, column: 1 }, end: { line: 1, column: 1 } },
      replacement: '',
    })
  })

  it('accepts a pre-split source array (per-file caching)', () => {
    expect(locate(['a', 'x+y', 'b'], 'a\nx-y\nb').replacement).toBe('-')
  })
})

describe('buildReport', () => {
  it('merges go-mutesting reports into a deduped Stryker schema', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomut-'))
    const reportPath = path.join(dir, 'report.json')
    fs.writeFileSync(reportPath, JSON.stringify({
      killed: [{ mutator: { mutatorName: 'm1', originalFilePath: 'f/a.go', originalSourceCode: 'x+y', mutatedSourceCode: 'x-y' } }],
      escaped: [
        { mutator: { mutatorName: 'm2', originalFilePath: 'f/a.go', originalSourceCode: 'x+y', mutatedSourceCode: 'x*y' } },
        { mutator: { mutatorName: 'm3', originalFilePath: 'f/b.go', originalSourceCode: 'a', mutatedSourceCode: 'b' } },
      ],
      // Missing originalFilePath: skipped, not crashed on.
      timeouted: [{ mutator: { mutatorName: 'm4', originalSourceCode: 'q', mutatedSourceCode: 'r' } }],
      errored: [{ mutator: { mutatorName: 'm5', originalFilePath: 'f/b.go', originalSourceCode: 'a', mutatedSourceCode: 'c' } }],
    }))

    const { report, loaded, mutantCount } = buildReport([reportPath])

    expect(loaded).toBe(1)
    expect(mutantCount).toBe(4)
    expect(report.schemaVersion).toBe('1')
    expect(Object.keys(report.files)).toEqual(['f/a.go', 'f/b.go'])

    const a = report.files['f/a.go']
    expect(a.language).toBe('go')
    expect(a.source).toBe('x+y') // one deduped source for both of its mutants
    expect(a.mutants.map((m) => m.status)).toEqual(['Killed', 'Survived'])
    // escaped -> Survived, errored -> CompileError (excluded from efficacy).
    expect(report.files['f/b.go'].mutants.map((m) => m.status)).toEqual(['Survived', 'CompileError'])

    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('skips unreadable report paths without counting them', () => {
    const { loaded, mutantCount } = buildReport(['/no/such/report.json'])
    expect(loaded).toBe(0)
    expect(mutantCount).toBe(0)
  })
})

describe('renderHtml', () => {
  const reportWith = (source, replacement) => ({
    schemaVersion: '1', thresholds: { high: 90, low: 80 },
    files: { 'x.go': { language: 'go', source, mutants: [
      { id: '1', mutatorName: 'm', replacement, status: 'Killed',
        location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } }] } },
  })

  it('escapes </script> so source text cannot break out of the inlined script', () => {
    const html = renderHtml(reportWith('// </script><img src=x onerror=alert(1)>', '</script>'))
    // Only our own two <script> blocks close; none injected from the data.
    expect((html.match(/<\/script>/g) || []).length).toBe(2)
    expect(html).not.toContain('</script><img src=x onerror=alert(1)>')
    expect(html).toContain('\\u003c/script>')
  })

  it('escapes U+2028/U+2029 line separators (valid JSON, invalid JS string)', () => {
    const html = renderHtml(reportWith('a' + String.fromCharCode(0x2028) + 'b', 'x'))
    expect(html).not.toContain(String.fromCharCode(0x2028))
    expect(html).toContain('\\u2028')
  })
})
