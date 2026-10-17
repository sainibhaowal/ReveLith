import { expect, test } from '@playwright/test'
import { launchShell } from './helpers'

test('Forms Builder ribbon, respondent preview, validation, and local response export surface', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-authoring' })

  try {
    await app.evaluate(({ app }) => {
      const events: Array<Record<string, unknown>> = []
      ;(globalThis as typeof globalThis & { __formsEvents?: Array<Record<string, unknown>> }).__formsEvents = events
      app.on('web-contents-created', (_event, contents) => {
        contents.on('did-fail-load', (_loadEvent, code, description, url) => events.push({ type: 'fail', code, description, url }))
        contents.on('did-finish-load', () => events.push({ type: 'finish', url: contents.getURL() }))
        contents.on('render-process-gone', (_goneEvent, details) => events.push({ type: 'gone', details }))
        contents.on('console-message', (_consoleEvent, level, message, line, sourceId) => events.push({ type: 'console', level, message, line, sourceId }))
      })
    })
    await page.evaluate(async () => {
      await window.aiOffice.newFormsBuilder()
    })

    const readFormsUi = async () => app.evaluate(async ({ BrowserWindow, app, webContents }) => {
      const views = BrowserWindow.getAllWindows()[0]?.contentView.children ?? []
      const candidates = webContents.getAllWebContents()
      const child = candidates.find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) return { ready: false, tabs: [], hasChat: false, urls: await Promise.all(candidates.map(async (contents) => ({ url: contents.getURL(), title: contents.getTitle(), loading: contents.isLoading(), crashed: contents.isCrashed(), id: contents.id, document: await contents.executeJavaScript('({ href: location.href, readyState: document.readyState, title: document.title, body: document.body?.innerText?.slice(0,200) })').catch(() => null) }))), viewIds: views.map((view) => view.webContents.id), appPath: app.getAppPath() }
      return child.executeJavaScript(`(() => ({
        ready: Boolean(document.querySelector('.revelith-app-ribbon')),
        tabs: [...document.querySelectorAll('.revelith-app-ribbon [role="tab"]')].map((tab) => tab.innerText.trim()),
        hasChat: document.querySelector('.revelith-app-chat[data-collapsed="false"]') !== null,
        chatTransition: (() => { const chat = document.querySelector('.revelith-app-chat'); return chat ? getComputedStyle(chat).transitionProperty + ' ' + getComputedStyle(chat).transitionDuration : '' })(),
        hasRedundantTitlebar: document.querySelector('.revelith-app-ribbon-titlebar') !== null,
      }))()`)
    })

    await expect.poll(readFormsUi).toMatchObject({
      ready: true,
      tabs: ['File', 'Home', 'Insert', 'Design', 'Logic', 'View', 'Settings'],
      hasChat: true,
      hasRedundantTitlebar: false,
    })
    expect((await readFormsUi()).chatTransition).toContain('width 0.18s')

    const previewResult = await app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) =>
        view.webContents.getURL().toLowerCase().includes('forms-builder'),
      )
      if (!child) throw new Error('Forms Builder tab did not load')
      return child.webContents.executeJavaScript(`(async () => {
        const clickButton = (name) => {
          const button = [...document.querySelectorAll('button')].find((candidate) => candidate.innerText.trim().toLowerCase() === name.toLowerCase() || candidate.innerText.toLowerCase().includes(name.toLowerCase()));
          if (!button) throw new Error('Missing button: ' + name + '; buttons=' + [...document.querySelectorAll('button')].map((candidate) => candidate.innerText.trim()).join('|'));
          button.click();
        };
        const clickTab = (name) => {
          const button = [...document.querySelectorAll('[role="tablist"] [role="tab"]')].find((candidate) => candidate.innerText.trim() === name);
          if (!button) throw new Error('Missing ribbon tab: ' + name);
          button.click();
        };
        const clickActiveRibbonAction = (name) => {
          const panel = document.querySelector('[role="tabpanel"]:not([hidden])');
          const button = [...(panel?.querySelectorAll('button') ?? [])].find((candidate) => candidate.innerText.trim().toLowerCase() === name.toLowerCase());
          if (!button) throw new Error('Missing active ribbon action: ' + name);
          button.click();
        };
        clickTab('Insert');
        await new Promise((resolve) => setTimeout(resolve, 30));
        clickButton('Short Text');
        await new Promise((resolve) => setTimeout(resolve, 50));
        const requiredLabel = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Required');
        const required = requiredLabel?.querySelector('input[type="checkbox"]');
        if (!required) throw new Error('Required field control is missing');
        required.click();
        const expectedAnswer = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Expected answer')?.parentElement?.querySelector('input');
        if (!(expectedAnswer instanceof HTMLInputElement)) throw new Error('Quiz expected-answer control is missing; labels=' + [...document.querySelectorAll('label')].map((label) => label.innerText.trim()).join('|'));
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(expectedAnswer, 'Ari Example');
        expectedAnswer.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        const propertiesSettings = [...document.querySelectorAll('button')].filter((button) => button.innerText.trim().toLowerCase() === 'settings').at(-1);
        propertiesSettings?.click(); await new Promise((resolve) => setTimeout(resolve, 30));
        const showScore = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Show quiz score after submission'))?.querySelector('input[type="checkbox"]');
        if (!(showScore instanceof HTMLInputElement)) throw new Error('Quiz score display setting is missing');
        showScore.click();
        clickTab('View');
        await new Promise((resolve) => setTimeout(resolve, 30));
        clickActiveRibbonAction('Preview');
        await new Promise((resolve) => setTimeout(resolve, 50));
        clickButton('Submit');
        await new Promise((resolve) => setTimeout(resolve, 40));
        const validationWorks = document.body.innerText.includes('is required.');
        const input = document.querySelector('.field-renderer input');
        if (!(input instanceof HTMLInputElement)) throw new Error('Respondent preview input is missing');
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(input, 'Ari Example');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        clickButton('Submit');
        await new Promise((resolve) => setTimeout(resolve, 80));
        const submitted = document.body.innerText.includes('Response recorded');
        const quizScoreShown = document.body.innerText.includes('Your score: 1 of 1 (100%)');
        clickTab('View');
        await new Promise((resolve) => setTimeout(resolve, 20));
        clickActiveRibbonAction('Design');
        await new Promise((resolve) => setTimeout(resolve, 30));
        const responsesTab = document.querySelector('.forms-properties-tab[data-tab="responses"]');
        if (!(responsesTab instanceof HTMLButtonElement)) throw new Error('Responses properties tab is missing');
        responsesTab.click();
        await new Promise((resolve) => setTimeout(resolve, 30));
        const localResponseSaved = document.body.innerText.includes('1 local response');
        const quizScoreStored = document.body.innerText.includes('Quiz score: 1 / 1');
        const details = [...document.querySelectorAll('button')].find((button) => button.innerText.includes('View details'));
        details?.click(); await new Promise((resolve) => setTimeout(resolve, 30));
        const fullDetailsVisible = document.body.innerText.includes('Ari Example');
        const search = [...document.querySelectorAll('label')].find((label) => label.innerText.includes('Search responses'))?.parentElement?.querySelector('input');
        if (!(search instanceof HTMLInputElement)) throw new Error('Response search field is missing');
        const searchSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        searchSetter?.call(search, 'no matching response'); search.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        const searchFiltersResponses = document.body.innerText.includes('No responses match this search.');
        return { validationWorks, submitted, quizScoreShown, localResponseSaved, quizScoreStored, fullDetailsVisible, searchFiltersResponses };
      })()`)
    })

    expect(previewResult).toEqual({ validationWorks: true, submitted: true, quizScoreShown: true, localResponseSaved: true, quizScoreStored: true, fullDetailsVisible: true, searchFiltersResponses: true })
  } finally {
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false })
    }).catch(() => {})
    await app.close()
  }
})

test('a fresh Forms Builder tab restores its local draft when that tab reloads', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-draft-reload' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const findFormsTab = async () => app.evaluate(({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      return child?.executeJavaScript(`({ ready: Boolean(document.querySelector('.revelith-app-ribbon')), freshFlag: new URL(location.href).searchParams.has('newDocument') })`) ?? null
    })
    await expect.poll(findFormsTab).toMatchObject({ ready: true, freshFlag: false })

    const createDraft = async () => app.evaluate(async ({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder tab did not load')
      return child.executeJavaScript(`(async () => {
        const insert = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Insert');
        insert?.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        const field = [...document.querySelectorAll('.forms-tool-button')].find((button) => button.innerText.includes('Short Text') && button.offsetWidth > 0);
        field?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { key: Object.keys(localStorage).find((key) => key.startsWith('revelith-forms-builder/draft/')), fieldCount: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('revelith-forms-builder/draft/')) || '') || '{}').fields?.length };
      })()`)
    })
    const beforeReload = await createDraft()
    expect(beforeReload.fieldCount).toBe(1)

    await app.evaluate(({ webContents }) => {
      webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))?.reload()
    })
    await expect.poll(async () => app.evaluate(({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      return child?.executeJavaScript(`({ ready: Boolean(document.querySelector('.revelith-app-ribbon')), fields: (() => { const key = Object.keys(localStorage).find((item) => item.startsWith('revelith-forms-builder/draft/')); return key ? JSON.parse(localStorage.getItem(key)).fields.length : -1 })() })`) ?? null
    })).toMatchObject({ ready: true, fields: 1 })
  } finally {
    await app.close()
  }
})

test('a new Forms task starts blank and can restore a local draft from an earlier app session', async () => {
  const first = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-recovery-first-session' })
  let second: Awaited<ReturnType<typeof launchShell>> | undefined
  try {
    await first.page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => first.app.evaluate(({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      return child?.executeJavaScript(`Boolean(document.querySelector('.revelith-app-ribbon'))`) ?? false
    })).toBe(true)
    const addDraftQuestion = async () => first.app.evaluate(async ({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder tab did not load')
      return child.executeJavaScript(`(async () => {
        const insert = [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Insert');
        insert?.click();
        await new Promise((resolve) => setTimeout(resolve, 20));
        [...document.querySelectorAll('.forms-tool-button')].find((button) => button.innerText.includes('Short Text') && button.offsetWidth > 0)?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        return { fields: JSON.parse(localStorage.getItem(Object.keys(localStorage).find((key) => key.startsWith('revelith-forms-builder/draft/')) || '') || '{}').fields?.length, status: document.body.innerText.includes('Saved locally'), recoveryIndex: localStorage.getItem('revelith-forms-builder/recovery-index') };
      })()`)
    })
    const firstDraft = await addDraftQuestion()
    expect(firstDraft).toMatchObject({ fields: 1, status: true })
    expect(JSON.parse(firstDraft.recoveryIndex ?? '[]')).toHaveLength(1)
    await first.app.close()

    second = await launchShell({ onboardingSeen: true, userDataDir: first.userDataDir, videoDir: 'forms-builder-recovery-second-session' })
    await second.page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    const findRecoveryBanner = async () => second!.app.evaluate(({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      return child?.executeJavaScript(`({ freshTaskIsBlank: document.body.innerText.includes('No fields yet'), canRestore: document.body.innerText.includes('A previous local form draft is available'), href: location.href })`) ?? null
    })
    await expect.poll(async () => (await findRecoveryBanner())?.href).toBeTruthy()
    const recoveryState = await findRecoveryBanner()
    expect(recoveryState).toMatchObject({ freshTaskIsBlank: true, canRestore: true })
    const restored = await second.app.evaluate(async ({ webContents }) => {
      const child = webContents.getAllWebContents().find((contents) => contents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder tab did not load')
      return child.executeJavaScript(`(async () => {
        [...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Restore')?.click();
        await new Promise((resolve) => setTimeout(resolve, 100));
        const key = Object.keys(localStorage).find((item) => item.startsWith('revelith-forms-builder/draft/'));
        const draft = key ? JSON.parse(localStorage.getItem(key)) : null;
        return { fields: draft?.fields?.length, stillBlank: document.body.innerText.includes('No fields yet'), bannerGone: !document.body.innerText.includes('A previous local form draft is available') };
      })()`)
    })
    expect(restored).toEqual({ fields: 1, stillBlank: false, bannerGone: true })
  } finally {
    if (second) await second.app.close()
    else await first.app.close()
  }
})

test('Forms Builder advanced respondent fields and one-question flow render and validate end to end', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-advanced-fields' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const childScript = async (script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(source)
    }, script)

    const added = await childScript(`(async () => {
      const waitRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tab = [...document.querySelectorAll('[role="tab"]')].find((item) => item.innerText.trim() === 'Home');
      tab?.click(); await waitRender();
      const allFields = [...document.querySelectorAll('.forms-tool-button')].find((item) => item.innerText.trim() === 'All fields');
      if (!allFields) throw new Error('All fields drawer control is missing');
      if (document.querySelector('.forms-field-palette')?.getAttribute('data-collapsed') === 'true') allFields.click();
      await waitRender();
      for (const label of ['Welcome screen', 'Full name', 'Date range', 'Country', 'Picture choice', 'Terms consent', 'Input table', 'Hidden value', 'Statement', 'Completion screen']) {
        const button = [...document.querySelectorAll('.forms-field-list-button')].find((item) => item.innerText.includes(label));
        if (!button) throw new Error('Missing field palette action: ' + label);
        button.click(); await waitRender();
      }
      return [...document.querySelectorAll('.field-renderer')].length;
    })()`)
    expect(added).toBe(6)

    const configuredFlow = await childScript(`(async () => {
      const waitRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      [...document.querySelectorAll('button')].filter((item) => item.innerText.trim().toLowerCase() === 'settings').at(-1)?.click(); await waitRender();
      const navigation = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Respondent flow'))?.parentElement?.querySelector('select');
      if (!navigation) throw new Error('Respondent flow setting is missing');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(navigation, 'one-at-a-time');
      navigation.dispatchEvent(new Event('change', { bubbles: true })); await waitRender();
      const questionList = [...document.querySelectorAll('label')].find((item) => item.innerText.includes('Show question navigation list'))?.querySelector('input[type="checkbox"]');
      if (!questionList) throw new Error('Question navigation setting is missing');
      if (!questionList.checked) { questionList.click(); await waitRender(); }
      return navigation.value === 'one-at-a-time' && questionList.checked;
    })()`)
    expect(configuredFlow).toBe(true)

    const preview = await childScript(`(async () => {
      const waitRender = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      [...document.querySelectorAll('[role="tab"]')].find((item) => item.innerText.trim() === 'View')?.click(); await waitRender();
      [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((item) => item.innerText.trim() === 'Preview')?.click(); await waitRender();
      const start = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Start');
      const welcomeOnly = Boolean(start) && !document.querySelector('[aria-label="First name"]');
      start?.click(); await waitRender();
      const selectors = ['[aria-label="First name"]', '[aria-label="Date range start date"]', 'select[autocomplete="country-name"]', 'input[type="radio"]', 'label', '[aria-label="Row 1 Column 1"]'];
      const expectedText = ['', '', '', '', 'I agree to the terms above', ''];
      const flow = [];
      for (let index = 0; index < selectors.length; index++) {
        const element = document.querySelector(selectors[index]);
        const exists = expectedText[index] ? [...document.querySelectorAll('label')].some((label) => label.innerText.includes(expectedText[index])) : Boolean(element);
        flow.push(exists);
        if (index < selectors.length - 1) {
          const next = [...document.querySelectorAll('button')].find((item) => item.innerText.trim() === 'Next');
          if (!next) throw new Error('One-question flow did not provide Next at step ' + index);
          next.click(); await waitRender();
        }
      }
      const submitVisible = [...document.querySelectorAll('button')].some((item) => item.innerText.trim() === 'Submit');
      return { welcomeOnly, questionList: Boolean(document.querySelector('nav[aria-label="Form question navigation"]')), flow, submitVisible };
    })()`)
    expect(preview).toEqual({
      welcomeOnly: true,
      questionList: true,
      flow: [true, true, true, true, true, true],
      submitVisible: true,
    })
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder question groups author child fields and save nested respondent answers end to end', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-question-groups' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const runInForms = async (script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(source)
    }, script)
    const setup = await runInForms(`(async () => {
      const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const tabs = [...document.querySelectorAll('[role="tab"]')]; tabs.find((tab) => tab.innerText.trim() === 'Home')?.click(); await wait();
      const allFields = [...document.querySelectorAll('.forms-tool-button')].find((button) => button.innerText.trim() === 'All fields');
      if (!allFields) throw new Error('All fields drawer control is missing');
      if (document.querySelector('.forms-field-palette')?.getAttribute('data-collapsed') === 'true') allFields.click(); await wait();
      const groupButton = [...document.querySelectorAll('.forms-field-list-button')].find((button) => button.innerText.includes('Question group'));
      if (!groupButton) throw new Error('Question group field is missing from the field palette'); groupButton.click(); await wait();
      const typeSelect = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Question type')?.parentElement?.querySelector('select');
      if (!(typeSelect instanceof HTMLSelectElement)) throw new Error('Question group type selector is missing');
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(typeSelect, 'text'); typeSelect.dispatchEvent(new Event('change', { bubbles: true })); await wait();
      const addButton = [...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Add');
      if (!addButton) throw new Error('Add child question control is missing'); addButton.click(); await wait();
      const childLabel = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Question label')?.parentElement?.querySelector('input');
      if (!(childLabel instanceof HTMLInputElement)) throw new Error('Child question label control is missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(childLabel, 'Nested answer'); childLabel.dispatchEvent(new Event('input', { bubbles: true })); await wait();
      return { groupRendered: document.querySelector('fieldset.field-renderer legend')?.innerText.trim(), childAuthoring: [...document.querySelectorAll('label')].some((label) => label.innerText.trim() === 'Nested answer') };
    })()`)
    expect(setup).toEqual({ groupRendered: 'Question group', childAuthoring: true })

    const submission = await runInForms(`(async () => {
      const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait();
      const preview = [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Preview');
      if (!preview) throw new Error('Preview action is missing'); preview.click(); await wait();
      const input = document.querySelector('fieldset.field-renderer input[type="text"]');
      if (!(input instanceof HTMLInputElement)) throw new Error('Nested respondent input is missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'Ari Example'); input.dispatchEvent(new Event('input', { bubbles: true })); await wait();
      const submit = [...document.querySelectorAll('button')].find((button) => button.innerText.trim() === 'Submit');
      if (!submit) throw new Error('Submit action is missing'); submit.click(); await wait();
      const recorded = document.body.innerText.includes('Response recorded');
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait();
      [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Design')?.click(); await wait();
      document.querySelector('.forms-properties-tab[data-tab="responses"]')?.click(); await wait();
      return { recorded, nestedResponseVisible: document.body.innerText.includes('Nested answer: Ari Example') };
    })()`)
    expect(submission).toEqual({ recorded: true, nestedResponseVisible: true })
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder enforces its UTC closing schedule and shows the configured closure message', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-scheduled-close' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const runInForms = async (script: string) => app.evaluate(async ({ BrowserWindow }, source) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(source)
    }, script)
    const preview = await runInForms(`(async () => {
      const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      [...document.querySelectorAll('button')].filter((button) => button.innerText.trim().toLowerCase() === 'settings').at(-1)?.click(); await wait();
      const closeInput = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Close at (UTC)')?.parentElement?.querySelector('input[type="datetime-local"]');
      if (!(closeInput instanceof HTMLInputElement)) throw new Error('UTC close-time setting is missing');
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(closeInput, '2000-01-01T00:00'); closeInput.dispatchEvent(new Event('input', { bubbles: true })); closeInput.dispatchEvent(new Event('change', { bubbles: true })); await wait();
      const closedMessage = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Closed form message')?.parentElement?.querySelector('textarea');
      if (!(closedMessage instanceof HTMLTextAreaElement)) throw new Error('Closed-form message setting is missing');
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(closedMessage, 'This survey has ended.'); closedMessage.dispatchEvent(new Event('input', { bubbles: true })); await wait();
      [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait();
      [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Preview')?.click(); await wait();
      return document.querySelector('[role="status"]')?.textContent?.trim() ?? '';
    })()`)
    expect(preview).toBe('This survey has ended.')
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder choice presentation supports custom icons, colors, and card layout in respondent preview', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-choice-presentation' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(`(async () => {
        const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Insert')?.click(); await wait();
        const add = [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.includes('Radio Buttons'));
        if (!add) throw new Error('Radio field action is missing'); add.click(); await wait();
        const setField = async (labelText, value) => { const control = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === labelText)?.parentElement?.querySelector('textarea,input'); if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) throw new Error(labelText + ' control missing'); const setter = control instanceof HTMLInputElement ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(control, value); control.dispatchEvent(new Event('input', { bubbles: true })); await wait(); };
        await setField('Choices (one per line)', 'A\\nB'); await setField('Choice icons (choice | symbol)', 'A | ★'); await setField('Choice colors (choice | #RRGGBB)', 'A | #123456');
        const layout = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === 'Choice layout')?.parentElement?.querySelector('select');
        if (!(layout instanceof HTMLSelectElement)) throw new Error('Choice layout control is missing'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(layout, 'cards'); layout.dispatchEvent(new Event('change', { bubbles: true })); await wait();
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait(); [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Preview')?.click(); await wait();
        const option = [...document.querySelectorAll('.field-renderer label')].find((label) => label.innerText.includes('★') && label.innerText.includes('A'));
        const optionLayout = document.querySelector('.field-renderer > div[style*="grid-template-columns"]');
        return { iconAndLabel: option?.innerText.replace(/\\s+/g, ' ').trim(), customBorder: option ? getComputedStyle(option).borderLeftColor : '', cardColumns: optionLayout ? getComputedStyle(optionLayout).gridTemplateColumns : '' };
      })()`)
    })
    expect(result.iconAndLabel).toContain('★')
    expect(result.iconAndLabel).toContain('A')
    expect(result.customBorder).toBe('rgb(18, 52, 86)')
    expect(result.cardColumns).not.toBe('1fr')
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder translations edit and render in the respondent language selector', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-translations' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(`(async () => {
        const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Insert')?.click(); await wait();
        [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.includes('Short Text'))?.click(); await wait();
        [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.includes('Radio Buttons'))?.click(); await wait();
        [...document.querySelectorAll('button')].filter((button) => button.innerText.trim().toLowerCase() === 'settings').at(-1)?.click(); await wait();
        const translatedField = [...document.querySelectorAll('details')].find((details) => details.querySelector('summary')?.innerText.trim() === 'Short Text');
        if (!translatedField) throw new Error('Field translation editor is missing'); translatedField.open = true; await wait();
        const translatedChoiceField = [...document.querySelectorAll('details')].find((details) => details.querySelector('summary')?.innerText.trim() === 'Radio Buttons');
        if (!translatedChoiceField) throw new Error('Choice translation editor is missing'); translatedChoiceField.open = true; await wait();
        const setText = async (labelText, value) => { const control = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === labelText)?.parentElement?.querySelector('input,textarea'); if (!(control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement)) throw new Error(labelText + ' control missing'); const setter = control instanceof HTMLInputElement ? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set : Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set; setter?.call(control, value); control.dispatchEvent(new Event('input', { bubbles: true })); await wait(); };
        await setText('Translated form title', 'Rückmeldung'); await setText('Translated label', 'Ihr Name'); await setText('Translated choices (keep one line per choice)', 'Ja\\nNein');
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait();
        [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Preview')?.click(); await wait();
        const language = document.querySelector('select[aria-label="Respondent language"]');
        if (!(language instanceof HTMLSelectElement)) throw new Error('Respondent language selector is missing');
        Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set?.call(language, 'de'); language.dispatchEvent(new Event('change', { bubbles: true })); await wait();
        const translatedChoices = [...document.querySelectorAll('.field-renderer label')].some((label) => label.innerText.includes('Ja'));
        [...document.querySelectorAll('.field-renderer label')].find((label) => label.innerText.includes('Ja'))?.click(); await wait();
        const draftKey = Object.keys(localStorage).find((key) => key.startsWith('revelith-forms-builder/preview-draft/'));
        const draft = draftKey ? JSON.parse(localStorage.getItem(draftKey) || '{}') : {};
        const choiceValueRemainsCanonical = Object.values(draft.answers || {}).includes('Option 1');
        return { title: document.querySelector('h1')?.textContent?.trim(), translatedQuestion: [...document.querySelectorAll('.field-renderer label')].some((label) => label.innerText.includes('Ihr Name')), translatedChoices, choiceValueRemainsCanonical };
      })()`)
    })
    expect(result).toEqual({ title: 'Rückmeldung', translatedQuestion: true, translatedChoices: true, choiceValueRemainsCanonical: true })
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder field media settings render safely with placement, brightness, and background', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-field-media' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(`(async () => {
        const wait = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'Insert')?.click(); await wait();
        [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.includes('Short Text'))?.click(); await wait();
        const set = async (labelText, value, type = 'text') => { const control = [...document.querySelectorAll('label')].find((label) => label.innerText.trim() === labelText)?.parentElement?.querySelector('input,select'); if (!control) throw new Error(labelText + ' control missing'); const proto = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(control, value); control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); if (type === 'color') control.dispatchEvent(new Event('change', { bubbles: true })); await wait(); };
        await set('Field media URL (HTTPS)', 'https://assets.example.invalid/prompt.jpg'); await set('Media placement', 'split_left'); await set('Media brightness (-100 to 100)', '20'); await set('Field background', '#F1F5F9', 'color');
        [...document.querySelectorAll('[role="tab"]')].find((tab) => tab.innerText.trim() === 'View')?.click(); await wait();
        [...document.querySelectorAll('[role="tabpanel"]:not([hidden]) button')].find((button) => button.innerText.trim() === 'Preview')?.click(); await wait();
        const image = document.querySelector('.field-renderer img'); const root = image?.closest('.field-renderer');
        return { mediaUrl: image?.getAttribute('src'), alt: image?.getAttribute('alt'), placementColumns: root ? getComputedStyle(root).gridTemplateColumns : '', backgroundColor: root ? getComputedStyle(root).backgroundColor : '' };
      })()`)
    })
    expect(result.mediaUrl).toBe('https://assets.example.invalid/prompt.jpg')
    expect(result.alt).toBe('Short Text media')
    expect(result.placementColumns.trim().split(/\s+/)).toHaveLength(2)
    expect(result.backgroundColor).toBe('rgb(241, 245, 249)')
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})

test('Forms Builder keeps uploaded response files locally and can retrieve the saved file', async () => {
  const { app, page } = await launchShell({ onboardingSeen: true, videoDir: 'forms-builder-files' })
  try {
    await page.evaluate(async () => { await window.aiOffice.newFormsBuilder() })
    await expect.poll(() => app.evaluate(({ webContents }) => webContents.getAllWebContents().some((contents) => contents.getURL().toLowerCase().includes('forms-builder')))).toBe(true)
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const child = BrowserWindow.getAllWindows()[0]?.contentView.children.find((view) => view.webContents.getURL().toLowerCase().includes('forms-builder'))
      if (!child) throw new Error('Forms Builder view is missing')
      return child.webContents.executeJavaScript(`(async () => {
        const pause = (ms = 40) => new Promise(resolve => setTimeout(resolve, ms));
        const clickTab = (name) => { const el = [...document.querySelectorAll('[role="tablist"] [role="tab"]')].find(item => item.innerText.trim() === name); if (!el) throw new Error('Missing ribbon tab ' + name); el.click(); };
        const clickButton = (name) => { const el = [...document.querySelectorAll('button')].find(item => item.innerText.trim().toLowerCase() === name.toLowerCase() || item.innerText.trim().toLowerCase().includes(name.toLowerCase())); if (!el) throw new Error('Missing button ' + name); el.click(); };
        const clickRibbonAction = (name) => { const panel = document.querySelector('[role="tabpanel"]:not([hidden])'); const el = [...(panel?.querySelectorAll('button') ?? [])].find(item => item.innerText.trim().toLowerCase() === name.toLowerCase()); if (!el) throw new Error('Missing ribbon action ' + name); el.click(); };
        clickTab('Home'); await pause();
        const allFields = [...document.querySelectorAll('.forms-tool-button')].find(button => button.innerText.trim() === 'All fields');
        if (!allFields) throw new Error('All fields drawer control is missing');
        if (document.querySelector('.forms-field-palette')?.getAttribute('data-collapsed') === 'true') allFields.click(); await pause();
        const fileUpload = [...document.querySelectorAll('.forms-field-list-button')].find(button => button.innerText.includes('File Upload'));
        if (!fileUpload) throw new Error('File Upload field palette action is missing'); fileUpload.click(); await pause();
        clickTab('View'); await pause(); clickButton('Preview'); await pause();
        const input = [...document.querySelectorAll('input[type="file"]')].find(item => item.getAttribute('aria-label') === 'File Upload files');
        if (!(input instanceof HTMLInputElement)) throw new Error('File input is missing; tabs=' + [...document.querySelectorAll('[role="tablist"] [role="tab"]')].map(item => item.innerText.trim()).join('|') + '; buttons=' + [...document.querySelectorAll('button')].map(item => item.innerText.trim()).filter(Boolean).slice(0,50).join('|') + '; labels=' + [...document.querySelectorAll('label')].map(item => item.innerText.trim()).join('|'));
        const transfer = new DataTransfer(); transfer.items.add(new File(['local attachment proof'], 'proof.txt', { type: 'text/plain', lastModified: 123 }));
        input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        for (let i = 0; i < 1000 && !document.body.innerText.includes('proof.txt'); i++) await pause(30);
        const selected = document.body.innerText.includes('proof.txt');
        if (!selected) throw new Error('Uploaded file was not accepted: ' + [...document.querySelectorAll('[role="alert"]')].map((item) => item.innerText).join(' | '));
        clickButton('Submit'); await pause(100);
        const submitted = document.body.innerText.includes('Response recorded');
        clickTab('View'); await pause(); clickRibbonAction('Design'); await pause(); document.querySelector('.forms-properties-tab[data-tab="responses"]')?.click(); await pause();
        const savedInResponse = document.body.innerText.includes('1 local response');
        document.querySelector('.forms-properties-tab[data-tab="analytics"]')?.click(); await pause();
        const localAnalyticsVisible = document.querySelector('[aria-label="Local response analytics"]') !== null && document.body.innerText.includes('Last 30 days');
        document.querySelector('.forms-properties-tab[data-tab="responses"]')?.click(); await pause();
        const details = [...document.querySelectorAll('button')].find(item => item.innerText.includes('View details')); details?.click(); await pause();
        const responseBook = JSON.parse(localStorage.getItem('revelith-forms-builder/responses') || '{}');
        const response = Object.values(responseBook).flat()[0];
        const answer = response && Object.values(response.answers).find(value => Array.isArray(value) && value[0]?.attachmentId);
        const reference = Array.isArray(answer) ? answer[0] : undefined;
        const database = await new Promise((resolve, reject) => { const request = indexedDB.open('revelith-forms-builder-files', 1); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const stored = await new Promise((resolve, reject) => { const request = database.transaction('attachments', 'readonly').objectStore('attachments').get(reference?.attachmentId); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
        const content = stored?.blob ? await stored.blob.text() : '';
        Object.defineProperty(window, '__responsesPackageBlob', { value: null, writable: true });
        URL.createObjectURL = (blob) => { Object.assign(window, { __responsesPackageBlob: blob }); return 'blob:responses-package-test'; };
        [...document.querySelectorAll('button')].find(item => item.innerText.trim() === 'JSON')?.click();
        for (let i = 0; i < 50 && !window.__responsesPackageBlob; i++) await pause(20);
        const exportedPackage = window.__responsesPackageBlob ? JSON.parse(await window.__responsesPackageBlob.text()) : null;
        const exportedFileBytes = exportedPackage?.attachments?.[0]?.dataBase64 ? atob(exportedPackage.attachments[0].dataBase64) : '';
        const download = [...document.querySelectorAll('button')].find(item => item.innerText.startsWith('Download proof.txt')); download?.click(); await pause();
        const downloadLink = [...document.querySelectorAll('a[download]')].some(item => item.getAttribute('download') === 'proof.txt');
        window.confirm = () => true;
        document.querySelector('[aria-label="Delete response"]')?.click();
        let removedAfterLastReference = false;
        for (let i = 0; i < 50; i++) { await pause(20); const current = await new Promise(resolve => { const request = database.transaction('attachments', 'readonly').objectStore('attachments').get(reference?.attachmentId); request.onsuccess = () => resolve(request.result); }); if (!current) { removedAfterLastReference = true; break; } }
        return { selected, submitted, savedInResponse, localAnalyticsVisible, storedBytes: content, exportedFileName: exportedPackage?.attachments?.[0]?.name, exportedFileBytes, downloadLink, removedAfterLastReference };
      })()`)
    })
    expect(result).toEqual({ selected: true, submitted: true, savedInResponse: true, localAnalyticsVisible: true, storedBytes: 'local attachment proof', exportedFileName: 'proof.txt', exportedFileBytes: 'local attachment proof', downloadLink: true, removedAfterLastReference: true })
  } finally {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }) }).catch(() => {})
    await app.close()
  }
})
