import type { AgentToolCall, AgentToolDef } from './types'

const OPEN_MARKER = /<\|tool_call(?:\|)?>/g
const CLOSE_MARKER = /<tool_call\|>|<\|tool_call_end\|>/g
const STRING_MARKER = '<|"|>'
const MAX_TEXT_CALLS = 16
const MAX_VALUE_DEPTH = 64
const MAX_VALUE_NODES = 20_000
let invalidCallSequence = 0

export interface RecoveredTextToolCalls {
  /** Assistant prose with control-token blocks removed. */
  text: string
  calls: AgentToolCall[]
  foundMarkers: boolean
}

/**
 * Recover the narrowly supported `call:name{...}` text format some local
 * inference servers leak instead of returning native tool-call events.
 * This is a data parser, never eval: names are matched against this turn's
 * registered tools and argument values are restricted to JSON-like values.
 */
export function recoverTextToolCalls(
  source: string,
  tools: readonly AgentToolDef[],
): RecoveredTextToolCalls {
  const calls: AgentToolCall[] = []
  const chunks: string[] = []
  let cursor = 0
  let match: RegExpExecArray | null
  OPEN_MARKER.lastIndex = 0

  while ((match = OPEN_MARKER.exec(source))) {
    chunks.push(source.slice(cursor, match.index))
    const bodyStart = OPEN_MARKER.lastIndex
    CLOSE_MARKER.lastIndex = bodyStart
    const close = CLOSE_MARKER.exec(source)
    if (!close) {
      calls.push(invalidCall('Unterminated textual tool-call marker.'))
      cursor = source.length
      break
    }

    const rawBody = source.slice(bodyStart, close.index).trim()
    const body = /^call\s*:\s*([A-Za-z0-9_.:/ -]+?)\s*(\{[\s\S]*\})\s*$/.exec(rawBody)
    if (!body) {
      calls.push(invalidCall('Expected call:<registered_tool_name>{...} inside the tool-call marker.'))
    } else {
      const rawName = body[1]!.trim()
      const input = parseArguments(body[2]!)
      const resolvedName = resolveRegisteredName(rawName, tools)
      calls.push({
        id: `text-tool-${calls.length + 1}`,
        name: resolvedName ?? rawName,
        input: input.value ?? {},
        ...(!resolvedName
          ? { inputError: `Unknown tool name "${rawName}". Use one of the registered tool names.` }
          : input.error
            ? { inputError: input.error }
            : {}),
      })
    }

    cursor = CLOSE_MARKER.lastIndex
    OPEN_MARKER.lastIndex = cursor
    if (calls.length >= MAX_TEXT_CALLS) {
      calls.push(invalidCall('Too many textual tool calls were returned in one assistant turn.'))
      chunks.push(hideTextToolCallMarkup(source.slice(cursor)))
      cursor = source.length
      break
    }
  }

  if (cursor < source.length) chunks.push(source.slice(cursor))
  return { text: chunks.join(''), calls, foundMarkers: calls.length > 0 }
}

/** Hide complete or still-streaming internal tool markup from the chat UI. */
export function hideTextToolCallMarkup(source: string): string {
  let text = source
  OPEN_MARKER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = OPEN_MARKER.exec(text))) {
    CLOSE_MARKER.lastIndex = OPEN_MARKER.lastIndex
    const close = CLOSE_MARKER.exec(text)
    if (!close) return text.slice(0, match.index)
    text = text.slice(0, match.index) + text.slice(CLOSE_MARKER.lastIndex)
    OPEN_MARKER.lastIndex = match.index
  }
  return text
}

function invalidCall(message: string): AgentToolCall {
  return {
    id: `text-tool-invalid-${++invalidCallSequence}`,
    name: '__invalid_text_tool_call__',
    input: {},
    inputError: message,
  }
}

function resolveRegisteredName(rawName: string, tools: readonly AgentToolDef[]): string | null {
  const name = rawName.trim()
  const normalized = normalizeName(name)
  const exact = tools.filter((tool) => tool.name.toLocaleLowerCase() === name.toLocaleLowerCase())
  if (exact.length === 1) return exact[0]!.name
  const equivalent = tools.filter((tool) => normalizeName(tool.name) === normalized)
  if (equivalent.length === 1) return equivalent[0]!.name
  // MCP-style labels sometimes prefix a valid tool name with a server name.
  const suffix = name.replace(/^mcp__[a-z0-9-]+__/i, '')
  if (suffix !== name) {
    const suffixNormalized = normalizeName(suffix)
    const namespaced = tools.filter((tool) => normalizeName(tool.name) === suffixNormalized)
    if (namespaced.length === 1) return namespaced[0]!.name
  }
  return null
}

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/[ .:/-]+/g, '_')
}

function parseArguments(source: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const parser = new ValueParser(source)
    const value = parser.parse()
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Tool arguments must be an object.')
    }
    return { value: value as Record<string, unknown> }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

/** Recursive-descent parser for objects, arrays, strings, finite numbers and JSON literals. */
class ValueParser {
  private index = 0
  private nodes = 0

  constructor(private readonly source: string) {}

  parse(): unknown {
    const value = this.readValue(0)
    this.space()
    if (this.index !== this.source.length) this.fail('Unexpected content after the argument object.')
    return value
  }

  private readValue(depth: number): unknown {
    if (depth > MAX_VALUE_DEPTH) this.fail('Tool arguments are nested too deeply.')
    if (++this.nodes > MAX_VALUE_NODES) this.fail('Tool arguments contain too many values.')
    this.space()
    const c = this.source[this.index]
    if (c === '{') return this.readObject(depth + 1)
    if (c === '[') return this.readArray(depth + 1)
    if (c === '"' || c === "'") return this.readQuotedString(c)
    if (this.source.startsWith(STRING_MARKER, this.index)) return this.readMarkedString()
    return this.readPrimitive()
  }

  private readObject(depth: number): Record<string, unknown> {
    this.index++
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
    this.space()
    if (this.take('}')) return result
    while (true) {
      this.space()
      const key = this.source[this.index] === '"' || this.source[this.index] === "'"
        ? this.readQuotedString(this.source[this.index]!)
        : this.readKey()
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        this.fail(`Unsafe object key "${key}" is not allowed.`)
      }
      this.space()
      if (!this.take(':')) this.fail('Expected ":" after an object key.')
      result[key] = this.readValue(depth)
      this.space()
      if (this.take('}')) return result
      if (!this.take(',')) this.fail('Expected "," or "}" in an object.')
    }
  }

  private readArray(depth: number): unknown[] {
    this.index++
    const result: unknown[] = []
    this.space()
    if (this.take(']')) return result
    while (true) {
      result.push(this.readValue(depth))
      this.space()
      if (this.take(']')) return result
      if (!this.take(',')) this.fail('Expected "," or "]" in an array.')
    }
  }

  private readKey(): string {
    const start = this.index
    while (/[A-Za-z0-9_$-]/.test(this.source[this.index] ?? '') && this.index < this.source.length) this.index++
    if (start === this.index) this.fail('Expected an object key.')
    return this.source.slice(start, this.index)
  }

  private readMarkedString(): string {
    this.index += STRING_MARKER.length
    let value = ''
    while (this.index < this.source.length) {
      if (this.source.startsWith(STRING_MARKER, this.index)) {
        this.index += STRING_MARKER.length
        return value
      }
      const c = this.source[this.index++]!
      if (c === '\\' && this.index < this.source.length) value += this.source[this.index++]!
      else value += c
    }
    this.fail('Unterminated marked string.')
  }

  private readQuotedString(quote: string): string {
    this.index++
    let value = ''
    while (this.index < this.source.length) {
      const c = this.source[this.index++]!
      if (c === quote) return value
      if (c !== '\\') {
        value += c
        continue
      }
      const escaped = this.source[this.index++]
      if (escaped === undefined) this.fail('Unterminated escape sequence.')
      const replacements: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }
      if (escaped === 'u') {
        const hex = this.source.slice(this.index, this.index + 4)
        if (!/^[0-9a-f]{4}$/i.test(hex)) this.fail('Invalid Unicode escape.')
        value += String.fromCharCode(parseInt(hex, 16))
        this.index += 4
      } else value += replacements[escaped] ?? escaped
    }
    this.fail('Unterminated quoted string.')
  }

  private readPrimitive(): unknown {
    const start = this.index
    while (this.index < this.source.length && !/[\s,}\]]/.test(this.source[this.index]!)) this.index++
    const word = this.source.slice(start, this.index)
    if (word === 'true') return true
    if (word === 'false') return false
    if (word === 'null') return null
    if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(word)) {
      const value = Number(word)
      if (Number.isFinite(value)) return value
    }
    this.fail(`Unsupported value "${word.slice(0, 40)}".`)
  }

  private space(): void {
    while (/\s/.test(this.source[this.index] ?? '') && this.index < this.source.length) this.index++
  }

  private take(value: string): boolean {
    if (!this.source.startsWith(value, this.index)) return false
    this.index += value.length
    return true
  }

  private fail(message: string): never {
    throw new Error(`${message} (at character ${this.index + 1})`)
  }
}
