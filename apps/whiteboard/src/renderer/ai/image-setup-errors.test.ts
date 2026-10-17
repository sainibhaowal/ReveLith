import { describe, expect, it } from 'vitest'
import { formatImageSetupError } from './image-setup-errors'

describe('formatImageSetupError', () => {
  it('turns settings permission failures into concise actionable copy', () => {
    const message = formatImageSetupError(
      new Error(
        "Error invoking remote method 'ai:set-settings': EPERM C:\\Users\\Ravin\\Temp\\settings.tmp",
      ),
      'save',
    )
    expect(message).toBe(
      'Could not save the image provider settings: ReveLith cannot write the AI settings file. Check app permissions and try again.',
    )
    expect(message).not.toContain('C:\\Users')
  })

  it('truncates unusually long provider errors and handles unknown values', () => {
    expect(formatImageSetupError(new Error('provider '.repeat(80)), 'test')).toHaveLength(240)
    expect(formatImageSetupError({ reason: 'offline' }, 'check availability')).toBe(
      'Could not check image-provider availability. Please try again.',
    )
  })
})
