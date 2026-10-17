/**
 * Locally select only the Drawboard tools relevant to one user turn. Runs
 * before a model request, costs no tokens, and deliberately falls back to the
 * complete tool set for ambiguous actionable requests (same contract as the
 * forms router: never risk a partial result because a keyword rule guessed
 * too narrowly).
 */
export const BOARD_TOOL_NAMES = [
  'build_flow_diagram',
  'build_sequence_diagram',
  'build_use_case_diagram',
  'build_requirement_diagram',
  'build_uml_class_diagram',
  'build_er_diagram',
  'build_state_diagram',
  'build_mind_map',
  'build_chart_diagram',
  'build_gantt_diagram',
  'build_heatmap_chart',
  'build_text_diagram',
  'render_mermaid_diagram',
  'build_infographic',
  'read_drawboard',
  'inspect_board_visual',
  'inspect_board_layout',
  'get_board_element',
  'add_board_text',
  'add_sticky_note',
  'add_board_shape',
  'add_freedraw',
  'build_drawboard_scene',
  'add_vector_artwork',
  'add_board_image',
  'add_board_image_from_url',
  'generate_image',
  'update_board_text',
  'move_board_elements',
  'scale_board_elements',
  'style_board_elements',
  'erase_board_elements',
  'delete_board_elements',
  'clear_drawboard',
  'undo_drawboard',
  'redo_drawboard',
  'export_drawboard',
  'arrange_elements',
  'align_elements',
  'distribute_elements',
  'group_elements',
  'ungroup_elements',
  'set_element_lock',
  'flip_elements',
  'duplicate_elements',
  'select_all',
  'clear_selection',
  'set_stroke_width',
  'set_opacity',
  'set_text_size',
  'zoom_to_fit',
] as const

export type BoardToolName = (typeof BOARD_TOOL_NAMES)[number]

const BOARD_TOOL_ALIASES: Readonly<Record<string, BoardToolName>> = {
  'read board': 'read_drawboard',
  'read drawboard': 'read_drawboard',
  'read ai draw': 'read_drawboard',
  // Legacy model names are accepted, but only Drawboard names are advertised.
  'read whiteboard': 'read_drawboard',
  'inspect board': 'read_drawboard',
  'inspect drawboard': 'read_drawboard',
  'inspect ai draw': 'read_drawboard',
  'inspect whiteboard': 'read_drawboard',
  'inspect the drawing visually': 'inspect_board_visual',
  'review board visually': 'inspect_board_visual',
  'get board': 'read_drawboard',
  'get drawboard': 'read_drawboard',
  'get ai draw': 'read_drawboard',
  'get whiteboard': 'read_drawboard',
  'add text': 'add_board_text',
  'add shape': 'add_board_shape',
  'draw shape': 'add_board_shape',
  'add sticky': 'add_sticky_note',
  'add sticky note': 'add_sticky_note',
  'draw freehand': 'add_freedraw',
  'build scene': 'build_drawboard_scene',
  'build drawboard scene': 'build_drawboard_scene',
  'build ai draw scene': 'build_drawboard_scene',
  'build whiteboard scene': 'build_drawboard_scene',
  'create scene': 'build_drawboard_scene',
  'create diagram': 'build_drawboard_scene',
  'build diagram': 'build_drawboard_scene',
  'build infographic': 'build_infographic',
  'build flow diagram': 'build_flow_diagram',
  'build sequence diagram': 'build_sequence_diagram',
  'build use case diagram': 'build_use_case_diagram',
  'build requirement diagram': 'build_requirement_diagram',
  'build uml class diagram': 'build_uml_class_diagram',
  'build er diagram': 'build_er_diagram',
  'build state diagram': 'build_state_diagram',
  'build mind map': 'build_mind_map',
  'build chart diagram': 'build_chart_diagram',
  'build gantt chart': 'build_gantt_diagram',
  'build gantt diagram': 'build_gantt_diagram',
  'build heatmap chart': 'build_heatmap_chart',
  'build text diagram': 'build_text_diagram',
  'render mermaid diagram': 'render_mermaid_diagram',
  'draw vector artwork': 'add_vector_artwork',
  'generate image': 'generate_image',
  'create image': 'generate_image',
  'ai image': 'generate_image',
  'zoom to fit': 'zoom_to_fit',
  'clear whiteboard': 'clear_drawboard',
  'undo whiteboard': 'undo_drawboard',
  'redo whiteboard': 'redo_drawboard',
  'export whiteboard': 'export_drawboard',
}

/** Resolve only unambiguous humanized tool names; unknown calls stay diagnosable. */
export function resolveBoardToolName(name: string): BoardToolName | null {
  const raw = name.trim().toLocaleLowerCase()
  const normalized = raw
    .replace(/^mcp__[a-z0-9-]+__/i, '')
    .replace(/^(?:drawboard|whiteboard|ai[- ]?draw)[.:/]+/i, '')
    .replace(/[.-]+/g, '_')
    .replace(/\s+/g, '_')
  if ((BOARD_TOOL_NAMES as readonly string[]).includes(normalized))
    return normalized as BoardToolName
  const humanized = raw
    .replace(/^mcp__[a-z0-9-]+__/i, '')
    .replace(/^(?:drawboard|whiteboard|ai[- ]?draw)[.:/]+/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return BOARD_TOOL_ALIASES[humanized] ?? null
}

function has(text: string, pattern: RegExp): boolean {
  return pattern.test(text)
}

/**
 * Mermaid is intentionally opt-in: it imports one rendered SVG, while the
 * native diagram builders create editable Drawboard elements. A negative or
 * comparative mention must never switch an ordinary drawing request to the
 * Mermaid renderer.
 */
export function explicitlyRequestsMermaid(instruction: string): boolean {
  const normalized = instruction.toLocaleLowerCase()
  const prefersNativeTools =
    /\b(?:native|editable|individually editable)\b.{0,55}\b(?:draw(?:board)?|diagram|shapes?|connectors?|tools?|board|canvas)\b/i.test(
      normalized,
    ) ||
    /\b(?:draw(?:board)?|diagram|shapes?|connectors?|tools?|board|canvas)\b.{0,55}\b(?:native|editable)\b/i.test(
      normalized,
    ) ||
    /\bonly\b.{0,36}\b(?:native\s+)?(?:ai\s+)?draw(?:board)?\s+tools?\b/i.test(normalized)
  if (prefersNativeTools) return false

  const positiveMentions = normalized
    .replace(
      /\b(?:do not|don't|never|avoid|without|no|not)\b(?:\s+[\w-]+){0,5}\s+(?:external\s+)?(?:mermaid|render_mermaid_diagram)\b/gi,
      ' ',
    )
    .replace(
      /\b(?:external\s+)?(?:mermaid|render_mermaid_diagram)\b(?:\s+[\w-]+){0,4}\s+\b(?:is\s+)?(?:not|never|unwanted|forbidden|disallowed)\b/gi,
      ' ',
    )

  return (
    /```\s*mermaid\b/i.test(positiveMentions) ||
    /\brender_mermaid_diagram\b/i.test(positiveMentions) ||
    /\b(?:create|make|render|generate|write|use|convert|produce)\b.{0,48}\bmermaid\b/i.test(
      positiveMentions,
    ) ||
    /\bmermaid\b.{0,36}\b(?:diagram|source|syntax|code)\b/i.test(positiveMentions)
  )
}

export function selectBoardToolNames(instruction: string): BoardToolName[] {
  const text = instruction
    .toLocaleLowerCase()
    .replace(/(?:^|\n)\s*(?:arguments|parameters):\s*\{[^\n]*\}/g, ' ')
    .replace(/"[^"\n]*"|'[^'\n]*'/g, ' ')
  const mermaidRequested = explicitlyRequestsMermaid(text)
  const selected = new Set<BoardToolName>()

  for (const name of BOARD_TOOL_NAMES) {
    if (name === 'render_mermaid_diagram' && !mermaidRequested) continue
    const exactToolName = new RegExp(`(?<![a-z0-9_])${name}(?![a-z0-9_])`)
    if (exactToolName.test(text)) selected.add(name)
  }

  const isAttachmentChat =
    has(text, /\battach(ment|ed|ing)?\b/) &&
    !has(text, /\b(board|canvas|element|shape|draw|place)\b/)
  if (isAttachmentChat) return []
  const diagrams = new Set<BoardToolName>()
  const asksForMermaid = mermaidRequested
  const asksForMermaidSource =
    asksForMermaid &&
    /```\s*mermaid\b|\bmermaid\s+(?:source|syntax|code)\b|\brender\s+(?:this\s+)?mermaid\b/i.test(text)
  const asksForMultipleViews =
    asksForMermaid && /\b(?:and also|plus|as well as|additionally)\b/i.test(text)
  const requestsVisualReview =
    has(
      text,
      /\b(review|visually inspect|critique|polish|refine|professional|fix|improv\w*|repair|clean up|layout|spacing|overlap|appearance|composition)\b/,
    ) &&
    has(
      text,
      /\b(drawing|draw|board|canvas|artwork|illustration|diagram|content|design|layout|composition|spacing|overlap|appearance)\b/,
    )
  // A poster/infographic containing several views must be composed as one
  // coherent scene.  Routing it to a handful of standalone UML/flow builders
  // makes every builder append a separate diagram and produces the very tall,
  // duplicate boards that users cannot repair coherently.
  const isMultiSectionComposition =
    /\b(infographic|one[ -]?pager|study guide|visual guide|poster|multi[ -]?section|educational guide|roadmap)\b/i.test(text) &&
    (/\b(section|parts?|views?|workflow|roadmap|plan|tall|portrait|multiple|several)\b/i.test(text) ||
      /\b(sequence|use[ -]?case|mind.?map|flowchart|chart|diagram)\b/i.test(text))
  if (asksForMermaid && !asksForMultipleViews) {
    diagrams.add('render_mermaid_diagram')
  } else {
    if (/\b(sequence diagram|sequence-diagram|uml sequence)\b/i.test(text))
      diagrams.add('build_sequence_diagram')
    if (/\b(use[ -]?case diagram|use[ -]?case model|use[ -]?cases)\b/i.test(text))
      diagrams.add('build_use_case_diagram')
    if (
      /\b(requirements? diagram|requirements? engineering diagram|traceability diagram|requirement model)\b/i.test(
        text,
      )
    )
      diagrams.add('build_requirement_diagram')
    if (asksForMultipleViews && /\brequirements? engineering\b/i.test(text) && diagrams.size > 0)
      diagrams.add('build_requirement_diagram')
    if (/\b(class diagram|uml class|class model)\b/i.test(text))
      diagrams.add('build_uml_class_diagram')
    if (/\b(entity.?relationship|\berd\b|database schema diagram)\b/i.test(text))
      diagrams.add('build_er_diagram')
    if (/\b(state machine|state diagram|state chart)\b/i.test(text))
      diagrams.add('build_state_diagram')
    if (/\b(mind.?map|concept map)\b/i.test(text)) diagrams.add('build_mind_map')
    if (/\b(gantt chart|gantt diagram|project timeline)\b/i.test(text))
      diagrams.add('build_gantt_diagram')
    if (/\bheat ?map\b/i.test(text)) diagrams.add('build_heatmap_chart')
    if (/\b(ascii|monospace|text) diagram\b/i.test(text)) diagrams.add('build_text_diagram')
    const explicitChart =
      /\b(bar chart|stacked bar|histogram|line chart|area chart|scatter ?plot|radar chart|waterfall chart|pie chart|donut chart|doughnut chart|chart of|graph of)\b/i.test(
        text,
      )
    if (
      explicitChart ||
      (/\bchart\b/i.test(text) &&
        !diagrams.has('build_gantt_diagram') &&
        !diagrams.has('build_heatmap_chart'))
    )
      diagrams.add('build_chart_diagram')
    if (asksForMermaidSource || (asksForMermaid && diagrams.size === 0))
      diagrams.add('render_mermaid_diagram')
    else if (asksForMultipleViews) diagrams.add('render_mermaid_diagram')
    if (
      diagrams.size === 0 &&
      /\b(flowchart|flow chart|process map|architecture diagram|component diagram|dependency diagram|network diagram|decision tree|activity diagram|diagram)\b/i.test(
        text,
      )
    )
      diagrams.add('build_flow_diagram')
  }
  if (isMultiSectionComposition) {
    diagrams.clear()
    diagrams.add('build_infographic')
    diagrams.add('read_drawboard')
    diagrams.add('inspect_board_layout')
    diagrams.add('inspect_board_visual')
    // These stay available from the first turn and throughout a repair pass.
    diagrams.add('erase_board_elements')
    diagrams.add('delete_board_elements')
    diagrams.add('move_board_elements')
    diagrams.add('scale_board_elements')
    diagrams.add('style_board_elements')
    diagrams.add('align_elements')
    diagrams.add('distribute_elements')
    diagrams.add('update_board_text')
    return BOARD_TOOL_NAMES.filter((name) => diagrams.has(name))
  }
  if (diagrams.size > 0) {
    // Keep the post-build QA tools in the request schema. When vision is
    // configured, DrawboardChatPanel exposes inspect_board_visual as well;
    // otherwise read_drawboard still gives the model a native structural
    // read-back on its next turn.
    diagrams.add('read_drawboard')
    diagrams.add('inspect_board_visual')
    // Diagram requests return early below. Preserve explicitly requested
    // object erasure/deletion, and expose repair actions for a requested QA
    // pass so the model can fix clutter instead of only describing it.
    if (has(text, /\b(erase|eraser|erasing|erased|rub out)\b/))
      diagrams.add('erase_board_elements')
    if (has(text, /\b(delete|remove)\b/)) diagrams.add('delete_board_elements')
    if (requestsVisualReview) {
      diagrams.add('erase_board_elements')
      diagrams.add('delete_board_elements')
      diagrams.add('move_board_elements')
      diagrams.add('align_elements')
      diagrams.add('distribute_elements')
      diagrams.add('update_board_text')
    }
    if (/\b(zoom|fit)\b.{0,25}\b(fit|screen|view|board|canvas|whole)\b/i.test(text))
      diagrams.add('zoom_to_fit')
    if (/\b(inspect|review|critique|check visually|visually check)\b/i.test(text))
      diagrams.add('inspect_board_visual')
    return BOARD_TOOL_NAMES.filter((name) => diagrams.has(name))
  }
  if (
    has(
      text,
      /\b(read|inspect|list|summari[sz]e|what(?:'s| is)(?: on| in)|show\s+(?:me\s+)?(?:the\s+)?(?:board|canvas|everything)|how many\b.{0,30}\b(elements?|objects?|shapes?|items?)\b|\bcount\b.{0,25}\b(elements?|objects?)\b|\bdescribe\b.{0,25}\bboard\b)/,
    )
  ) {
    selected.add('read_drawboard')
  }
  if (
    has(
      text,
      /\b(element|shape|text|note)\b.{0,30}\b(id|identifier)\b|\bdetails?\b.{0,25}\b(element|shape)\b|\bspecific\b.{0,20}\belement\b/,
    )
  ) {
    selected.add('get_board_element')
  }
  if (has(text, /\bsticky\b|\bpost.?it\b|\bsticky note\b/)) selected.add('add_sticky_note')
  if (
    has(
      text,
      /\b(sketch|scribble|doodle|doodles|hand.?drawn?|freehand|pen|brush|stroke|signature|curve|curves|underline|circle around)\b/,
    )
  ) {
    selected.add('add_freedraw')
  }
  if (
    has(
      text,
      /\b(rectangle|square|box|boxes|circle|ellipse|oval|diamond|rhombus|triangle|line|arrow|shape|border|outline)\b/,
    ) ||
    has(text, /\b(add|draw|create|insert|make|put)\b.{0,40}\b(box|border)\b/)
  ) {
    selected.add('add_board_shape')
  }
  if (
    has(text, /\b(title|heading|label|caption|text|word|words|write|type)\b/) &&
    !has(text, /\b(edit|change|update|modify|fix|rename)\b.{0,40}\b(text|label|wording)\b/) &&
    !has(text, /\btext\b.{0,30}\b(edit|change|update|to)\b/)
  ) {
    selected.add('add_board_text')
  }
  if (
    has(
      text,
      /\b(edit|change|update|modify|fix|correct|rename|reword)\b.{0,45}\b(text|label|wording|title|note)\b|\b(text|label)\b.{0,30}\b(edit|change|update|to)\b/,
    )
  ) {
    selected.add('update_board_text')
  }
  if (
    has(text, /\b(place|insert|add|put|use|include)\b.{0,35}\b(attached|attachment)\b/) ||
    has(text, /\b(attached|attachment)\b.{0,30}\b(image|picture|photo|logo)\b/)
  )
    selected.add('add_board_image')
  else if (
    has(
      text,
      /\b(place|insert|add|put|use|include)\b.{0,45}\b(search result|image|picture|photo|logo|icon|visual)\b/,
    ) ||
    (has(text, /\b(search result|image|picture|photo|logo|icon)\b/) &&
      (has(text, /\b(on|onto|into)\b.{0,20}\b(board|canvas)\b/) ||
        (has(text, /\b(add|put|place|insert)\b/) && has(text, /\b(board|canvas)\b/))))
  )
    selected.add('add_board_image_from_url')
  // Distinguish finished artwork from structured/technical board content.
  // Natural requests such as "draw a 3D house with mountains" must have the
  // image-generation tool in the very first model request; otherwise the model
  // is forced into primitive shapes and tends to return clip-art-like results.
  const asksForStructuredDrawing = has(
    text,
    /\b(flowchart|flow chart|diagram|mind.?map|process map|org chart|network topology|schematic|blueprint|floor.?plan|elevation drawing|section drawing|technical drawing|engineering drawing|cad|dimensioned|wireframe|uml|erd)\b/,
  )
  const asksForEditableArt = has(
    text,
    /\b(editable|vector|as shapes|native shapes|individual elements)\b/,
  )
  const asksForArtwork =
    has(
      text,
      /\b(illustrat\w*|artwork|poster|painting|painted|painterly|photoreal\w*|realistic|fine art|concept art|landscape|portrait|scene|picture|image)\b/,
    ) ||
    (has(text, /\b(draw|sketch|create|make|render|design)\b/) &&
      has(
        text,
        /\b(house|cabin|home|mountain|mountains|forest|tree|building|city|castle|bridge|road|car|vehicle|ship|boat|airplane|person|human|robot|animal|garden|sunset|sunrise|planet|character)\b/,
      ))
  const wantsRenderedArtwork = asksForArtwork && !asksForStructuredDrawing && !asksForEditableArt

  if (
    has(
      text,
      /\b(generate|creat\w*|imagine|render|make)\b.{0,40}\b(image|picture|photo|illustration|artwork|art|logo|icon|mascot|poster)\b/,
    ) ||
    has(
      text,
      /\b(image|picture|illustration|artwork|logo|icon)\b.{0,30}\b(ai|generated|generate)\b/,
    ) ||
    has(text, /\bdraw me\b/) ||
    wantsRenderedArtwork
  ) {
    selected.add('generate_image')
  }
  if (has(text, /\b(move|shift|drag|rearrange|reposition|reposition|align|arrange|nudge|slide)\b/))
    selected.add('move_board_elements')
  if (has(text, /\b(resize|scale|larger|smaller|shrink|enlarge)\b/)) selected.add('scale_board_elements')
  if (has(text, /\b(restyle|recolor|colour|color|style|palette|border|fill)\b/)) selected.add('style_board_elements')
  if (!isAttachmentChat && has(text, /\b(delete|remove)\b/))
    selected.add('delete_board_elements')
  if (!isAttachmentChat && has(text, /\b(erase|eraser|erasing|erased|rub out)\b/))
    selected.add('erase_board_elements')
  if (
    !isAttachmentChat &&
    has(
      text,
      /\b(clear|wipe|reset|empty)\b.{0,30}\b(board|canvas|everything|all)\b|\bstart over\b|\bblank board\b|\bfrom scratch\b/,
    )
  ) {
    selected.add('clear_drawboard')
  }
  if (has(text, /\bundo\b|\brevert\b|\boops\b|\bgo back\b|\bthat was wrong\b/))
    selected.add('undo_drawboard')
  if (has(text, /\bredo\b|\bre-do\b/)) selected.add('redo_drawboard')
  if (
    has(
      text,
      /\bexport\b|\bdownload\b|\bsave\b.{0,25}\b(png|svg|image|file)\b|\bas\b.{0,15}\b(png|svg|image)\b/,
    )
  ) {
    selected.add('export_drawboard')
  }
  if (
    has(
      text,
      /\b(bring|send|move)\b.{0,30}\b(front|back|forward|backward)\b|\b(arrange|layer|order|stack|z-?order)\b/,
    )
  ) {
    selected.add('arrange_elements')
  }
  if (has(text, /\balign\w*\b|\balignment\b/)) selected.add('align_elements')
  if (has(text, /\bdistribute\w*\b|\bspace\b.{0,20}\bevenly|\beven(ly)?\b.{0,20}\bspac/))
    selected.add('distribute_elements')
  if (has(text, /\bungroup\w*\b/)) selected.add('ungroup_elements')
  else if (has(text, /\bgroup\w*\b/)) selected.add('group_elements')
  if (has(text, /\block\w*\b|\bunlock\w*\b/)) selected.add('set_element_lock')
  if (has(text, /\bflip\w*\b|\bmirror\w*\b/)) selected.add('flip_elements')
  if (
    has(
      text,
      /\bduplicat\w*\b|\bclon\w*\b|\bmake\b.{0,20}\bcopy\b|\bcopy\b.{0,25}\b(element|shape|selection|selected)\b/,
    )
  ) {
    selected.add('duplicate_elements')
  }
  if (has(text, /\bselect\b.{0,20}\b(all|everything)\b/)) selected.add('select_all')
  if (
    has(
      text,
      /\bstroke\b.{0,20}\bwidth\b|\bline\b.{0,20}\bwidth\b|\b(thicker|thinner)\b.{0,20}\b(lines?|strokes?)\b/,
    )
  ) {
    selected.add('set_stroke_width')
  }
  if (has(text, /\bopacity\b|\btransparen\w*\b|\b fade\b|\bfade\b.{0,20}\b(in|out)\b/))
    selected.add('set_opacity')
  if (
    has(
      text,
      /\bfont\b.{0,20}\bsize\b|\btext\b.{0,20}\bsize\b|\bbigger\b.{0,20}\btext\b|\bsmaller\b.{0,20}\btext\b/,
    )
  ) {
    selected.add('set_text_size')
  }
  if (
    has(
      text,
      /\bzoom\b.{0,20}\bfit\b|\bfit\b.{0,25}\b(screen|view|board)\b|\bshow\b.{0,20}\b(everything|all|whole board)\b/,
    )
  ) {
    selected.add('zoom_to_fit')
  }
  if (
    asksForStructuredDrawing ||
    asksForEditableArt ||
    (has(
      text,
      /\b(complex|detailed|infographic|architecture|architectural|structure|wireframe|storyboard|product design|room|solar system)\b/,
    ) &&
      !wantsRenderedArtwork)
  ) {
    selected.add('build_drawboard_scene')
    if (asksForEditableArt && !asksForStructuredDrawing) {
      selected.add('add_vector_artwork')
    }
    selected.add('read_drawboard')
  }
  if (wantsRenderedArtwork) {
    selected.add('add_vector_artwork') // vector fallback if image generation is unavailable
    selected.add('read_drawboard')
  }

  if (
    requestsVisualReview ||
    selected.has('build_drawboard_scene') ||
    selected.has('add_vector_artwork') ||
    selected.has('generate_image') ||
    selected.has('add_freedraw') ||
    selected.has('add_board_shape')
  ) {
    selected.add('inspect_board_visual')
  }

  // Editing or moving existing content always needs a look first.
  if (
    selected.has('update_board_text') ||
    selected.has('move_board_elements') ||
    selected.has('scale_board_elements') ||
    selected.has('style_board_elements') ||
    selected.has('erase_board_elements') ||
    selected.has('delete_board_elements') ||
    selected.has('get_board_element') ||
    selected.has('arrange_elements') ||
    selected.has('align_elements') ||
    selected.has('distribute_elements') ||
    selected.has('group_elements') ||
    selected.has('ungroup_elements') ||
    selected.has('set_element_lock') ||
    selected.has('flip_elements') ||
    selected.has('duplicate_elements') ||
    selected.has('set_stroke_width') ||
    selected.has('set_opacity') ||
    selected.has('set_text_size')
  ) {
    selected.add('read_drawboard')
  }

  // An ambiguous action keeps every tool available rather than risking a
  // partial result because a local keyword rule guessed too narrowly —
  // except chat-composer operations (attachments), which need no board tools.
  if (
    !isAttachmentChat &&
    (selected.size === 0 || (selected.size === 1 && selected.has('inspect_board_visual'))) &&
    has(
      text,
      /\b(create|build|design|make|draw|add|insert|edit|change|update|remove|delete|organize|improve|fix|help|drawboard|board|diagram|flowchart|mind.?map|brainstorm|plan)\b/,
    )
  ) {
    return [...BOARD_TOOL_NAMES]
  }
  return BOARD_TOOL_NAMES.filter((name) => selected.has(name))
}

export function selectBoardTools<T extends { name: string }>(
  instruction: string,
  tools: readonly T[],
): T[] {
  const names = new Set<string>(selectBoardToolNames(instruction))
  return tools.filter((tool) => names.has(tool.name))
}
