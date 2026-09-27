import { useEffect, useRef, useState } from 'react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import mermaid from 'mermaid'
import { t } from '../i18n/locale'

let mermaidInitialized = false
function initMermaid() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'neutral',
      securityLevel: 'loose',
      fontFamily: 'inherit',
    })
    mermaidInitialized = true
  }
}

const LANGUAGES = [
  'plaintext',
  'mermaid',
  'bash',
  'c',
  'cpp',
  'csharp',
  'css',
  'diff',
  'dockerfile',
  'go',
  'graphql',
  'html',
  'java',
  'javascript',
  'json',
  'kotlin',
  'lua',
  'markdown',
  'objectivec',
  'php',
  'python',
  'r',
  'ruby',
  'rust',
  'scala',
  'scss',
  'sql',
  'swift',
  'typescript',
  'xml',
  'yaml',
]

let mermaidCounter = 0

export function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false)
  const [previewMode, setPreviewMode] = useState(true)
  const [svgHtml, setSvgHtml] = useState<string>('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const containerIdRef = useRef(`mermaid-${Date.now()}-${++mermaidCounter}`)

  const language = String(node.attrs.language ?? '') || 'plaintext'
  const isMermaid = language.toLowerCase() === 'mermaid'

  const copy = () => {
    void navigator.clipboard.writeText(node.textContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  useEffect(() => {
    if (!isMermaid) {
      setSvgHtml('')
      setErrorMsg(null)
      return
    }
    initMermaid()
    const code = node.textContent.trim()
    if (!code) {
      setSvgHtml('')
      setErrorMsg(null)
      return
    }

    let cancelled = false
    const renderDiagram = async () => {
      try {
        const id = `${containerIdRef.current}-${Date.now()}`
        const { svg } = await mermaid.render(id, code)
        if (!cancelled) {
          setSvgHtml(svg)
          setErrorMsg(null)
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'Mermaid syntax error')
        }
      }
    }

    const timer = setTimeout(() => {
      void renderDiagram()
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [isMermaid, node.textContent])

  return (
    <NodeViewWrapper className={`md-codeblock ${isMermaid ? 'md-codeblock-mermaid' : ''}`}>
      <div className="md-codeblock-bar" contentEditable={false}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            className="md-codeblock-lang"
            value={LANGUAGES.includes(language) ? language : 'plaintext'}
            disabled={!editor.isEditable}
            onChange={(e) =>
              updateAttributes({ language: e.target.value === 'plaintext' ? null : e.target.value })
            }
          >
            {LANGUAGES.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>

          {isMermaid && (
            <div style={{ display: 'inline-flex', borderRadius: 4, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.15)' }}>
              <button
                type="button"
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  background: previewMode ? 'rgba(255,255,255,0.2)' : 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewMode(true)}
              >
                Diagram
              </button>
              <button
                type="button"
                style={{
                  padding: '2px 8px',
                  fontSize: 11,
                  background: !previewMode ? 'rgba(255,255,255,0.2)' : 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                }}
                onClick={() => setPreviewMode(false)}
              >
                Source
              </button>
            </div>
          )}
        </div>

        <button type="button" className="md-codeblock-copy" onClick={copy}>
          {copied ? t('codeCopied') : t('codeCopy')}
        </button>
      </div>

      {isMermaid && previewMode ? (
        <div contentEditable={false} style={{ padding: 16, background: '#ffffff', borderRadius: '0 0 6px 6px', overflowX: 'auto', textAlign: 'center' }}>
          {errorMsg ? (
            <div style={{ color: '#ef4444', fontSize: 12, textAlign: 'left', fontFamily: 'monospace' }}>
              ⚠️ {errorMsg}
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    background: '#fee2e2',
                    border: '1px solid #f87171',
                    borderRadius: 4,
                    color: '#991b1b',
                    cursor: 'pointer',
                  }}
                  onClick={() => setPreviewMode(false)}
                >
                  Edit Mermaid Source
                </button>
              </div>
            </div>
          ) : svgHtml ? (
            <div
              style={{ display: 'inline-block', maxWidth: '100%' }}
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div style={{ color: '#9ca3af', fontSize: 12, fontStyle: 'italic' }}>
              Empty Mermaid diagram. Switch to Source to add syntax.
            </div>
          )}
        </div>
      ) : (
        <pre>
          <NodeViewContent<'code'> as="code" />
        </pre>
      )}
    </NodeViewWrapper>
  )
}
