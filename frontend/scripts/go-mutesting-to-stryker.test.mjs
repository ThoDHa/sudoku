import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { locate, buildReport } from './go-mutesting-to-stryker.mjs'

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
    }))

    const { report, loaded, mutantCount } = buildReport([reportPath])

    expect(loaded).toBe(1)
    expect(mutantCount).toBe(3)
    expect(report.schemaVersion).toBe('1')
    expect(Object.keys(report.files)).toEqual(['f/a.go', 'f/b.go'])

    const a = report.files['f/a.go']
    expect(a.language).toBe('go')
    expect(a.source).toBe('x+y') // one deduped source for both of its mutants
    expect(a.mutants.map((m) => m.status)).toEqual(['Killed', 'Survived'])
    expect(report.files['f/b.go'].mutants[0].status).toBe('Survived')

    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('skips unreadable report paths without counting them', () => {
    const { loaded, mutantCount } = buildReport(['/no/such/report.json'])
    expect(loaded).toBe(0)
    expect(mutantCount).toBe(0)
  })
})
