import { describe, expect, it } from 'vitest'
import { analyzeLocalResponses } from './responseAnalytics'

const fields = [
  { id: 'rating', type: 'rating', label: 'Rating', required: false },
  { id: 'choice', type: 'radio', label: 'Choice', required: false, options: ['A', 'B'] },
] as const

describe('local response analytics', () => {
  it('calculates only submission-backed counts, distributions, numeric averages, and quiz scores', () => {
    const now = Date.parse('2026-10-06T12:00:00Z')
    const analytics = analyzeLocalResponses(fields as never, [
      { id: '1', submittedAt: '2026-10-01T10:00:00Z', answers: { rating: 4, choice: 'A', _quizScore: { earned: 2, possible: 2 } } },
      { id: '2', submittedAt: '2026-08-01T10:00:00Z', answers: { rating: 2, choice: 'A', _quizScore: { earned: 1, possible: 2 } } },
      { id: '3', submittedAt: '2026-10-05T10:00:00Z', answers: { rating: 5, choice: 'B' } },
    ], now)
    expect(analytics.totalResponses).toBe(3)
    expect(analytics.responsesLast30Days).toBe(2)
    expect(analytics.quizAveragePercentage).toBe(75)
    expect(analytics.questions[0]).toMatchObject({ answered: 3, unanswered: 0, average: 11 / 3 })
    expect(analytics.questions[1]?.choices).toEqual([{ label: 'A', count: 2 }, { label: 'B', count: 1 }])
  })

  it('reports blank answers without inventing visit or drop-off metrics', () => {
    const analytics = analyzeLocalResponses(fields as never, [{ id: '1', submittedAt: '2026-10-05T10:00:00Z', answers: {} }], Date.parse('2026-10-06T12:00:00Z'))
    expect(analytics.questions.map((question) => question.unanswered)).toEqual([1, 1])
    expect(analytics).not.toHaveProperty('views')
    expect(analytics).not.toHaveProperty('dropOff')
  })
})
