import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AppRibbon, RibbonGroup, RibbonQuickButton, RibbonToolButton } from '@revelith/ui'
import type { FieldType, FormSchema, FormTheme, ViewMode } from '../types'
import { FormIcon, type FormIconName } from './FormIcon'
import { FieldPaletteIcon } from './FieldPaletteIcon'
import { DEFAULT_CANVAS_BACKGROUND } from '../schema'

export interface FieldTypeDef {
  type: FieldType
  label: string
  icon: string
}

type PreviewDevice = 'desktop' | 'tablet' | 'mobile'
export type FormAiAction = 'polish' | 'format' | 'generate' | 'audit'

interface RibbonProps {
  documentTitle: string
  statusText: string
  autoSaveEnabled: boolean
  canUndo: boolean
  canRedo: boolean
  onToggleAutoSave: () => void
  onUndo: () => void
  onRedo: () => void
  onAiAction: (action: FormAiAction) => void
  aiOpen: boolean
  onAiToggle: () => void
  viewMode: ViewMode
  onViewModeChange: (mode: ViewMode) => void
  zoom: number
  onZoomChange: (zoom: number) => void
  device: PreviewDevice
  onDeviceChange: (device: PreviewDevice) => void
  schema: FormSchema
  responseCount: number
  onExportResponses: () => void
  onThemeChange: (theme: Partial<FormTheme>) => void
  onNew: () => void
  onTemplate: (template: 'contact' | 'event' | 'feedback' | 'application') => void
  onOpen: (file: File) => void
  onOpenDialog: () => void
  onSave: () => void
  onSaveAs: () => void
  onExportJson: () => void
  onExportStandalone: () => void
  paletteOpen: boolean
  onPaletteToggle: () => void
  propsOpen: boolean
  onPropsToggle: () => void
  onOpenSettings: () => void
  onOpenLogic: () => void
  fieldTypes: FieldTypeDef[]
  onAddField: (type: FieldType) => void
  onAddSection: () => void
  onAddPage: () => void
}

export const FORM_SHORTCUTS = [
  { keys: 'Ctrl/Cmd + S', description: 'Save the form' },
  { keys: 'Ctrl/Cmd + Z', description: 'Undo (when not typing in a field)' },
  { keys: 'Ctrl/Cmd + Y', description: 'Redo (when not typing in a field)' },
  { keys: 'Ctrl/Cmd + Shift + Z', description: 'Redo (when not typing in a field)' },
] as const

/** A native color input only accepts #rgb/#rrggbb and would otherwise silently
 * show black for an unset or shorthand color; fall back to the form's own
 * paper/accent so the swatch never lies about the current form theme. */
function swatchHex(value: string | undefined, fallback: string): string {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) return value
  if (typeof value === 'string' && /^#[0-9a-f]{3}$/i.test(value))
    return `#${value
      .slice(1)
      .split('')
      .map((c) => c + c)
      .join('')}`
  return fallback
}

const THEME_PRESETS = [
  { label: 'Blue', primaryColor: '#2563eb', backgroundColor: '#f8fafc', borderRadius: 8 },
  { label: 'Indigo', primaryColor: '#4f46e5', backgroundColor: '#f5f3ff', borderRadius: 12 },
  { label: 'Emerald', primaryColor: '#059669', backgroundColor: '#f0fdf4', borderRadius: 10 },
  { label: 'Amber', primaryColor: '#d97706', backgroundColor: '#fffbeb', borderRadius: 8 },
  { label: 'Rose', primaryColor: '#e11d48', backgroundColor: '#fff1f2', borderRadius: 12 },
  { label: 'Ocean', primaryColor: '#0891b2', backgroundColor: '#ecfeff', borderRadius: 10 },
  { label: 'Violet', primaryColor: '#7c3aed', backgroundColor: '#f5f3ff', borderRadius: 14 },
  { label: 'Slate', primaryColor: '#475569', backgroundColor: '#f8fafc', borderRadius: 4 },
] satisfies Array<{
  label: string
  primaryColor: string
  backgroundColor: string
  borderRadius: number
}>

const FONT_PRESETS = [
  'Inter, system-ui, sans-serif',
  'system-ui, sans-serif',
  'Arial, sans-serif',
  'Verdana, sans-serif',
  'Georgia, serif',
  'Trebuchet MS, sans-serif',
  'Courier New, monospace',
]

export function Ribbon(props: RibbonProps) {
  const {
    statusText,
    autoSaveEnabled,
    canUndo,
    canRedo,
    onToggleAutoSave,
    onUndo,
    onRedo,
    onAiAction,
    aiOpen,
    onAiToggle,
    viewMode,
    onViewModeChange,
    zoom,
    onZoomChange,
    device,
    onDeviceChange,
    schema,
    responseCount,
    onExportResponses,
    onThemeChange,
    onNew,
    onTemplate,
    onOpen,
    onSave,
    onOpenDialog,
    onSaveAs,
    onExportJson,
    onExportStandalone,
    paletteOpen,
    onPaletteToggle,
    propsOpen,
    onPropsToggle,
    onOpenSettings,
    onOpenLogic,
    fieldTypes,
    onAddField,
    onAddSection,
    onAddPage,
  } = props
  const fileRef = useRef<HTMLInputElement>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  useEffect(() => {
    if (!shortcutsOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShortcutsOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [shortcutsOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      const key = event.key.toLowerCase()
      if (key === 's') {
        event.preventDefault()
        onSave()
      } else if (key === 'z' || key === 'y') {
        const target = event.target instanceof HTMLElement ? event.target : null
        if (target?.isContentEditable || target?.matches('input, textarea, [role="textbox"]'))
          return
        if (key === 'z' && !event.shiftKey && canUndo) {
          event.preventDefault()
          onUndo()
        } else if ((key === 'y' || (key === 'z' && event.shiftKey)) && canRedo) {
          event.preventDefault()
          onRedo()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onSave, onUndo, onRedo, canUndo, canRedo])

  const fields = (types: FieldType[]) =>
    fieldTypes
      .filter((field) => types.includes(field.type))
      .map((field) => (
        <ToolButton
          key={field.type}
          label={field.label}
          title={`Add ${field.label} field`}
          icon={<FieldPaletteIcon type={field.type} />}
          onClick={() => onAddField(field.type)}
        />
      ))

  const quickAccess = (
    <>
      <QuickButton label="Save" title="Save form (Ctrl+S)" icon="save" onClick={onSave} primary />
      <QuickButton
        label="Undo"
        title="Undo (Ctrl+Z)"
        icon="undo"
        onClick={onUndo}
        disabled={!canUndo}
      />
      <QuickButton
        label="Redo"
        title="Redo (Ctrl+Y)"
        icon="redo"
        onClick={onRedo}
        disabled={!canRedo}
      />
      <button
        type="button"
        className="forms-autosave-toggle"
        data-on={autoSaveEnabled}
        aria-pressed={autoSaveEnabled}
        onClick={onToggleAutoSave}
        data-tip={
          autoSaveEnabled
            ? 'AutoSave is on. Named forms are saved to their file after edits; new forms keep a local recovery draft.'
            : 'AutoSave is off for named files. A local recovery copy is still kept for untitled forms.'
        }
      >
        <span className="forms-autosave-switch" aria-hidden="true">
          <span />
        </span>
        <span>AutoSave</span>
      </button>
    </>
  )

  return (
    <>
      <AppRibbon
        title={props.documentTitle || 'Untitled Form'}
        status={statusText}
        actions={quickAccess}
        fileTabId="file"
        initialTabId="home"
        tabs={[
          {
            id: 'file',
            label: 'File',
            content: (
              <>
                <RibbonGroup label="Form file">
                  <ToolButton
                    label="New"
                    title="Create a new form"
                    icon={<FormIcon name="new" size={24} />}
                    onClick={onNew}
                  />
                  <label className="forms-ribbon-select">
                    Template
                    <select
                      aria-label="Form template"
                      defaultValue=""
                      onChange={(event) => {
                        const template = event.currentTarget.value
                        if (
                          template === 'contact' ||
                          template === 'event' ||
                          template === 'feedback' ||
                          template === 'application'
                        ) {
                          onTemplate(template)
                        }
                        event.currentTarget.value = ''
                      }}
                    >
                      <option value="">Choose a template</option>
                      <option value="contact">Contact</option>
                      <option value="event">Event registration</option>
                      <option value="feedback">Feedback</option>
                      <option value="application">Application</option>
                    </select>
                  </label>
                  <ToolButton
                    label="Open"
                    title="Open a form"
                    icon={<FormIcon name="open" size={24} />}
                    onClick={() => (window.electronAPI ? onOpenDialog() : fileRef.current?.click())}
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".form,.json,.form.json,application/json"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) onOpen(file)
                      event.target.value = ''
                    }}
                  />
                  <ToolButton
                    label="Save As"
                    title="Save the form to another file"
                    icon={<FormIcon name="save-as" size={24} />}
                    onClick={onSaveAs}
                  />
                  <ToolButton
                    label="Export JSON"
                    title="Export the editable form schema"
                    icon={<FormIcon name="export" size={24} />}
                    onClick={onExportJson}
                  />
                  <ToolButton
                    label="Offline HTML"
                    title="Export a respondent form that returns responses as JSON files"
                    icon={<FormIcon name="page" size={24} />}
                    onClick={onExportStandalone}
                  />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'home',
            label: 'Home',
            content: (
              <>
                <RibbonGroup label="ReveLith AI">
                  <ToolButton
                    label="ReveLith AI"
                    title={aiOpen ? 'Close ReveLith AI assistant' : 'Open ReveLith AI assistant'}
                    icon={<ReveLithMark size={24} />}
                    onClick={onAiToggle}
                    active={aiOpen}
                    expanded={aiOpen}
                    accent
                    aiEntry
                  />
                  <ToolButton
                    label="Polish"
                    title="Polish this form with ReveLith AI"
                    icon={<FormIcon name="polish" size={24} />}
                    onClick={() => onAiAction('polish')}
                    accent
                    aiEntry
                  />
                  <ToolButton
                    label="Format"
                    title="Improve form wording and structure with ReveLith AI"
                    icon={<FormIcon name="format" size={24} />}
                    onClick={() => onAiAction('format')}
                    accent
                    aiEntry
                  />
                  <ToolButton
                    label="Generate"
                    title="Generate form questions with ReveLith AI"
                    icon={<FormIcon name="generate" size={24} />}
                    onClick={() => onAiAction('generate')}
                    accent
                    aiEntry
                  />
                  <ToolButton
                    label="Review"
                    title="Review this form with ReveLith AI"
                    icon={<FormIcon name="audit" size={24} />}
                    onClick={() => onAiAction('audit')}
                    accent
                    aiEntry
                  />
                </RibbonGroup>
                <RibbonGroup label={`Help · ${FORM_SHORTCUTS.length} shortcuts`}>
                  <ToolButton
                    label={`Shortcuts · ${FORM_SHORTCUTS.length}`}
                    title="Show form-builder keyboard shortcuts"
                    icon={<span aria-hidden="true">ⓘ</span>}
                    onClick={() => setShortcutsOpen(true)}
                  />
                </RibbonGroup>
                <RibbonGroup label="History">
                  <ToolButton
                    label="Undo"
                    title="Undo last form edit (Ctrl+Z)"
                    icon={<FormIcon name="undo" size={24} />}
                    onClick={onUndo}
                    disabled={!canUndo}
                  />
                  <ToolButton
                    label="Redo"
                    title="Redo form edit (Ctrl+Y)"
                    icon={<FormIcon name="redo" size={24} />}
                    onClick={onRedo}
                    disabled={!canRedo}
                  />
                </RibbonGroup>
                <RibbonGroup label="Build">
                  <ToolButton
                    label="Design"
                    title="Edit form fields"
                    icon={<FormIcon name="fields" size={24} />}
                    active={viewMode === 'design'}
                    onClick={() => onViewModeChange('design')}
                  />
                  <ToolButton
                    label="Preview"
                    title="Preview as a respondent"
                    icon={<FormIcon name="preview" size={24} />}
                    active={viewMode === 'preview'}
                    onClick={() => onViewModeChange('preview')}
                  />
                  <ToolButton
                    label="Form rules"
                    title="Edit conditions and calculations"
                    icon={<FormIcon name="settings" size={24} />}
                    onClick={onOpenLogic}
                  />
                  <ToolButton
                    label="Settings"
                    title="Edit form settings"
                    icon={<FormIcon name="settings" size={24} />}
                    onClick={onOpenSettings}
                  />
                  <ToolButton
                    label="All fields"
                    title={
                      paletteOpen
                        ? 'Collapse field drawer to icons'
                        : 'Expand field drawer with labels'
                    }
                    icon={<FormIcon name="fields" size={24} />}
                    active={paletteOpen}
                    expanded={paletteOpen}
                    controls="forms-field-drawer"
                    onClick={onPaletteToggle}
                  />
                </RibbonGroup>
                <RibbonGroup label="Responses">
                  <span className="forms-ribbon-hint">
                    {responseCount} local response{responseCount === 1 ? '' : 's'}
                  </span>
                  <ToolButton
                    label="Export CSV"
                    title="Export local responses"
                    icon={<FormIcon name="export" size={24} />}
                    disabled={responseCount === 0}
                    onClick={onExportResponses}
                  />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'insert',
            label: 'Insert',
            content: (
              <>
                <RibbonGroup label="Quick fields">
                  {fields([
                    'text',
                    'textarea',
                    'email',
                    'phone',
                    'number',
                    'date',
                    'select',
                    'radio',
                    'checkbox',
                  ])}
                </RibbonGroup>
                <RibbonGroup label="Structure">
                  <ToolButton
                    label="Section"
                    title="Insert a section heading"
                    icon={<FormIcon name="section" size={24} />}
                    onClick={onAddSection}
                  />
                  <ToolButton
                    label="Page break"
                    title="Start a new respondent page"
                    icon={<FormIcon name="page" size={24} />}
                    onClick={onAddPage}
                  />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'design',
            label: 'Design',
            content: (
              <>
                <RibbonGroup label="Color palettes">
                  {THEME_PRESETS.map((theme) => (
                    <ToolButton
                      key={theme.label}
                      label={theme.label}
                      title={`Apply the ${theme.label} palette`}
                      icon={
                        <span className="forms-theme-palette">
                          <span style={{ background: theme.primaryColor }} />
                          <span style={{ background: theme.backgroundColor }} />
                        </span>
                      }
                      active={
                        schema.theme.primaryColor === theme.primaryColor &&
                        schema.theme.backgroundColor === theme.backgroundColor
                      }
                      onClick={() => onThemeChange(theme)}
                    />
                  ))}
                </RibbonGroup>
                <RibbonGroup label="Custom colors">
                  <label className="forms-ribbon-color">
                    Accent
                    <input
                      aria-label="Accent color"
                      type="color"
                      value={swatchHex(schema.theme.primaryColor, '#7c3aed')}
                      onChange={(event) => onThemeChange({ primaryColor: event.target.value })}
                    />
                  </label>
                  <label className="forms-ribbon-color">
                    Canvas
                    <input
                      aria-label="Canvas color"
                      type="color"
                      value={swatchHex(schema.theme.backgroundColor, DEFAULT_CANVAS_BACKGROUND)}
                      onChange={(event) => onThemeChange({ backgroundColor: event.target.value })}
                    />
                  </label>
                </RibbonGroup>
                <RibbonGroup label="Form width and spacing">
                  <label className="forms-ribbon-select">
                    Width
                    <select
                      aria-label="Form content width"
                      value={schema.theme.contentWidth ?? 'standard'}
                      onChange={(event) =>
                        onThemeChange({
                          contentWidth: event.target.value as FormTheme['contentWidth'],
                        })
                      }
                    >
                      <option value="compact">Compact · 520 px</option>
                      <option value="narrow">Narrow · 620 px</option>
                      <option value="standard">Standard · 840 px</option>
                      <option value="wide">Wide · 1120 px</option>
                      <option value="full">Full · 1240 px</option>
                    </select>
                  </label>
                  <label className="forms-ribbon-select">
                    Spacing
                    <select
                      aria-label="Question spacing"
                      value={schema.theme.questionSpacing ?? 'comfortable'}
                      onChange={(event) =>
                        onThemeChange({
                          questionSpacing: event.target.value as FormTheme['questionSpacing'],
                        })
                      }
                    >
                      <option value="tight">Tight</option>
                      <option value="compact">Compact</option>
                      <option value="comfortable">Comfortable</option>
                      <option value="relaxed">Relaxed</option>
                      <option value="spacious">Spacious</option>
                    </select>
                  </label>
                </RibbonGroup>
                <RibbonGroup label="Typography and buttons">
                  <label className="forms-ribbon-select">
                    Font
                    <select
                      aria-label="Form font family"
                      value={schema.theme.fontFamily}
                      onChange={(event) => onThemeChange({ fontFamily: event.target.value })}
                    >
                      {!FONT_PRESETS.includes(schema.theme.fontFamily) ? (
                        <option value={schema.theme.fontFamily}>Custom</option>
                      ) : null}
                      {FONT_PRESETS.map((font) => (
                        <option key={font} value={font}>
                          {font.split(',')[0]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="forms-ribbon-select">
                    Button
                    <select
                      aria-label="Submit button style"
                      value={schema.theme.buttonStyle ?? 'filled'}
                      onChange={(event) =>
                        onThemeChange({
                          buttonStyle: event.target.value as FormTheme['buttonStyle'],
                        })
                      }
                    >
                      <option value="filled">Filled</option>
                      <option value="outlined">Outlined</option>
                      <option value="text">Text</option>
                    </select>
                  </label>
                  <label className="forms-ribbon-range">
                    <span>
                      Corners <b>{schema.theme.borderRadius ?? 8}px</b>
                    </span>
                    <input
                      aria-label="Corner radius"
                      type="range"
                      min="0"
                      max="24"
                      step="2"
                      value={schema.theme.borderRadius ?? 8}
                      onChange={(event) =>
                        onThemeChange({ borderRadius: Number(event.target.value) })
                      }
                    />
                  </label>
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'logic',
            label: 'Logic',
            content: (
              <>
                <RibbonGroup label="Form logic">
                  <ToolButton
                    label="Rules"
                    title="Edit conditional branching and calculations"
                    icon={<FormIcon name="branch" size={24} />}
                    onClick={onOpenLogic}
                  />
                  <ToolButton
                    label="Test logic"
                    title="Test field conditions in preview"
                    icon={<FormIcon name="test-run" size={24} />}
                    onClick={() => onViewModeChange('preview')}
                  />
                  <ToolButton
                    label="Field properties"
                    title="Show conditions and validation for the selected field"
                    icon={<FormIcon name="properties-panel" size={24} />}
                    active={propsOpen}
                    onClick={onPropsToggle}
                  />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'view',
            label: 'View',
            content: (
              <>
                <RibbonGroup label="Respondent preview">
                  <ToolButton
                    label="Design"
                    title="Return to the form editor"
                    icon={<FormIcon name="fields" size={24} />}
                    active={viewMode === 'design'}
                    onClick={() => onViewModeChange('design')}
                  />
                  <ToolButton
                    label="Preview"
                    title="Review the form as a respondent"
                    icon={<FormIcon name="preview" size={24} />}
                    active={viewMode === 'preview'}
                    onClick={() => onViewModeChange('preview')}
                  />
                  {(['desktop', 'tablet', 'mobile'] as const).map((item) => (
                    <ToolButton
                      key={item}
                      label={item[0]!.toUpperCase() + item.slice(1)}
                      title={`Preview on ${item}`}
                      icon={<FormIcon name="preview" size={24} />}
                      active={device === item && viewMode === 'preview'}
                      onClick={() => {
                        onDeviceChange(item)
                        onViewModeChange('preview')
                      }}
                    />
                  ))}
                </RibbonGroup>
                <RibbonGroup label="Panels">
                  <ToolButton
                    label="All fields"
                    title={
                      paletteOpen
                        ? 'Collapse field drawer to icons'
                        : 'Expand field drawer with labels'
                    }
                    icon={<FormIcon name="fields" size={24} />}
                    active={paletteOpen}
                    expanded={paletteOpen}
                    controls="forms-field-drawer"
                    onClick={onPaletteToggle}
                  />
                  <ToolButton
                    label="Properties"
                    title="Show or hide field properties"
                    icon={<FormIcon name="settings" size={24} />}
                    active={propsOpen}
                    onClick={onPropsToggle}
                  />
                </RibbonGroup>
                <RibbonGroup label="Canvas zoom">
                  <label className="forms-ribbon-select">
                    Zoom
                    <select
                      aria-label="Canvas zoom"
                      value={zoom}
                      onChange={(event) => onZoomChange(Number(event.target.value))}
                    >
                      {[50, 75, 90, 100, 125, 150, 200].map((value) => (
                        <option key={value} value={value}>
                          {value}%
                        </option>
                      ))}
                    </select>
                  </label>
                </RibbonGroup>
              </>
            ),
          },
          {
            id: 'settings',
            label: 'Settings',
            content: (
              <>
                <RibbonGroup label="Form configuration">
                  <ToolButton
                    label="General"
                    title="Edit form title and description"
                    icon={<FormIcon name="sliders" size={24} />}
                    onClick={onOpenSettings}
                  />
                  <ToolButton
                    label="Submission"
                    title="Edit submission and privacy settings"
                    icon={<FormIcon name="inbox-check" size={24} />}
                    onClick={onOpenSettings}
                  />
                  <ToolButton
                    label="Schedule"
                    title="Edit schedule and response limits"
                    icon={<FormIcon name="calendar-clock" size={24} />}
                    onClick={onOpenSettings}
                  />
                </RibbonGroup>
                <RibbonGroup label="Form status">
                  <span className="forms-ribbon-hint">
                    {schema.fields.length} questions ·{' '}
                    {schema.fields.filter((field) => field.required).length} required
                  </span>
                </RibbonGroup>
              </>
            ),
          },
        ]}
      />
      {shortcutsOpen
        ? createPortal(
            <div
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setShortcutsOpen(false)
              }}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 10000,
                display: 'grid',
                placeItems: 'center',
                padding: 20,
                background: 'rgba(0,0,0,.42)',
              }}
            >
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="forms-shortcuts-title"
                style={{
                  width: 'min(420px, 100%)',
                  padding: 20,
                  borderRadius: 12,
                  border: '1px solid var(--border)',
                  background: 'var(--surface)',
                  color: 'var(--text-primary)',
                  boxShadow: '0 16px 48px rgba(0,0,0,.28)',
                }}
              >
                <header
                  style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}
                >
                  <h2 id="forms-shortcuts-title" style={{ fontSize: 16, margin: 0 }}>
                    Keyboard shortcuts{' '}
                    <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>
                      ({FORM_SHORTCUTS.length})
                    </span>
                  </h2>
                  <button
                    type="button"
                    aria-label="Close keyboard shortcuts"
                    onClick={() => setShortcutsOpen(false)}
                    style={{
                      marginLeft: 'auto',
                      border: '1px solid var(--border)',
                      borderRadius: 7,
                      background: 'var(--surface)',
                      color: 'inherit',
                      padding: '4px 9px',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                </header>
                <dl style={{ display: 'grid', gap: 10, margin: 0 }}>
                  {FORM_SHORTCUTS.map((entry) => (
                    <div
                      key={entry.keys}
                      style={{ display: 'flex', alignItems: 'center', gap: 14 }}
                    >
                      <dt
                        style={{
                          minWidth: 140,
                          padding: '4px 7px',
                          border: '1px solid var(--border)',
                          borderRadius: 6,
                          font: '12px ui-monospace, monospace',
                          textAlign: 'center',
                        }}
                      >
                        {entry.keys}
                      </dt>
                      <dd style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
                        {entry.description}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}

function QuickButton({
  label,
  title,
  icon,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string
  title: string
  icon: FormIconName
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}) {
  return (
    <RibbonQuickButton
      className={`forms-quick-button${primary ? ' primary' : ''}`}
      label={label}
      tooltip={title}
      icon={<FormIcon name={icon} size={16} />}
      onClick={onClick}
      disabled={disabled}
      primary={primary}
    />
  )
}

function ToolButton({
  label,
  title,
  icon,
  onClick,
  disabled = false,
  active = false,
  accent = false,
  aiEntry = false,
  expanded,
  controls,
}: {
  label: string
  title?: string
  icon: ReactNode
  onClick: () => void
  disabled?: boolean
  active?: boolean
  accent?: boolean
  aiEntry?: boolean
  expanded?: boolean
  controls?: string
}) {
  return (
    <RibbonToolButton
      className={`forms-tool-button${accent ? ' ai' : ''}`}
      label={label}
      tooltip={title}
      icon={icon}
      onClick={onClick}
      disabled={disabled}
      active={active}
      accent={accent}
      aiEntry={aiEntry}
      expanded={expanded}
      controls={controls}
    />
  )
}

function ReveLithMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <g transform="translate(10 10)">
        <circle cx="50" cy="50" r="7.5" fill="#38bdf8" />
        <ellipse cx="50" cy="50" rx="42" ry="18" stroke="#38bdf8" strokeWidth="6.5" />
        <circle cx="88" cy="50" r="6.5" fill="#67e8f9" />
        <ellipse
          cx="50"
          cy="50"
          rx="42"
          ry="18"
          stroke="#60a5fa"
          strokeWidth="6.5"
          transform="rotate(60 50 50)"
        />
        <circle cx="31" cy="17" r="6.5" fill="#93c5fd" />
        <ellipse
          cx="50"
          cy="50"
          rx="42"
          ry="18"
          stroke="#818cf8"
          strokeWidth="6.5"
          transform="rotate(120 50 50)"
        />
        <circle cx="31" cy="83" r="6.5" fill="#c7d2fe" />
      </g>
    </svg>
  )
}

export function fieldIcon(type: FieldType): ReactNode {
  return <FieldPaletteIcon type={type} />
}
