/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
/* eslint-enable @typescript-eslint/ban-ts-comment */
/**
 * Generation layer: intent tree (IR) -> native OOXML via the `docx` library.
 *
 * Layout vocabulary used (deliberately no floating text boxes):
 *   card    -> single-cell borderless table with shading / left border
 *   kpirow  -> single-row N-column borderless table
 *   code    -> shaded paragraphs with a monospace font
 */
import { Packer } from 'docx'
import {
  addPageBackgroundFloat,
  createDocument,
  partitionIr,
  renderSection,
} from './generate/page-settings'
import { createRenderContext } from './generate/render-context'
import { Generator } from './generate/renderer'

async function generateDocx(ir, images, options = {}) {
  const parts = partitionIr(ir)
  const context = createRenderContext(parts.docSettings, options)
  const generator = new Generator(images, context)
  addPageBackgroundFloat(generator, parts.pageBgNode)
  const rendered = renderSection(generator, parts)
  const document = createDocument(context, parts, rendered, generator)
  return Packer.toBuffer(document)
}

export { generateDocx }
