import { describe, expect, it } from 'vitest'
import {
  estimatePasteCells,
  translatePastedFormula,
  translatePastedRange,
} from '@revelith/xlsx-gateway/domain/paste-formulas'

describe('translatePastedFormula', () => {
  it('shifts relative refs by the delta', () => {
    expect(translatePastedFormula('=B2+C3', { dRow: 2, dCol: 1 }).formula).toBe('=C4+D5')
  })

  it('honors $ locks per axis', () => {
    // D3+$A$1+B$2+$C4 pasted +(2 rows, 1 col)
    expect(translatePastedFormula('=D3+$A$1+B$2+$C4', { dRow: 2, dCol: 1 }).formula).toBe(
      '=E5+$A$1+C$2+$C6',
    )
  })

  it('shifts ranges endpoint-wise', () => {
    expect(translatePastedFormula('=SUM(B2:D4)', { dRow: 1, dCol: -1 }).formula).toBe('=SUM(A3:C5)')
  })

  it('shifts whole-column and whole-row refs', () => {
    expect(translatePastedFormula('=SUM(B:D)', { dRow: 0, dCol: 2 }).formula).toBe('=SUM(D:F)')
    expect(translatePastedFormula('=SUM($B:D)', { dRow: 0, dCol: 2 }).formula).toBe('=SUM($B:F)')
    expect(translatePastedFormula('=SUM(3:5)', { dRow: -1, dCol: 0 }).formula).toBe('=SUM(2:4)')
  })

  it('emits #REF! for off-sheet targets', () => {
    const r = translatePastedFormula('=A1', { dRow: -1, dCol: 0 })
    expect(r.formula).toBe('=#REF!')
    expect(r.hasRefError).toBe(true)
    expect(r.changed).toBe(true)
  })

  it('keeps other-sheet prefixes untouched, shifts source-sheet refs', () => {
    expect(
      translatePastedFormula('=Sheet2!B2+C3', { dRow: 1, dCol: 1 }, { sourceSheet: 'Sheet1' })
        .formula,
    ).toBe('=Sheet2!B2+D4')
    expect(
      translatePastedFormula('=Sheet1!B2', { dRow: 1, dCol: 1 }, { sourceSheet: 'Sheet1' }).formula,
    ).toBe('=Sheet1!C3')
  })

  it('skips string literals and protects function names', () => {
    expect(translatePastedFormula('="A1"&LOG10(B2)', { dRow: 1, dCol: 1 }).formula).toBe(
      '="A1"&LOG10(C3)',
    )
  })

  it('leaves non-formula text alone', () => {
    const r = translatePastedFormula('hello', { dRow: 5, dCol: 5 })
    expect(r.formula).toBe('hello')
    expect(r.changed).toBe(false)
  })
})

describe('translatePastedRange', () => {
  it('translates a flat block and counts changes', () => {
    const r = translatePastedRange(['=A1', 'plain', '=$A$1'], { dRow: 1, dCol: 1 })
    expect(r.formulas).toEqual(['=B2', 'plain', '=$A$1'])
    expect(r.changedCount).toBe(1)
    expect(r.refErrorCount).toBe(0)
  })

  it('handles a million-cell block within budget', () => {
    const formulas = new Array<string>(1_000_000).fill('=SUM($A$1:B2)+C$3')
    const start = Date.now()
    const r = translatePastedRange(formulas, { dRow: 10, dCol: 5 })
    const elapsed = Date.now() - start
    expect(r.formulas).toHaveLength(1_000_000)
    expect(r.formulas[0]).toBe('=SUM($A$1:G12)+H$3')
    expect(r.changedCount).toBe(1_000_000)
    expect(elapsed).toBeLessThan(15000)
  })
})

describe('estimatePasteCells', () => {
  it('counts rows x max columns, ignoring the trailing newline', () => {
    expect(estimatePasteCells('a\tb\nc\td\n')).toBe(4)
    expect(estimatePasteCells('a\nb\nc')).toBe(3)
    expect(estimatePasteCells('')).toBe(0)
  })
})
