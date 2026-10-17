/** @vitest-environment jsdom */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FormSchema } from '../types'
import { FORM_SHORTCUTS, Ribbon } from './Ribbon'

const schema = {
  id: 'form-1',
  title: 'Registration',
  description: '',
  fields: [],
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

describe('Forms Builder shortcuts', () => {
  it('keeps the visible shortcut count in sync and invokes the documented key handlers', () => {
    const onSave = vi.fn()
    const onUndo = vi.fn()
    const onRedo = vi.fn()
    const props = {
      documentTitle: 'Registration',
      statusText: 'Saved locally',
      autoSaveEnabled: true,
      canUndo: true,
      canRedo: true,
      onToggleAutoSave: () => {},
      onUndo,
      onRedo,
      onAiAction: () => {},
      aiOpen: false,
      onAiToggle: () => {},
      viewMode: 'design',
      onViewModeChange: () => {},
      zoom: 100,
      onZoomChange: () => {},
      device: 'desktop',
      onDeviceChange: () => {},
      schema,
      responseCount: 0,
      onExportResponses: () => {},
      onThemeChange: () => {},
      onNew: () => {},
      onTemplate: () => {},
      onOpen: () => {},
      onOpenDialog: () => {},
      onSave,
      onSaveAs: () => {},
      onExportJson: () => {},
      onExportStandalone: () => {},
      paletteOpen: false,
      onPaletteToggle: () => {},
      propsOpen: false,
      onPropsToggle: () => {},
      onOpenSettings: () => {},
      onOpenLogic: () => {},
      fieldTypes: [],
      onAddField: () => {},
      onAddSection: () => {},
      onAddPage: () => {},
    } as Parameters<typeof Ribbon>[0]
    act(() => root.render(createElement(Ribbon, props)))
    expect(FORM_SHORTCUTS).toHaveLength(4)
    expect(
      [...host.querySelectorAll('button')].some((button) =>
        button.textContent?.includes(`Shortcuts · ${FORM_SHORTCUTS.length}`),
      ),
    ).toBe(true)

    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true }),
      ),
    )
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
      ),
    )
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'y', ctrlKey: true, bubbles: true }),
      ),
    )
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, shiftKey: true, bubbles: true }),
      ),
    )
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(onRedo).toHaveBeenCalledTimes(2)

    const helpButton = [...host.querySelectorAll('button')].find((button) =>
      button.textContent?.includes(`Shortcuts · ${FORM_SHORTCUTS.length}`),
    )
    act(() => helpButton!.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(host.ownerDocument.body.querySelector('[role="dialog"]')?.textContent).toContain(
      `(${FORM_SHORTCUTS.length})`,
    )
  })
})
