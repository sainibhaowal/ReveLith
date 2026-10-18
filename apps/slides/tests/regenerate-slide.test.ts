/** Skill-layer behavior of the regenerate_slide (redo one page in place) tool. */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSlidesSkill, type DeckAccess } from '../src/renderer/ai/slides-skill'
import type { RenderSlide } from '@revelith/pptx-render'
import type { AgentToolCall } from '../src/shared/ipc'

const page = { widthPx: 1280, heightPx: 720, nodes: [] } as unknown as RenderSlide
const marker = 'generatedpptx:/tmp/p.pptx'

function mkAccess(
  slides: RenderSlide[],
  overrides: Partial<DeckAccess> = {},
): DeckAccess & { applyDeck: ReturnType<typeof vi.fn> } {
  const applyDeck = vi.fn()
  return {
    getSlides: () => slides,
    getCurrent: () => 0,
    getSelectedIds: () => [],
    applySlide: () => {},
    applyDeck,
    fitWidthPx: 1280,
    ...overrides,
  } as unknown as DeckAccess & { applyDeck: ReturnType<typeof vi.fn> }
}

const call = (name: string, input: Record<string, unknown>): AgentToolCall => ({
  id: 't',
  name,
  input,
})

beforeEach(() => {
  ;(window as any).slidesApi = { deleteSlide: vi.fn(async () => [page, page]) }
})

describe('regenerate_slide', () => {
  it('generates a page with the configured provider and lands its marker', async () => {
    const regenerateSlide = vi.fn(async () => ({ ok: true }))
    const generatePageLocal = vi.fn(async () => ({ ok: true, marker }))
    const skill = createSlidesSkill(
      mkAccess([page, page], { regenerateSlide, generatePageLocal, retryBackoffMs: 0 }),
    )
    const r = await skill.executeTool!(
      call('regenerate_slide', {
        slideIndex: 1,
        brief: 'Redo as three-column cards, keep the title "NEW"',
      }),
    )
    expect(r.isError).toBeUndefined()
    expect(r.mutated).toBe(true)
    expect(generatePageLocal).toHaveBeenCalledOnce()
    expect(regenerateSlide).toHaveBeenCalledWith(1, marker)
    expect(r.output).toContain('page 2')
  })

  it('slideIndex out of range errors without invoking the pipeline', async () => {
    const regenerateSlide = vi.fn(async () => ({ ok: true }))
    const generatePageLocal = vi.fn(async () => ({ ok: true, marker }))
    const skill = createSlidesSkill(
      mkAccess([page], { regenerateSlide, generatePageLocal, retryBackoffMs: 0 }),
    )
    const r = await skill.executeTool!(call('regenerate_slide', { slideIndex: 3, brief: 'x' }))
    expect(r.isError).toBe(true)
    expect(generatePageLocal).not.toHaveBeenCalled()
    expect(regenerateSlide).not.toHaveBeenCalled()
  })

  it('requires a non-empty brief and a local generation pipeline', async () => {
    const noPipeline = createSlidesSkill(
      mkAccess([page], { regenerateSlide: vi.fn(async () => ({ ok: true })) }),
    )
    const missingPipeline = await noPipeline.executeTool!(
      call('regenerate_slide', { slideIndex: 0, brief: 'redo' }),
    )
    expect(missingPipeline.isError).toBe(true)

    const emptyBrief = createSlidesSkill(
      mkAccess([page], {
        regenerateSlide: vi.fn(async () => ({ ok: true })),
        generatePageLocal: vi.fn(async () => ({ ok: true, marker })),
      }),
    )
    const empty = await emptyBrief.executeTool!(
      call('regenerate_slide', { slideIndex: 0, brief: '' }),
    )
    expect(empty.isError).toBe(true)
  })

  it('retries local generation once and leaves the slide untouched when both attempts fail', async () => {
    const generatePageLocal = vi.fn(async () => ({ ok: false, error: 'spec rejected' }))
    const regenerateSlide = vi.fn(async () => ({ ok: true }))
    const skill = createSlidesSkill(
      mkAccess([page], { regenerateSlide, generatePageLocal, retryBackoffMs: 0 }),
    )
    const r = await skill.executeTool!(call('regenerate_slide', { slideIndex: 0, brief: 'x' }))
    expect(r.isError).toBe(true)
    expect(r.output).toContain('spec rejected')
    expect(generatePageLocal).toHaveBeenCalledTimes(2)
    expect(regenerateSlide).not.toHaveBeenCalled()
  })

  it('reports generated-image failures and errors returned by the landing step', async () => {
    const imageFailure = createSlidesSkill(
      mkAccess([page], {
        regenerateSlide: vi.fn(async () => ({ ok: true })),
        generatePageLocal: vi.fn(async () => ({
          ok: true,
          marker,
          imageFailures: ['https://img.example/broken.jpg'],
        })),
        retryBackoffMs: 0,
      }),
    )
    const imageResult = await imageFailure.executeTool!(
      call('regenerate_slide', { slideIndex: 0, brief: 'x' }),
    )
    expect(imageResult.output).toContain('Missing images')
    expect(imageResult.output).toContain('https://img.example/broken.jpg')

    const landingFailure = createSlidesSkill(
      mkAccess([page], {
        regenerateSlide: vi.fn(async () => ({ ok: false, error: 'conversion timeout' })),
        generatePageLocal: vi.fn(async () => ({ ok: true, marker })),
        retryBackoffMs: 0,
      }),
    )
    const landingResult = await landingFailure.executeTool!(
      call('regenerate_slide', { slideIndex: 0, brief: 'x' }),
    )
    expect(landingResult.isError).toBe(true)
    expect(landingResult.output).toContain('conversion timeout')
  })

  it('marks the deck generated after success so later fine-tuning is allowed', async () => {
    const skill = createSlidesSkill(
      mkAccess([page], {
        regenerateSlide: vi.fn(async () => ({ ok: true })),
        generatePageLocal: vi.fn(async () => ({ ok: true, marker })),
        retryBackoffMs: 0,
      }),
    )
    await skill.executeTool!(call('regenerate_slide', { slideIndex: 0, brief: 'x' }))
    ;(window as any).slidesApi.applyTxn = vi.fn(async () => ({
      applied: true,
      records: [{ op: 'addElement', target: '0', created: ['e1'] }],
      slides: [page],
    }))
    const r = await skill.executeTool!(
      call('apply_ops', {
        ops: [
          {
            op: 'addElement',
            target: { slide: 0 },
            kind: 'textbox',
            offset: { x: 1, y: 1, cx: 10, cy: 10 },
            paragraphs: [{ runs: [{ text: 'x' }] }],
          },
        ],
      }),
    )
    expect(r.isError).toBeUndefined()
    expect((window as any).slidesApi.applyTxn).toHaveBeenCalledOnce()
  })
})
