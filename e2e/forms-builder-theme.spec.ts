import { expect, test } from '@playwright/test'
import { launchShell } from './helpers'

test('Forms Builder authoring canvas follows ReveLith theme while respondent preview preserves the form theme', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, settings: { theme: 'light' }, videoDir: 'forms-builder-theme' })

  try {
    await page.evaluate(async () => {
      await window.aiOffice.setTheme('light')
      await window.aiOffice.newFormsBuilder()
    })

    const addField = () => app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
        view.webContents.getURL().toLowerCase().includes('forms-builder'),
      )
      if (!child) return false
      return child.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('.forms-field-list-button');
        if (!button) return false;
        button.click();
        return true;
      })()`)
    })
    await expect.poll(addField).toBe(true)

    const readThemeStyles = async () => app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
        view.webContents.getURL().toLowerCase().includes('forms-builder'),
      )
      if (!child) return null
      return child.webContents.executeJavaScript(`(() => {
        const title = document.querySelector('input[placeholder="Form title"]');
        const description = document.querySelector('input[placeholder="Form description (optional)"]');
        const canvas = document.querySelector('.forms-canvas');
        const paper = canvas?.querySelector('[style*="box-shadow"]');
        const workbench = document.querySelector('.app') ?? document.body;
        const properties = document.querySelector('.forms-properties-pane');
        const propertyTabs = document.querySelector('.forms-properties-tabs');
        const questionLabel = document.querySelector('.field-renderer label');
        const fieldInput = document.querySelector('.field-renderer input:not([type="hidden"]):not([type="color"])');
        const styles = (element) => element ? getComputedStyle(element) : null;
        return {
          titleBackground: styles(title)?.backgroundColor,
          titleColor: styles(title)?.color,
          descriptionBackground: styles(description)?.backgroundColor,
          descriptionColor: styles(description)?.color,
          paperBackground: styles(paper)?.backgroundColor,
          paperColor: styles(paper)?.color,
          questionLabelColor: styles(questionLabel)?.color,
          fieldInputColor: styles(fieldInput)?.color,
          fieldInputBackground: styles(fieldInput)?.backgroundColor,
          workbenchBackground: styles(workbench)?.backgroundColor,
          formCanvasBackground: styles(canvas)?.backgroundColor,
          formPreview: canvas?.getAttribute('data-form-preview'),
            propertiesWidth: properties?.getBoundingClientRect().width ?? 0,
            propertyTabScrolls: (propertyTabs?.scrollWidth ?? 0) > (propertyTabs?.clientWidth ?? 0),
            propertyTextColor: styles(document.querySelector('.forms-properties-content'))?.color,
            theme: document.documentElement.getAttribute('data-theme'),
          usesOriginalComposer: Boolean(document.querySelector('.revelith-app-chat .ai-input-box textarea')),
          usesOriginalSideControl: Boolean(document.querySelector('.revelith-app-chat .ai-panel-side-button')),
          hasOriginalThinkingAnimation: [...document.styleSheets].some((sheet) => {
            try { return [...sheet.cssRules].some((rule) => rule.name === 'revelith-ai-thinking-shimmer'); }
            catch { return false; }
          }),
          hasRedundantTitlebar: document.querySelector('.revelith-app-ribbon-titlebar') !== null,
          duplicateFileStatus: [...document.querySelectorAll('.revelith-app-ribbon-status')].some((node) => node.textContent?.trim() === 'Untitled Form'),
        };
      })()`)
    })

    await expect.poll(readThemeStyles).not.toBeNull()
    await page.evaluate(() => window.aiOffice.setTheme('dark'))
    await expect.poll(async () => (await readThemeStyles())?.theme).toBe('dark')
    await expect.poll(async () => (await readThemeStyles())?.formCanvasBackground).toBe('rgb(43, 43, 43)')
    const dark = await readThemeStyles()
    const clickFormView = (title) => app.evaluate(async ({ BrowserWindow }, buttonTip) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
        view.webContents.getURL().toLowerCase().includes('forms-builder'),
      )
      if (!child) return false
      return child.webContents.executeJavaScript(`(() => {
        const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('data-tip') === ${JSON.stringify(buttonTip)});
        if (!button) return false;
        button.click();
        return true;
      })()`)
    }, title === 'Preview' ? 'Preview as a respondent' : 'Return to the form editor')
    expect(await clickFormView('Preview')).toBe(true)
    await expect.poll(async () => (await readThemeStyles())?.formPreview).toBe('true')
    await expect.poll(async () => (await readThemeStyles())?.formCanvasBackground).toBe('rgb(248, 250, 252)')
    const darkPreview = await readThemeStyles()
    expect(await clickFormView('Design')).toBe(true)
    await expect.poll(async () => (await readThemeStyles())?.formPreview).toBe('false')
    await expect.poll(async () => (await readThemeStyles())?.formCanvasBackground).toBe('rgb(43, 43, 43)')
    await page.evaluate(() => window.aiOffice.setTheme('light'))
    await expect.poll(async () => (await readThemeStyles())?.theme).toBe('light')
    await expect.poll(async () => (await readThemeStyles())?.formCanvasBackground).toBe('rgb(230, 230, 230)')
    const light = await readThemeStyles()
    if (!dark || !light) throw new Error('Forms Builder theme state was not available.')

    for (const theme of [dark, light]) {
      expect(theme.titleBackground).toBe('rgba(0, 0, 0, 0)')
      expect(theme.descriptionBackground).toBe('rgba(0, 0, 0, 0)')
      expect(theme.formPreview).toBe('false')
      expect(theme.propertiesWidth).toBeGreaterThanOrEqual(320)
      expect(theme.propertyTextColor).not.toBe('rgba(0, 0, 0, 0)')
      expect(theme.hasRedundantTitlebar).toBe(false)
      expect(theme.duplicateFileStatus).toBe(false)
      expect(theme.usesOriginalComposer).toBe(true)
      expect(theme.usesOriginalSideControl).toBe(true)
      expect(theme.hasOriginalThinkingAnimation).toBe(true)
    }
    expect(dark.workbenchBackground).not.toBe(light.workbenchBackground)
    expect(dark.paperBackground).toBe('rgb(37, 37, 37)')
    expect(dark.paperColor).toBe('rgb(228, 228, 228)')
    expect(dark.titleColor).toBe('rgb(228, 228, 228)')
    expect(dark.descriptionColor).toBe('rgb(160, 160, 160)')
    expect(dark.formCanvasBackground).toBe('rgb(43, 43, 43)')
    expect(dark.questionLabelColor).toBe('rgb(228, 228, 228)')
    expect(dark.fieldInputColor).toBe('rgb(228, 228, 228)')
    expect(dark.fieldInputBackground).toBe('rgb(30, 30, 30)')
    expect(light.paperBackground).toBe('rgb(255, 255, 255)')
    expect(light.paperColor).toBe('rgb(31, 41, 55)')
    expect(light.formCanvasBackground).toBe('rgb(230, 230, 230)')
    expect(darkPreview?.formPreview).toBe('true')
    expect(darkPreview?.paperBackground).toBe('rgb(255, 255, 255)')
    expect(darkPreview?.paperColor).toBe('rgb(31, 41, 55)')
    expect(darkPreview?.formCanvasBackground).toBe('rgb(248, 250, 252)')
    expect(darkPreview?.fieldInputColor).toBe('rgb(31, 41, 55)')
    expect(darkPreview?.fieldInputBackground).toBe('rgb(255, 255, 255)')
  } finally {
    await app.close()
  }
})

test('Tasks and Drawboard share the compact light/dark ReveLith ribbon', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'new-app-ribbon-themes' })

  try {
    const apps = [
      { method: 'newTasks', slug: 'tasks', urlSlug: 'tasks' },
      // Drawboard currently ships from the legacy whiteboard workspace path.
      { method: 'newDrawboard', slug: 'drawboard', urlSlug: 'whiteboard' },
    ]
    for (const item of apps) {
      await page.evaluate(async (method) => {
        const api = window.aiOffice as unknown as Record<string, () => Promise<void>>
        await api[method]?.()
      }, item.method)
      const readTheme = () => app.evaluate(async ({ webContents }, appInfo) => {
        const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes(appInfo.urlSlug))
        if (!child) return null
        return child.executeJavaScript(`(async () => {
          const read = () => {
            const ribbon = document.querySelector('[data-revelith-ribbon]');
            const tabs = ribbon?.querySelector('[role="tablist"]');
            const active = tabs?.querySelector('[role="tab"][aria-selected="true"]');
            const chat = document.querySelector(${JSON.stringify(appInfo.slug === 'drawboard' ? '.revelith-board-chat' : '.revelith-app-chat')});
            return {
              hasTitlebar: Boolean(ribbon?.querySelector('.revelith-app-ribbon-titlebar')),
              label: tabs?.getAttribute('aria-label'),
              tabBackground: tabs ? getComputedStyle(tabs).backgroundColor : null,
              activeText: active ? getComputedStyle(active).color : null,
              workbenchBackground: getComputedStyle(document.body).backgroundColor,
              usesOriginalComposer: Boolean(chat?.querySelector('.ai-input-box textarea')),
              usesOriginalSideControl: Boolean(chat?.querySelector('.ai-panel-side-button')),
              hasOriginalThinkingAnimation: [...document.styleSheets].some((sheet) => {
                try { return [...sheet.cssRules].some((rule) => rule.name === 'revelith-ai-thinking-shimmer'); }
                catch { return false; }
              }),
              emptyState: chat?.querySelector('.ai-chat-empty-title')?.textContent?.trim() ?? '',
            };
          };
          document.documentElement.setAttribute('data-theme', 'dark');
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          const dark = read();
          document.documentElement.setAttribute('data-theme', 'light');
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          return { dark, light: read() };
        })()`)
      }, item)
      await expect.poll(readTheme, { timeout: 20_000 }).not.toBeNull()
      const styles = await readTheme()
      expect(styles?.dark.hasTitlebar, item.slug).toBe(false)
      expect(styles?.light.hasTitlebar, item.slug).toBe(false)
      expect(styles?.dark.label, item.slug).toContain('tools')
      expect(styles?.light.label, item.slug).toContain('tools')
      expect(styles?.dark.workbenchBackground, item.slug).not.toBe(styles?.light.workbenchBackground)
      expect(styles?.dark.usesOriginalComposer, item.slug).toBe(true)
      expect(styles?.dark.usesOriginalSideControl, item.slug).toBe(true)
      expect(styles?.dark.hasOriginalThinkingAnimation, item.slug).toBe(true)
      expect(styles?.dark.emptyState, item.slug).toContain('Let ReveLith help you')
    }
  } finally {
    await app.close()
  }
})
