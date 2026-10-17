/**
 * Date maths for the calendar and gantt views.
 *
 * Everything here works on plain `YYYY-MM-DD` strings rather than `Date`
 * objects. The board stores date-only values on purpose (a due date is a day,
 * not an instant), so these helpers never introduce a timezone: they add
 * calendar days arithmetically and format from parts.
 */

export const DAY_MS = 86_400_000

/** Parse `YYYY-MM-DD` into a UTC timestamp at midnight. */
export function parseDay(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`)
}

/** The `YYYY-MM-DD` string for a timestamp, in UTC. */
export function toDay(value: number): string {
  return new Date(value).toISOString().slice(0, 10)
}

/** Today's date string. */
export function today(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** Shift a date string by whole days. */
export function addDays(iso: string, days: number): string {
  return toDay(parseDay(iso) + days * DAY_MS)
}

/** Whole days from `a` to `b`; negative when `b` is earlier. */
export function daysBetween(a: string, b: string): number {
  return Math.round((parseDay(b) - parseDay(a)) / DAY_MS)
}

export interface MonthGrid {
  /** The first day of the grid, which may fall in the previous month. */
  start: string
  days: string[]
  weeks: string[][]
}

/**
 * A 6x7 grid covering `month`, padded so every week is complete.
 *
 * `weekStartsOn` is 0 for Sunday and 1 for Monday, matching the preference in
 * settings rather than hard-coding a locale.
 */
export function monthGrid(month: string, weekStartsOn: 0 | 1 = 1): MonthGrid {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7)) - 1
  const first = `${year}-${String(index + 1).padStart(2, '0')}-01`
  const firstWeekday = (new Date(`${first}T00:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7
  const start = addDays(first, -firstWeekday)

  const days: string[] = []
  for (let i = 0; i < 42; i += 1) days.push(addDays(start, i))

  const weeks: string[][] = []
  for (let i = 0; i < 42; i += 7) weeks.push(days.slice(i, i + 7))
  return { start, days, weeks }
}

/** Step a `YYYY-MM` month key forward or back by whole months. */
export function shiftMonth(month: string, delta: number): string {
  const year = Number(month.slice(0, 4))
  const index = Number(month.slice(5, 7)) - 1 + delta
  const date = new Date(Date.UTC(year, index, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function monthLabel(month: string): string {
  return `${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}

/** Human-friendly relative wording used by both the calendar and gantt. */
export function relativeDay(day: string, reference = today()): string {
  const delta = daysBetween(reference, day)
  if (delta === 0) return 'Today'
  if (delta === 1) return 'Tomorrow'
  if (delta === -1) return 'Yesterday'
  if (delta > 1 && delta <= 7) return `In ${delta} days`
  if (delta < -1 && delta >= -7) return `${Math.abs(delta)} days ago`
  return day
}

/**
 * The span a task occupies, as inclusive start/end days.
 *
 * A task with only a due date is a single day. A start date after the due date
 * would produce a negative span, so the later of the two is used as the end.
 */
export interface Span {
  start: string
  end: string
}

export function spanOf(startDate: string | null, dueDate: string | null): Span | null {
  if (!startDate && !dueDate) return null
  const start = startDate ?? dueDate!
  const end = startDate && dueDate ? (startDate > dueDate ? startDate : dueDate) : (dueDate ?? startDate)!
  return { start, end }
}

/** Inclusive length of a span in days. */
export function spanLength(span: Span): number {
  return daysBetween(span.start, span.end) + 1
}