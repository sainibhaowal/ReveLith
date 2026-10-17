import { useState, type ReactNode } from 'react'

export interface AppRibbonTab {
  id: string
  label: string
  tooltip?: string
  content: ReactNode
}

export function AppRibbon({
  title,
  status,
  actions,
  tabs,
  fileTabId,
  fileTabTooltip,
  fileTabClassName,
  initialTabId,
}: {
  title: string
  status?: ReactNode
  actions?: ReactNode
  tabs: AppRibbonTab[]
  /** Render this tab as the leading File button, before quick-access actions. */
  fileTabId?: string
  fileTabTooltip?: string
  /** Optional app-specific class for preserving an established File-tab accent. */
  fileTabClassName?: string
  /** Choose the initially selected tab when the ribbon opens. */
  initialTabId?: string
}) {
  const [activeTab, setActiveTab] = useState(initialTabId ?? tabs[0]?.id ?? '')
  const fileTab = fileTabId ? tabs.find((tab) => tab.id === fileTabId) : undefined
  return (
    <header className="revelith-app-ribbon" data-revelith-ribbon="">
      <div className="revelith-app-ribbon-tabs" role="tablist" aria-label={`${title} tools`}>
        {fileTab ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === fileTab.id}
            className={`revelith-app-ribbon-file${activeTab === fileTab.id ? ' active' : ''}${fileTabClassName ? ` ${fileTabClassName}` : ''}`}
            data-tip={fileTabTooltip ?? fileTab.label}
            onClick={() => setActiveTab(fileTab.id)}
          >
            {fileTab.label}
          </button>
        ) : null}
        {fileTab && actions ? <div className="revelith-app-ribbon-actions">{actions}</div> : null}
        {tabs.map((tab) =>
          tab.id === fileTabId ? null : (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={activeTab === tab.id ? 'active' : ''}
              data-tip={tab.tooltip ?? tab.label}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ),
        )}
        {status ? (
          <span className="revelith-app-ribbon-status" data-tip={`${title} status`}>
            {status}
          </span>
        ) : null}
        {!fileTab && actions ? <div className="revelith-app-ribbon-actions">{actions}</div> : null}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className="revelith-app-ribbon-body"
          role="tabpanel"
          data-ribbon-panel={tab.id}
          aria-label={`${tab.label} tools`}
          hidden={activeTab !== tab.id}
        >
          {tab.content}
        </div>
      ))}
    </header>
  )
}

export function RibbonGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="revelith-app-ribbon-group">
      <div className="revelith-app-ribbon-group-items">{children}</div>
      <div className="revelith-app-ribbon-group-label">{label}</div>
    </section>
  )
}
