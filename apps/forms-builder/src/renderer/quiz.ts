import type { FormField } from './types'

export interface FormQuizScore {
  earned: number
  possible: number
  percentage: number
}

export function randomizeChoiceOrder(options: string[], random: () => number = Math.random): string[] {
  const values = [...options]
  for (let index = values.length - 1; index > 0; index--) {
    const sample = random()
    const swap = Math.min(index, Math.max(0, Math.floor(sample * (index + 1))))
    ;[values[index], values[swap]] = [values[swap]!, values[index]!]
  }
  return values
}

/** Scores only fields with an explicit expected answer; unanswered and malformed values earn zero. */
export function calculateQuizScore(fields: FormField[], answers: Record<string, unknown>): FormQuizScore | undefined {
  let earned = 0
  let possible = 0
  let scoredFields = 0
  for (const field of fields) {
    const points = field.validation?.points ?? 1
    if (!Number.isFinite(points) || points < 0) continue
    if (field.validation?.expectedAnswer !== undefined) {
      scoredFields++
      possible += points
      const actual = answers[field.id]
      const expected = field.validation.expectedAnswer.trim().toLocaleLowerCase()
      const value = actual == null ? '' : String(actual).trim().toLocaleLowerCase()
      if (value !== '' && value === expected) earned += points
      continue
    }
    const correct = field.correctAnswers
    if (!correct?.length) continue
    scoredFields++
    const expected = new Set(correct.map((item) => item.trim().toLocaleLowerCase()))
    const isMulti = field.type === 'checkbox'
    possible += isMulti ? correct.length * points : points
    const actual = answers[field.id]
    const selected = (Array.isArray(actual) ? actual : actual == null ? [] : [actual]).map((item) => String(item).trim().toLocaleLowerCase())
    if (isMulti) earned += selected.filter((item) => expected.has(item)).length * points
    else if (selected.length && expected.has(selected[0]!)) earned += points
  }
  if (!scoredFields) return undefined
  return { earned, possible, percentage: possible === 0 ? 0 : Math.round((earned / possible) * 10000) / 100 }
}
