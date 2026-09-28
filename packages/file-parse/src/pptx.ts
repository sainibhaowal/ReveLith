import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'

// Text fidelity: no trim (xml:space="preserve" runs carry the spaces between words),
// no numeric coercion of tag values (otherwise <a:t>02139</a:t> becomes a number and loses characters).
// preserveOrder keeps <a:br> and <a:fld> in sequence with the <a:r> runs around them; grouped by
// tag name they lose that position, and a deck's soft breaks and field text land in the wrong place.
const parser = new XMLParser({
  ignoreAttributes: true,
  trimValues: false,
  parseTagValue: false,
  preserveOrder: true,
})

function slideNumber(path: string): number {
  const m = /slide(\d+)\.xml$/.exec(path)
  return m ? Number(m[1]) : 0
}

/**
 * One paragraph's text in document order. Only #text directly under a:t counts: untrimmed, the
 * whitespace laying out any other element is a value too. <a:br> is a soft line break, and
 * <a:fld> (slide number, date) contributes its own a:t where it sits.
 */
function collectText(nodes: readonly unknown[], out: string[], isText = false): void {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (key === '#text') {
        if (isText) out.push(String(value))
      } else if (key === 'a:br') {
        out.push('\n')
      } else if (Array.isArray(value)) {
        collectText(value, out, key === 'a:t')
      }
    }
  }
}

/** walk the slide tree; each a:p paragraph becomes one output entry (a:br splits it further) */
function collectParagraphs(nodes: readonly unknown[], out: string[]): void {
  for (const node of nodes) {
    if (node == null || typeof node !== 'object') continue
    for (const [key, value] of Object.entries(node)) {
      if (!Array.isArray(value)) continue
      if (key === 'a:p') {
        const texts: string[] = []
        collectText(value, texts)
        const line = texts.join('')
        if (line.trim()) out.push(line)
      } else {
        collectParagraphs(value, out)
      }
    }
  }
}

/** extract slide text from a pptx: one "## Slide N" section per slide, a line per paragraph in presentation order */
export async function pptxToText(bytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(bytes)
  let slidePaths: string[] = []
  const presFile = zip.file('ppt/presentation.xml')
  const relsFile = zip.file('ppt/_rels/presentation.xml.rels')
  if (presFile && relsFile) {
    try {
      const presXml = await presFile.async('text')
      const relsXml = await relsFile.async('text')
      const relsMap = new Map<string, string>()
      const relRe =
        /<Relationship\b[^>]*\bId=(?:"([^"]*)"|'([^']*)')[^>]*\bTarget=(?:"([^"]*)"|'([^']*)')/g
      let m: RegExpExecArray | null
      while ((m = relRe.exec(relsXml)) !== null) {
        const id = m[1] ?? m[2]
        const target = m[3] ?? m[4]
        if (id && target) relsMap.set(id, target)
      }
      const sldIdRe = /<p:sldId\b[^>]*\br:id=(?:"([^"]*)"|'([^']*)')/g
      while ((m = sldIdRe.exec(presXml)) !== null) {
        const rId = m[1] ?? m[2]
        if (rId && relsMap.has(rId)) {
          let target = relsMap.get(rId)!
          if (!target.startsWith('ppt/')) {
            target = target.startsWith('slides/') ? `ppt/${target}` : `ppt/slides/${target}`
          }
          if (zip.file(target)) {
            slidePaths.push(target)
          }
        }
      }
    } catch {
      // Fallback
    }
  }

  if (slidePaths.length === 0) {
    slidePaths = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => slideNumber(a) - slideNumber(b))
  }

  const sections: string[] = []
  for (let i = 0; i < slidePaths.length; i++) {
    const path = slidePaths[i]
    const file = zip.file(path)
    if (!file) continue
    const xml = await file.async('text')
    const paras: string[] = []
    collectParagraphs(parser.parse(xml), paras)
    const num = slideNumber(path) || i + 1
    sections.push([`## Slide ${num}`, ...paras].join('\n'))
  }
  return sections.join('\n\n')
}
