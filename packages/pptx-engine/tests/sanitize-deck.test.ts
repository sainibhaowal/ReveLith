import { describe, expect, it } from 'vitest'
import { sanitizeDeckForPowerPoint } from '../src/index.js'

describe('sanitizeDeckForPowerPoint', () => {
  it('de-duplicates relationship ids', () => {
    const slides = new Map([
      ['ppt/slides/slide1.xml', '<p:sld><a:p><a:r><a:t>Hi</a:t></a:r></a:p></p:sld>'],
    ])
    const rels = new Map([
      [
        'ppt/slides/_rels/slide1.xml.rels',
        '<R><Relationship Id="rId1"/><Relationship Id="rId1"/></R>',
      ],
    ])
    const res = sanitizeDeckForPowerPoint(slides, rels)
    expect(res.fixed).toBeGreaterThan(0)
    expect(rels.get('ppt/slides/_rels/slide1.xml.rels')).toContain('rId1_fix1')
  })
})
