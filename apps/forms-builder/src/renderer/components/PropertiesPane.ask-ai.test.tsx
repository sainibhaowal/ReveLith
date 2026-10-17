/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormField, FormSchema } from '../types'
import { PropertiesPane } from './PropertiesPane'

const field: FormField = { id: 'field-name', type: 'text', label: 'Full name', required: true }
const schema = {
  id: 'form-1',
  title: 'Registration',
  description: '',
  fields: [field],
  settings: {
    submitButtonText: 'Submit',
    showProgressBar: true,
    allowMultipleResponses: false,
    collectEmail: false,
    confirmationMessage: 'Thanks',
  },
  theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
} as FormSchema

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('selected field Ask AI control', () => {
  it('is explicit, names the selected field in its disclosure, and reports only that field ID', () => {
    const ask = vi.fn()
    act(() =>
      root.render(
        createElement(PropertiesPane, {
          schema,
          selectedField: field,
          onUpdateSchema: () => {},
          onUpdateField: () => {},
          onRemoveField: () => {},
          onDuplicateField: () => {},
          onAskAIField: ask,
          responses: [],
          onExportResponses: () => {},
          onExportResponsesJson: () => {},
          onImportResponses: async () => {},
          onDeleteResponse: () => {},
          onClearResponses: () => {},
          onDownloadAttachment: () => {},
          onTranslateForm: async () => {},
          expanded: true,
          onExpandedChange: () => {},
        }),
      ),
    )
    const button = [...host.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.trim() === 'Ask AI',
    )
    expect(button).toBeTruthy()
    expect(button!.title).toContain('response data is excluded')
    act(() => button!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(ask).toHaveBeenCalledWith('field-name')
  })
})
