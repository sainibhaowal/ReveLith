import { describe, expect, it } from 'vitest'
import {
  BOARD_TOOL_NAMES,
  resolveBoardToolName,
  selectBoardToolNames,
  selectBoardTools,
} from './board-tool-routing'

describe('board tool routing', () => {
  it('routes read intents to read_drawboard only', () => {
    expect(selectBoardToolNames('summarize what is on the board')).toEqual(['read_drawboard'])
    expect(selectBoardToolNames('how many elements are there?')).toEqual(['read_drawboard'])
  })

  it('routes creation intents precisely', () => {
    expect(selectBoardToolNames('add a sticky note saying hello')).toContain('add_sticky_note')
    expect(selectBoardToolNames('draw an arrow from A to B')).toContain('add_board_shape')
    expect(selectBoardToolNames('draw a diamond and a circle')).toContain('add_board_shape')
    const pen = selectBoardToolNames('sign my name here with the pen')
    expect(pen).toContain('add_freedraw')
    expect(pen).not.toContain('clear_drawboard')
  })

  it('routes edit/move/delete intents with a read-first pairing', () => {
    const move = selectBoardToolNames('move the title 50px to the right')
    expect(move).toContain('move_board_elements')
    expect(move).toContain('read_drawboard')
    const del = selectBoardToolNames('delete that rectangle')
    expect(del).toContain('delete_board_elements')
    expect(del).toContain('read_drawboard')
    const erase = selectBoardToolNames('erase the detached clutter from the diagram')
    expect(erase).toContain('erase_board_elements')
    expect(erase).toContain('read_drawboard')
    expect(selectBoardToolNames('change the heading text to Launch')).toContain('update_board_text')
  })

  it('keeps erase and repair tools available during a diagram review pass', () => {
    const names = selectBoardToolNames(
      'Create a flowchart, inspect the whole diagram, erase detached clutter, and improve the spacing.',
    )
    expect(names).toContain('erase_board_elements')
    expect(names).toContain('delete_board_elements')
    expect(names).toContain('move_board_elements')
    expect(names).toContain('read_drawboard')
    expect(names).toContain('inspect_board_visual')
  })

  it('routes image, undo, export, and clear intents', () => {
    expect(selectBoardToolNames('place the attached logo on the board')).toContain(
      'add_board_image',
    )
    expect(selectBoardToolNames('find a photo of a cabin and add it to the board')).toContain(
      'add_board_image_from_url',
    )
    expect(selectBoardToolNames('search images of modern cabins')).not.toContain(
      'add_board_image_from_url',
    )
    expect(selectBoardToolNames('oops, undo that')).toContain('undo_drawboard')
    expect(selectBoardToolNames('export this as PNG please')).toContain('export_drawboard')
    const clear = selectBoardToolNames('clear the whole board and start over')
    expect(clear).toContain('clear_drawboard')
    expect(clear).not.toContain('delete_board_elements')
  })

  it('never mistakes chat attachments for board deletion', () => {
    const names = selectBoardToolNames('remove the attachment from my message')
    expect(names).not.toContain('delete_board_elements')
    expect(names).not.toContain('clear_drawboard')
  })

  it('routes arrange, style, and view intents', () => {
    expect(selectBoardToolNames('bring that shape to the front')).toContain('arrange_elements')
    expect(selectBoardToolNames('align everything to the left')).toContain('align_elements')
    expect(selectBoardToolNames('distribute these evenly across the page')).toContain(
      'distribute_elements',
    )
    expect(selectBoardToolNames('group these two boxes together')).toContain('group_elements')
    expect(selectBoardToolNames('ungroup the selection')).toContain('ungroup_elements')
    expect(selectBoardToolNames('lock the background image')).toContain('set_element_lock')
    expect(selectBoardToolNames('flip it horizontally')).toContain('flip_elements')
    expect(selectBoardToolNames('duplicate the logo three times')).toContain('duplicate_elements')
    expect(selectBoardToolNames('make the lines thicker')).toContain('set_stroke_width')
    expect(selectBoardToolNames('set opacity to 50')).toContain('set_opacity')
    expect(selectBoardToolNames('increase the font size of the title')).toContain('set_text_size')
    expect(selectBoardToolNames('zoom to fit the whole board')).toContain('zoom_to_fit')
    expect(selectBoardToolNames('redo that')).toContain('redo_drawboard')
  })

  it('falls back to every tool for ambiguous requests and keeps structured visual tasks focused', () => {
    expect(selectBoardToolNames('build me something cool')).toEqual([...BOARD_TOOL_NAMES])
    expect(selectBoardToolNames('design a flowchart for onboarding')).toEqual([
      'build_flow_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
  })

  it('discovers only the dedicated schemas required by each diagram request', () => {
    expect(selectBoardToolNames('Draw a UML sequence diagram')).toEqual([
      'build_sequence_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Build a use-case diagram and a sequence diagram')).toEqual([
      'build_sequence_diagram',
      'build_use_case_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Create a Mermaid sequence diagram')).toEqual([
      'render_mermaid_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(
      selectBoardToolNames(
        'Create a Mermaid diagram about requirements engineering, and also an ASCII diagram, sequence diagram, and use-case diagram',
      ),
    ).toEqual([
      'build_sequence_diagram',
      'build_use_case_diagram',
      'build_requirement_diagram',
      'build_text_diagram',
      'render_mermaid_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(
      selectBoardToolNames('Render this Mermaid source: ```mermaid flowchart LR; A-->B ```'),
    ).toEqual(['render_mermaid_diagram', 'read_drawboard', 'inspect_board_visual'])
    expect(
      selectBoardToolNames(
        'Create a native editable architecture flowchart. Do not use Mermaid, imported SVG, or external JSON; use the AI Draw tools to make the boxes and connectors.',
      ),
    ).toEqual(['build_flow_diagram', 'read_drawboard', 'inspect_board_visual'])
    expect(
      selectBoardToolNames('Do not use render_mermaid_diagram. Build an editable flowchart.'),
    ).toEqual(['build_flow_diagram', 'read_drawboard', 'inspect_board_visual'])
    expect(selectBoardToolNames('Make a bar chart from these values')).toEqual([
      'build_chart_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Build a UML class model')).toEqual([
      'build_uml_class_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Build an ERD')).toEqual([
      'build_er_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Build a state machine diagram')).toEqual([
      'build_state_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Create a mind map')).toEqual([
      'build_mind_map',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Draw a requirements traceability diagram')).toEqual([
      'build_requirement_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Create a Gantt chart for requirements work')).toEqual([
      'build_gantt_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Create a heatmap chart')).toEqual([
      'build_heatmap_chart',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Create a chart')).toEqual([
      'build_chart_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
    expect(selectBoardToolNames('Draw an ASCII diagram')).toEqual([
      'build_text_diagram',
      'read_drawboard',
      'inspect_board_visual',
    ])
  })

  it('keeps a multi-section infographic as one coordinated native composition', () => {
    const names = selectBoardToolNames(
      'Create a tall editable educational infographic with several sections: a flow, mind map, sequence diagram and roadmap. Do not use Mermaid.',
    )
    expect(names).toContain('build_infographic')
    expect(names).toContain('inspect_board_layout')
    expect(names).toContain('scale_board_elements')
    expect(names).toContain('style_board_elements')
    expect(names).not.toContain('render_mermaid_diagram')
    expect(names).not.toContain('build_sequence_diagram')
  })

  it('filters tool definition lists by name', () => {
    const tools = [
      { name: 'read_drawboard' },
      { name: 'add_board_text' },
      { name: 'clear_drawboard' },
    ]
    expect(selectBoardTools('what is on the board?', tools)).toEqual([{ name: 'read_drawboard' }])
  })

  it('selects the composed scene tool for complex visual requests', () => {
    const naturalArtRequest = selectBoardToolNames(
      'can you draw a house with a 3D look and mountains behind it',
    )
    expect(naturalArtRequest).toEqual([
      'read_drawboard',
      'inspect_board_visual',
      'add_vector_artwork',
      'generate_image',
    ])
    expect(naturalArtRequest).not.toContain('build_drawboard_scene')
    expect(naturalArtRequest).not.toContain('add_freedraw')
    expect(naturalArtRequest).not.toContain('arrange_elements')
    expect(
      selectBoardToolNames('draw a detailed house behind a mountain landscape with 3D depth'),
    ).toContain('generate_image')
    expect(selectBoardToolNames('draw a detailed house behind a mountain')).toContain(
      'generate_image',
    )
    expect(selectBoardToolNames('draw an editable vector house behind a mountain')).toContain(
      'add_vector_artwork',
    )
    expect(selectBoardToolNames('draw an editable vector house behind a mountain')).toContain(
      'build_drawboard_scene',
    )
    expect(selectBoardToolNames('build a simple flowchart for onboarding')).toContain(
      'build_flow_diagram',
    )
    expect(selectBoardToolNames('build a simple flowchart for onboarding')).not.toContain(
      'build_drawboard_scene',
    )
    expect(selectBoardToolNames('build a simple flowchart for onboarding')).not.toContain(
      'generate_image',
    )
    expect(selectBoardToolNames('fix my drawing and make it look professional')).toContain(
      'inspect_board_visual',
    )
    expect(selectBoardToolNames('fix my content')).toEqual([...BOARD_TOOL_NAMES])
  })

  it('normalizes humanized and namespaced tool labels but rejects invented names', () => {
    expect(resolveBoardToolName('Read drawboard')).toBe('read_drawboard')
    expect(resolveBoardToolName('Read Drawboard')).toBe('read_drawboard')
    expect(resolveBoardToolName('Read whiteboard')).toBe('read_drawboard')
    expect(resolveBoardToolName('drawboard.read-board')).toBe('read_drawboard')
    expect(resolveBoardToolName('drawboard.read-drawboard')).toBe('read_drawboard')
    expect(resolveBoardToolName('mcp__drawboard__build_drawboard_scene')).toBe(
      'build_drawboard_scene',
    )
    expect(resolveBoardToolName('mcp__whiteboard__build_whiteboard_scene')).toBe(
      'build_drawboard_scene',
    )
    expect(resolveBoardToolName('paint_a_house')).toBe(null)
    expect(BOARD_TOOL_NAMES).toContain('build_drawboard_scene')
  })
})
