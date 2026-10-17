export type ImageSetupOperation = 'save' | 'test' | 'sign-in' | 'check availability'

const operationLabel: Record<ImageSetupOperation, string> = {
  save: 'save the image provider settings',
  test: 'test the image provider',
  'sign-in': 'start ReveLith sign-in',
  'check availability': 'check image-provider availability',
}

export function formatImageSetupError(error: unknown, operation: ImageSetupOperation): string {
  const detail =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : ''
  const action = operationLabel[operation]

  if (/\b(EPERM|EACCES|permission denied)\b/i.test(detail)) {
    return `Could not ${action}: ReveLith cannot write the AI settings file. Check app permissions and try again.`
  }
  if (/Error invoking remote method|ERR_IPC/i.test(detail)) {
    return `Could not ${action}: the ReveLith settings service returned an error. Restart ReveLith and try again.`
  }

  const compact = detail.replace(/\s+/g, ' ').trim()
  if (!compact) return `Could not ${action}. Please try again.`

  const message = `Could not ${action}: ${compact}`
  return message.length > 240 ? `${message.slice(0, 237).trimEnd()}...` : message
}
