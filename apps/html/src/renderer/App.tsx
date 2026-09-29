import { useState, useEffect, useRef } from 'react'
import { Ribbon, type ViewLayout } from './components/Ribbon'
import { LayerTree, parseDomToTree, type DomNodeInfo } from './components/LayerTree'
import { ElementRestyler, type SelectedElementData } from './components/ElementRestyler'
import { PresentMode } from './components/PresentMode'
import { AiDesignModal, type AiDesignRequest } from './components/AiDesignModal'
import { AiDocumentModal, type AiDocumentRequest } from './components/AiDocumentModal'
import { AiSummaryModal } from './components/AiSummaryModal'
import { buildDesignPrompt, buildDocumentPrompt, buildElementRefinePrompt } from './ai/generator'
import { exportHtmlToDocxBytes, bytesToBase64 } from './export/htmlDocxExport'

const DEFAULT_STARTER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>ReveLith HTML</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      margin: 0;
      padding: 40px 20px;
      background: #0f172a;
      color: #f8fafc;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
      box-sizing: border-box;
    }
    .hero {
      max-width: 800px;
      text-align: center;
      margin-top: 40px;
    }
    h1 {
      font-size: 3rem;
      font-weight: 800;
      background: linear-gradient(135deg, #f43f5e 0%, #3b82f6 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 16px;
    }
    p.lead {
      font-size: 1.25rem;
      color: #94a3b8;
      line-height: 1.6;
      margin-bottom: 32px;
    }
    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 20px;
      width: 100%;
      max-width: 840px;
      margin-top: 40px;
    }
    .card {
      background: rgba(30, 41, 59, 0.7);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 24px;
      backdrop-filter: blur(10px);
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: #3b82f6;
    }
    .card h3 {
      font-size: 1.2rem;
      color: #38bdf8;
      margin-top: 0;
      margin-bottom: 8px;
    }
    .card p {
      font-size: 0.95rem;
      color: #cbd5e1;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="hero">
    <h1>ReveLith HTML</h1>
    <p class="lead">Create and edit interactive HTML files with AI in two modes: AI Design for visual pages and AI Document for long-form reading.</p>
  </div>
  <div class="cards-grid">
    <div class="card">
      <h3>🎨 AI Design</h3>
      <p>Build visual landing pages, interactive dashboards, and slide decks from a brief with style directions.</p>
    </div>
    <div class="card">
      <h3>📝 AI Document</h3>
      <p>Generate beautifully formatted, structured articles, reports, and documentation as native HTML.</p>
    </div>
    <div class="card">
      <h3>🔍 Click-to-Restyle</h3>
      <p>Click any element in this live preview to inspect, restyle, or ask AI to change just that part.</p>
    </div>
  </div>
</body>
</html>`

// Script injected into the preview iframe to support element selection, click-to-restyle, and highlight
const INJECTED_PREVIEW_SCRIPT = `
<script>
(function() {
  let selectedEl = null;
  const overlay = document.createElement('div');
  overlay.id = '__revelith_highlight_overlay';
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.border = '2px solid #3b82f6';
  overlay.style.background = 'rgba(59, 130, 246, 0.1)';
  overlay.style.zIndex = '999999';
  overlay.style.transition = 'all 0.1s ease-out';
  overlay.style.display = 'none';
  document.documentElement.appendChild(overlay);

  function updateOverlay(el) {
    if (!el) { overlay.style.display = 'none'; return; }
    const rect = el.getBoundingClientRect();
    overlay.style.left = (rect.left + window.scrollX) + 'px';
    overlay.style.top = (rect.top + window.scrollY) + 'px';
    overlay.style.width = rect.width + 'px';
    overlay.style.height = rect.height + 'px';
    overlay.style.display = 'block';
  }

  document.addEventListener('click', function(e) {
    e.preventDefault();
    e.stopPropagation();
    selectedEl = e.target;
    updateOverlay(selectedEl);

    const comp = window.getComputedStyle(selectedEl);
    window.parent.postMessage({
      type: 'revelith:element-selected',
      tagName: selectedEl.tagName.toLowerCase(),
      id: selectedEl.id || undefined,
      className: selectedEl.className || undefined,
      outerHtml: selectedEl.outerHTML,
      innerText: selectedEl.innerText || '',
      styles: {
        color: comp.color,
        backgroundColor: comp.backgroundColor,
        fontSize: comp.fontSize,
        fontWeight: comp.fontWeight,
        textAlign: comp.textAlign,
        padding: comp.padding,
        margin: comp.margin,
        borderRadius: comp.borderRadius,
        display: comp.display,
        width: comp.width,
        height: comp.height
      }
    }, '*');
  }, true);

  window.addEventListener('message', function(e) {
    if (!e.data) return;
    if (e.data.type === 'revelith:highlight-selector') {
      const el = document.querySelector(e.data.selector);
      if (el) {
        selectedEl = el;
        updateOverlay(el);
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else if (e.data.type === 'revelith:apply-style' && selectedEl) {
      selectedEl.style[e.data.property] = e.data.value;
      updateOverlay(selectedEl);
      window.parent.postMessage({
        type: 'revelith:html-updated',
        html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
      }, '*');
    } else if (e.data.type === 'revelith:update-text' && selectedEl) {
      selectedEl.innerText = e.data.text;
      updateOverlay(selectedEl);
      window.parent.postMessage({
        type: 'revelith:html-updated',
        html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
      }, '*');
    } else if (e.data.type === 'revelith:delete-element' && selectedEl) {
      selectedEl.remove();
      selectedEl = null;
      updateOverlay(null);
      window.parent.postMessage({
        type: 'revelith:html-updated',
        html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
      }, '*');
    } else if (e.data.type === 'revelith:duplicate-element' && selectedEl) {
      const clone = selectedEl.cloneNode(true);
      selectedEl.parentNode.insertBefore(clone, selectedEl.nextSibling);
      updateOverlay(selectedEl);
      window.parent.postMessage({
        type: 'revelith:html-updated',
        html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
      }, '*');
    } else if (e.data.type === 'revelith:replace-selected-html' && selectedEl) {
      const temp = document.createElement('div');
      temp.innerHTML = e.data.html;
      if (temp.firstElementChild) {
        selectedEl.parentNode.replaceChild(temp.firstElementChild, selectedEl);
        selectedEl = temp.firstElementChild;
        updateOverlay(selectedEl);
        window.parent.postMessage({
          type: 'revelith:html-updated',
          html: '<!DOCTYPE html>\\n' + document.documentElement.outerHTML
        }, '*');
      }
    }
  });

  window.addEventListener('resize', () => updateOverlay(selectedEl));
  window.addEventListener('scroll', () => updateOverlay(selectedEl));
})();
</script>
`

export default function App() {
  const [html, setHtml] = useState(DEFAULT_STARTER_HTML)
  const [filePath, setFilePath] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [viewLayout, setViewLayout] = useState<ViewLayout>('preview')
  const [showLayers, setShowLayers] = useState(true)
  const [showInspector, setShowInspector] = useState(true)
  const [showPresent, setShowPresent] = useState(false)
  const [designModalOpen, setDesignModalOpen] = useState(false)
  const [documentModalOpen, setDocumentModalOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [designError, setDesignError] = useState<string | null>(null)
  const [documentError, setDocumentError] = useState<string | null>(null)
  const [refineError, setRefineError] = useState<string | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [summaryText, setSummaryText] = useState('')
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [summarizing, setSummarizing] = useState(false)
  /** in-flight ai:stream request id so the user can cancel it mid-run */
  const cancelRef = useRef<string | null>(null)

  const handleCancelAi = () => {
    const requestId = cancelRef.current
    cancelRef.current = null
    setIsGenerating(false)
    setSummarizing(false)
    if (requestId && window.htmlApi) {
      void window.htmlApi.aiStreamCancel(requestId).catch(() => {})
    }
  }

  const [selectedSelector, setSelectedSelector] = useState<string | null>(null)
  const [selectedElement, setSelectedElement] = useState<SelectedElementData | null>(null)
  const [domTree, setDomTree] = useState<DomNodeInfo | null>(null)

  const [autoSave, setAutoSave] = useState(() => localStorage.getItem('htmlapp.autoSave') === '1')
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Parse HTML into DOM tree whenever html changes
  useEffect(() => {
    try {
      const parser = new DOMParser()
      const doc = parser.parseFromString(html, 'text/html')
      const tree = parseDomToTree(doc.body || doc.documentElement)
      setDomTree(tree)
    } catch {}
  }, [html])

  // Listen to messages from the preview iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (!e.data) return
      if (e.data.type === 'revelith:element-selected') {
        setSelectedElement({
          tagName: e.data.tagName,
          id: e.data.id,
          className: e.data.className,
          outerHtml: e.data.outerHtml,
          innerText: e.data.innerText,
          styles: e.data.styles,
        })
        setShowInspector(true)
      } else if (e.data.type === 'revelith:html-updated') {
        setHtml(e.data.html)
        setDirty(true)
        window.htmlApi?.notifyDirty(true)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  // Initial load
  useEffect(() => {
    if (!window.htmlApi) return
    window.htmlApi.consumePendingOpen().then(async ({ path }) => {
      if (path) {
        setFilePath(path)
        const content = await window.htmlApi.readFile(path)
        setHtml(content)
      }
    })
    const offRenamed = window.htmlApi.onFileRenamed((newPath) => setFilePath(newPath))
    const offSaveReq = window.htmlApi.onSaveRequest((mode) => {
      void handleSave(mode).then((ok) => window.htmlApi.sendSaveRequestAck(ok))
    })
    const offCloseReq = window.htmlApi.onCloseSaveRequest(() => {
      void handleSave('save').then((ok) => window.htmlApi.sendCloseSaveResult(ok))
    })
    return () => {
      offRenamed()
      offSaveReq()
      offCloseReq()
    }
  }, [])

  // AutoSave persistence
  useEffect(() => {
    localStorage.setItem('htmlapp.autoSave', autoSave ? '1' : '0')
  }, [autoSave])

  const handleSave = async (mode: 'save' | 'saveAs' = 'save'): Promise<boolean> => {
    if (!window.htmlApi) return false
    const res = await window.htmlApi.save({
      html,
      mode,
      suggestedName: filePath ? undefined : 'ReveLith_Document',
    })
    if (res.ok && 'path' in res) {
      setFilePath(res.path)
      setDirty(false)
      window.htmlApi.notifyDirty(false)
      return true
    }
    return false
  }

  // Restyler handlers
  const handleApplyStyle = (property: string, value: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'revelith:apply-style',
        property,
        value,
      },
      '*',
    )
  }

  const handleUpdateText = (text: string) => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'revelith:update-text',
        text,
      },
      '*',
    )
  }

  const handleDeleteElement = () => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'revelith:delete-element',
      },
      '*',
    )
    setSelectedElement(null)
  }

  const handleDuplicateElement = () => {
    iframeRef.current?.contentWindow?.postMessage(
      {
        type: 'revelith:duplicate-element',
      },
      '*',
    )
  }

  // Targeted "Ask AI to change just this part"
  const handleAskAiOnElement = async (instruction: string) => {
    if (!selectedElement || !window.htmlApi) return
    setIsGenerating(true)
    setRefineError(null)
    const prompt = buildElementRefinePrompt(selectedElement.outerHtml, instruction)
    let buffer = ''
    let runError: string | null = null
    try {
      const requestId = `ai-refine-${Date.now()}`
      cancelRef.current = requestId
      const offStream = window.htmlApi.onAiStream((chunk) => {
        if (chunk.requestId !== requestId) return
        if (chunk.text) buffer += chunk.text
        else if (chunk.type === 'error') runError = chunk.error || 'The AI request failed.'
      })
      const settings = await window.htmlApi.getAiSettings()
      await window.htmlApi.aiStream({
        requestId,
        settings,
        system: 'You are an expert web UI engineer. Return only clean HTML.',
        messages: [{ role: 'user', text: prompt }],
      })
      offStream()
      if (runError && !buffer.trim()) {
        setRefineError(runError)
        return
      }
      const cleanHtml = buffer.replace(/^```html\s*|\s*```$/gi, '').trim()
      if (cleanHtml) {
        iframeRef.current?.contentWindow?.postMessage(
          {
            type: 'revelith:replace-selected-html',
            html: cleanHtml,
          },
          '*',
        )
      } else if (runError) {
        setRefineError(runError)
      }
    } catch (err) {
      console.error('[ReveLith HTML] AI Element Refine error:', err)
      setRefineError(err instanceof Error ? err.message : 'The AI request failed.')
    } finally {
      cancelRef.current = null
      setIsGenerating(false)
    }
  }

  // AI Design generator
  const handleGenerateDesign = async (req: AiDesignRequest) => {
    setIsGenerating(true)
    setDesignError(null)
    const prompt = buildDesignPrompt(req)
    let buffer = ''
    let runError: string | null = null
    try {
      const requestId = `ai-design-${Date.now()}`
      cancelRef.current = requestId
      const offStream = window.htmlApi?.onAiStream?.((chunk) => {
        if (chunk.requestId !== requestId) return
        if (chunk.text) buffer += chunk.text
        else if (chunk.type === 'error') runError = chunk.error || 'The AI request failed.'
      })
      const settings = (await window.htmlApi?.getAiSettings?.()) ?? {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '',
      }
      await window.htmlApi?.aiStream?.({
        requestId,
        settings,
        system:
          'You are an expert web designer. Return only complete, self-contained HTML documents with embedded CSS.',
        messages: [{ role: 'user', text: prompt }],
      })
      offStream?.()
      const cleanHtml = buffer.replace(/^```html\s*|\s*```$/gi, '').trim()
      if (cleanHtml && cleanHtml.includes('<html')) {
        setHtml(cleanHtml)
        setDirty(true)
        window.htmlApi?.notifyDirty(true)
        setDesignModalOpen(false)
      } else {
        setDesignError(runError ?? 'The model returned no usable HTML. Try a different brief.')
      }
    } catch (err) {
      console.error('[ReveLith HTML] AI Design Generation error:', err)
      setDesignError(err instanceof Error ? err.message : 'The AI request failed.')
    } finally {
      cancelRef.current = null
      setIsGenerating(false)
    }
  }

  // AI Document generator
  const handleGenerateDocument = async (req: AiDocumentRequest) => {
    setIsGenerating(true)
    setDocumentError(null)
    const prompt = buildDocumentPrompt(req)
    let buffer = ''
    let runError: string | null = null
    try {
      const requestId = `ai-doc-${Date.now()}`
      cancelRef.current = requestId
      const offStream = window.htmlApi?.onAiStream?.((chunk) => {
        if (chunk.requestId !== requestId) return
        if (chunk.text) buffer += chunk.text
        else if (chunk.type === 'error') runError = chunk.error || 'The AI request failed.'
      })
      const settings = (await window.htmlApi?.getAiSettings?.()) ?? {
        provider: 'openai',
        model: 'gpt-4o',
        apiKey: '',
      }
      await window.htmlApi?.aiStream?.({
        requestId,
        settings,
        system:
          'You are an expert technical writer and document designer. Return only complete, clean, beautifully formatted HTML documents with embedded CSS.',
        messages: [{ role: 'user', text: prompt }],
      })
      offStream?.()
      const cleanHtml = buffer.replace(/^```html\s*|\s*```$/gi, '').trim()
      if (cleanHtml && cleanHtml.includes('<html')) {
        setHtml(cleanHtml)
        setDirty(true)
        window.htmlApi?.notifyDirty(true)
        setDocumentModalOpen(false)
      } else {
        setDocumentError(runError ?? 'The model returned no usable HTML. Try a different topic.')
      }
    } catch (err) {
      console.error('[ReveLith HTML] AI Document Generation error:', err)
      setDocumentError(err instanceof Error ? err.message : 'The AI request failed.')
    } finally {
      cancelRef.current = null
      setIsGenerating(false)
    }
  }

  // AI Summarize: condense the current document into key points via the
  // configured provider. Reads the live editor state, never the saved file.
  const handleSummarize = async () => {
    if (!window.htmlApi) return
    let text: string
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      text = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').trim()
    } catch {
      text = ''
    }
    setSummaryOpen(true)
    setSummaryText('')
    setSummaryError(null)
    if (!text) return
    setSummarizing(true)
    let buffer = ''
    let runError: string | null = null
    try {
      const requestId = `ai-summary-${Date.now()}`
      cancelRef.current = requestId
      const offStream = window.htmlApi.onAiStream((chunk) => {
        if (chunk.requestId !== requestId) return
        if (chunk.text) {
          buffer += chunk.text
          setSummaryText(buffer)
        } else if (chunk.type === 'error') {
          runError = chunk.error || 'The AI request failed.'
        }
      })
      const settings = await window.htmlApi.getAiSettings()
      await window.htmlApi.aiStream({
        requestId,
        settings,
        system:
          'You are a precise document summarizer. Summarize the supplied document text in a short paragraph followed by 3-7 bullet key points. Plain text only, no markdown fences.',
        messages: [{ role: 'user', text: text.slice(0, 8000) }],
      })
      offStream()
      if (!buffer.trim()) {
        setSummaryError(runError ?? 'The model returned no summary.')
      }
    } catch (err) {
      console.error('[ReveLith HTML] AI Summarize error:', err)
      setSummaryError(err instanceof Error ? err.message : 'The AI request failed.')
    } finally {
      cancelRef.current = null
      setSummarizing(false)
    }
  }

  const SNIPPETS: Record<string, string> = {
    hero: '<section class="hero"><h1>New Hero</h1><p class="lead">Drop-in section.</p></section>',
    cards:
      '<section class="cards-grid"><div class="card"><h3>Card</h3><p>Text.</p></div></section>',
    table:
      '<table border="1" style="width:100%"><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>',
    form: '<form><input placeholder="Name"><button>Submit</button></form>',
    nav: '<nav style="display:flex;gap:12px"><a href="#">Home</a><a href="#">Docs</a></nav>',
  }

  const handleInsertSnippet = (kind: string): void => {
    const snippet = SNIPPETS[kind] ?? `<div>${kind}</div>`
    setHtml((prev) => prev.replace(/<\/body>/i, `${snippet}\n</body>`))
    setDirty(true)
    window.htmlApi?.notifyDirty(true)
  }

  const handleInsertImageUrl = (): void => {
    const url = window.prompt('Image URL (https://…):', 'https://')
    if (!url || url === 'https://') return
    const safe = /^https?:\/\//.test(url.trim()) ? url.trim() : ''
    if (!safe) return
    setHtml((prev) =>
      prev.replace(/<\/body>/i, `<img src="${safe}" alt="image" style="max-width:100%">\n</body>`),
    )
    setDirty(true)
    window.htmlApi?.notifyDirty(true)
  }

  const handleExportSingleFile = async (): Promise<void> => {
    try {
      const suggestedName = filePath ? filePath.replace(/\.[^/.]+$/, '') : 'ReveLith_Document'
      await window.htmlApi?.saveSingleFile({ html, suggestedName })
    } catch (err) {
      console.error('[ReveLith HTML] Single-file export error:', err)
    }
  }

  const handleMoveLayer = (selector: string, direction: 'up' | 'down'): void => {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const el = doc.querySelector(selector)
      const sibling = direction === 'up' ? el?.previousElementSibling : el?.nextElementSibling
      if (!el || !sibling) return
      if (direction === 'up') el.parentElement?.insertBefore(el, sibling)
      else el.parentElement?.insertBefore(sibling, el)
      setHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`)
      setDirty(true)
      window.htmlApi?.notifyDirty(true)
    } catch (err) {
      console.error('[ReveLith HTML] Move layer error:', err)
    }
  }

  const handleReorderLayer = (
    source: string,
    target: string,
    position: 'before' | 'after',
  ): void => {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const src = doc.querySelector(source)
      const dst = doc.querySelector(target)
      if (!src || !dst || src === dst || dst.contains(src)) return
      const parent = dst.parentElement
      if (!parent) return
      parent.insertBefore(src, position === 'before' ? dst : dst.nextSibling)
      setHtml(`<!DOCTYPE html>\n${doc.documentElement.outerHTML}`)
      setDirty(true)
      window.htmlApi?.notifyDirty(true)
    } catch (err) {
      console.error('[ReveLith HTML] Reorder layer error:', err)
    }
  }

  // Local Word (.docx) export
  const handleExportWord = async () => {
    try {
      const bytes = await exportHtmlToDocxBytes(html)
      const base64 = bytesToBase64(bytes)
      const suggestedName = filePath ? filePath.replace(/\.[^/.]+$/, '') : 'ReveLith_Document'
      await window.htmlApi?.exportDocx({
        base64,
        suggestedName,
      })
    } catch (err) {
      console.error('[ReveLith HTML] Word Export error:', err)
    }
  }

  // PDF export
  const handleExportPdf = async () => {
    try {
      const suggestedName = filePath ? filePath.replace(/\.[^/.]+$/, '') : 'ReveLith_Document'
      await window.htmlApi?.exportPdf({
        html,
        suggestedName,
      })
    } catch (err) {
      console.error('[ReveLith HTML] PDF Export error:', err)
    }
  }

  // Injected HTML for the iframe
  const previewHtml = `${html}\n${INJECTED_PREVIEW_SCRIPT}`

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: '#09090b',
        color: '#f4f4f5',
      }}
    >
      <Ribbon
        viewLayout={viewLayout}
        onChangeViewLayout={setViewLayout}
        showLayers={showLayers}
        onToggleLayers={() => setShowLayers((v) => !v)}
        showInspector={showInspector}
        onToggleInspector={() => setShowInspector((v) => !v)}
        onOpenDesign={() => setDesignModalOpen(true)}
        onOpenDocument={() => setDocumentModalOpen(true)}
        onSummarize={() => void handleSummarize()}
        onPresent={() => setShowPresent(true)}
        onSave={() => void handleSave('save')}
        onSaveAs={() => void handleSave('saveAs')}
        onExportWord={handleExportWord}
        onExportPdf={handleExportPdf}
        onExportSingleFile={() => void handleExportSingleFile()}
        onInsertSnippet={handleInsertSnippet}
        onInsertImageUrl={handleInsertImageUrl}
        dirty={dirty}
        autoSave={autoSave}
        onToggleAutoSave={setAutoSave}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Layer Tree */}
        {showLayers && (
          <LayerTree
            tree={domTree}
            selectedSelector={selectedSelector}
            onMove={handleMoveLayer}
            onReorder={handleReorderLayer}
            onSelect={(selector) => {
              setSelectedSelector(selector)
              iframeRef.current?.contentWindow?.postMessage(
                {
                  type: 'revelith:highlight-selector',
                  selector,
                },
                '*',
              )
            }}
          />
        )}

        {/* Center Main Stage */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Code Editor View (Split or Code only) */}
          {(viewLayout === 'split' || viewLayout === 'code') && (
            <div
              style={{
                flex: viewLayout === 'split' ? '0 0 45%' : '1 1 auto',
                borderRight: '1px solid #27272a',
                display: 'flex',
                flexDirection: 'column',
                background: '#121214',
              }}
            >
              <div
                style={{
                  padding: '6px 12px',
                  borderBottom: '1px solid #27272a',
                  fontSize: 11,
                  color: '#a1a1aa',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>HTML Code</span>
                <span>{html.length.toLocaleString()} chars</span>
              </div>
              <textarea
                value={html}
                onChange={(e) => {
                  setHtml(e.target.value)
                  setDirty(true)
                  window.htmlApi?.notifyDirty(true)
                }}
                style={{
                  flex: 1,
                  padding: 14,
                  fontSize: 12,
                  fontFamily: 'Consolas, monospace',
                  background: '#09090b',
                  color: '#e4e4e7',
                  border: 'none',
                  outline: 'none',
                  resize: 'none',
                  lineHeight: 1.5,
                }}
              />
            </div>
          )}

          {/* Live Interactive Preview */}
          {(viewLayout === 'preview' || viewLayout === 'split') && (
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                background: '#27272a',
                position: 'relative',
              }}
            >
              <iframe
                ref={iframeRef}
                title="Live Preview"
                srcDoc={previewHtml}
                sandbox="allow-scripts allow-same-origin"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  background: '#ffffff',
                }}
              />
            </div>
          )}
        </div>

        {/* Element Restyler / Inspector */}
        {showInspector && (
          <ElementRestyler
            element={selectedElement}
            onApplyStyle={handleApplyStyle}
            onUpdateText={handleUpdateText}
            onDeleteElement={handleDeleteElement}
            onDuplicateElement={handleDuplicateElement}
            onAskAi={handleAskAiOnElement}
            onClose={() => setShowInspector(false)}
            aiError={refineError}
            isAskingAi={isGenerating}
          />
        )}
      </div>

      {/* Present Mode */}
      {showPresent && <PresentMode html={html} onClose={() => setShowPresent(false)} />}

      {/* AI Design Mode Modal */}
      <AiDesignModal
        isOpen={designModalOpen}
        onClose={() => setDesignModalOpen(false)}
        onGenerate={handleGenerateDesign}
        isGenerating={isGenerating}
        error={designError}
        onCancel={handleCancelAi}
      />

      {/* AI Document Mode Modal */}
      <AiDocumentModal
        isOpen={documentModalOpen}
        onClose={() => setDocumentModalOpen(false)}
        onGenerate={handleGenerateDocument}
        isGenerating={isGenerating}
        error={documentError}
        onCancel={handleCancelAi}
      />

      {/* AI Summary Modal */}
      <AiSummaryModal
        isOpen={summaryOpen}
        summary={summaryText}
        isSummarizing={summarizing}
        error={summaryError}
        onClose={() => setSummaryOpen(false)}
        onCancel={handleCancelAi}
      />
    </div>
  )
}
