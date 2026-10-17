import { describe, expect, it } from 'vitest'
import { calculateQuizScore, randomizeChoiceOrder } from './quiz'
import type { FormField } from './types'

const fields: FormField[] = [
  {
    id: 'capital',
    type: 'radio',
    label: 'Capital',
    required: false,
    options: ['Paris', 'Berlin'],
    correctAnswers: ['Paris'],
    validation: { points: 2 },
  },
  {
    id: 'tools',
    type: 'checkbox',
    label: 'Tools',
    required: false,
    options: ['Mail', 'Docs', 'Chat'],
    correctAnswers: ['Mail', 'Docs'],
    validation: { points: 1 },
  },
  {
    id: 'explain',
    type: 'text',
    label: 'Explain',
    required: false,
    validation: { expectedAnswer: '42', points: 3 },
  },
]

describe('quiz scoring', () => {
  it('randomizes a copy of choices using Fisher-Yates while leaving authored order untouched', () => {
    const authored = ['A', 'B', 'C']
    expect(randomizeChoiceOrder(authored, () => 0)).toEqual(['B', 'C', 'A'])
    expect(authored).toEqual(['A', 'B', 'C'])
    expect(randomizeChoiceOrder(authored, () => 0.999)).toEqual(authored)
  })

  it('awards configured points and partial checkbox credit without depending on choice order', () => {
    expect(
      calculateQuizScore(fields, { capital: 'Paris', tools: ['Docs'], explain: ' 42 ' }),
    ).toEqual({ earned: 6, possible: 7, percentage: 85.71 })
  })

  it('returns zero earned credit for wrong or missing answers and omits unconfigured quizzes', () => {
    expect(calculateQuizScore(fields, { capital: 'Rome', tools: ['Mail', 'Chat'] })).toEqual({
      earned: 1,
      possible: 7,
      percentage: 14.29,
    })
    expect(
      calculateQuizScore([{ id: 'q', type: 'text', label: 'Q', required: false }], {}),
    ).toBeUndefined()
  })
})
