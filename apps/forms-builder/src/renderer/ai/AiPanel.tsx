import { useEffect, useRef, useState } from 'react'
import type { AiPreset, FieldType, FormField, FormSchema } from '../types'

interface AiPanelProps {
  schema: FormSchema
  selectedField: FormField | null
  onClose: () => void
  onInsertField: (type: FieldType, label: string, options?: string[]) => void
  style?: React.CSSProperties
}

interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  suggestion?: { type: FieldType; label: string; options?: string[] }
}

const QUICK = [
  { icon: '➕', label: 'Suggest field', prompt: 'Suggest a field to add to this form' },
  { icon: '✨', label: 'Improve form', prompt: 'Review my form and suggest improvements' },
  {
    icon: '📝',
    label: 'Survey kit',
    prompt: 'Add a survey question set (satisfaction + feedback)',
  },
  {
    icon: '📋',
    label: 'Contact kit',
    prompt: 'Add contact information fields (name, email, phone)',
  },
]

const FIELD_IDEAS: { type: FieldType; label: string; options?: string[]; match: RegExp }[] = [
  { type: 'text', label: 'Full Name', match: /contact|name/i },
  { type: 'email', label: 'Email Address', match: /contact|email/i },
  { type: 'text', label: 'Phone Number', match: /contact|phone/i },
  { type: 'rating', label: 'Overall Satisfaction', match: /survey|satisfaction|feedback/i },
  { type: 'textarea', label: 'Additional Feedback', match: /survey|feedback/i },
  {
    type: 'select',
    label: 'How did you hear about us?',
    options: ['Search engine', 'Social media', 'Friend referral', 'Advertisement', 'Other'],
    match: /survey|feedback/i,
  },
  { type: 'date', label: 'Preferred Date', match: /book|appoint|date|event/i },
  {
    type: 'radio',
    label: 'Preferred Contact Method',
    options: ['Email', 'Phone', 'Text message'],
    match: /contact/i,
  },
]

function localReply(
  prompt: string,
  schema: FormSchema,
  selected: FormField | null,
): Msg['content'] | Msg {
  void schema
  void selected
  const lower = prompt.toLowerCase()
  if (/improve|review/.test(lower)) {
    const tips: string[] = []
    if (schema.fields.length === 0)
      tips.push('• Your form is empty — start with a name + email pair from the Contact kit.')
    if (!schema.fields.some((f) => f.required))
      tips.push('• No field is marked required yet. Mark at least one key field required.')
    if (!schema.description) tips.push('• Add a short description so respondents know the purpose.')
    if (schema.fields.length > 12)
      tips.push('• Long forms reduce completion — consider splitting into sections.')
    if (tips.length === 0)
      tips.push('• Looks solid! Consider a confirmation message tune-up in Settings.')
    return tips.join('\n')
  }
  const idea = FIELD_IDEAS.find((f) => f.match.test(lower) || f.match.test(prompt))
  if (idea) {
    return {
      id: '',
      role: 'assistant',
      content: `I suggest adding “${idea.label}”. Click Insert to add it, or ask for something else.`,
      suggestion: { type: idea.type, label: idea.label, options: idea.options },
    } as Msg
  }
  const fallback = FIELD_IDEAS[schema.fields.length % FIELD_IDEAS.length]!
  return {
    id: '',
    role: 'assistant',
    content: `Based on your form, I suggest adding “${fallback.label}”.`,
    suggestion: { type: fallback.type, label: fallback.label, options: fallback.options },
  } as Msg
}

export function AiPanel({ schema, selectedField, onClose, onInsertField, style }: AiPanelProps) {
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const seq = useRef(0)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  const send = (text: string) => {
    const clean = text.trim()
    if (!clean || busy) return
    const uid = `u${++seq.current}`
    setMessages((prev) => [...prev, { id: uid, role: 'user', content: clean }])
    setInput('')
    setBusy(true)
    window.setTimeout(() => {
      const reply = localReply(clean, schema, selectedField)
      const msg: Msg =
        typeof reply === 'string'
          ? { id: `a${++seq.current}`, role: 'assistant', content: reply }
          : { ...reply, id: `a${++seq.current}` }
      setMessages((prev) => [...prev, msg])
      setBusy(false)
    }, 450)
  }

  void selectedField

  return (
    <div
      style={{
        ...style,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--surface)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-subtle)',
        }}
      >
        <span style={{ fontSize: 18 }}>🤖</span>
        <strong style={{ fontSize: 14, flex: 1, color: 'var(--text-primary)' }}>
          AI Assistant
        </strong>
        <button
          onClick={onClose}
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: 15,
            color: 'var(--text-secondary)',
          }}
          title="Close AI panel"
        >
          ✕
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '32px 16px' }}
          >
            <div style={{ fontSize: 40, marginBottom: 12 }}>🤖</div>
            <p
              style={{
                margin: '0 0 4px',
                fontSize: 14,
                fontWeight: 600,
                color: 'var(--text-primary)',
              }}
            >
              How can I help?
            </p>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>
              Ask for field ideas, a form review, or a starter kit.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%' }}
            >
              <div
                style={{
                  padding: '10px 14px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-line',
                  borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--bg-hover-subtle)',
                  color: m.role === 'user' ? 'var(--accent-ink)' : 'var(--text-primary)',
                }}
              >
                {m.content}
              </div>
              {m.suggestion ? (
                <button
                  onClick={() =>
                    onInsertField(m.suggestion!.type, m.suggestion!.label, m.suggestion!.options)
                  }
                  style={{
                    marginTop: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    borderRadius: 16,
                    border: '1px solid var(--accent)',
                    background: 'var(--accent-soft)',
                    color: 'var(--accent)',
                    cursor: 'pointer',
                  }}
                >
                  ➕ Insert “{m.suggestion.label}”
                </button>
              ) : null}
            </div>
          ))
        )}
        {busy ? (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Thinking…</div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div
        style={{
          padding: '8px 12px',
          borderTop: '1px solid var(--border)',
          background: 'var(--surface-subtle)',
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {QUICK.map((q) => (
            <button
              key={q.label}
              onClick={() => send(q.prompt)}
              disabled={busy}
              style={{
                padding: '6px 10px',
                fontSize: 12,
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.5 : 1,
              }}
            >
              {q.icon} {q.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(input)
          }}
          style={{ display: 'flex', gap: 8 }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your form…"
            disabled={busy}
            style={{
              flex: 1,
              padding: '8px 12px',
              fontSize: 13,
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text-primary)',
              backgroundColor: 'var(--surface)',
            }}
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            style={{
              padding: '8px 14px',
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
              cursor: busy || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: busy || !input.trim() ? 0.5 : 1,
            }}
          >
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export type { AiPreset }
