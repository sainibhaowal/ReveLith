// The generated standalone runtime is serialized as JavaScript source at export time.
// @ts-nocheck
import type { FormSchema } from './types'

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  )
}

function safeFileSlug(value: string): string {
  return (
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.join('-') || 'form'
  )
}

/** This runtime is intentionally dependency-free so its source can be embedded in the exported HTML. */
function standaloneRuntime() {
  const dataNode = document.getElementById('revelith-form-data')
  const schema = JSON.parse(dataNode?.textContent || '{}')
  const form = document.getElementById('revelith-form')
  const status = document.getElementById('revelith-status')
  const questions = document.getElementById('revelith-questions')
  const fieldControls = new Map()
  const filePayloads = new Map()
  let lastResponse = null
  const key = `revelith-offline-responses/${schema.id}`
  const text = (tag, value, parent) => {
    const element = document.createElement(tag)
    element.textContent = value ?? ''
    parent.append(element)
    return element
  }
  const control = (field, parent, type = 'text') => {
    const input = document.createElement(
      type === 'textarea' ? 'textarea' : type === 'select' ? 'select' : 'input',
    )
    if (input.tagName === 'INPUT') input.type = type
    input.name = field.id
    input.setAttribute('aria-label', field.label || 'Question')
    if (field.placeholder) input.placeholder = field.placeholder
    if (field.required) input.required = true
    if (field.helpText) {
      const id = `help-${field.id}`
      text('small', field.helpText, parent).id = id
      input.setAttribute('aria-describedby', id)
    }
    parent.append(input)
    fieldControls.set(field.id, input)
    return input
  }
  const addField = (field, parent) => {
    if (field.type === 'hidden') {
      const hidden = control({ ...field, required: false }, parent, 'hidden')
      hidden.value = field.defaultValue == null ? '' : String(field.defaultValue)
      return
    }
    if (field.type === 'pagebreak') {
      const marker = document.createElement('span')
      marker.hidden = true
      marker.dataset.pagebreak = 'true'
      parent.append(marker)
      return
    }
    if (field.type === 'thankyou') return
    if (field.type === 'section' || field.type === 'statement' || field.type === 'welcome') {
      const section = text('section', '', parent)
      section.dataset.fieldId = field.id
      if (field.type === 'welcome') section.dataset.welcome = 'true'
      text('h2', field.label || '', section)
      if (field.sectionDescription || field.helpText)
        text('p', field.sectionDescription || field.helpText, section)
      if (field.type === 'welcome') {
        const button = text('button', field.buttonText || 'Start', section)
        button.type = 'button'
        button.dataset.startForm = 'true'
      }
      return
    }
    if (field.type === 'group') {
      const fieldset = document.createElement('fieldset')
      fieldset.dataset.fieldId = field.id
      const legend = text('legend', field.label || 'Question group', fieldset)
      legend.id = `label-${field.id}`
      if (field.helpText) text('p', field.helpText, fieldset)
      ;(field.children || []).forEach((child) => addField(child, fieldset))
      parent.append(fieldset)
      fieldControls.set(field.id, fieldset)
      return
    }
    const choiceField = [
      'radio',
      'checkbox',
      'yesno',
      'legal_terms',
      'picture_choice',
      'rating',
      'nps',
    ].includes(field.type)
    const wrapper = document.createElement(choiceField ? 'fieldset' : 'div')
    wrapper.className = 'question'
    wrapper.dataset.fieldId = field.id
    const label = text(choiceField ? 'legend' : 'div', '', wrapper)
    label.className = 'question-label'
    label.id = `label-${field.id}`
    text('span', field.label || 'Question', label)
    if (field.required) {
      const required = text('span', ' *', label)
      required.className = 'required'
    }
    if (field.layout?.mediaUrl) {
      try {
        const mediaUrl = new URL(field.layout.mediaUrl, location.href)
        if (
          mediaUrl.protocol === 'https:' ||
          (mediaUrl.protocol === 'data:' && mediaUrl.href.startsWith('data:image/'))
        ) {
          if (field.layout.mediaType === 'video') {
            const video = document.createElement('video')
            video.src = mediaUrl.href
            video.controls = true
            video.preload = 'metadata'
            video.setAttribute('aria-label', field.label || 'Form media')
            wrapper.append(video)
          } else {
            const image = document.createElement('img')
            image.src = mediaUrl.href
            image.alt = field.label || 'Form media'
            image.loading = 'lazy'
            image.referrerPolicy = 'no-referrer'
            wrapper.append(image)
          }
        } else
          text('p', 'Only secure HTTPS or embedded image media can be shown.', wrapper).className =
            'notice'
      } catch {
        text('p', 'This media URL could not be opened.', wrapper).className = 'notice'
      }
    }
    let input
    const addOptions = (select) => {
      const empty = document.createElement('option')
      empty.value = ''
      empty.textContent = 'Select…'
      select.append(empty)
      ;(field.options || []).forEach((option) => {
        const node = document.createElement('option')
        node.value = option
        node.textContent = field.optionLabels?.[option] || option
        select.append(node)
      })
      if (field.validation?.allowOther) {
        const node = document.createElement('option')
        node.value = '__other__'
        node.textContent = 'Other'
        select.append(node)
      }
    }
    if (field.type === 'group') return
    if (field.type === 'select' || field.type === 'country') {
      input = control(field, wrapper, 'select')
      addOptions(input)
    } else if (
      ['text', 'email', 'number', 'date', 'time', 'url', 'phone', 'currency'].includes(field.type)
    )
      input = control(
        field,
        wrapper,
        field.type === 'phone' ? 'tel' : field.type === 'currency' ? 'number' : field.type,
      )
    else if (field.type === 'textarea') input = control(field, wrapper, 'textarea')
    else if (['radio', 'checkbox', 'yesno', 'legal_terms', 'picture_choice'].includes(field.type)) {
      const choices =
        field.type === 'yesno'
          ? ['Yes', 'No']
          : field.type === 'legal_terms'
            ? ['I agree to the terms above']
            : field.options || []
      const name = field.id
      const choiceList = document.createElement('div')
      choiceList.className = 'choices'
      wrapper.append(choiceList)
      choices.forEach((option, index) => {
        const row = document.createElement('label')
        row.className = 'choice'
        const choice = document.createElement('input')
        choice.type = field.type === 'checkbox' ? 'checkbox' : 'radio'
        choice.name = name
        choice.value = option
        if (field.required && (field.type !== 'checkbox' || index === 0)) choice.required = true
        row.append(choice)
        const choiceImage = field.choiceImages?.[option]
        if (choiceImage && /^https:\/\//i.test(choiceImage)) {
          const image = document.createElement('img')
          image.src = choiceImage
          image.alt = ''
          image.loading = 'lazy'
          image.referrerPolicy = 'no-referrer'
          row.append(image)
        }
        const labelText = document.createElement('span')
        labelText.textContent = field.optionLabels?.[option] || option
        row.append(labelText)
        choiceList.append(row)
      })
      input = choiceList.querySelector('input')
      fieldControls.set(field.id, [...choiceList.querySelectorAll('input')])
    } else if (field.type === 'rating' || field.type === 'nps') {
      const min = field.type === 'nps' ? 0 : (field.scaleMin ?? 1)
      const max = field.type === 'nps' ? 10 : (field.scaleMax ?? 5)
      const list = document.createElement('div')
      list.className = 'choices'
      wrapper.append(list)
      for (let value = min; value <= max; value += 1) {
        const row = document.createElement('label')
        row.className = 'choice score'
        const radio = document.createElement('input')
        radio.type = 'radio'
        radio.name = field.id
        radio.value = String(value)
        radio.required = Boolean(field.required)
        row.append(radio)
        row.append(document.createTextNode(String(value)))
        list.append(row)
      }
      fieldControls.set(field.id, [...list.querySelectorAll('input')])
    } else if (
      field.type === 'fullname' ||
      field.type === 'address' ||
      field.type === 'date_range'
    ) {
      const parts =
        field.type === 'fullname'
          ? [
              ['First name', 'given-name'],
              ['Last name', 'family-name'],
            ]
          : field.type === 'date_range'
            ? [
                ['Start date', 'date'],
                ['End date', 'date'],
              ]
            : [
                ['Street address', 'address-line1'],
                ['City', 'address-level2'],
                ['State / region', 'address-level1'],
                ['Postal code', 'postal-code'],
                ['Country', 'country-name'],
              ]
      const group = document.createElement('div')
      group.className = 'parts'
      wrapper.append(group)
      const controls = []
      parts.forEach(([part, autocomplete]) => {
        const labelPart = text('label', part, group)
        const el = document.createElement('input')
        el.type = autocomplete === 'date' ? 'date' : 'text'
        el.autocomplete = autocomplete
        el.setAttribute('aria-label', `${field.label || 'Question'}: ${part}`)
        if (field.required) el.required = true
        labelPart.append(el)
        controls.push(el)
      })
      fieldControls.set(field.id, controls)
    } else if (field.type === 'file') {
      input = control(field, wrapper, 'file')
      input.multiple = true
      input.accept = field.validation?.accept || ''
      const maxMB = field.validation?.maxFileSizeMb ?? 20
      const maxFiles = field.validation?.maxFiles ?? 10
      input.addEventListener('change', async () => {
        const files = [...input.files]
        if (files.length > maxFiles || files.some((file) => file.size > maxMB * 1024 * 1024)) {
          input.setCustomValidity(
            `Choose at most ${maxFiles} files, each no larger than ${maxMB} MB.`,
          )
          input.reportValidity()
          input.value = ''
          return
        }
        input.setCustomValidity('')
        for (const file of files) {
          const buffer = await file.arrayBuffer()
          const bytes = new Uint8Array(buffer)
          if (
            file.name.toLowerCase().endsWith('.pdf') &&
            new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-'
          ) {
            input.setCustomValidity(`${file.name} is not a PDF file.`)
            input.reportValidity()
            input.value = ''
            return
          }
          const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
          filePayloads.set(file.name, {
            name: file.name,
            type: file.type,
            size: file.size,
            dataBase64: btoa(binary),
          })
        }
      })
    } else if (field.type === 'signature') {
      input = control(field, wrapper, 'text')
      input.placeholder = 'Type your full name as a signature'
    } else if (field.type === 'input_table') {
      const table = document.createElement('table')
      const body = document.createElement('tbody')
      const cells = {}
      ;(field.rows || []).forEach((rowName) => {
        const tr = document.createElement('tr')
        text('th', rowName, tr)
        ;(field.columns || []).forEach((column) => {
          const td = document.createElement('td')
          const el = document.createElement('input')
          el.type = 'text'
          el.setAttribute('aria-label', `${rowName} ${column}`)
          td.append(el)
          tr.append(td)
          cells[`${rowName}::${column}`] = el
        })
        body.append(tr)
      })
      table.append(body)
      wrapper.append(table)
      fieldControls.set(field.id, cells)
    } else {
      input = control(field, wrapper, 'text')
      text(
        'small',
        `This offline view presents ${field.type} as a text answer.`,
        wrapper,
      ).className = 'notice'
    }
    if (input) {
      if (field.placeholder) input.placeholder = field.placeholder
      if (field.validation?.minLength != null) input.minLength = field.validation.minLength
      if (field.validation?.maxLength != null) input.maxLength = field.validation.maxLength
      if (field.validation?.min != null && 'min' in input) input.min = field.validation.min
      if (field.validation?.max != null && 'max' in input) input.max = field.validation.max
      if (field.defaultValue != null && !['file'].includes(field.type))
        input.value = String(field.defaultValue)
    }
    if (field.helpText && !['group'].includes(field.type)) {
      const help = wrapper.querySelector('small') || text('small', field.helpText, wrapper)
      help.textContent = field.helpText
      help.id = `help-${field.id}`
    }
    if (field.type === 'legal_terms' && field.termsText) {
      const terms = text('p', field.termsText, wrapper)
      terms.className = 'terms'
    }
    if (field.conditionalLogic?.showWhen?.length)
      wrapper.dataset.conditions = JSON.stringify(field.conditionalLogic)
    parent.append(wrapper)
  }
  ;(schema.fields || []).forEach((field) => addField(field, questions))
  const welcome = questions.querySelector('[data-welcome="true"]')
  const mode = schema.settings?.navigationMode || 'paged'
  const originalNodes = [...questions.children]
  const pages = [[]]
  for (const node of originalNodes) {
    if (node === welcome) continue
    if (node.dataset.pagebreak === 'true') {
      if (pages[pages.length - 1].length) pages.push([])
      continue
    }
    if (mode === 'one-at-a-time' && node.matches('.question,fieldset')) {
      if (pages[pages.length - 1].length) pages.push([])
      pages[pages.length - 1].push(node)
      pages.push([])
      continue
    }
    pages[pages.length - 1].push(node)
  }
  if (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop()
  if (!pages.length) pages.push([])
  questions.replaceChildren()
  if (welcome) questions.append(welcome)
  const pageNodes = pages.map((nodes, index) => {
    const page = document.createElement('div')
    page.dataset.page = String(index)
    page.setAttribute('aria-label', `Page ${index + 1}`)
    nodes.forEach((node) => page.append(node))
    questions.append(page)
    return page
  })
  let activePage = 0
  const backButton = document.getElementById('revelith-back')
  const nextButton = document.getElementById('revelith-next')
  const submitButton = form.querySelector('button[type=submit]')
  const navigation = document.getElementById('revelith-page-navigation')
  const questionList = document.createElement('nav')
  questionList.setAttribute('aria-label', 'Form page navigation')
  questionList.className = 'page-list'
  if (schema.settings?.showQuestionList && pageNodes.length > 1) {
    pageNodes.forEach((_, index) => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = `Page ${index + 1}`
      button.addEventListener('click', () => showPage(index))
      questionList.append(button)
    })
    questions.before(questionList)
  }
  const showPage = (target) => {
    const visible = pageNodes.map(
      (page) => !page.querySelector('[hidden]') || [...page.children].some((node) => !node.hidden),
    )
    let index = Math.max(0, Math.min(target, pageNodes.length - 1))
    while (index < pageNodes.length - 1 && !visible[index]) index++
    activePage = index
    pageNodes.forEach((page, pageIndex) => {
      page.hidden = pageIndex !== index
    })
    if (backButton)
      backButton.hidden = index === 0 || schema.settings?.showNavigationArrows === false
    if (nextButton) nextButton.hidden = index >= pageNodes.length - 1
    if (submitButton) submitButton.hidden = index < pageNodes.length - 1
    if (navigation)
      navigation.textContent = schema.settings?.showProgressBar
        ? `Page ${index + 1} of ${pageNodes.length}`
        : ''
    ;[...questionList.children].forEach((button, buttonIndex) =>
      button.setAttribute('aria-current', buttonIndex === index ? 'page' : 'false'),
    )
    if (submitButton) submitButton.textContent = schema.settings?.submitButtonText || 'Submit'
  }
  const startForm = () => {
    if (welcome) welcome.hidden = true
    form.querySelector('#revelith-actions').hidden = false
    showPage(0)
    pageNodes[0]?.querySelector('input:not([type=hidden]),textarea,select')?.focus()
  }
  welcome?.querySelector('[data-start-form="true"]')?.addEventListener('click', startForm)
  backButton?.addEventListener('click', () => {
    showPage(activePage - 1)
    pageNodes[activePage]?.querySelector('input,textarea,select')?.focus()
  })
  nextButton?.addEventListener('click', () => form.requestSubmit())
  const emailContainer = document.getElementById('revelith-email')
  const email = schema.settings?.collectEmail ? document.getElementById('respondent-email') : null
  if (emailContainer && email) emailContainer.hidden = false
  if (email) email.addEventListener('input', () => email.setCustomValidity(''))
  const validationError = document.getElementById('revelith-error')
  const clearValidation = (event) => {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    target.removeAttribute('aria-invalid')
    const ids = (target.getAttribute('aria-describedby') || '')
      .split(/\s+/)
      .filter((id) => id && id !== 'revelith-error')
    if (ids.length) target.setAttribute('aria-describedby', ids.join(' '))
    else target.removeAttribute('aria-describedby')
    if (validationError) validationError.textContent = ''
  }
  form.addEventListener('input', clearValidation)
  form.addEventListener('change', clearValidation)
  const flattenAnswers = (fields, answers) => {
    const flattened = { ...answers }
    for (const field of fields || []) {
      if (field.type !== 'group') continue
      const nested =
        answers[field.id] &&
        typeof answers[field.id] === 'object' &&
        !Array.isArray(answers[field.id])
          ? answers[field.id]
          : {}
      Object.assign(flattened, flattenAnswers(field.children, nested))
    }
    return flattened
  }
  const valueText = (value) => {
    if (value == null) return ''
    if (Array.isArray(value)) return value.map(valueText).join(', ')
    if (typeof value === 'object') {
      if ('firstName' in value || 'lastName' in value)
        return [value.firstName, value.lastName].filter(Boolean).map(String).join(' ')
      if ('start' in value || 'end' in value)
        return [value.start, value.end].filter(Boolean).map(String).join(' to ')
      return Object.values(value).map(valueText).filter(Boolean).join(', ')
    }
    return String(value)
  }
  const matchesCondition = (actual, condition) => {
    const value = valueText(actual)
    const normalized = value.toLocaleLowerCase()
    const expected = String(condition.value ?? '')
    const wanted = expected.toLocaleLowerCase()
    switch (condition.operator) {
      case 'equals':
        return Array.isArray(actual)
          ? actual.some((item) => valueText(item) === expected)
          : value === expected
      case 'not_equals':
        return Array.isArray(actual)
          ? actual.every((item) => valueText(item) !== expected)
          : value !== expected
      case 'contains':
        return Array.isArray(actual)
          ? actual.some((item) => valueText(item) === expected)
          : normalized.includes(wanted)
      case 'not_contains':
        return Array.isArray(actual)
          ? actual.every((item) => valueText(item) !== expected)
          : !normalized.includes(wanted)
      case 'starts_with':
        return normalized.startsWith(wanted)
      case 'ends_with':
        return normalized.endsWith(wanted)
      case 'greater_than':
        return (
          Number.isFinite(Number(value)) &&
          Number.isFinite(Number(expected)) &&
          Number(value) > Number(expected)
        )
      case 'greater_or_equal_than':
        return (
          Number.isFinite(Number(value)) &&
          Number.isFinite(Number(expected)) &&
          Number(value) >= Number(expected)
        )
      case 'less_than':
        return (
          Number.isFinite(Number(value)) &&
          Number.isFinite(Number(expected)) &&
          Number(value) < Number(expected)
        )
      case 'less_or_equal_than':
        return (
          Number.isFinite(Number(value)) &&
          Number.isFinite(Number(expected)) &&
          Number(value) <= Number(expected)
        )
      case 'is_before':
        return (
          Number.isFinite(Date.parse(value)) &&
          Number.isFinite(Date.parse(expected)) &&
          Date.parse(value) < Date.parse(expected)
        )
      case 'is_after':
        return (
          Number.isFinite(Date.parse(value)) &&
          Number.isFinite(Date.parse(expected)) &&
          Date.parse(value) > Date.parse(expected)
        )
      case 'is_empty':
        return value.trim() === ''
      case 'is_not_empty':
        return value.trim() !== ''
      default:
        return false
    }
  }
  const matchesRule = (rule, values) => {
    const checks = (rule.conditions || []).map((condition) =>
      matchesCondition(values[condition.fieldId], condition),
    )
    return (
      checks.length > 0 && (rule.match === 'any' ? checks.some(Boolean) : checks.every(Boolean))
    )
  }
  const calculateVariables = (answers) => {
    const variables = schema.variables || []
    const values = Object.fromEntries(
      variables.map((variable) => [variable.id, variable.initialValue]),
    )
    for (const rule of schema.logicRules || []) {
      const action = rule.action
      if (action?.kind !== 'calculate' || !matchesRule(rule, { ...answers, ...values })) continue
      const variable = variables.find((item) => item.id === action.variableId)
      if (!variable) continue
      const source = action.sourceFieldId ? answers[action.sourceFieldId] : action.value
      if (variable.type === 'string') {
        if (action.operation === 'assign') values[variable.id] = valueText(source)
        else if (action.operation === 'add')
          values[variable.id] = String(values[variable.id] ?? '') + valueText(source)
        continue
      }
      const left = Number(values[variable.id])
      const right = Number(valueText(source))
      if (!Number.isFinite(left) || !Number.isFinite(right)) continue
      let next
      switch (action.operation) {
        case 'assign':
          next = right
          break
        case 'add':
          next = left + right
          break
        case 'subtract':
          next = left - right
          break
        case 'multiply':
          next = left * right
          break
        case 'divide':
          if (right === 0) continue
          next = left / right
          break
      }
      if (Number.isFinite(next)) values[variable.id] = next
    }
    return values
  }
  const calculateQuizScore = (fields, answers) => {
    let earned = 0
    let possible = 0
    let scoredFields = 0
    const flattenFields = (items) =>
      (items || []).flatMap((field) => [
        field,
        ...(field.type === 'group' ? flattenFields(field.children) : []),
      ])
    for (const field of flattenFields(fields)) {
      const points = field.validation?.points ?? 1
      if (!Number.isFinite(points) || points < 0) continue
      if (field.validation?.expectedAnswer !== undefined) {
        scoredFields++
        possible += points
        const expected = field.validation.expectedAnswer.trim().toLocaleLowerCase()
        const actual =
          answers[field.id] == null ? '' : String(answers[field.id]).trim().toLocaleLowerCase()
        if (actual && actual === expected) earned += points
        continue
      }
      const correct = field.correctAnswers
      if (!correct?.length) continue
      scoredFields++
      const expected = new Set(correct.map((item) => item.trim().toLocaleLowerCase()))
      const multi = field.type === 'checkbox'
      possible += multi ? correct.length * points : points
      const actual = answers[field.id]
      const selected = (Array.isArray(actual) ? actual : actual == null ? [] : [actual]).map(
        (item) => String(item).trim().toLocaleLowerCase(),
      )
      if (multi) earned += selected.filter((item) => expected.has(item)).length * points
      else if (selected.length && expected.has(selected[0])) earned += points
    }
    if (!scoredFields) return undefined
    return {
      earned,
      possible,
      percentage: possible === 0 ? 0 : Math.round((earned / possible) * 10000) / 100,
    }
  }
  const updateVisibility = () => {
    const rawValues = {}
    fieldControls.forEach((control, id) => {
      if (Array.isArray(control))
        rawValues[id] = control.filter((item) => item.checked).map((item) => item.value)
      else if (control instanceof HTMLInputElement && control.type === 'radio')
        rawValues[id] = control.checked ? control.value : ''
      else if (control instanceof HTMLInputElement && control.type === 'checkbox')
        rawValues[id] = control.checked
      else rawValues[id] = control.value ?? ''
    })
    const answers = flattenAnswers(schema.fields, rawValues)
    const values = { ...answers, ...calculateVariables(answers) }
    questions.querySelectorAll('[data-conditions]').forEach((node) => {
      const logic = JSON.parse(node.dataset.conditions)
      const checks = logic.showWhen.map((condition) =>
        matchesCondition(values[condition.fieldId], condition),
      )
      node.hidden = logic.match === 'any' ? !checks.some(Boolean) : !checks.every(Boolean)
    })
    showPage(activePage)
  }
  const collectAnswers = (fields) => {
    const result = {}
    for (const field of fields || []) {
      if (['section', 'statement', 'welcome', 'thankyou', 'pagebreak'].includes(field.type))
        continue
      if (field.type === 'group') {
        result[field.id] = collectAnswers(field.children)
        continue
      }
      const control = fieldControls.get(field.id)
      if (
        Array.isArray(control) &&
        control.every(
          (item) => item instanceof HTMLInputElement && ['radio', 'checkbox'].includes(item.type),
        )
      )
        result[field.id] = control.filter((item) => item.checked).map((item) => item.value)
      else if (
        Array.isArray(control) &&
        ['fullname', 'date_range', 'address'].includes(field.type)
      ) {
        const keys =
          field.type === 'fullname'
            ? ['firstName', 'lastName']
            : field.type === 'date_range'
              ? ['start', 'end']
              : ['street', 'city', 'state', 'zip', 'country']
        result[field.id] = Object.fromEntries(
          control.map((item, index) => [keys[index], item.value]),
        )
      } else if (control instanceof HTMLInputElement && control.type === 'file')
        result[field.id] = [...control.files].map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size,
        }))
      else if (control && typeof control === 'object' && !(control instanceof HTMLElement))
        result[field.id] = Object.fromEntries(
          Object.entries(control).map(([name, item]) => [name, item.value]),
        )
      else result[field.id] = control?.value ?? ''
    }
    return result
  }
  form.addEventListener('input', updateVisibility)
  form.addEventListener('change', updateVisibility)
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    updateVisibility()
    const activeNode = pageNodes[activePage]
    const fields = [...(activeNode?.querySelectorAll('.question,fieldset') ?? [])].filter(
      (node) => !node.hidden,
    )
    const invalid = fields.find(
      (node) => node.matches(':invalid') || node.querySelector(':invalid'),
    )
    if (invalid) {
      const invalidControl = invalid.matches(':invalid')
        ? invalid
        : invalid.querySelector(':invalid')
      if (invalidControl instanceof HTMLElement) {
        invalidControl.setAttribute('aria-invalid', 'true')
        const descriptions = new Set(
          (invalidControl.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean),
        )
        descriptions.add('revelith-error')
        invalidControl.setAttribute('aria-describedby', [...descriptions].join(' '))
      }
      const question =
        invalid.querySelector('.question-label,legend')?.textContent?.trim() || 'This page'
      if (validationError)
        validationError.textContent = `${question}: Complete the required field or correct the invalid value.`
      invalidControl?.reportValidity()
      invalidControl?.focus()
      return
    }
    if (activePage < pageNodes.length - 1) {
      const values = collectAnswers(schema.fields)
      const route = (schema.logicRules || []).find(
        (rule) =>
          rule.action?.kind === 'navigate' &&
          matchesRule(rule, {
            ...flattenAnswers(schema.fields, values),
            ...calculateVariables(flattenAnswers(schema.fields, values)),
          }),
      )
      if (route) {
        const destination = pageNodes.findIndex((page) =>
          page.querySelector(`[data-field-id="${CSS.escape(route.action.fieldId)}"]`),
        )
        showPage(destination > activePage ? destination : activePage + 1)
      } else showPage(activePage + 1)
      pageNodes[activePage]?.querySelector('input:not([type=hidden]),textarea,select')?.focus()
      return
    }
    const answers = collectAnswers(schema.fields)
    if (email && !email.value.trim()) {
      email.focus()
      email.setCustomValidity('Enter a valid email address.')
      email.reportValidity()
      return
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.focus()
      email.setCustomValidity('Enter a valid email address.')
      email.reportValidity()
      return
    }
    if (email) email.setCustomValidity('')
    const flattenedAnswers = flattenAnswers(schema.fields, answers)
    const variables = calculateVariables(flattenedAnswers)
    const quizScore = calculateQuizScore(schema.fields, flattenedAnswers)
    const responseAnswers = {
      ...answers,
      ...(Object.keys(variables).length ? { _variables: variables } : {}),
      ...(quizScore ? { _quizScore: quizScore } : {}),
    }
    const submission = {
      id: `offline-${Date.now()}`,
      submittedAt: new Date().toISOString(),
      answers: responseAnswers,
      email: email?.value ?? '',
      attachments: [...filePayloads.values()],
    }
    lastResponse = {
      format: 'revelith-offline-response',
      version: 1,
      form: { id: schema.id, title: schema.title },
      response: submission,
    }
    let saved
    try {
      saved = JSON.parse(localStorage.getItem(key) || '[]')
    } catch {
      saved = []
    }
    try {
      localStorage.setItem(
        key,
        JSON.stringify([...saved, { ...submission, attachments: undefined }].slice(-500)),
      )
    } catch {
      status.textContent = 'Response is ready to download, but browser storage is full.'
    }
    form.hidden = true
    const done = document.getElementById('revelith-complete')
    done.hidden = false
    done.querySelector('h2').textContent = schema.settings?.confirmationTitle || 'Response recorded'
    done.querySelector('#revelith-confirmation').textContent =
      schema.settings?.confirmationMessage || 'Thank you for your response!'
    const scoreMessage = done.querySelector('#revelith-score')
    if (schema.settings?.showQuizScore && quizScore && scoreMessage) {
      const formatter = new Intl.NumberFormat(schema.settings?.locale || 'en')
      scoreMessage.textContent = `Score: ${formatter.format(quizScore.earned)} / ${formatter.format(quizScore.possible)} (${formatter.format(quizScore.percentage)}%)`
      scoreMessage.hidden = false
    }
    done.querySelector('h2').focus()
  })
  document.getElementById('revelith-download').addEventListener('click', () => {
    if (!lastResponse) return
    const blob = new Blob([JSON.stringify(lastResponse, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'form-response.json'
    link.click()
    setTimeout(() => URL.revokeObjectURL(link.href), 1000)
  })
  updateVisibility()
  if (welcome) {
    pageNodes.forEach((page) => {
      page.hidden = true
    })
    form.querySelector('#revelith-actions').hidden = true
  } else showPage(0)
}

/** Creates a self-contained offline respondent HTML file with a CSP hash for its inline runtime. */
export async function buildStandaloneFormHtml(schema: FormSchema): Promise<string> {
  const serialized = JSON.stringify(schema)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
  const script = `(${standaloneRuntime.toString()})();`
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(script))
  let binary = ''
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte)
  const scriptHash = btoa(binary)
  const locale = schema.settings.locale || 'en'
  const title = escapeHtml(schema.title || 'Offline form')
  const contentMaxWidth =
    schema.theme.contentWidth === 'compact'
      ? 520
      : schema.theme.contentWidth === 'narrow'
        ? 620
        : schema.theme.contentWidth === 'wide'
          ? 1120
          : schema.theme.contentWidth === 'full'
            ? 1240
            : 840
  const questionSpacing =
    schema.theme.questionSpacing === 'tight'
      ? 4
      : schema.theme.questionSpacing === 'compact'
        ? 8
        : schema.theme.questionSpacing === 'relaxed'
          ? 26
          : schema.theme.questionSpacing === 'spacious'
            ? 40
            : 16
  const buttonBackground =
    schema.theme.buttonStyle === 'filled' || !schema.theme.buttonStyle
      ? escapeHtml(schema.theme.primaryColor)
      : 'transparent'
  const buttonColor =
    schema.theme.buttonStyle === 'filled' || !schema.theme.buttonStyle
      ? '#ffffff'
      : escapeHtml(schema.theme.primaryColor)
  const buttonBorder =
    schema.theme.buttonStyle === 'outlined'
      ? `2px solid ${escapeHtml(schema.theme.primaryColor)}`
      : '0'
  const embed = `<iframe src="./${safeFileSlug(schema.title || 'form')}-offline.html" title="${title}" width="100%" height="720" loading="lazy" style="border:0" sandbox="allow-forms allow-scripts allow-downloads"></iframe>`
  return `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data: blob: https:; media-src blob: https:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'"><title>${title}</title><style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:${escapeHtml(schema.theme.backgroundColor || '#f3f4f6')};font:16px ${escapeHtml(schema.theme.fontFamily || 'system-ui,sans-serif')};color:#1f2937}main{max-width:${contentMaxWidth}px;margin:24px auto;padding:32px;background:#fff;border-radius:${Math.min(32, Math.max(0, schema.theme.borderRadius ?? 8))}px;box-shadow:0 1px 4px #0002}h1{text-align:center;font-size:1.7rem;margin:0 0 8px}#revelith-description{text-align:center;color:#64748b;margin:0 0 24px}.question{margin:${questionSpacing}px 0}.question-label{display:block;font-weight:600;margin:0 0 8px}.required{color:#b91c1c}input:not([type=radio]):not([type=checkbox]),textarea,select{display:block;width:100%;min-height:42px;padding:9px 11px;border:1px solid #94a3b8;border-radius:${Math.min(32, Math.max(0, schema.theme.borderRadius ?? 8))}px;font:inherit;background:#fff;color:#111827}textarea{min-height:100px}input[type=radio],input[type=checkbox]{width:18px;height:18px;accent-color:${escapeHtml(schema.theme.primaryColor)}}fieldset{border:1px solid #cbd5e1;border-radius:8px;padding:12px;margin:20px 0}.choices,.parts{display:flex;flex-wrap:wrap;gap:10px}.parts>*{flex:1 1 180px}.choice{display:inline-flex;align-items:center;gap:7px;padding:8px;border:1px solid #cbd5e1;border-radius:6px;cursor:pointer}.score{min-width:42px;justify-content:center}button{min-height:44px;padding:10px 18px;border:${buttonBorder};border-radius:${Math.min(32, Math.max(0, schema.theme.borderRadius ?? 8))}px;background:${buttonBackground};color:${buttonColor};font:inherit;font-weight:600;cursor:pointer}button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:3px solid #1d4ed8;outline-offset:2px}button:disabled{opacity:.6}section{padding:12px 0}section h2{font-size:1.25rem}.notice{color:#92400e;font-size:.85rem}.terms{white-space:pre-wrap;border:1px solid #cbd5e1;padding:10px}small{display:block;color:#475569;margin:7px 0}table{width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #cbd5e1}#revelith-actions{display:flex;justify-content:center;margin-top:24px}#revelith-complete{text-align:center;padding:30px}#revelith-email{margin:0 0 18px}#revelith-status{color:#92400e} [hidden]{display:none!important}@media(max-width:600px){body{padding:8px}main{padding:20px 15px;margin:8px auto}.parts{display:grid}}
</style></head><body><main><h1>${title}</h1><p id="revelith-description">${escapeHtml(schema.description || '')}</p><div id="revelith-status" role="status" aria-live="polite"></div><div id="revelith-error" role="alert" aria-live="assertive" style="color:#b91c1c"></div><form id="revelith-form" novalidate><div id="revelith-email" hidden><label for="respondent-email">Email address</label><input id="respondent-email" type="email" autocomplete="email"></div><div id="revelith-questions"></div><div id="revelith-actions"><button id="revelith-back" type="button" hidden>Back</button><span id="revelith-page-navigation" aria-live="polite"></span><button id="revelith-next" type="button" hidden>Next</button><button type="submit">${escapeHtml(schema.settings.submitButtonText || 'Submit')}</button></div></form><section id="revelith-complete" hidden aria-live="polite"><h2 tabindex="-1"></h2><p id="revelith-confirmation"></p><p id="revelith-score" role="status" aria-live="polite" hidden></p><button id="revelith-download" type="button">Download my response and files</button></section><details><summary>Embed this local form</summary><p>Keep this HTML file beside the page that embeds it. Secure remote media is loaded from its original HTTPS host when a network is available.</p><pre>${escapeHtml(embed)}</pre></details></main><script id="revelith-form-data" type="application/json">${serialized}</script><script>${script}</script></body></html>`
}
