import { describe, expect, it } from 'vitest'
import { lastUserInstruction, toolLabel, workedLabel, type ChatLineLike } from './chat-lines'

const user = (text: string): ChatLineLike => ({ role: 'user', text })
const bot = (text: string): ChatLineLike => ({ role: 'assistant', text })

describe('lastUserInstruction', () => {
  it('returns the instruction behind the newest reply', () => {
    const lines = [user('draw a box'), bot('Done.')]
    expect(lastUserInstruction(lines, 1)).toBe('draw a box')
  })

  it('replays the request that STARTED a multi-turn run, not a tool turn', () => {
    // a run can append several assistant lines between the request and the reply
    const lines = [user('draw a box'), bot('Working…'), bot('Done.')]
    expect(lastUserInstruction(lines, 2)).toBe('draw a box')
  })

  it('refuses to regenerate anything but the newest reply', () => {
    const lines = [user('first'), bot('one'), user('second'), bot('two')]
    expect(lastUserInstruction(lines, 3)).toBe('second')
    expect(lastUserInstruction(lines, 1)).toBeNull()
  })

  it('refuses when the reply has no text to re-run', () => {
    expect(lastUserInstruction([user('q'), bot('')], 1)).toBeNull()
  })

  it('returns null when there is no preceding user line', () => {
    expect(lastUserInstruction([bot('unprompted')], 0)).toBeNull()
  })

  it('returns null for an out-of-range index or a user line', () => {
    const lines = [user('q'), bot('a')]
    expect(lastUserInstruction(lines, 5)).toBeNull()
    expect(lastUserInstruction(lines, -1)).toBeNull()
    expect(lastUserInstruction(lines, 0)).toBeNull()
    expect(lastUserInstruction([], 0)).toBeNull()
  })

  it('ignores a blank user line and keeps looking back', () => {
    const lines = [user('real request'), user('   '), bot('answer')]
    expect(lastUserInstruction(lines, 2)).toBe('real request')
  })
})

describe('toolLabel', () => {
  it('prefers the routed name and spaces out underscores', () => {
    expect(toolLabel({ name: 'build_drawboard_scene' }, () => 'Build drawing scene')).toBe(
      'Build drawing scene',
    )
    // The board tools keep stable protocol IDs; the user-facing label uses the
    // Drawboard product name instead.
    expect(toolLabel({ name: 'build_drawboard_scene' })).toBe('build drawboard scene')
    expect(toolLabel({ name: 'read_drawboard' })).toBe('read drawboard')
    expect(toolLabel({ name: 'add_board_text' })).toBe('add board text')
    expect(toolLabel({ name: 'inspect_board_visual' })).toBe('visually review drawing')
  })

  it('falls back to the raw name when the router does not know it', () => {
    expect(toolLabel({ name: 'some_new_tool' }, () => null)).toBe('some new tool')
    expect(toolLabel({ name: 'some_new_tool' }, () => undefined)).toBe('some new tool')
  })
})

describe('workedLabel', () => {
  it('counts steps and gets the singular right', () => {
    expect(workedLabel(1)).toBe('Worked · 1 step')
    expect(workedLabel(3)).toBe('Worked · 3 steps')
    expect(workedLabel(0)).toBe('Worked · 0 steps')
  })
})
