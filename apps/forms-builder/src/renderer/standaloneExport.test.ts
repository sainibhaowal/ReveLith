import { describe, expect, it } from 'vitest'
import type { FormSchema } from './types'
import { buildStandaloneFormHtml } from './standaloneExport'

const form: FormSchema = {
  id: 'offline-form', title: 'Local <form>', description: 'No network required.', fields: [{ id: 'name', type: 'text', label: 'Name', required: true }],
  settings: { submitButtonText: 'Send', showProgressBar: false, allowMultipleResponses: true, collectEmail: false, confirmationMessage: 'Thank you.' },
  theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
}

describe('offline respondent HTML export', () => {
  it('embeds escaped schema, a hash-locked script, and local iframe instructions without network access', async () => {
    const html = await buildStandaloneFormHtml(form)
    expect(html).toContain('Local &lt;form&gt;')
    expect(html).toContain("connect-src 'none'")
    expect(html).toMatch(/script-src 'sha256-[A-Za-z0-9+/]+=*'/)
    expect(html).toContain('revelith-offline-responses/')
    expect(html).toContain('&lt;iframe src=&quot;./local-form-offline.html&quot;')
    expect(html).not.toContain('<script src=')
  })
})
