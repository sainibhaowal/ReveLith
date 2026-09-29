import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useI18n } from './locale'
import type { StringKey } from './locale'
import type { UiTheme } from '../../shared/home-api'
import './settings.css'

interface CustomSelectOption<T extends string> {
  value: T
  label: string
}

function CustomSelect<T extends string>({
  value,
  options,
  onChange,
  id,
}: {
  value: T
  options: readonly CustomSelectOption<T>[]
  onChange: (val: T) => void
  id?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const selectedOption = options.find((o) => o.value === value)

  return (
    <div className="custom-select-wrap" ref={wrapRef} id={id}>
      <button
        type="button"
        className={`custom-select-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="custom-select-value">{selectedOption?.label ?? value}</span>
        <svg
          className="custom-select-chevron"
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 4.5L6 8L9.5 4.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="custom-select-dropdown" role="listbox">
          {options.map((opt) => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                className={`custom-select-item${isSelected ? ' selected' : ''}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => {
                  onChange(opt.value)
                  setOpen(false)
                }}
              >
                <span className="custom-select-item-label">{opt.label}</span>
                {isSelected && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3.5 8.5L6.5 11.5L12.5 4.5"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Settings modal (opened from the account menu) ─────────
// ReveLith-style two-pane dialog: section nav on the left, fields on the right.
// All values go through the existing home IPC; nothing is stored locally.

// sorted by ISO 639 language code : native-script labels have no natural
// shared alphabet, so the code is the ordering key
const LANG_OPTIONS = [
  { value: 'ar', label: 'العربية' },
  { value: 'cs', label: 'Čeština' },
  { value: 'de', label: 'Deutsch' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'he', label: 'עברית' },
  { value: 'hi', label: 'हिन्दी' },
  { value: 'id', label: 'Bahasa Indonesia' },
  { value: 'it', label: 'Italiano' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'ms', label: 'Bahasa Melayu' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'pl', label: 'Polski' },
  { value: 'pt', label: 'Português' },
  { value: 'ru', label: 'Русский' },
  { value: 'th', label: 'ไทย' },
  { value: 'zh', label: '简体中文' },
  { value: 'zh-TW', label: '繁體中文' },
] as const

// GenMail's option order: follow-system first, then the manual picks
const THEME_OPTIONS = [
  { value: 'system', labelKey: 'themeSystem' },
  { value: 'light', labelKey: 'themeLight' },
  { value: 'dark', labelKey: 'themeDark' },
] as const satisfies readonly { value: UiTheme; labelKey: StringKey }[]

const _CHANNEL_OPTIONS = [
  { value: 'stable', labelKey: 'channelStable' },
  { value: 'beta', labelKey: 'channelBeta' },
] as const satisfies readonly { value: 'stable' | 'beta'; labelKey: StringKey }[]

type SectionId = 'account' | 'ai' | 'media' | 'general' | 'integrations' | 'about'

const SECTIONS: readonly { id: SectionId; label: string }[] = [
  { id: 'account', label: 'Account' },
  { id: 'ai', label: 'AI & Models' },
  { id: 'media', label: 'AI Media & Search' },
  { id: 'general', label: 'General' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'about', label: 'About' },
]

function SectionIcon({ id }: { id: SectionId }) {
  if (id === 'account') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="5.2" r="2.6" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M2.5 13.5c.6-2.6 2.8-4 5.5-4s4.9 1.4 5.5 4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  if (id === 'media') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect
          x="1.8"
          y="3"
          width="12.4"
          height="8.6"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.3"
        />
        <circle cx="5.2" cy="6.4" r="1.1" fill="currentColor" />
        <path
          d="M3 10.4l3-3 2.4 2.4 2-2 2.8 2.8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M6 13.6h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'integrations') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M6.5 2v3M9.5 2v3M5 5h6v2.5a3 3 0 0 1-6 0V5z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M8 10.5V14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'ai') {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z" />
        <path d="M12 6a6 6 0 0 0-6 6c0 2.5 1.5 4.5 3.5 5.5" />
        <path d="M12 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0" />
      </svg>
    )
  }
  if (id === 'general') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2 5h8M13 5h1M2 11h1M6 11h8"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="11.5" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.3" />
        <circle cx="4.5" cy="11" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6.3" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.4v3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="8" cy="5.1" r="0.8" fill="currentColor" />
    </svg>
  )
}

function ProviderIcon({ id }: { id: string }) {
  if (id === 'ollama') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 2C8.5 2 7 4.5 7 7v4H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h1v1h2v-1h6v1h2v-1h1a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1V7c0-2.5-1.5-5-5-5z"
          fill="#F3F4F6"
        />
        <circle cx="9.5" cy="13.5" r="1.5" fill="#111827" />
        <circle cx="14.5" cy="13.5" r="1.5" fill="#111827" />
        <path d="M10 6.5h4M10 8.5h4" stroke="#111827" strokeWidth="1.2" strokeLinecap="round" />
        <circle cx="12" cy="16.5" r="1" fill="#111827" />
      </svg>
    )
  }
  if (id === 'lmstudio') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#1E293B" />
        <path
          d="M5 6.5C5 5.67 5.67 5 6.5 5h11c.83 0 1.5.67 1.5 1.5v8c0 .83-.67 1.5-1.5 1.5h-11C5.67 16 5 15.33 5 14.5v-8z"
          fill="#0284C7"
        />
        <rect x="7" y="7" width="10" height="7" rx="1" fill="#38BDF8" />
        <path d="M10 18.5h4M12 16v2.5" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'openai') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M22.28 9.37a5.98 5.98 0 0 0-.52-4.95 6.07 6.07 0 0 0-6.52-2.73 6.08 6.08 0 0 0-4.73-2.39 6.07 6.07 0 0 0-5.8 4.3 6.08 6.08 0 0 0-3.9 2.83 6.07 6.07 0 0 0 .74 7.07 6.08 6.08 0 0 0 .52 4.95 6.07 6.07 0 0 0 6.52 2.73 6.08 6.08 0 0 0 4.73 2.39 6.07 6.07 0 0 0 5.8-4.3 6.08 6.08 0 0 0 3.9-2.83 6.07 6.07 0 0 0-.74-7.07zm-8.86 11.45a3.86 3.86 0 0 1-2.28-.73l3.65-2.11a1.1 1.1 0 0 0 .56-.96v-5.14l1.55.9a.1.1 0 0 1 .05.08v4.22a3.88 3.88 0 0 1-3.53 3.74zm-8.15-3.48a3.86 3.86 0 0 1-.5-2.35l3.65 2.1a1.1 1.1 0 0 0 1.11 0l4.45-2.57v1.79a.1.1 0 0 1-.04.09l-3.65 2.11a3.88 3.88 0 0 1-5.02-1.17zm-1.84-8.73a3.86 3.86 0 0 1 1.78-1.62v4.22a1.1 1.1 0 0 0 .55.96l4.45 2.57-1.55.9a.1.1 0 0 1-.1 0l-3.65-2.11a3.88 3.88 0 0 1-1.48-4.92zm14.19 3.02l-4.45-2.57 1.55-.9a.1.1 0 0 1 .1 0l3.65 2.11a3.88 3.88 0 0 1 1.48 4.92 3.86 3.86 0 0 1-1.78 1.62v-4.22a1.1 1.1 0 0 0-.55-.96zm2.35 5.83a3.86 3.86 0 0 1 .5 2.35l-3.65-2.1a1.1 1.1 0 0 0-1.11 0l-4.45 2.57v-1.79a.1.1 0 0 1 .04-.09l3.65-2.11a3.88 3.88 0 0 1 5.02 1.17zM10.57 13.5l-1.55-.9a.1.1 0 0 1-.05-.08V8.3a3.88 3.88 0 0 1 5.81-3.01l-3.65 2.11a1.1 1.1 0 0 0-.56.96v5.14zm1.18-1.92l2.03-1.17 2.03 1.17v2.34l-2.03 1.17-2.03-1.17v-2.34z"
          fill="#10A37F"
        />
      </svg>
    )
  }
  if (id === 'anthropic') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path
          d="M14.5 3H18L24 21h-3.6l-1.8-4.2h-6.2l-1.8 4.2H7L14.5 3zm2.5 9.8l-1.8-4.3-1.8 4.3H17zM0 21L7.5 3h3.6L3.6 21H0z"
          fill="#D97706"
        />
      </svg>
    )
  }
  if (id === 'gemini') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <defs>
          <linearGradient id="geminiGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#1BA1E3" />
            <stop offset="35%" stopColor="#5470FF" />
            <stop offset="70%" stopColor="#8E55EA" />
            <stop offset="100%" stopColor="#EA4335" />
          </linearGradient>
        </defs>
        <path
          d="M12 0C12 6.627 17.373 12 24 12C17.373 12 12 17.373 12 24C12 17.373 6.627 12 0 12C6.627 12 12 6.627 12 0Z"
          fill="url(#geminiGrad2)"
        />
      </svg>
    )
  }
  if (id === 'deepseek') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="11" fill="#1D4ED8" />
        <path
          d="M5.5 13.5C7.2 9.5 11 8.5 15.5 10C17.5 10.7 18.5 12.2 18.5 14C18.5 16 16.8 17.5 14.5 17.5C11.5 17.5 9.5 16 8.5 14.5"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        <circle cx="10" cy="11.5" r="1.3" fill="#FFFFFF" />
        <circle cx="15.5" cy="12" r="1.3" fill="#FFFFFF" />
      </svg>
    )
  }
  if (id === 'opencode-zen') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="OpenCode Zen">
        <rect width="24" height="24" fill="#0B0B0B" />
        <path d="M7 5H17V19H7V5ZM10 8V16H14V8H10Z" fill="#FFFFFF" fillRule="evenodd" />
      </svg>
    )
  }
  if (id === 'opper') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-label="Opper">
        <rect width="24" height="24" rx="6" fill="#6366F1" />
        <circle cx="12" cy="12" r="5" fill="#FFFFFF" />
      </svg>
    )
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="11" fill="#F59E0B" fillOpacity="0.15" />
      <polygon points="13 3 4 14 12 14 11 21 20 10 12 10 13 3" fill="#F59E0B" />
    </svg>
  )
}

const PROVIDER_METAS = [
  {
    id: 'ollama',
    label: 'Ollama (Local)',
    defaultUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    desc: '100% Offline Local LLM Runner',
  },
  {
    id: 'lmstudio',
    label: 'LM Studio (Local)',
    defaultUrl: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    desc: 'Local Desktop Model Server',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    defaultUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1-mini',
    desc: 'Direct OpenAI API (gpt-6-astra, GPT-4o, Mini)',
  },
  {
    id: 'opencode-zen',
    label: 'OpenCode Zen',
    defaultUrl: 'https://opencode.ai/zen/v1',
    defaultModel: 'deepseek-v4-pro',
    desc: 'OpenCode curated AI gateway',
  },
  {
    id: 'anthropic',
    label: 'Claude',
    defaultUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-4-6',
    desc: 'Direct Anthropic API (Claude)',
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    defaultUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-flash',
    desc: 'Direct Google Gemini API',
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    defaultUrl: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-v4.1-flash',
    desc: 'DeepSeek V4.1 Flash / V3 / R1 Reasoner',
  },
  {
    id: 'codex-app-server',
    label: 'Codex App Server',
    defaultUrl: 'http://localhost:8765/v1',
    defaultModel: 'codex-1',
    desc: 'Local / Remote Codex App Server',
  },
  {
    id: 'opper',
    label: 'Opper',
    defaultUrl: 'https://api.opper.ai/v1',
    defaultModel: 'opper-default',
    desc: 'Opper AI Gateway & Orchestration',
  },
  {
    id: 'custom',
    label: 'Custom Server',
    defaultUrl: 'http://localhost:8080/v1',
    defaultModel: 'custom-model',
    desc: 'Custom OpenAI-compatible Endpoint',
  },
] as const

/** Agents with a real one-click SKILL.md install target (see skill-install.ts). */
const KNOWN_SKILL_AGENTS = ['claude-code', 'codex', 'opencode'] as const

function agentDisplayName(agent: string): string {
  if (agent === 'claude-code') return 'Claude Code'
  if (agent === 'codex') return 'Codex'
  if (agent === 'opencode') return 'OpenCode'
  return agent
}

function IntegrationsSection() {
  const [skillStatus, setSkillStatus] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const [agentRows, setAgentRows] = useState<
    Array<{ agent: string; dir: string; hostDetected: boolean; installed: boolean }>
  >([])
  const [agentsBusy, setAgentsBusy] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<
    'claude-code' | 'claude-desktop' | 'cursor' | 'in-app' | 'cli'
  >('claude-code')

  const refreshAgentRows = async () => {
    try {
      const detected = ((await window.aiOffice?.detectSkills?.()) ?? []) as string[]
      setAgentRows((prev) => {
        const prevByAgent = new Map(prev.map((r) => [r.agent, r]))
        const rows: Array<{
          agent: string
          dir: string
          hostDetected: boolean
          installed: boolean
        }> = KNOWN_SKILL_AGENTS.map((agent) => ({
          agent,
          dir: prevByAgent.get(agent)?.dir ?? '',
          hostDetected: detected.includes(agent),
          installed: prevByAgent.get(agent)?.installed ?? false,
        }))
        for (const agent of detected) {
          if (!rows.some((r) => r.agent === agent)) {
            rows.push({ agent, dir: '', hostDetected: true, installed: false })
          }
        }
        return rows
      })
    } catch {}
  }

  useEffect(() => {
    void refreshAgentRows()
  }, [])

  const installOneSkill = async (agent: string) => {
    setAgentsBusy(agent)
    try {
      const res = (await window.aiOffice?.installSkill?.(agent)) ?? []
      const ok = res.some((r) => r.agent === agent && r.ok)
      const path = res.find((r) => r.agent === agent)?.path ?? ''
      setAgentRows((prev) =>
        prev.map((r) =>
          r.agent === agent ? { ...r, installed: ok || r.installed, dir: path || r.dir } : r,
        ),
      )
      setSkillStatus(
        res
          .map((r) => `${r.agent}: ${r.ok ? '✓ installed (' + r.path + ')' : 'skipped'}`)
          .join('\n') || 'Done',
      )
    } catch (e: unknown) {
      setSkillStatus(e instanceof Error ? e.message : String(e))
    } finally {
      setAgentsBusy(null)
    }
  }

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text)
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 2000)
  }

  const claudeCodeCmd = `claude mcp add revelith -- npx revelith mcp`
  const claudeDesktopConfig = `{
  "mcpServers": {
    "revelith": {
      "command": "revelith",
      "args": ["mcp"]
    }
  }
}`
  const cursorConfig = `{
  "mcpServers": {
    "revelith": {
      "command": "revelith",
      "args": ["mcp"]
    }
  }
}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h3 className="set-pane-title" style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600 }}>
          Integrations & Agent Protocol (MCP)
        </h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          Connect AI coding agents to ReveLith via the <strong>Model Context Protocol (MCP)</strong>
          . Agents can inspect, generate, and edit presentations, spreadsheets, and Word documents
          in real time.
        </p>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: 6,
        }}
      >
        {[
          { id: 'claude-code', label: 'Claude Code' },
          { id: 'claude-desktop', label: 'Claude Desktop' },
          { id: 'cursor', label: 'Cursor IDE' },
          { id: 'in-app', label: 'In-App Live MCP' },
          { id: 'cli', label: 'CLI & Skills' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="btn-chip"
            onClick={() => setActiveTab(tab.id as any)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border:
                activeTab === tab.id ? '1px solid var(--accent)' : '1px solid var(--border-subtle)',
              background:
                activeTab === tab.id
                  ? 'var(--accent-subtle, rgba(99, 102, 241, 0.1))'
                  : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-secondary)',
              fontWeight: activeTab === tab.id ? 600 : 400,
              fontSize: 12,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Active Tab Content */}
      <div
        style={{
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 10,
          padding: 18,
        }}
      >
        {activeTab === 'claude-code' && (
          <div>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>⚡</span> Claude Code One-Line Setup
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Run this single command in your terminal to register the ReveLith MCP tools with
              Claude Code. Works even when ReveLith is not running.
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  fontFamily: 'monospace',
                  fontSize: 12.5,
                  margin: 0,
                  overflowX: 'auto',
                }}
              >
                <code>{claudeCodeCmd}</code>
              </pre>
              <button
                type="button"
                className="btn-chip"
                onClick={() => copyToClipboard(claudeCodeCmd, 'claude-code')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: copiedKey === 'claude-code' ? '#22c55e' : 'var(--text-primary)',
                }}
              >
                {copiedKey === 'claude-code' ? '✓ Copied' : 'Copy Command'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              💡 Example prompt in Claude Code:{' '}
              <code>"Build an 8-slide pitch deck on Renewable Energy trends using revelith"</code>
            </p>
          </div>
        )}

        {activeTab === 'claude-desktop' && (
          <div>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🖥️</span> Claude Desktop Configuration
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Add ReveLith to your <code>claude_desktop_config.json</code> under{' '}
              <code>mcpServers</code>:
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  margin: 0,
                  overflowX: 'auto',
                }}
              >
                <code>{claudeDesktopConfig}</code>
              </pre>
              <button
                type="button"
                className="btn-chip"
                onClick={() => copyToClipboard(claudeDesktopConfig, 'claude-desktop')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: copiedKey === 'claude-desktop' ? '#22c55e' : 'var(--text-primary)',
                }}
              >
                {copiedKey === 'claude-desktop' ? '✓ Copied' : 'Copy Config'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10, marginBottom: 0 }}>
              Location on Windows: <code>%APPDATA%\Claude\claude_desktop_config.json</code>
            </p>
          </div>
        )}

        {activeTab === 'cursor' && (
          <div>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🖱️</span> Cursor IDE MCP Integration
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              Configure Cursor Settings → Features → MCP or add to <code>.cursor/mcp.json</code> in
              your project:
            </p>
            <div style={{ position: 'relative' }}>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '12px 14px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  margin: 0,
                  overflowX: 'auto',
                }}
              >
                <code>{cursorConfig}</code>
              </pre>
              <button
                type="button"
                className="btn-chip"
                onClick={() => copyToClipboard(cursorConfig, 'cursor')}
                style={{
                  position: 'absolute',
                  right: 8,
                  top: 8,
                  padding: '4px 10px',
                  fontSize: 11,
                  fontWeight: 600,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: copiedKey === 'cursor' ? '#22c55e' : 'var(--text-primary)',
                }}
              >
                {copiedKey === 'cursor' ? '✓ Copied' : 'Copy Config'}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'in-app' && (
          <div>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>🔴</span> Local In-App Live Editor Server
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              When ReveLith is open, the built-in local MCP server allows AI agents to inspect and
              edit your open Word documents, spreadsheets, and presentation slides live in real
              time.
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 14px',
                background: 'var(--surface)',
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                marginBottom: 12,
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: '#22c55e',
                }}
              />
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>Endpoint:</span>
              <code style={{ fontSize: 12, color: 'var(--accent)' }}>
                http://127.0.0.1:3928/mcp
              </code>
              <button
                type="button"
                className="btn-chip"
                onClick={() => copyToClipboard('http://127.0.0.1:3928/mcp', 'in-app-url')}
                style={{
                  marginLeft: 'auto',
                  padding: '3px 8px',
                  fontSize: 11,
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 4,
                  cursor: 'pointer',
                  color: copiedKey === 'in-app-url' ? '#22c55e' : 'var(--text-primary)',
                }}
              >
                {copiedKey === 'in-app-url' ? '✓ Copied' : 'Copy URL'}
              </button>
            </div>
            <ul
              style={{
                margin: 0,
                paddingLeft: 18,
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.6,
              }}
            >
              <li>Real-time bidirectional document tree inspection and node patching</li>
              <li>Live paragraph, table, cell, and slide manipulation without file reload</li>
              <li>Protected by local-loopback only binding (127.0.0.1)</li>
            </ul>
          </div>
        )}

        {activeTab === 'cli' && (
          <div>
            <h4
              style={{
                margin: '0 0 8px',
                fontSize: 14,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span>📦</span> ReveLith CLI & Agent Skills
            </h4>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              One-click installer for local coding agents (Claude Code, Codex, OpenCode). Installs
              the native ReveLith skill definitions into agent config directories.
            </p>
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginBottom: 14,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                1
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Pick a route:</strong> CLI if your
                assistant can run terminal commands, MCP if it cannot.
              </span>
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                2
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Follow that section below</strong>—
                usually a single click.
              </span>
              <span
                style={{
                  flexShrink: 0,
                  width: 20,
                  height: 20,
                  borderRadius: '50%',
                  background: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: 11,
                }}
              >
                3
              </span>
              <span style={{ flex: 1 }}>
                <strong style={{ color: 'var(--text-primary)' }}>Start a new chat</strong> and just
                ask.
              </span>
            </div>
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                marginBottom: 6,
                color: 'var(--text-secondary)',
              }}
            >
              Install the skill into your assistant
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {agentRows.map((row) => (
                <div
                  key={row.agent}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 12px',
                    background: 'var(--surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 6,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      {agentDisplayName(row.agent)}
                    </div>
                    <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                      {row.installed
                        ? `Skill installed (${row.dir})`
                        : row.hostDetected
                          ? 'Skill not installed'
                          : 'Assistant not detected on this computer'}
                    </div>
                  </div>
                  {row.installed ? (
                    <span style={{ fontSize: 12, color: '#22c55e', fontWeight: 600 }}>
                      ✓ Installed
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="set-btn"
                      disabled={agentsBusy !== null}
                      onClick={() => void installOneSkill(row.agent)}
                    >
                      {agentsBusy === row.agent ? 'Installing…' : 'Install'}
                    </button>
                  )}
                </div>
              ))}
              {agentRows.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Detecting assistants on this computer…
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <button
                type="button"
                className="set-btn primary"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  setSkillStatus('Installing skills…')
                  void (
                    window as unknown as {
                      aiOffice?: {
                        installSkill?: () => Promise<
                          Array<{ agent: string; ok: boolean; path: string }>
                        >
                      }
                    }
                  ).aiOffice
                    ?.installSkill?.()
                    .then((res) =>
                      setSkillStatus(
                        res
                          ?.map(
                            (r) =>
                              `${r.agent}: ${r.ok ? '✓ installed (' + r.path + ')' : 'skipped'}`,
                          )
                          .join('\n') || 'Done',
                      ),
                    )
                    .catch((e: unknown) =>
                      setSkillStatus(e instanceof Error ? e.message : String(e)),
                    )
                    .finally(() => setBusy(false))
                }}
                style={{ height: 32, padding: '0 16px', fontSize: 13, fontWeight: 600 }}
              >
                {busy ? 'Installing…' : '⚡ Install ReveLith Skills'}
              </button>
            </div>
            {skillStatus && (
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  margin: '0 0 12px',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {skillStatus}
              </pre>
            )}
            <div style={{ marginTop: 12 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--text-secondary)',
                }}
              >
                Try it
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Once installed, open a new chat in your assistant and ask in plain words, for
                example:
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {[
                  'Turn ~/Downloads/report.md into a Word document',
                  'Make a 6-slide deck about our Q3 results',
                  'Convert budget.xlsx to PDF and open it in ReveLith',
                ].map((prompt) => (
                  <div
                    key={prompt}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      background: 'var(--surface)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 6,
                    }}
                  >
                    <span style={{ flex: 1, fontSize: 12.5 }}>&ldquo;{prompt}&rdquo;</span>
                    <button
                      type="button"
                      className="set-btn"
                      onClick={() => copyToClipboard(prompt, `try-${prompt}`)}
                    >
                      {copiedKey === `try-${prompt}` ? '✓ Copied' : 'Copy'}
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 14px' }}>
                The assistant runs the revelith command line itself; you never have to type it.
              </p>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--text-secondary)',
                }}
              >
                My assistant is not listed
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px' }}>
                Any MCP-capable assistant can drive ReveLith over stdio (nothing to switch on here),
                or over Streamable HTTP for remote agents and sandboxes:
              </p>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  margin: '0 0 14px',
                  lineHeight: 1.6,
                }}
              >
                {`revelith mcp                             # stdio (Claude Desktop, Cursor, …)
revelith mcp --http 3928 --token <secret>  # Streamable HTTP + PUT /files/<name> upload`}
              </pre>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--text-secondary)',
                }}
              >
                Advanced: revelith command line
              </div>
              <pre
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontFamily: 'monospace',
                  fontSize: 11.5,
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                {`revelith mcp                               # Start standard MCP server
revelith docs apply doc.docx --spec spec.json  # Apply document styles & content
revelith sheet apply sheet.xlsx --spec spec.json # Apply formulas & conditional formats
revelith slides apply deck.pptx --spec spec.json # Apply slide templates & shapes
revelith deck build --spec spec.json --out out.pptx # Build deck from spec
revelith open deck.pptx --slide 3            # Point editor at slide / range / page
revelith check file.docx [--json]            # Quality & validation check`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function AiSettingsSection() {
  const [settings, setSettings] = useState<any>(null)
  const [selectedId, setSelectedId] = useState<string>('ollama')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<{
    state: 'idle' | 'testing' | 'success' | 'error'
    message?: string
  }>({ state: 'idle' })
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [fetchingModels, setFetchingModels] = useState(false)
  const [discoveryError, setDiscoveryError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const handleSaveAndApply = () => {
    const next = { ...settings, provider: selectedId }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    void window.aiOffice?.setAiSettings?.(next)
    window.dispatchEvent(new Event('ai-settings-changed'))
    setSaveSuccess(true)
    setTimeout(() => setSaveSuccess(false), 3000)
  }

  useEffect(() => {
    let alive = true
    void (async () => {
      let s = await window.aiOffice?.getAiSettings?.()
      if (!s) {
        try {
          const stored = localStorage.getItem('revelith.aiSettings')
          if (stored) s = JSON.parse(stored)
        } catch {}
      }
      if (!s) {
        s = {
          provider: 'ollama',
          providers: {
            ollama: { apiKey: '', model: 'llama3.2', baseUrl: 'http://127.0.0.1:11434/v1' },
            lmstudio: { apiKey: '', model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1' },
            openai: { apiKey: '', model: 'gpt-4o-mini' },
            anthropic: { apiKey: '', model: 'claude-sonnet-4-6' },
          },
        }
      }
      if (alive && s) {
        setSettings(s)
        const validSelected = PROVIDER_METAS.some((p) => p.id === s.provider)
          ? s.provider
          : 'ollama'
        setSelectedId(validSelected)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const [aiFontSize, setAiFontSize] = useState(() => {
    try {
      return localStorage.getItem('revelith.aiPanelFontSize') || '14px'
    } catch {
      return '14px'
    }
  })
  const [aiSpellcheck, setAiSpellcheck] = useState(() => {
    try {
      return localStorage.getItem('revelith.aiSpellcheck') !== 'false'
    } catch {
      return true
    }
  })

  const activeProvider = PROVIDER_METAS.some((p) => p.id === settings?.provider)
    ? settings.provider
    : 'ollama'
  const currentMeta = PROVIDER_METAS.find((p) => p.id === selectedId) || PROVIDER_METAS[0]
  const currentConfig = settings?.providers?.[selectedId] || {
    apiKey: '',
    model: currentMeta.defaultModel,
    baseUrl: currentMeta.defaultUrl,
  }

  useEffect(() => {
    if (!settings) return
    if (currentConfig.discoveredModels && currentConfig.discoveredModels.length > 0) {
      setDiscoveredModels(currentConfig.discoveredModels)
    } else {
      setDiscoveredModels([])
    }
  }, [selectedId, settings, currentConfig.discoveredModels])

  if (!settings) return <div style={{ padding: 20 }}>Loading AI settings...</div>

  const updateConfig = (key: string, val: string) => {
    const next = {
      ...settings,
      providers: {
        ...settings.providers,
        [selectedId]: {
          ...(settings.providers?.[selectedId] || {}),
          [key]: val,
        },
      },
    }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    void window.aiOffice?.setAiSettings?.(next)
  }

  const updateByok = (key: 'webSearchKey' | 'imageGenKey' | 'mediaAnalysisKey', val: string) => {
    const next = {
      ...settings,
      byok: {
        ...(settings.byok || {}),
        [key]: val,
      },
    }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    void window.aiOffice?.setAiSettings?.(next)
  }

  const changeAiFontSize = (size: string) => {
    setAiFontSize(size)
    try {
      localStorage.setItem('revelith.aiPanelFontSize', size)
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-ai-panel-settings-changed', { detail: { fontSize: size } }),
    )
  }

  const toggleAiSpellcheck = (val: boolean) => {
    setAiSpellcheck(val)
    try {
      localStorage.setItem('revelith.aiSpellcheck', String(val))
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-ai-panel-settings-changed', { detail: { spellcheck: val } }),
    )
  }

  const setActiveProvider = (id: string) => {
    const next = { ...settings, provider: id }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    void window.aiOffice?.setAiSettings?.(next)
  }

  const handleTestConnection = async () => {
    setTestStatus({ state: 'testing', message: 'Testing connection to endpoint...' })
    try {
      const url = currentConfig.baseUrl || currentMeta.defaultUrl
      const apiKey = currentConfig.apiKey || ''
      if (!url) {
        setTestStatus({ state: 'error', message: 'Missing Base URL' })
        return
      }

      if (
        (selectedId === 'openai' ||
          selectedId === 'opencode-zen' ||
          selectedId === 'anthropic' ||
          selectedId === 'gemini' ||
          selectedId === 'deepseek') &&
        !apiKey
      ) {
        setTestStatus({
          state: 'error',
          message: 'Please enter your API Key before testing connection.',
        })
        return
      }

      let ok = false
      let status = 0
      if (typeof window.aiOffice?.discoverAiModels === 'function') {
        const models = await window.aiOffice.discoverAiModels(selectedId, url, apiKey)
        if (models.length > 0) {
          setTestStatus({
            state: 'success',
            message: `Successfully connected to ${currentMeta.label}`,
          })
          return
        }
        ok = false
      } else {
        const proxyUrl = `/api/proxy-models?target=${encodeURIComponent(url)}&apiKey=${encodeURIComponent(apiKey)}&provider=${encodeURIComponent(selectedId)}`
        const res = await fetch(proxyUrl).catch(() => null)
        status = res?.status ?? 0
        ok = !!res?.ok
        if (ok) {
          setTestStatus({
            state: 'success',
            message: `Successfully connected to ${currentMeta.label}`,
          })
          return
        }
      }
      if (status === 401) {
        setTestStatus({ state: 'error', message: 'Authentication failed: Invalid API Key' })
      } else if (apiKey) {
        setTestStatus({ state: 'success', message: `Connected to ${currentMeta.label} endpoint` })
      } else {
        setTestStatus({ state: 'error', message: `Endpoint unreachable (${url})` })
      }
    } catch (err: any) {
      setTestStatus({ state: 'error', message: err?.message || 'Connection error' })
    }
  }

  const handleDiscoverModels = async () => {
    if (selectedId === 'revelith') return
    setFetchingModels(true)
    setDiscoveryError(null)
    setDiscoveredModels([])
    try {
      const baseUrl = currentConfig.baseUrl || currentMeta.defaultUrl
      const apiKey = currentConfig.apiKey || ''

      let foundList: string[] = []
      let discoveryErr: string | null = null

      // 1. Real discovery via the main-process IPC bridge (works in the packaged
      //    app; maps Anthropic -> api.anthropic.com/v1/models, Gemini ->
      //    generativelanguage.googleapis.com, OpenAI/DeepSeek/Ollama/LM Studio ->
      //    their /models or /api/tags endpoints). Falls back to the dev-only
      //    /api/proxy-models middleware when running in a plain browser.
      const discoverInMain = window.aiOffice?.discoverAiModels
      const hasMainProcessDiscovery = typeof discoverInMain === 'function'
      if (hasMainProcessDiscovery) {
        try {
          foundList = await discoverInMain(selectedId, baseUrl || '', apiKey)
        } catch (err: any) {
          discoveryErr = err?.message || 'Discovery failed in the main process.'
        }
      }

      // This relative route exists only in browser/dev mode. In a packaged
      // Electron app it resolves against file:// and creates a misleading 404.
      if (foundList.length === 0 && !discoveryErr && !hasMainProcessDiscovery) {
        const proxyUrl = `/api/proxy-models?target=${encodeURIComponent(baseUrl || '')}&apiKey=${encodeURIComponent(apiKey)}&provider=${encodeURIComponent(selectedId)}`
        const res = await fetch(proxyUrl).catch(() => null)
        if (res && res.ok) {
          const json = await res.json().catch(() => null)
          if (json) {
            if (Array.isArray(json.data)) {
              foundList = json.data
                .map((m: any) => {
                  const id = m.id || m.name || m.model
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            } else if (Array.isArray(json.models)) {
              foundList = json.models
                .map((m: any) => {
                  const id = m.name || m.model || m.id
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            } else if (Array.isArray(json)) {
              foundList = json
                .map((m: any) => {
                  if (typeof m === 'string') return m
                  const id = m.id || m.name || m.model
                  return typeof id === 'string' ? id.replace(/^models\//, '') : String(m)
                })
                .filter(Boolean)
            }
          }
        } else if (res && res.status === 401) {
          discoveryErr = 'Invalid API Key — real model discovery requires a valid key.'
        } else if (res && res.status === 404) {
          discoveryErr = 'Endpoint unreachable or no models endpoint found.'
        }
      }

      // 2. Fallback: direct browser fetch for local engines (Ollama / LM Studio)
      if (
        foundList.length === 0 &&
        (selectedId === 'ollama' || selectedId === 'lmstudio' || selectedId === 'custom')
      ) {
        const cleanUrl = (baseUrl || '').replace(/\/$/, '')
        const rootUrl = cleanUrl.replace(/\/v1$/, '')
        const headers: Record<string, string> = { Accept: 'application/json' }
        if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`

        const candidateUrls = [
          `${cleanUrl}/models`,
          `${rootUrl}/v1/models`,
          `${rootUrl}/api/tags`,
          `${cleanUrl}/tags`,
          cleanUrl.includes('localhost')
            ? cleanUrl.replace('localhost', '127.0.0.1') + '/models'
            : null,
          cleanUrl.includes('127.0.0.1')
            ? cleanUrl.replace('127.0.0.1', 'localhost') + '/models'
            : null,
        ].filter(Boolean) as string[]

        for (const url of candidateUrls) {
          try {
            const resp = await fetch(url, { method: 'GET', headers }).catch(() => null)
            if (resp && resp.ok) {
              const json = await resp.json().catch(() => null)
              if (json) {
                if (Array.isArray(json.data)) {
                  foundList = json.data.map((m: any) => m.id || m.name || String(m)).filter(Boolean)
                } else if (Array.isArray(json.models)) {
                  foundList = json.models
                    .map((m: any) => m.name || m.model || m.id || String(m))
                    .filter(Boolean)
                } else if (Array.isArray(json)) {
                  foundList = json
                    .map((m: any) => (typeof m === 'string' ? m : m.id || m.name || String(m)))
                    .filter(Boolean)
                }
                if (foundList.length > 0) break
              }
            }
          } catch {}
        }
      }

      // 3. Last-resort curated defaults only when live discovery failed entirely
      if (foundList.length === 0) {
        if (selectedId === 'anthropic') {
          foundList = [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
          ]
        } else if (selectedId === 'openai') {
          foundList = ['gpt-4o', 'gpt-4o-mini', 'o1', 'o3-mini', 'gpt-4-turbo']
        } else if (selectedId === 'gemini') {
          foundList = ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash', 'gemini-1.5-pro']
        } else if (selectedId === 'deepseek') {
          foundList = ['deepseek-chat', 'deepseek-reasoner']
        }
      }

      if (foundList.length > 0) {
        const uniqueList = Array.from(new Set(foundList))
        setDiscoveredModels(uniqueList)
        const next = {
          ...settings,
          providers: {
            ...settings.providers,
            [selectedId]: {
              ...(settings.providers?.[selectedId] || {}),
              discoveredModels: uniqueList,
              ...(!currentConfig.model || currentConfig.model === currentMeta.defaultModel
                ? { model: uniqueList[0] }
                : {}),
            },
          },
        }
        setSettings(next)
        void window.aiOffice.setAiSettings?.(next)
      } else {
        setDiscoveryError(
          discoveryErr || `No live models found at ${baseUrl}. Ensure server is active.`,
        )
      }
    } catch (err: any) {
      setDiscoveryError(err?.message || 'Failed to connect to server endpoint.')
    } finally {
      setFetchingModels(false)
    }
  }

  return (
    <div className="ai-settings-container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 className="set-pane-title" style={{ margin: 0 }}>
          AI & Provider Settings
        </h3>
        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          Active Engine:{' '}
          <strong style={{ color: 'var(--color-btn-primary)' }}>
            {PROVIDER_METAS.find((p) => p.id === activeProvider)?.label}
          </strong>
        </span>
      </div>

      <div className="ai-provider-layout">
        {/* Left Provider Selector List */}
        <div className="ai-provider-list">
          {PROVIDER_METAS.map((meta) => {
            const isCurrentActive = activeProvider === meta.id
            const isSelected = selectedId === meta.id
            return (
              <button
                key={meta.id}
                className={`ai-provider-card${isSelected ? ' active' : ''}`}
                onClick={() => {
                  setSelectedId(meta.id)
                  setTestStatus({ state: 'idle' })
                  setDiscoveredModels([])
                  setDiscoveryError(null)
                }}
              >
                <span
                  className="ai-provider-card-icon"
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  <ProviderIcon id={meta.id} />
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {meta.label}
                </span>
                {isCurrentActive && <span className="ai-provider-card-badge">Active</span>}
              </button>
            )
          })}
        </div>

        {/* Right Provider Configuration Detail */}
        <div className="ai-provider-detail">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: 10,
            }}
          >
            <div>
              <h4
                style={{ margin: 0, fontSize: 16, display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  <ProviderIcon id={currentMeta.id} />
                </span>{' '}
                {currentMeta.label}
              </h4>
              <div className="ai-form-desc">{currentMeta.desc}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeProvider === selectedId ? (
                <span
                  className="ai-provider-card-badge"
                  style={{ padding: '4px 10px', fontSize: 12 }}
                >
                  ✓ Current Active Engine
                </span>
              ) : (
                <button className="set-btn primary" onClick={() => setActiveProvider(selectedId)}>
                  Set as Active Engine
                </button>
              )}
            </div>
          </div>

          {/* Base URL Input */}
          {selectedId !== 'revelith' && (
            <div className="ai-form-group">
              <label className="ai-form-label">Base URL (Endpoint)</label>
              <div className="ai-input-wrap">
                <input
                  type="text"
                  className="ai-input"
                  value={currentConfig.baseUrl ?? currentMeta.defaultUrl}
                  placeholder={currentMeta.defaultUrl}
                  onChange={(e) => updateConfig('baseUrl', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* API Key Input */}
          {selectedId !== 'ollama' && selectedId !== 'lmstudio' && selectedId !== 'revelith' && (
            <div className="ai-form-group">
              <label className="ai-form-label">API Key / Access Token</label>
              <div className="ai-input-wrap">
                <input
                  type={showKey ? 'text' : 'password'}
                  className="ai-input"
                  style={{ paddingRight: 50 }}
                  value={currentConfig.apiKey || ''}
                  placeholder="Enter your API Key..."
                  onChange={(e) => updateConfig('apiKey', e.target.value)}
                />
                <button
                  type="button"
                  className="ai-input-toggle"
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>
          )}

          {/* Real Model Discovery & Selection */}
          <div className="ai-form-group">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label className="ai-form-label">Model Selection</label>
              {selectedId !== 'revelith' && (
                <button
                  type="button"
                  className="set-btn primary"
                  style={{ height: 26, fontSize: 12, padding: '0 10px' }}
                  onClick={handleDiscoverModels}
                  disabled={fetchingModels}
                >
                  {fetchingModels ? '⟳ Querying Server...' : '🔍 Fetch Real Live Models'}
                </button>
              )}
            </div>

            {/* Unified Clean Model Selector */}
            <div style={{ marginTop: 8 }}>
              {discoveredModels.length > 0 ? (
                <div>
                  <div
                    className="ai-input-wrap"
                    style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                  >
                    <select
                      className="ai-input"
                      style={{ cursor: 'pointer', flex: 1 }}
                      value={currentConfig.model || discoveredModels[0]}
                      onChange={(e) => updateConfig('model', e.target.value)}
                    >
                      {discoveredModels.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Quick Pick from Live Models ({discoveredModels.length}):
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 6,
                        maxHeight: 110,
                        overflowY: 'auto',
                        padding: 6,
                        background: 'var(--bg-content)',
                        borderRadius: 8,
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      {discoveredModels.map((m) => {
                        const isSelected = (currentConfig.model || discoveredModels[0]) === m
                        return (
                          <button
                            key={m}
                            type="button"
                            className={`set-btn${isSelected ? ' primary' : ''}`}
                            style={{
                              height: 26,
                              fontSize: 12,
                              padding: '0 10px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                            }}
                            onClick={() => updateConfig('model', m)}
                          >
                            {isSelected && <span>✓</span>}
                            <span>{m}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="ai-input-wrap">
                  <input
                    type="text"
                    className="ai-input"
                    value={currentConfig.model || ''}
                    placeholder={`e.g. ${currentMeta.defaultModel}`}
                    onChange={(e) => updateConfig('model', e.target.value)}
                  />
                </div>
              )}
            </div>

            {discoveryError && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>
                ⚠️ {discoveryError}
              </div>
            )}
          </div>

          {/* Test & Save Action Bar */}
          <div
            className="ai-test-bar"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              marginTop: 16,
              paddingTop: 14,
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                className="set-btn"
                onClick={handleTestConnection}
                disabled={testStatus.state === 'testing'}
              >
                {testStatus.state === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
              {testStatus.state === 'success' && (
                <span className="ai-status-badge success">✓ {testStatus.message}</span>
              )}
              {testStatus.state === 'error' && (
                <span className="ai-status-badge error">✕ {testStatus.message}</span>
              )}
              {testStatus.state === 'testing' && (
                <span className="ai-status-badge checking">⟳ {testStatus.message}</span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {saveSuccess && (
                <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 500 }}>
                  ✓ Configuration Updated & Saved!
                </span>
              )}
              <button
                type="button"
                className="set-btn primary"
                style={{
                  height: 32,
                  padding: '0 16px',
                  fontSize: 13,
                  fontWeight: 600,
                  boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                }}
                onClick={handleSaveAndApply}
              >
                💾 Update & Set Model
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* BYOK Keys Section */}
      <div
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🔑</span> Dedicated BYOK Keys (Search, Image & Media)
        </h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                marginBottom: 4,
                color: 'var(--text-secondary)',
              }}
            >
              Web Search API Key (Serper / Google)
            </label>
            <input
              type="password"
              className="ai-input"
              value={settings?.byok?.webSearchKey || ''}
              placeholder="Search API Key..."
              onChange={(e) => updateByok('webSearchKey', e.target.value)}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                marginBottom: 4,
                color: 'var(--text-secondary)',
              }}
            >
              Image Generation Key (OpenAI / Image)
            </label>
            <input
              type="password"
              className="ai-input"
              value={settings?.byok?.imageGenKey || ''}
              placeholder="Image API Key..."
              onChange={(e) => updateByok('imageGenKey', e.target.value)}
            />
          </div>
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 12,
                fontWeight: 500,
                marginBottom: 4,
                color: 'var(--text-secondary)',
              }}
            >
              Media Analysis Key (Vision / Multimodal)
            </label>
            <input
              type="password"
              className="ai-input"
              value={settings?.byok?.mediaAnalysisKey || ''}
              placeholder="Vision API Key..."
              onChange={(e) => updateByok('mediaAnalysisKey', e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* AI Panel Preferences */}
      <div
        style={{
          marginTop: 14,
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <h4
          style={{
            margin: '0 0 10px',
            fontSize: 14,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span>🎨</span> AI Panel Preferences
        </h4>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Panel Font Size:</label>
            <select
              className="ai-input"
              style={{ width: 130, height: 32 }}
              value={aiFontSize}
              onChange={(e) => changeAiFontSize(e.target.value)}
            >
              <option value="12px">Small (12px)</option>
              <option value="14px">Normal (14px)</option>
              <option value="16px">Large (16px)</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={aiSpellcheck}
                onChange={(e) => toggleAiSpellcheck(e.target.checked)}
              />
              Enable Spellcheck in AI Composer
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

/** label-over-value field row with an optional right-aligned action */
const DEFAULT_MEDIA_SEARCH = {
  webSearch: { provider: 'duckduckgo', apiKey: '' },
  imageGen: { provider: '', model: '', apiKey: '', baseUrl: '' },
  imageAnalysis: { provider: '', model: '' },
  videoAnalysis: { provider: '' },
} as const

type MediaSearchState = {
  webSearch: { provider: string; apiKey: string }
  imageGen: { provider: string; model: string; apiKey: string; baseUrl: string }
  imageAnalysis: { provider: string; model: string }
  videoAnalysis: { provider: string }
}

function mergeMediaSearch(raw: any): MediaSearchState {
  const s = raw?.mediaSearch ?? {}
  return {
    webSearch: { ...DEFAULT_MEDIA_SEARCH.webSearch, ...(s.webSearch ?? {}) },
    imageGen: { ...DEFAULT_MEDIA_SEARCH.imageGen, ...(s.imageGen ?? {}) },
    imageAnalysis: { ...DEFAULT_MEDIA_SEARCH.imageAnalysis, ...(s.imageAnalysis ?? {}) },
    videoAnalysis: { ...DEFAULT_MEDIA_SEARCH.videoAnalysis, ...(s.videoAnalysis ?? {}) },
  }
}

function MediaSearchSection() {
  const [settings, setSettings] = useState<any>(null)
  const [showKeys, setShowKeys] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      let s: any
      try {
        s = (await window.aiOffice?.getAiSettings?.()) ?? null
      } catch {
        /* fall through to localStorage below */
      }
      if (!s) {
        try {
          const stored = localStorage.getItem('revelith.aiSettings')
          if (stored) s = JSON.parse(stored)
        } catch {}
      }
      if (alive) setSettings(s ?? { provider: 'lmstudio', providers: {}, byok: {} })
    })()
    return () => {
      alive = false
    }
  }, [])

  if (!settings) return <div style={{ padding: 20 }}>Loading media & search settings...</div>
  const media = mergeMediaSearch(settings)

  const persist = (nextMedia: MediaSearchState) => {
    const next = { ...settings, mediaSearch: nextMedia }
    // Keep the legacy BYOK search key in sync so older readers still find it.
    next.byok = { ...(settings.byok || {}), webSearchKey: nextMedia.webSearch.apiKey }
    setSettings(next)
    try {
      localStorage.setItem('revelith.aiSettings', JSON.stringify(next))
    } catch {}
    try {
      void window.aiOffice?.setAiSettings?.(next)
    } catch {}
    window.dispatchEvent(new Event('ai-settings-changed'))
    setSavedTick(true)
    setTimeout(() => setSavedTick(false), 1500)
  }

  const setMedia = <K extends keyof MediaSearchState>(
    section: K,
    patch: Partial<MediaSearchState[K]>,
  ) => {
    persist({ ...media, [section]: { ...media[section], ...patch } })
  }

  const imageProviderOptions = [
    { value: '', label: 'Use active chat provider' },
    ...PROVIDER_METAS.map((p) => ({ value: p.id, label: p.label })),
  ]

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 12,
    fontWeight: 500,
    marginBottom: 4,
    color: 'var(--text-secondary)',
  }
  const hintStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-secondary)',
    margin: '8px 0 0',
  }
  const cardStyle: React.CSSProperties = {
    padding: 16,
    borderRadius: 8,
    background: 'var(--surface-sunken)',
    border: '1px solid var(--border-subtle)',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h3 className="set-pane-title" style={{ margin: '0 0 6px' }}>
          AI Media & Search
        </h3>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>
          A vendor&apos;s key and base URL are shared across capabilities; enter them once.
          Everything below is stored only on this device.
          {savedTick && <span style={{ color: '#22c55e', marginLeft: 8 }}>✓ Saved</span>}
        </p>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Web search</h4>
        <div style={{ marginBottom: 10 }}>
          <label style={labelStyle}>Provider</label>
          <CustomSelect
            value={media.webSearch.provider}
            options={[
              { value: 'serper', label: 'Serper (Google results, needs key)' },
              { value: 'duckduckgo', label: 'DuckDuckGo (free, no key)' },
            ]}
            onChange={(val) => setMedia('webSearch', { provider: val })}
          />
        </div>
        <div>
          <label style={labelStyle}>API Key</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type={showKeys ? 'text' : 'password'}
              className="ai-input"
              value={media.webSearch.apiKey}
              placeholder="tvly-..."
              onChange={(e) => setMedia('webSearch', { apiKey: e.target.value })}
            />
            <button type="button" className="set-btn" onClick={() => setShowKeys((v) => !v)}>
              {showKeys ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        <p style={hintStyle}>
          {media.webSearch.provider === 'serper'
            ? media.webSearch.apiKey
              ? 'Serper serves web search with your key; image search falls back to free sources when its quota is exhausted.'
              : 'Add your Serper key to enable Google results; until then the free fallback answers.'
            : 'Web and image search use the free DuckDuckGo fallback; add a Serper key above for Google results.'}
        </p>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Image generation</h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Provider</label>
            <CustomSelect
              value={media.imageGen.provider}
              options={imageProviderOptions}
              onChange={(val) => setMedia('imageGen', { provider: val })}
            />
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              className="ai-input"
              value={media.imageGen.model}
              placeholder="model-id"
              onChange={(e) => setMedia('imageGen', { model: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>API Key</label>
            <input
              type={showKeys ? 'text' : 'password'}
              className="ai-input"
              value={media.imageGen.apiKey}
              placeholder="API Key"
              onChange={(e) => setMedia('imageGen', { apiKey: e.target.value })}
            />
          </div>
          <div>
            <label style={labelStyle}>Base URL</label>
            <input
              type="text"
              className="ai-input"
              value={media.imageGen.baseUrl}
              placeholder="https://.../v1"
              onChange={(e) => setMedia('imageGen', { baseUrl: e.target.value })}
            />
          </div>
        </div>
        <p style={hintStyle}>
          Any OpenAI-compatible endpoint: /images/generations and /chat/completions. Empty provider
          means slides, sheets and PDF generate with the active chat provider.
        </p>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Image analysis</h4>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12,
          }}
        >
          <div>
            <label style={labelStyle}>Provider</label>
            <CustomSelect
              value={media.imageAnalysis.provider}
              options={imageProviderOptions}
              onChange={(val) => setMedia('imageAnalysis', { provider: val })}
            />
          </div>
          <div>
            <label style={labelStyle}>Model</label>
            <input
              type="text"
              className="ai-input"
              value={media.imageAnalysis.model}
              placeholder="vision model-id"
              onChange={(e) => setMedia('imageAnalysis', { model: e.target.value })}
            />
          </div>
        </div>
        <p style={hintStyle}>
          Vision-capable chat model used to describe images and media for the AI tools.
        </p>
      </div>

      <div style={cardStyle}>
        <h4 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 600 }}>Video analysis</h4>
        <div>
          <label style={labelStyle}>Provider</label>
          <CustomSelect
            value={media.videoAnalysis.provider}
            options={imageProviderOptions}
            onChange={(val) => setMedia('videoAnalysis', { provider: val })}
          />
        </div>
        <p style={hintStyle}>
          Provider used when the AI tools analyze attached video via the media pipeline.
        </p>
      </div>
    </div>
  )
}

function AccountSection() {
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [savedTick, setSavedTick] = useState(false)

  useEffect(() => {
    let alive = true
    void (async () => {
      let profile: { displayName?: string; email?: string } | null
      try {
        profile = (await window.aiOffice?.getProfile?.()) ?? null
      } catch {
        profile = null
      }
      if (!profile) {
        try {
          const stored = localStorage.getItem('revelith.profile')
          if (stored) profile = JSON.parse(stored)
        } catch {}
      }
      if (alive) {
        setDisplayName(profile?.displayName ?? '')
        setEmail(profile?.email ?? '')
        setLoaded(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  const handleSave = () => {
    const next = { displayName: displayName.trim(), email: email.trim() }
    try {
      localStorage.setItem('revelith.profile', JSON.stringify(next))
    } catch {}
    try {
      void window.aiOffice?.setProfile?.(next)
    } catch {}
    setSavedTick(true)
    setTimeout(() => setSavedTick(false), 2000)
  }

  const initial = (displayName.trim()[0] ?? email.trim()[0] ?? 'R').toUpperCase()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h3 className="set-pane-title" style={{ margin: 0 }}>
        Account
      </h3>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 48,
            height: 48,
            borderRadius: '50%',
            background: 'var(--color-btn-primary)',
            color: 'var(--color-btn-primary-text)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 20,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initial}
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{displayName || 'ReveLith Account'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {email || 'Local device profile — nothing leaves this computer.'}
          </div>
        </div>
      </div>
      <div
        style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-sunken)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div>
          <label
            htmlFor="acct-name"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 4,
              color: 'var(--text-secondary)',
            }}
          >
            Display name
          </label>
          <input
            id="acct-name"
            type="text"
            className="ai-input"
            value={displayName}
            placeholder="Your name"
            disabled={!loaded}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label
            htmlFor="acct-email"
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 500,
              marginBottom: 4,
              color: 'var(--text-secondary)',
            }}
          >
            Email
          </label>
          <input
            id="acct-email"
            type="email"
            className="ai-input"
            value={email}
            placeholder="you@example.com"
            disabled={!loaded}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="button" className="set-btn primary" onClick={handleSave} disabled={!loaded}>
            Save profile
          </button>
          {savedTick && (
            <span style={{ color: '#22c55e', fontSize: 13 }}>✓ Saved on this device</span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Stored only on this device. There is no cloud account: your documents, keys and settings
          never leave this computer.
        </p>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  valueTitle,
  action,
}: {
  label: string
  value: string
  valueTitle?: string
  action?: ReactNode
}) {
  return (
    <div className="set-field">
      <div className="set-field-text">
        <div className="set-field-label">{label}</div>
        <div className="set-field-value" data-tip={valueTitle}>
          {value}
        </div>
      </div>
      {action}
    </div>
  )
}

export interface SettingsModalProps {
  status?: { loggedIn: boolean; email?: string } | null
  loggingOut?: boolean
  /** browser sign-in in progress (spinner shows on the account entry) */
  loginWaiting?: boolean
  /** device auth URL while waiting : rescue actions when the browser did not auto-open */
  loginUrl?: string | null
  urlCopied?: boolean
  onOpenLoginUrl?: () => void
  onCopyLoginUrl?: () => void
  onClose: () => void
  /** closes the modal and launches the ReveLith login flow (progress shows on the account entry) */
  onLogin?: () => void
  onLogout?: () => void
}

export function SettingsModal({
  status,
  loggingOut: _loggingOut = false,
  loginWaiting: _loginWaiting = false,
  loginUrl: _loginUrl,
  urlCopied: _urlCopied = false,
  onOpenLoginUrl: _onOpenLoginUrl,
  onCopyLoginUrl: _onCopyLoginUrl,
  onClose,
  onLogin: _onLogin,
  onLogout: _onLogout,
}: SettingsModalProps) {
  const i18n = useI18n()
  const { t, lang, setLang } = i18n
  const [section, setSection] = useState<SectionId>('ai')
  const [theme, setTheme] = useState<UiTheme>('system')
  const [saveDir, setSaveDir] = useState('')
  const [_channel, setChannel] = useState<'stable' | 'beta'>('stable')
  const [appVersion, setAppVersion] = useState('')

  const [autoSave, setAutoSave] = useState(() => {
    try {
      return localStorage.getItem('revelith.autoSaveEnabled') === 'true'
    } catch {
      return false
    }
  })
  const [autoSaveInterval, setAutoSaveInterval] = useState(() => {
    try {
      return Number(localStorage.getItem('revelith.autoSaveInterval') || 60)
    } catch {
      return 60
    }
  })
  const [aiDock, setAiDock] = useState<'left' | 'right'>(() => {
    try {
      return (localStorage.getItem('revelith.aiPanelDock') as 'left' | 'right') || 'left'
    } catch {
      return 'left'
    }
  })
  const [aiFontSize, setAiFontSize] = useState(() => {
    try {
      return localStorage.getItem('revelith.aiPanelFontSize') || '14px'
    } catch {
      return '14px'
    }
  })
  const [aiSpellcheck, setAiSpellcheck] = useState(() => {
    try {
      return localStorage.getItem('revelith.aiSpellcheck') !== 'false'
    } catch {
      return true
    }
  })
  const [usageStats, setUsageStats] = useState(false)

  const applyAiDock = (next: 'left' | 'right') => {
    setAiDock(next)
    try {
      localStorage.setItem('revelith.aiPanelDock', next)
    } catch {}
    window.dispatchEvent(new CustomEvent('revelith-ai-dock-changed', { detail: { side: next } }))
    const iframes = document.querySelectorAll('iframe')
    iframes.forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: 'ai-dock-change', side: next }, '*')
      } catch {}
    })
  }

  const toggleAutoSave = (val: boolean) => {
    setAutoSave(val)
    try {
      localStorage.setItem('revelith.autoSaveEnabled', String(val))
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-autosave-changed', {
        detail: { enabled: val, interval: autoSaveInterval },
      }),
    )
  }

  const changeAutoSaveInterval = (interval: number) => {
    setAutoSaveInterval(interval)
    try {
      localStorage.setItem('revelith.autoSaveInterval', String(interval))
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-autosave-changed', { detail: { enabled: autoSave, interval } }),
    )
  }

  const changeAiFontSize = (size: string) => {
    setAiFontSize(size)
    try {
      localStorage.setItem('revelith.aiPanelFontSize', size)
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-ai-panel-settings-changed', { detail: { fontSize: size } }),
    )
  }

  const toggleAiSpellcheck = (val: boolean) => {
    setAiSpellcheck(val)
    try {
      localStorage.setItem('revelith.aiSpellcheck', String(val))
    } catch {}
    window.dispatchEvent(
      new CustomEvent('revelith-ai-panel-settings-changed', { detail: { spellcheck: val } }),
    )
  }

  const toggleUsageStats = (val: boolean) => {
    setUsageStats(val)
    try {
      localStorage.setItem('revelith.usageStats', String(val))
    } catch {}
    try {
      void window.aiOffice?.setUsageStats?.(val)
    } catch {}
  }

  useEffect(() => {
    let alive = true
    void window.aiOffice?.getTheme?.().then((th) => {
      if (alive && th) setTheme(th)
    })
    void window.aiOffice?.getDefaultSaveDir?.().then((dir) => {
      if (alive && dir) setSaveDir(dir)
    })
    void window.aiOffice?.getUpdateChannel?.().then((ch) => {
      if (alive && ch) setChannel(ch)
    })
    void window.aiOffice?.getAppVersion?.().then((v) => {
      if (alive && v) setAppVersion(v)
    })
    void (async () => {
      try {
        const enabled = await window.aiOffice?.getUsageStats?.()
        if (alive) setUsageStats(enabled === true)
      } catch {
        try {
          if (alive) setUsageStats(localStorage.getItem('revelith.usageStats') === 'true')
        } catch {}
      }
    })()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const applyTheme = (next: UiTheme) => {
    setTheme(next)
    try {
      localStorage.setItem('revelith.theme', next)
    } catch {}
    void window.aiOffice?.setTheme?.(next)
    if (next === 'system') document.documentElement.removeAttribute('data-theme')
    else document.documentElement.setAttribute('data-theme', next)
    // Broadcast to any active editor iframes
    const iframes = document.querySelectorAll('iframe')
    iframes.forEach((f) => {
      try {
        f.contentWindow?.postMessage({ type: 'theme-change', theme: next }, '*')
      } catch {}
    })
  }

  const changeSaveDir = () => {
    void window.aiOffice.pickDefaultSaveDir?.().then((dir) => {
      if (dir) setSaveDir(dir)
    })
  }

  const _loggedIn = status?.loggedIn ?? false
  const _email = status?.email ?? ''

  return (
    <div
      className="set-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="set-dialog" role="dialog" aria-modal="true" aria-label={t('settings')}>
        <div className="set-header">
          <h2 className="set-title">{t('settings')}</h2>
          <button className="set-close" onClick={onClose} aria-label={t('cancel')}>
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path
                d="M2 2l10 10M12 2L2 12"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <div className="set-body">
          <nav className="set-nav" aria-label={t('settings')}>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`set-nav-item${section === s.id ? ' active' : ''}`}
                aria-current={section === s.id}
                onClick={() => setSection(s.id)}
              >
                <SectionIcon id={s.id} />
                {s.label}
              </button>
            ))}
          </nav>
          <div className="set-pane">
            {section === 'account' && <AccountSection />}
            {section === 'ai' && <AiSettingsSection />}
            {section === 'media' && <MediaSearchSection />}
            {section === 'integrations' && <IntegrationsSection />}
            {section === 'general' && (
              <>
                <h3 className="set-pane-title">{t('setSecGeneral')}</h3>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-lang">
                      {t('language')}
                    </label>
                  </div>
                  <CustomSelect
                    id="set-lang"
                    value={lang}
                    options={LANG_OPTIONS}
                    onChange={(val) => setLang(val)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-theme">
                      {t('theme')}
                    </label>
                  </div>
                  <CustomSelect
                    id="set-theme"
                    value={theme}
                    options={THEME_OPTIONS.map((opt) => ({
                      value: opt.value,
                      label: t(opt.labelKey),
                    }))}
                    onChange={(val) => applyTheme(val)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-ai-font">
                      AI panel text size
                    </label>
                  </div>
                  <CustomSelect
                    id="set-ai-font"
                    value={aiFontSize}
                    options={[
                      { value: '12px', label: 'Small (12px)' },
                      { value: '14px', label: 'Normal (14px)' },
                      { value: '16px', label: 'Large (16px)' },
                    ]}
                    onChange={(val) => changeAiFontSize(val)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-ai-spell">
                      Spell check in AI chat
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Underline misspelled words while typing in the AI chat input.
                    </div>
                  </div>
                  <input
                    id="set-ai-spell"
                    type="checkbox"
                    checked={aiSpellcheck}
                    onChange={(e) => toggleAiSpellcheck(e.target.checked)}
                  />
                </div>
                <div className="set-field">
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-ai-dock">
                      AI Panel Position
                    </label>
                  </div>
                  <CustomSelect
                    id="set-ai-dock"
                    value={aiDock}
                    options={[
                      { value: 'left', label: 'Left Side' },
                      { value: 'right', label: 'Right Side' },
                    ]}
                    onChange={(val) => applyAiDock(val as 'left' | 'right')}
                  />
                </div>
                <Field
                  label={t('saveLocation')}
                  value={saveDir || ':'}
                  valueTitle={saveDir}
                  action={
                    <button className="set-btn" onClick={changeSaveDir}>
                      {t('setChange')}
                    </button>
                  }
                />
                <div className="set-field" style={{ marginTop: 14 }}>
                  <div className="set-field-text">
                    <label className="set-field-label">Global AutoSave</label>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Automatically save changes periodically across all editors
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        fontSize: 13,
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={autoSave}
                        onChange={(e) => toggleAutoSave(e.target.checked)}
                      />
                      Enabled
                    </label>
                    {autoSave && (
                      <select
                        className="ai-input"
                        style={{ width: 110, height: 32 }}
                        value={autoSaveInterval}
                        onChange={(e) => changeAutoSaveInterval(Number(e.target.value))}
                      >
                        <option value={30}>Every 30s</option>
                        <option value={60}>Every 1m</option>
                        <option value={120}>Every 2m</option>
                        <option value={300}>Every 5m</option>
                      </select>
                    )}
                  </div>
                </div>
                <div className="set-field" style={{ marginTop: 14 }}>
                  <div className="set-field-text">
                    <label className="set-field-label" htmlFor="set-usage-stats">
                      Send anonymous usage statistics
                    </label>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Helps improve ReveLith. No document contents or file names are ever collected,
                      and nothing is uploaded while this is off.
                    </div>
                  </div>
                  <input
                    id="set-usage-stats"
                    type="checkbox"
                    checked={usageStats}
                    onChange={(e) => toggleUsageStats(e.target.checked)}
                  />
                </div>
              </>
            )}
            {section === 'about' && (
              <>
                <h3 className="set-pane-title">{t('setSecAbout')}</h3>
                <Field label={t('versionLabel')} value={appVersion || '0.10.100'} />
                <Field label="Edition" value="ReveLith AI Desktop" />
                <Field label="License" value="Apache-2.0 Open Source" />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
