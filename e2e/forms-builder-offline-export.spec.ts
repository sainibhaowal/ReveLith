import { expect, test } from '@playwright/test'
import { launchShell } from './helpers'
import { buildStandaloneFormHtml } from '../apps/forms-builder/src/renderer/standaloneExport'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { FormSchema } from '../apps/forms-builder/src/renderer/types'

type AxeResult = { violations: Array<{ id: string; impact?: string; nodes: unknown[] }> }
type AxeWindow = Window & { axe: { run: (root: Document) => Promise<AxeResult> } }

test('offline form export runs locally and downloads respondent answers with file bytes', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-offline-export' })
  try {
    const schema: FormSchema = {
      id: 'offline-e2e-form', title: 'Offline form', description: 'Runs without a hosted service.',
      fields: [
        { id: 'name', type: 'text', label: 'Your name', required: true },
        { id: 'page-one', type: 'pagebreak', label: '' },
        { id: 'branch', type: 'text', label: 'Routing answer', required: true },
        { id: 'page-two', type: 'pagebreak', label: '' },
        { id: 'skip-me', type: 'text', label: 'Skipped question' },
        { id: 'page-three', type: 'pagebreak', label: '' },
        { id: 'evidence', type: 'file', label: 'Evidence file', required: true, validation: { accept: '.pdf', maxFileSizeMb: 1, maxFiles: 2 } },
      ],
      logicRules: [{ id: 'skip', name: 'Skip to upload', match: 'all', conditions: [{ fieldId: 'branch', operator: 'equals', value: 'skip' }], action: { kind: 'navigate', fieldId: 'evidence' } }],
      settings: { submitButtonText: 'Send response', showProgressBar: true, allowMultipleResponses: true, collectEmail: false, confirmationMessage: 'Saved locally.', navigationMode: 'paged' },
      theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
    }
    const exportedHtml = await buildStandaloneFormHtml(schema)
    await page.evaluate(() => {
      Object.defineProperty(window, '__offlineResponseBlob', { value: null, writable: true })
      URL.createObjectURL = (blob) => { Object.assign(window, { __offlineResponseBlob: blob }); return 'blob:offline-response-test' }
      HTMLAnchorElement.prototype.click = function () { this.dataset.downloadTriggered = 'true' }
    })
    const axeScript = readFileSync(path.resolve('node_modules/axe-core/axe.min.js'), 'utf8')
    const axeHash = createHash('sha256').update(axeScript).digest('base64')
    await page.setContent(exportedHtml.replace(/script-src ('sha256-[^']+')/, `script-src $1 'sha256-${axeHash}'`))
    await page.addScriptTag({ content: axeScript })
    const a11y = await page.evaluate(async () => (window as unknown as AxeWindow).axe.run(document))
    expect(a11y.violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length }))).toEqual([])
    await expect(page.getByRole('textbox', { name: 'Your name' })).toBeVisible()
    await expect(page.locator("meta[http-equiv='Content-Security-Policy']")).toHaveAttribute('content', /connect-src 'none'/)
    await page.getByRole('textbox', { name: 'Your name' }).fill('Ari Example')
    await page.getByRole('textbox', { name: 'Your name' }).focus()
    await page.keyboard.press('Tab')
    await expect(page.getByRole('button', { name: 'Next' })).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('textbox', { name: 'Routing answer' })).toBeVisible()
    await page.getByRole('textbox', { name: 'Routing answer' }).fill('skip')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('textbox', { name: 'Skipped question' })).toBeHidden()
    await expect(page.getByLabel('Evidence file')).toBeVisible()
    await page.locator('input[type="file"][name="evidence"]').setInputFiles({ name: 'evidence.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 offline proof') })
    await page.getByRole('button', { name: 'Send response' }).click()
    await expect(page.getByRole('heading', { name: 'Response recorded' })).toBeVisible()
    await page.getByRole('button', { name: 'Download my response and files' }).click()
    const response = await page.evaluate(async () => JSON.parse(await (window as Window & { __offlineResponseBlob: Blob }).__offlineResponseBlob.text())) as { response: { answers: Record<string, unknown>; attachments: Array<{ name: string; dataBase64: string }> } }
    expect(response.response.answers.name).toBe('Ari Example')
    expect(response.response.attachments).toHaveLength(1)
    expect(response.response.attachments[0]).toMatchObject({ name: 'evidence.pdf', dataBase64: Buffer.from('%PDF-1.7 offline proof').toString('base64') })
  } finally {
    await app.close()
  }
})

test('standalone export applies calculation rules, branches on computed answers, scores quizzes, and announces validation', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-standalone-calculation-quiz' })
  try {
    const schema: FormSchema = {
      id: 'offline-calculation-quiz', title: 'Training check', description: 'Test calculated rules and scoring.',
      fields: [
        { id: 'campaign', type: 'hidden', label: 'Campaign', defaultValue: 'winter-2026' },
        { id: 'seats', type: 'number', label: 'Number of seats', required: true, validation: { min: 1, max: 20 }, layout: { width: '100%', mediaUrl: 'https://example.com/forms-media.svg', mediaType: 'image' } },
        { id: 'quiz-page', type: 'pagebreak', label: '' },
        { id: 'answer', type: 'radio', label: 'Is three greater than two?', required: true, options: ['Yes', 'No'], correctAnswers: ['Yes'], validation: { points: 2 } },
      ],
      variables: [{ id: 'bulk', name: 'Bulk discount', type: 'number', initialValue: 0 }],
      logicRules: [
        { id: 'discount-rule', name: 'Apply bulk discount', match: 'all', conditions: [{ fieldId: 'seats', operator: 'greater_or_equal_than', value: '3' }], action: { kind: 'calculate', variableId: 'bulk', operation: 'assign', value: 5 } },
        { id: 'route-rule', name: 'Route eligible group', match: 'all', conditions: [{ fieldId: 'bulk', operator: 'equals', value: '5' }], action: { kind: 'navigate', fieldId: 'answer' } },
      ],
      settings: { submitButtonText: 'Submit', showProgressBar: true, allowMultipleResponses: true, collectEmail: false, confirmationMessage: 'Saved locally.', confirmationTitle: 'Response recorded', showQuizScore: true, navigationMode: 'paged' },
      theme: { primaryColor: '#2563eb', backgroundColor: '#fff', fontFamily: 'system-ui' },
    }
    const html = await buildStandaloneFormHtml(schema)
    await page.evaluate(() => {
      Object.defineProperty(window, '__offlineResponseBlob', { value: null, writable: true })
      URL.createObjectURL = (blob) => { Object.assign(window, { __offlineResponseBlob: blob }); return 'blob:offline-scoring-test' }
      HTMLAnchorElement.prototype.click = function () { this.dataset.downloadTriggered = 'true' }
    })
    expect(html).toContain('img-src data: blob: https:')
    expect(html).toContain('https://example.com/forms-media.svg')
    await page.setContent(html)

    await expect(page.locator('img[src="https://example.com/forms-media.svg"]')).toBeVisible()

    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.locator('#revelith-error')).toContainText('Number of seats')
    await expect(page.getByRole('spinbutton', { name: 'Number of seats' })).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByRole('spinbutton', { name: 'Number of seats' })).toHaveAttribute('aria-describedby', 'revelith-error')

    await page.getByRole('spinbutton', { name: 'Number of seats' }).fill('3')
    await page.getByRole('button', { name: 'Next' }).click()
    await expect(page.getByRole('group', { name: 'Is three greater than two?' })).toBeVisible()
    await page.getByRole('radio', { name: 'Yes' }).check()
    await page.getByRole('button', { name: 'Submit' }).click()
    await expect(page.getByRole('heading', { name: 'Response recorded' })).toBeFocused()
    await expect(page.locator('#revelith-score')).toContainText('Score: 2 / 2 (100%)')

    await page.getByRole('button', { name: 'Download my response and files' }).click()
    const response = await page.evaluate(async () => JSON.parse(await (window as Window & { __offlineResponseBlob: Blob }).__offlineResponseBlob.text())) as { response: { answers: Record<string, unknown> } }
    expect(response.response.answers).toMatchObject({
      campaign: 'winter-2026',
      seats: '3',
      answer: ['Yes'],
      _variables: { bulk: 5 },
      _quizScore: { earned: 2, possible: 2, percentage: 100 },
    })
  } finally {
    await app.close()
  }
})

test('Forms Builder imports an offline response JSON into its matching form', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-response-import' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const readReady = async () => app.evaluate(({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      return child?.executeJavaScript(`Boolean(document.querySelector('.revelith-app-ribbon'))`) ?? false
    })
    await expect.poll(readReady).toBe(true)

    const imported = await app.evaluate(async ({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder tab did not load')
      return child.executeJavaScript(`(async () => {
        window.alert = (message) => { window.__formsImportAlert = String(message) };
        const home = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Home');
        home?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        const allFieldsButton = [...document.querySelectorAll('.forms-tool-button')].find((button) => button.innerText.trim() === 'All fields');
        if (!allFieldsButton) throw new Error('All fields drawer control is missing');
        if (document.querySelector('.forms-field-palette')?.getAttribute('data-collapsed') === 'true') allFieldsButton.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        const shortText = [...document.querySelectorAll('.forms-field-list-button')].find((button) => button.innerText.includes('Short Text'));
        const fileUpload = [...document.querySelectorAll('.forms-field-list-button')].find((button) => button.innerText.includes('File Upload'));
        if (!shortText || !fileUpload) throw new Error('Required form field palette actions are missing');
        shortText.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        fileUpload.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const responseTab = document.querySelector('.forms-properties-tab[data-tab="responses"]');
        if (!responseTab) throw new Error('Responses tab is missing');
        responseTab.click();
        await new Promise((resolve) => setTimeout(resolve, 60));
        const input = document.querySelector('[aria-label="Choose a response JSON file"]');
        const storageKey = Object.keys(localStorage).find((key) => key.startsWith('revelith-forms-builder/draft/'));
        const draft = storageKey ? JSON.parse(localStorage.getItem(storageKey)) : null;
        if (!(input instanceof HTMLInputElement) || !draft?.id) throw new Error('Could not locate the active form or response import control: ' + JSON.stringify({ input: Boolean(input), storageKeys: Object.keys(localStorage), body: document.body.innerText.slice(-500) }));
        const fieldId = draft.fields?.[0]?.id;
        const fileFieldId = draft.fields?.[1]?.id;
        if (!fieldId || !fileFieldId) throw new Error('The test form questions were not saved locally');
        const packageData = { format: 'revelith-offline-response', version: 1, form: { id: draft.id, title: draft.title }, response: { id: 'offline-import-e2e-response', submittedAt: new Date().toISOString(), answers: { [fieldId]: 'Returned from a respondent', [fileFieldId]: [{ name: 'proof.pdf', type: 'application/pdf', size: 5 }] }, attachments: [{ name: 'proof.pdf', type: 'application/pdf', size: 5, dataBase64: 'JVBERi0=' }] } };
        const transfer = new DataTransfer();
        transfer.items.add(new File([JSON.stringify(packageData)], 'returned-response.json', { type: 'application/json' }));
        Object.defineProperty(input, 'files', { configurable: true, value: transfer.files });
        input.dispatchEvent(new Event('change', { bubbles: true }));
        for (let attempt = 0; attempt < 100 && !document.body.innerText.includes('1 local response') && !window.__formsImportAlert; attempt += 1) await new Promise((resolve) => setTimeout(resolve, 50));
        const details = [...document.querySelectorAll('button')].find((button) => button.innerText.includes('View details'));
        details?.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        await window.electronAPI?.setDocumentState(false, 'Response import E2E');
        return { countVisible: document.body.innerText.includes('1 local response'), answerVisible: document.body.innerText.includes('Returned from a respondent'), fileVisible: document.body.innerText.includes('Download proof.pdf'), alert: window.__formsImportAlert || null, body: document.body.innerText.slice(-500) };
      })()`)
    })
    expect(imported).toMatchObject({ countVisible: true, answerVisible: true, fileVisible: true, alert: null })
  } finally {
    await app.close()
  }
})
