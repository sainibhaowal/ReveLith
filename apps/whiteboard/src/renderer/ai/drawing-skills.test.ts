import { describe, expect, it } from 'vitest'
import { DRAWING_SKILLS, buildDrawingGuidance, selectDrawingSkills } from './drawing-skills'

const ids = (instruction: string, limit?: number) =>
  selectDrawingSkills(instruction, limit).map((skill) => skill.id)

describe('drawboard drawing skills', () => {
  it('routes each domain to its brief', () => {
    expect(ids('Create a concept board for a cliffside house at sunset')).toContain('architecture')
    expect(ids('technical drawing of a steel beam with tolerances and dimensions')).toContain(
      'engineering',
    )
    expect(ids('draw an isometric 3D massing of the block')).toContain('isometric-3d')
    expect(ids('a poster illustration of a mountain sunset')).toContain('illustration')
    expect(ids('flowchart for user onboarding')).toContain('diagram')
    expect(ids('wireframe mockup for the settings screen')).toContain('design')
  })

  it('matches whole words only, so generic substrings do not hijack routing', () => {
    // "art" lives inside start/chart/cart and must not select the illustration brief.
    expect(ids('start a timer')).not.toContain('illustration')
    expect(ids('restart the sequence')).not.toContain('illustration')
    // "plan" lives inside plane/aeroplane.
    expect(ids('draw a plane shape')).not.toContain('architecture')
  })

  it('adds no guidance for ordinary board questions', () => {
    expect(buildDrawingGuidance('how many elements are on the board?')).toBe('')
    expect(buildDrawingGuidance('')).toBe('')
    expect(buildDrawingGuidance('   ')).toBe('')
  })

  it('does not inject Mermaid instructions when the user rejects Mermaid or requests native Draw tools', () => {
    expect(
      ids('Create a native editable flow diagram; do not use Mermaid or external SVG.'),
    ).not.toContain('mermaid')
    expect(
      buildDrawingGuidance('Create a native editable flow diagram; do not use Mermaid.'),
    ).not.toContain('render_mermaid_diagram')
    expect(ids('Render this Mermaid source: ```mermaid flowchart LR; A-->B ```')).toContain(
      'mermaid',
    )
  })

  it('is deterministic, respects the limit and never exceeds it', () => {
    const brief = 'isometric 3D architectural section drawing of a column'
    expect(ids(brief, 3)).toEqual(ids(brief, 3))
    expect(selectDrawingSkills(brief, 1)).toHaveLength(1)
    expect(selectDrawingSkills(brief, 2).length).toBeLessThanOrEqual(2)
    expect(selectDrawingSkills(brief, 0)).toHaveLength(0)
  })

  it('labels the guidance block with the selected brief titles', () => {
    const guidance = buildDrawingGuidance('flowchart for onboarding')
    expect(guidance).toContain('Drawing guidance for this request')
    expect(guidance).toContain('System architecture and flow diagrams')
    expect(guidance.startsWith('Drawing guidance')).toBe(true)
  })

  it('keeps every brief substantial and pointed at real tool capabilities', () => {
    for (const skill of DRAWING_SKILLS) {
      expect(skill.title.length).toBeGreaterThan(4)
      expect(skill.description.length).toBeGreaterThan(20)
      expect(skill.description.length).toBeLessThan(180)
      expect(skill.keywords.length).toBeGreaterThan(3)
      expect(skill.guidance.length).toBeGreaterThan(200)
    }
    expect(DRAWING_SKILLS.find((skill) => skill.id === 'engineering')!.guidance).toContain(
      'Palette discipline',
    )
    const engineering = DRAWING_SKILLS.find((skill) => skill.id === 'engineering')!
    expect(engineering.guidance).toContain('kind:"dimension"')
    expect(engineering.guidance).toContain('cross-hatch')
    const isometric = DRAWING_SKILLS.find((skill) => skill.id === 'isometric-3d')!
    expect(isometric.guidance).toContain('kind:"scene3d"')
    const illustration = DRAWING_SKILLS.find((skill) => skill.id === 'illustration')!
    expect(illustration.guidance).toContain('feGaussianBlur')
    expect(illustration.guidance).toContain('linearGradient')
    expect(illustration.guidance).toContain('do not impose a generic corporate palette')
  })
})
