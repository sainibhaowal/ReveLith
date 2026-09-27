import { describe, it, expect } from 'vitest'
import type { Paragraph, TableElement, TextBody } from '@revelith/pptx-engine'
import { layoutText } from '../src/text-layout'
import { buildTable } from '../src/build-slide'
import { HeuristicMetrics } from '../src/metrics'
import { makeViewport } from '../src/coords'

/**
 * Explicit RTL layout: <a:pPr rtl> paragraphs mirror geometry (marL/indent
 * from the right edge, bullets on the right) and default to right alignment;
 * RTL tables mirror column order with right-aligned cell defaults.
 */

const vp = makeViewport({ cx: 12192000, cy: 6858000 }, 1280)
const metrics = new HeuristicMetrics()

function body(paragraphs: Paragraph[]): TextBody {
  return { paragraphs }
}

function layoutPara(p: Paragraph, width = 400) {
  return layoutText({ body: body([p]), boxWidthPx: width, boxHeightPx: 200, metrics, vp })
}

const rightEdge = (runs: Array<{ x: number; widthPx: number }>) =>
  Math.max(...runs.map((r) => r.x + r.widthPx))

describe('explicit paragraph rtl', () => {
  it('right-aligns Latin-only text by default (explicit flag, not inference)', () => {
    const laid = layoutPara({ runs: [{ text: 'hello world' }], rtl: true })
    const line = laid.lines[0]!
    // content width is 400 minus default insets; the line must hug the right edge
    expect(rightEdge(line.runs)).toBeGreaterThan(300)
    expect(line.runs[0]!.x).toBeGreaterThan(50)
  })

  it('leaves LTR layout untouched without the flag', () => {
    const laid = layoutPara({ runs: [{ text: 'hello world' }] })
    expect(laid.lines[0]!.runs[0]!.x).toBe(0)
  })

  it('mirrors bullet + hanging indent to the right edge', () => {
    const rtl = layoutPara({
      runs: [{ text: 'item one' }],
      rtl: true,
      bullet: { type: 'char', char: '•' },
      marL: 228600,
      indent: -228600,
    })
    const line = rtl.lines[0]!
    const bullet = line.runs.find((r) => r.isBullet)!
    expect(bullet).toBeDefined()
    // bullet sits at the right side, body text ends at the right margin
    expect(bullet.x).toBeGreaterThan(200)
    expect(rightEdge(line.runs)).toBeGreaterThan(300)
  })

  it('keeps an explicit left alignment in the mirrored frame', () => {
    const laid = layoutPara({ runs: [{ text: 'hi' }], rtl: true, align: 'left' })
    // explicit left in an RTL paragraph = text at the left edge
    expect(laid.lines[0]!.runs[0]!.x).toBeLessThan(50)
  })
})

function tableEl(rtl: boolean | undefined): TableElement {
  const cell = (text: string) => ({
    text: {
      paragraphs: [{ runs: [{ text }] }],
      insets: { l: 91440, t: 45720, r: 91440, b: 45720 },
    },
  })
  return {
    id: 't1',
    type: 'table',
    anchor: { originalXml: '' },
    transform: { x: 0, y: 0, cx: 100, cy: 100, rotationDeg: 0, flipH: false, flipV: false },
    colWidths: [2000000, 1000000],
    rowHeights: [500000],
    rows: [[cell('a'), cell('b')]],
    ...(rtl ? { rtl: true } : {}),
  } as unknown as TableElement
}

const tableBox = {
  x: 0,
  y: 0,
  w: 300,
  h: 100,
  centerX: 150,
  centerY: 50,
  rotationDeg: 0,
  flipH: false,
  flipV: false,
}

describe('RTL table mirroring', () => {
  it('keeps LTR column order without the flag', () => {
    const node = buildTable(tableEl(false), tableBox, vp, metrics, undefined)
    expect(node.cells[0]!.x).toBe(0)
    expect(node.cells[1]!.x).toBeGreaterThan(node.cells[0]!.x)
    expect(node.gridX[node.gridX.length - 1]).toBeCloseTo(300, 0)
  })

  it('renders column 0 on the far right when rtl', () => {
    const node = buildTable(tableEl(true), tableBox, vp, metrics, undefined)
    // wide column (2/3) first in data order lands on the right
    expect(node.cells[0]!.x).toBeGreaterThan(node.cells[1]!.x)
    expect(node.cells[0]!.x + node.cells[0]!.w).toBeCloseTo(300, 0)
    expect(node.cells[1]!.x).toBeCloseTo(0, 0)
    // widths preserved, grid stays ascending for editing overlays
    expect(node.cells[0]!.w).toBeCloseTo(200, 0)
    expect(node.cells[1]!.w).toBeCloseTo(100, 0)
    const grid = node.gridX
    expect(grid[0]).toBeCloseTo(0, 0)
    expect(grid[grid.length - 1]).toBeCloseTo(300, 0)
    for (let i = 1; i < grid.length; i++) expect(grid[i]!).toBeGreaterThan(grid[i - 1]!)
  })

  it('defaults cell text to right alignment in RTL tables', () => {
    const node = buildTable(tableEl(true), tableBox, vp, metrics, undefined)
    const text = node.cells[0]!.text!
    const line = text.lines[0]!
    const w = node.cells[0]!.w
    expect(rightEdge(line.runs)).toBeGreaterThan(w - 60)
  })
})
