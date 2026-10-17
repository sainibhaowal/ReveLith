// ReveLith AI Draw — rich tabbed ribbon (File/Edit/Arrange/Style/View/Export/AI),
// same icon-over-label house pattern as docs/sheets/slides. Purely presentational:
// all behavior arrives through props, implemented once in App.
import { AppRibbon, RibbonGroup, RibbonQuickButton, RibbonToolButton } from '@revelith/ui'
import type { Alignment, ArrangeOp } from './board-actions'
import {
  IconAuto,
  IconBrainstorm,
  IconBack,
  IconBackward,
  IconBoardFile,
  IconClear,
  IconCopy,
  IconDelete,
  IconDeselect,
  IconDistributeH,
  IconDistributeV,
  IconDuplicate,
  IconFileSvg,
  IconFit,
  IconFlowchart,
  IconFlipH,
  IconFlipV,
  IconFont,
  IconForward,
  IconFront,
  IconAlignBottom,
  IconAlignCenterX,
  IconAlignLeft,
  IconAlignMiddle,
  IconAlignRight,
  IconAlignTop,
  IconGrid,
  IconGroup,
  IconImage,
  IconImport,
  IconLock,
  IconMoon,
  IconNew,
  IconOpacity,
  IconOpen,
  IconPresent,
  IconRedo,
  IconReview,
  IconReveLith,
  IconSave,
  IconSaveAs,
  IconSelectAll,
  IconSettings,
  IconSnap,
  IconSummarize,
  IconStrokeWidth,
  IconSun,
  IconTextSize,
  IconTrackChanges,
  IconUndo,
  IconUngroup,
  IconUnlock,
  IconZoom100,
  IconZoomIn,
  IconZoomOut,
} from './icons'
import './ribbon.css'
import type { DrawboardRevision } from '../board-engine/revisions'

export type ThemeMode = 'system' | 'light' | 'dark'

export interface DrawboardRibbonProps {
  title: string
  status: string
  quick: {
    onSave(): void
    canUndo: boolean
    onUndo(): void
    canRedo: boolean
    onRedo(): void
    autosave: boolean
    onToggleAutosave(): void
  }
  file: { onNew(): void; onOpen(): void; onSave(): void; onSaveAs(): void; onImport(): void }
  edit: {
    canUndo: boolean
    canRedo: boolean
    onUndo(): void
    onRedo(): void
    hasSelection: boolean
    hasContent: boolean
    onSelectAll(): void
    onDeselect(): void
    onDuplicate(): void
    onDelete(): void
    onClear(): void
    shortcutCount?: number | null
    onShowShortcuts(): void
  }
  arrange: {
    canArrange: boolean
    canAlign: boolean
    canDistribute: boolean
    isLocked: boolean
    onArrange(op: ArrangeOp): void
    onAlign(alignment: Alignment): void
    onDistribute(axis: 'horizontal' | 'vertical'): void
    onGroup(): void
    onUngroup(): void
    onLock(locked: boolean): void
    onFlip(direction: 'horizontal' | 'vertical'): void
  }
  style: {
    canStyle: boolean
    onStrokeWidth(width: number): void
    onOpacity(opacity: number): void
    onTextSize(size: number): void
    onFontFamily(family: number): void
  }
  view: {
    onZoomIn(): void
    onZoomOut(): void
    onZoomReset(): void
    onZoomFit(): void
    grid: boolean
    onToggleGrid(): void
    snap: boolean
    onToggleSnap(): void
    presenting: boolean
    onTogglePresent(): void
    themeMode: ThemeMode
    onThemeMode(mode: ThemeMode): void
    onPickBackground(color: string): void
    onToggleSettings(): void
  }
  exp: { onExportPng(): void; onExportSvg(): void; onExportBoard(): void; onCopyPng(): void }
  ai: { aiOpen: boolean; onToggleAi(): void; onPrompt(text: string): void }
  review: {
    enabled: boolean
    revisions: DrawboardRevision[]
    onToggle(): void
    onAccept(id: string): void
    onReject(id: string): void
  }
}

function Big({
  icon,
  label,
  title,
  onClick,
  disabled,
  active,
  variant,
}: {
  icon: React.ReactNode
  label: string
  title: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  variant?: 'ai-entry'
}) {
  return (
    <RibbonToolButton
      className={`wb-rb${variant ? ` wb-rb-${variant}` : ''}`}
      iconClassName="wb-rb-icon"
      labelClassName="wb-rb-label"
      icon={icon}
      label={label}
      tooltip={title}
      onClick={onClick}
      disabled={disabled}
      active={active}
      pressed={active}
      aiEntry={variant === 'ai-entry'}
      accent={variant === 'ai-entry'}
    />
  )
}

function Small({
  icon,
  title,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode
  title: string
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
}) {
  return (
    <RibbonToolButton
      variant="icon"
      className="wb-rb-sm"
      icon={icon}
      label={label}
      ariaLabel={label}
      tooltip={title}
      onClick={onClick}
      disabled={disabled}
      active={active}
      pressed={active}
    />
  )
}

const PAPER_SWATCHES = ['#ffffff', '#f6f7f9', '#fef9c3', '#dcfce7', '#dbeafe', '#fae8ff']

export function DrawboardRibbon(props: DrawboardRibbonProps) {
  const { file, edit, arrange, style, view, exp, ai, quick, review } = props
  const quickAccess = (
    <span className="wb-qat" aria-label="Quick access">
      <RibbonQuickButton
        className="wb-qat-btn"
        label="Save"
        tooltip="Save this Drawboard"
        icon={<IconSave size={16} />}
        onClick={quick.onSave}
      />
      <RibbonQuickButton
        className="wb-qat-btn"
        label="Undo"
        tooltip="Undo last change"
        icon={<IconUndo size={16} />}
        onClick={quick.onUndo}
        disabled={!quick.canUndo}
      />
      <RibbonQuickButton
        className="wb-qat-btn"
        label="Redo"
        tooltip="Redo"
        icon={<IconRedo size={16} />}
        onClick={quick.onRedo}
        disabled={!quick.canRedo}
      />
      <button
        className="wb-autosave"
        data-tip={quick.autosave ? 'Autosave is on' : 'Autosave is off'}
        aria-pressed={quick.autosave}
        data-on={quick.autosave ? 'true' : 'false'}
        onClick={quick.onToggleAutosave}
      >
        <span className="wb-autosave-switch" aria-hidden="true">
          <span />
        </span>
        AutoSave
      </button>
    </span>
  )
  const tabs = [
    {
      id: 'file',
      label: 'File',
      content: (
        <>
          <RibbonGroup label="Drawboard file">
            <Big
              icon={<IconNew size={28} />}
              label="New"
              title="Create a new Drawboard"
              onClick={file.onNew}
            />
            <Big
              icon={<IconOpen size={28} />}
              label="Open"
              title="Open a drawing"
              onClick={file.onOpen}
            />
            <Big
              icon={<IconSave size={28} />}
              label="Save"
              title="Save this Drawboard"
              onClick={file.onSave}
            />
            <Big
              icon={<IconSaveAs size={28} />}
              label="Save As"
              title="Save to a chosen folder"
              onClick={file.onSaveAs}
            />
            <Big
              icon={<IconImport size={28} />}
              label="Import"
              title="Import Drawboard file"
              onClick={file.onImport}
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
            <Big
              variant="ai-entry"
              icon={<IconReveLith size={26} />}
              label="ReveLith AI"
              title="Show or hide the AI panel"
              onClick={ai.onToggleAi}
              active={ai.aiOpen}
            />
            <Big
              variant="ai-entry"
              icon={<IconSummarize size={24} />}
              label="Summarize"
              title="Ask ReveLith to summarize"
              onClick={() => ai.onPrompt('Inspect the current state and summarize what is here.')}
            />
            <Big
              variant="ai-entry"
              icon={<IconFlowchart size={24} />}
              label="Flowchart"
              title="Ask ReveLith for a flowchart"
              onClick={() => ai.onPrompt('Build a clean flowchart on the board for: ')}
            />
            <Big
              variant="ai-entry"
              icon={<IconBrainstorm size={24} />}
              label="Brainstorm"
              title="Brainstorm with ReveLith"
              onClick={() => ai.onPrompt('Brainstorm on the board: ')}
            />
          </RibbonGroup>
          <RibbonGroup label="Quick edit">
            <Big
              icon={<IconUndo size={28} />}
              label="Undo"
              title="Undo last change"
              onClick={edit.onUndo}
              disabled={!edit.canUndo}
            />
            <Big
              icon={<IconRedo size={28} />}
              label="Redo"
              title="Redo"
              onClick={edit.onRedo}
              disabled={!edit.canRedo}
            />
            <Big
              icon={<IconSelectAll size={28} />}
              label="Select all"
              title="Select everything"
              onClick={edit.onSelectAll}
              disabled={!edit.hasContent}
            />
            <Big
              icon={<IconDuplicate size={28} />}
              label="Duplicate"
              title="Duplicate selection"
              onClick={edit.onDuplicate}
              disabled={!edit.hasSelection}
            />
            <Big
              icon={<IconDelete size={28} />}
              label="Delete"
              title="Delete selection"
              onClick={edit.onDelete}
              disabled={!edit.hasSelection}
            />
            <Big
              icon={
                <span aria-hidden="true" style={{ fontSize: 23, fontWeight: 600 }}>
                  ⓘ
                </span>
              }
              label={`Shortcuts${edit.shortcutCount ? ` · ${edit.shortcutCount}` : ''}`}
              title={`Open the complete built-in Drawboard keyboard shortcut reference${edit.shortcutCount ? ` (${edit.shortcutCount} shortcuts)` : ''}`}
              onClick={edit.onShowShortcuts}
            />
          </RibbonGroup>
          <RibbonGroup label="Arrange">
            <Big
              icon={<IconFront size={28} />}
              label="Front"
              title="Bring to front"
              onClick={() => arrange.onArrange('front')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconBack size={28} />}
              label="Back"
              title="Send to back"
              onClick={() => arrange.onArrange('back')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconGroup size={28} />}
              label="Group"
              title="Group selection (2+)"
              onClick={arrange.onGroup}
              disabled={!arrange.canAlign}
            />
            <Big
              icon={<IconLock size={28} />}
              label="Lock"
              title="Lock selection"
              onClick={() => arrange.onLock(true)}
              disabled={!arrange.canArrange}
              active={arrange.isLocked}
            />
          </RibbonGroup>
          <RibbonGroup label="Style">
            <Big
              icon={<IconStrokeWidth size={28} />}
              label="Bold"
              title="Bold strokes (2)"
              onClick={() => style.onStrokeWidth(2)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconTextSize size={28} />}
              label="Medium"
              title="Text size 20"
              onClick={() => style.onTextSize(20)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconImage size={28} />}
              label="Image"
              title="Insert image file"
              onClick={() => document.getElementById('wb-insert-image')?.click()}
            />
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'edit',
      label: 'Edit',
      content: (
        <>
          <RibbonGroup label="History">
            <Big
              icon={<IconUndo size={28} />}
              label="Undo"
              title="Undo last change"
              onClick={edit.onUndo}
              disabled={!edit.canUndo}
            />
            <Big
              icon={<IconRedo size={28} />}
              label="Redo"
              title="Redo"
              onClick={edit.onRedo}
              disabled={!edit.canRedo}
            />
          </RibbonGroup>
          <RibbonGroup label="Select">
            <Big
              icon={<IconSelectAll size={28} />}
              label="Select all"
              title="Select everything"
              onClick={edit.onSelectAll}
              disabled={!edit.hasContent}
            />
            <Big
              icon={<IconDeselect size={28} />}
              label="Deselect"
              title="Clear selection"
              onClick={edit.onDeselect}
              disabled={!edit.hasSelection}
            />
          </RibbonGroup>
          <RibbonGroup label="Modify">
            <Big
              icon={<IconDuplicate size={28} />}
              label="Duplicate"
              title="Duplicate selection"
              onClick={edit.onDuplicate}
              disabled={!edit.hasSelection}
            />
            <Big
              icon={<IconDelete size={28} />}
              label="Delete"
              title="Delete selection"
              onClick={edit.onDelete}
              disabled={!edit.hasSelection}
            />
            <Big
              icon={<IconClear size={28} />}
              label="Clear"
              title="Clear the whole Drawboard"
              onClick={edit.onClear}
              disabled={!edit.hasContent}
            />
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'arrange',
      label: 'Arrange',
      content: (
        <>
          <RibbonGroup label="Order">
            <Big
              icon={<IconFront size={28} />}
              label="Front"
              title="Bring to front"
              onClick={() => arrange.onArrange('front')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconForward size={28} />}
              label="Forward"
              title="Bring forward"
              onClick={() => arrange.onArrange('forward')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconBackward size={28} />}
              label="Backward"
              title="Send backward"
              onClick={() => arrange.onArrange('backward')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconBack size={28} />}
              label="Back"
              title="Send to back"
              onClick={() => arrange.onArrange('back')}
              disabled={!arrange.canArrange}
            />
          </RibbonGroup>
          <RibbonGroup label="Align">
            <div className="wb-rb-cluster">
              <Small
                icon={<IconAlignLeft size={18} />}
                title="Align left"
                label="Align left"
                onClick={() => arrange.onAlign('left')}
                disabled={!arrange.canAlign}
              />
              <Small
                icon={<IconAlignCenterX size={18} />}
                title="Align center"
                label="Align center"
                onClick={() => arrange.onAlign('centerX')}
                disabled={!arrange.canAlign}
              />
              <Small
                icon={<IconAlignRight size={18} />}
                title="Align right"
                label="Align right"
                onClick={() => arrange.onAlign('right')}
                disabled={!arrange.canAlign}
              />
              <Small
                icon={<IconAlignTop size={18} />}
                title="Align top"
                label="Align top"
                onClick={() => arrange.onAlign('top')}
                disabled={!arrange.canAlign}
              />
              <Small
                icon={<IconAlignMiddle size={18} />}
                title="Align middle"
                label="Align middle"
                onClick={() => arrange.onAlign('middle')}
                disabled={!arrange.canAlign}
              />
              <Small
                icon={<IconAlignBottom size={18} />}
                title="Align bottom"
                label="Align bottom"
                onClick={() => arrange.onAlign('bottom')}
                disabled={!arrange.canAlign}
              />
            </div>
          </RibbonGroup>
          <RibbonGroup label="Distribute">
            <div className="wb-rb-pair">
              <Small
                icon={<IconDistributeH size={18} />}
                title="Distribute horizontally (3+ selected)"
                label="Distribute horizontally"
                onClick={() => arrange.onDistribute('horizontal')}
                disabled={!arrange.canDistribute}
              />
              <Small
                icon={<IconDistributeV size={18} />}
                title="Distribute vertically (3+ selected)"
                label="Distribute vertically"
                onClick={() => arrange.onDistribute('vertical')}
                disabled={!arrange.canDistribute}
              />
            </div>
          </RibbonGroup>
          <RibbonGroup label="Group">
            <Big
              icon={<IconGroup size={28} />}
              label="Group"
              title="Group selection (2+)"
              onClick={arrange.onGroup}
              disabled={!arrange.canAlign}
            />
            <Big
              icon={<IconUngroup size={28} />}
              label="Ungroup"
              title="Ungroup selection"
              onClick={arrange.onUngroup}
              disabled={!arrange.canArrange}
            />
          </RibbonGroup>
          <RibbonGroup label="Lock">
            <Big
              icon={<IconLock size={28} />}
              label="Lock"
              title="Lock selection"
              onClick={() => arrange.onLock(true)}
              disabled={!arrange.canArrange}
              active={arrange.isLocked}
            />
            <Big
              icon={<IconUnlock size={28} />}
              label="Unlock"
              title="Unlock selection"
              onClick={() => arrange.onLock(false)}
              disabled={!arrange.canArrange}
            />
          </RibbonGroup>
          <RibbonGroup label="Flip">
            <Big
              icon={<IconFlipH size={28} />}
              label="Flip H"
              title="Flip horizontally"
              onClick={() => arrange.onFlip('horizontal')}
              disabled={!arrange.canArrange}
            />
            <Big
              icon={<IconFlipV size={28} />}
              label="Flip V"
              title="Flip vertically"
              onClick={() => arrange.onFlip('vertical')}
              disabled={!arrange.canArrange}
            />
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'style',
      label: 'Style',
      content: (
        <>
          <RibbonGroup label="Stroke width">
            <Big
              icon={<IconStrokeWidth size={28} />}
              label="Thin"
              title="Thin strokes (1)"
              onClick={() => style.onStrokeWidth(1)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconStrokeWidth size={28} />}
              label="Bold"
              title="Bold strokes (2)"
              onClick={() => style.onStrokeWidth(2)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconStrokeWidth size={28} />}
              label="Heavy"
              title="Heavy strokes (4)"
              onClick={() => style.onStrokeWidth(4)}
              disabled={!style.canStyle}
            />
          </RibbonGroup>
          <RibbonGroup label="Opacity">
            <Big
              icon={<IconOpacity size={28} />}
              label="25%"
              title="Opacity 25%"
              onClick={() => style.onOpacity(25)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconOpacity size={28} />}
              label="50%"
              title="Opacity 50%"
              onClick={() => style.onOpacity(50)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconOpacity size={28} />}
              label="100%"
              title="Opacity 100%"
              onClick={() => style.onOpacity(100)}
              disabled={!style.canStyle}
            />
          </RibbonGroup>
          <RibbonGroup label="Text size">
            <Big
              icon={<IconTextSize size={28} />}
              label="Small"
              title="Text size 16"
              onClick={() => style.onTextSize(16)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconTextSize size={28} />}
              label="Medium"
              title="Text size 20"
              onClick={() => style.onTextSize(20)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconTextSize size={28} />}
              label="Large"
              title="Text size 32"
              onClick={() => style.onTextSize(32)}
              disabled={!style.canStyle}
            />
          </RibbonGroup>
          <RibbonGroup label="Font">
            <Big
              icon={<IconFont size={28} />}
              label="Hand"
              title="Hand-drawn font"
              onClick={() => style.onFontFamily(1)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconFont size={28} />}
              label="Normal"
              title="Normal font"
              onClick={() => style.onFontFamily(2)}
              disabled={!style.canStyle}
            />
            <Big
              icon={<IconFont size={28} />}
              label="Code"
              title="Code font"
              onClick={() => style.onFontFamily(3)}
              disabled={!style.canStyle}
            />
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'review',
      label: 'Review',
      content: (
        <>
          <RibbonGroup label="Track changes">
            <Big
              icon={<IconTrackChanges size={28} />}
              label={review.enabled ? 'Tracking on' : 'Tracking off'}
              title={
                review.enabled
                  ? 'Click to stop recording new board changes'
                  : 'Click to record additions, edits, and deletions'
              }
              onClick={review.onToggle}
              active={review.enabled}
            />
            <Big
              icon={<IconReview size={28} />}
              label={`Pending changes (${review.revisions.filter((item) => item.status === 'pending').length})`}
              title="Jump to tracked changes waiting for review"
              disabled={!review.revisions.some((item) => item.status === 'pending')}
              onClick={() => {
                const list = document.getElementById('wb-review-list')
                list?.scrollIntoView({ block: 'nearest' })
                list?.focus()
              }}
            />
          </RibbonGroup>
          <RibbonGroup label="Changes">
            <div
              className="wb-review-list"
              id="wb-review-list"
              tabIndex={-1}
              aria-label="Tracked board changes"
            >
              {review.revisions.length === 0 ? (
                <span className="wb-review-empty">
                  {review.enabled
                    ? 'Tracking is on. Changes you make will appear here.'
                    : 'Turn tracking on to record changes.'}
                </span>
              ) : (
                review.revisions
                  .slice()
                  .reverse()
                  .map((item) => (
                    <div className="wb-review-item" key={item.id}>
                      <span className="wb-review-description">
                        {item.kind === 'added'
                          ? 'Added'
                          : item.kind === 'deleted'
                            ? 'Deleted'
                            : 'Edited'}{' '}
                        · {item.after?.type ?? item.before?.type ?? 'element'}{' '}
                        <small>{item.status}</small>
                      </span>
                      {item.status === 'pending' && (
                        <span className="wb-review-actions">
                          <button
                            type="button"
                            aria-label={`Accept ${item.kind} ${item.after?.type ?? item.before?.type ?? 'element'}`}
                            onClick={() => review.onAccept(item.id)}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            aria-label={`Reject ${item.kind} ${item.after?.type ?? item.before?.type ?? 'element'}`}
                            onClick={() => review.onReject(item.id)}
                          >
                            Reject
                          </button>
                        </span>
                      )}
                    </div>
                  ))
              )}
            </div>
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'view',
      label: 'View',
      content: (
        <>
          <RibbonGroup label="Zoom">
            <Big
              icon={<IconZoomIn size={28} />}
              label="Zoom in"
              title="Zoom in"
              onClick={view.onZoomIn}
            />
            <Big
              icon={<IconZoomOut size={28} />}
              label="Zoom out"
              title="Zoom out"
              onClick={view.onZoomOut}
            />
            <Big
              icon={<IconZoom100 size={28} />}
              label="100%"
              title="Reset zoom"
              onClick={view.onZoomReset}
            />
            <Big
              icon={<IconFit size={28} />}
              label="Fit"
              title="Fit Drawboard on screen"
              onClick={view.onZoomFit}
            />
          </RibbonGroup>
          <RibbonGroup label="Canvas">
            <Big
              icon={<IconGrid size={28} />}
              label="Grid"
              title="Toggle grid"
              onClick={view.onToggleGrid}
              active={view.grid}
            />
            <Big
              icon={<IconSnap size={28} />}
              label="Snap"
              title="Toggle snap to objects"
              onClick={view.onToggleSnap}
              active={view.snap}
            />
            <Big
              icon={<IconPresent size={28} />}
              label="Present"
              title="Presentation mode"
              onClick={view.onTogglePresent}
              active={view.presenting}
            />
          </RibbonGroup>
          <RibbonGroup label="Theme">
            <Big
              icon={<IconSun size={28} />}
              label="Light"
              title="Light canvas"
              onClick={() => view.onThemeMode('light')}
              active={view.themeMode === 'light'}
            />
            <Big
              icon={<IconMoon size={28} />}
              label="Dark"
              title="Dark canvas"
              onClick={() => view.onThemeMode('dark')}
              active={view.themeMode === 'dark'}
            />
            <Big
              icon={<IconAuto size={28} />}
              label="Auto"
              title="Follow system theme"
              onClick={() => view.onThemeMode('system')}
              active={view.themeMode === 'system'}
            />
          </RibbonGroup>
          <RibbonGroup label="Background">
            <div className="wb-rb-pair">
              {PAPER_SWATCHES.map((color) => (
                <RibbonToolButton
                  key={color}
                  variant="icon"
                  className="wb-rb-sm"
                  label={`Canvas background ${color}`}
                  tooltip={`Canvas background ${color}`}
                  onClick={() => view.onPickBackground(color)}
                  style={{ backgroundColor: color }}
                  icon={<span aria-hidden="true" />}
                />
              ))}
            </div>
          </RibbonGroup>
          <RibbonGroup label="Options">
            <Big
              icon={<IconSettings size={28} />}
              label="Settings"
              title="Drawboard settings"
              onClick={view.onToggleSettings}
            />
          </RibbonGroup>
        </>
      ),
    },
    {
      id: 'export',
      label: 'Export',
      content: (
        <>
          <RibbonGroup label="Download">
            <Big
              icon={<IconImage size={28} />}
              label="PNG"
              title="Export Drawboard image as PNG"
              onClick={exp.onExportPng}
            />
            <Big
              icon={<IconFileSvg size={28} />}
              label="SVG"
              title="Export editable vector image as SVG"
              onClick={exp.onExportSvg}
            />
            <Big
              icon={<IconBoardFile size={28} />}
              label="Drawboard file"
              title="Export editable ReveLith Drawboard file (.draw)"
              onClick={exp.onExportBoard}
            />
            <Big
              icon={<IconCopy size={28} />}
              label="Copy PNG"
              title="Copy PNG to clipboard"
              onClick={exp.onCopyPng}
            />
          </RibbonGroup>
          <RibbonGroup label="Insert">
            <Big
              icon={<IconImage size={28} />}
              label="Image"
              title="Insert image file"
              onClick={() => document.getElementById('wb-insert-image')?.click()}
            />
          </RibbonGroup>
        </>
      ),
    },
  ]
  return (
    <AppRibbon
      title={props.title}
      status={props.status}
      actions={quickAccess}
      tabs={tabs}
      fileTabId="file"
      fileTabTooltip="File tools"
      fileTabClassName="wb-file-btn"
      initialTabId="home"
    />
  )
}
