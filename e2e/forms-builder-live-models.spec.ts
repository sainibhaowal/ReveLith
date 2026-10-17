import { expect, test } from '@playwright/test'
import { launchShell } from './helpers'

const models = ['google/gemma-4-e4b', 'nvidia/nemotron-3-nano-4b'] as const

for (const model of models) {
  test(`Forms Builder executes a real add-field tool call with ${model}`, async () => {
    test.setTimeout(240_000)
    const label = `Live model tool ${model.split('/').at(-1)}`
    const { app, page } = await launchShell({
      onboardingSeen: true,
      aiSettings: { provider: 'lmstudio', providers: { lmstudio: { model, baseUrl: 'http://127.0.0.1:1234/v1', apiKey: '' } } },
      videoDir: `forms-live-${model.split('/').at(-1)}`,
    })
    try {
      await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
      const run = <T,>(script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
        const view = BrowserWindow.getAllWindows()[0]?.contentView.children.find((candidate) => candidate.webContents.getURL().toLowerCase().includes('forms-builder'))
        if (!view) return null
        return view.webContents.executeJavaScript(source)
      }, script) as Promise<T>

      await expect.poll(() => run<string>('window.location.href')).toContain('forms-builder')
      await expect.poll(() => run<boolean>('Boolean(document.querySelector(".revelith-app-chat textarea:not(:disabled)"))')).toBe(true)
      const submitted = await run<boolean>(`(() => {
        const input = document.querySelector('.revelith-app-chat textarea');
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        if (!input || !setter) return false;
        setter.call(input, ${JSON.stringify(`Use add_form_field with this exact input: {"type":"text","label":"${label}"}. Execute the tool now and report the result.`)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const send = [...document.querySelectorAll('.revelith-app-chat button')].find((button) => button.getAttribute('aria-label') === 'Send');
        if (!send || send.disabled) return false;
        send.click();
        return true;
      })()`)
      expect(submitted).toBe(true)
      await expect.poll(() => run<string>('document.querySelector(".revelith-app-chat-log")?.innerText ?? ""'), {
        timeout: 180_000,
        message: `${model} should invoke add_form_field and finish the chat turn`,
      }).toContain(label)
      await expect.poll(() => run<boolean>(`document.body.innerText.includes(${JSON.stringify(label)})`)).toBe(true)
    } finally {
      await app.close()
    }
  })
}
