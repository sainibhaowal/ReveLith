import { describe, expect, it } from 'vitest'
import { toolSchemas } from './tools'
import { selectTaskToolNames, selectTaskTools, TASK_TOOL_NAMES } from './task-tool-routing'

const launchRequest = [
  'Create a launch checklist for the 0.10.100 release: assign each task to Backlog, In Progress, or Review,',
  'give them priorities, and link any that block others.',
].join(' ')

describe('dynamic task-tool selection', () => {
  it('keeps every registered Tasks tool selectable and schema-backed', () => {
    const schemas = toolSchemas()
    expect(schemas.map((tool) => tool.name)).toEqual(TASK_TOOL_NAMES)
    for (const name of TASK_TOOL_NAMES) {
      expect(selectTaskToolNames(`RUN_TASK_TOOL:${name}`)).toEqual([name])
      expect(schemas.find((tool) => tool.name === name)?.inputSchema).toBeTruthy()
    }
  })

  it('keeps the actual write capabilities for a release checklist on an empty board', () => {
    const selected = selectTaskToolNames(launchRequest, { activeProjectCount: 0 })
    expect(selected).toContain('create_project')
    expect(selected).toContain('create_task')
    expect(selected).toContain('move_task')
    expect(selected).toContain('link_tasks')
    expect(selected).toContain('list_tasks')
    expect(selected.length).toBeLessThan(10)

    const schemas = selectTaskTools(launchRequest, toolSchemas(), { activeProjectCount: 0 })
    for (const name of ['create_project', 'create_task', 'move_task', 'link_tasks']) {
      expect(schemas.find((tool) => tool.name === name)?.inputSchema).toBeTruthy()
    }
  })

  it('does not misclassify a pasted refusal or question wording as a read-only turn', () => {
    const transcript = [
      "I can't create a project or task with the available tools. No changes were made.",
      'add to projects now',
      launchRequest,
    ].join('\n')
    const selected = selectTaskToolNames(transcript, { activeProjectCount: 0 })
    expect(selected).toContain('create_project')
    expect(selected).toContain('create_task')
    expect(selected).toContain('link_tasks')
  })

  it('reuses an existing project rather than exposing project creation for a checklist', () => {
    const selected = selectTaskToolNames(launchRequest, { activeProjectCount: 1 })
    expect(selected).toContain('create_task')
    expect(selected).not.toContain('create_project')
  })

  it('keeps ordinary task questions read-only', () => {
    const selected = selectTaskToolNames('What tasks have high priority?', { activeProjectCount: 1 })
    expect(selected).toContain('list_tasks')
    expect(selected).not.toContain('create_task')
    expect(selected).not.toContain('update_task')
    expect(selected).not.toContain('link_tasks')
  })

  it('treats "Can you create…" as an action request rather than a read-only query', () => {
    const selected = selectTaskToolNames('Can you create a launch checklist?', { activeProjectCount: 1 })
    expect(selected).toContain('create_task')
  })
})
