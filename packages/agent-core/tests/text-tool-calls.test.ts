import { describe, expect, it } from 'vitest'
import type { AgentToolDef } from '../src'
import { hideTextToolCallMarkup, recoverTextToolCalls } from '../src/text-tool-calls'

const tools: AgentToolDef[] = [
  { name: 'build_drawboard_scene', description: 'draw', inputSchema: { type: 'object' } },
]

describe('text tool-call recovery', () => {
  it('parses the leaked local-model format without executing code', () => {
    const source =
      'Preparing. <|tool_call>call:build_drawboard_scene{elements:[{fillColor:<|"|>#a0522d<|"|>,kind:<|"|>polygon<|"|>,points:[0,800,1400,800]},{color:<|"|>#1e1b4b<|"|>,text:<|"|>Cliffside Residence<|"|>,x:350,y:50}]}<tool_call|> Done.'
    const recovered = recoverTextToolCalls(source, tools)

    expect(recovered.foundMarkers).toBe(true)
    expect(recovered.text).toBe('Preparing.  Done.')
    expect(recovered.calls).toHaveLength(1)
    expect(recovered.calls[0]).toMatchObject({
      name: 'build_drawboard_scene',
      input: {
        elements: [
          { fillColor: '#a0522d', kind: 'polygon', points: [0, 800, 1400, 800] },
          { color: '#1e1b4b', text: 'Cliffside Residence', x: 350, y: 50 },
        ],
      },
    })
  })

  it('normalizes only names that resolve to a tool registered for the turn', () => {
    const recovered = recoverTextToolCalls(
      '<|tool_call|>call:mcp__drawboard__build-drawboard-scene{elements:[]}<|tool_call_end|>' +
        '<|tool_call|>call:invented_tool{}<|tool_call_end|>',
      tools,
    )
    expect(recovered.calls[0]?.name).toBe('build_drawboard_scene')
    expect(recovered.calls[0]?.inputError).toBeUndefined()
    expect(recovered.calls[1]?.name).toBe('invented_tool')
    expect(recovered.calls[1]?.inputError).toContain('Unknown tool name')
  })

  it('reports malformed argument values without accepting executable expressions', () => {
    const recovered = recoverTextToolCalls(
      '<|tool_call>call:build_drawboard_scene{elements:process.exit()}<tool_call|>',
      tools,
    )
    expect(recovered.calls[0]?.inputError).toContain('Unsupported value')
    expect(recovered.calls[0]?.input).toEqual({})
  })

  it('hides both complete and incomplete control markup while streaming', () => {
    expect(hideTextToolCallMarkup('Before<|tool_call>call:x{}<tool_call|>After')).toBe(
      'BeforeAfter',
    )
    expect(hideTextToolCallMarkup('Before<|tool_call>call:x{partial')).toBe('Before')
  })
})
