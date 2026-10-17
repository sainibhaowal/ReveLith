import type { FormField, FormSubmission } from './types'
import { flattenResponseAnswers } from './responseExport'

export interface QuestionAnalytics {
  id: string
  label: string
  answered: number
  unanswered: number
  average?: number
  choices?: Array<{ label: string; count: number }>
}

export interface LocalResponseAnalytics {
  totalResponses: number
  responsesLast30Days: number
  quizAveragePercentage?: number
  questions: QuestionAnalytics[]
}

function questionFields(fields: FormField[]): FormField[] {
  return fields.flatMap((field) => field.type === 'group' ? questionFields(field.children ?? []) : field.type === 'section' || field.type === 'pagebreak' || field.type === 'statement' || field.type === 'welcome' || field.type === 'thankyou' || field.type === 'hidden' ? [] : [field])
}

export function analyzeLocalResponses(fields: FormField[], responses: FormSubmission[], now = Date.now()): LocalResponseAnalytics {
  const rows = responses.map((response) => ({ response, answers: flattenResponseAnswers(fields, response.answers) }))
  const cutoff = now - 30 * 24 * 60 * 60 * 1000
  const quizzes = responses.map((response) => response.answers._quizScore).filter((score): score is { earned: number; possible: number } => Boolean(score && typeof score === 'object' && typeof (score as { earned?: unknown }).earned === 'number' && typeof (score as { possible?: unknown }).possible === 'number' && (score as { possible: number }).possible > 0))
  const questions = questionFields(fields).map((field): QuestionAnalytics => {
    const values = rows.map(({ answers }) => answers[field.id]).filter((value) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0))
    const question: QuestionAnalytics = { id: field.id, label: field.label, answered: values.length, unanswered: Math.max(0, responses.length - values.length) }
    const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    if (numbers.length) question.average = numbers.reduce((sum, value) => sum + value, 0) / numbers.length
    const choiceCounts = new Map<string, number>()
    for (const value of values) {
      const choices = Array.isArray(value) ? value : [value]
      for (const choice of choices) {
        const label = typeof choice === 'string' ? choice : typeof choice === 'number' ? String(choice) : ''
        if (label) choiceCounts.set(label, (choiceCounts.get(label) ?? 0) + 1)
      }
    }
    if (choiceCounts.size) question.choices = [...choiceCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)).slice(0, 12)
    return question
  })
  return {
    totalResponses: responses.length,
    responsesLast30Days: responses.filter((response) => Date.parse(response.submittedAt) >= cutoff && Date.parse(response.submittedAt) <= now).length,
    quizAveragePercentage: quizzes.length ? quizzes.reduce((sum, score) => sum + score.earned / score.possible * 100, 0) / quizzes.length : undefined,
    questions,
  }
}
