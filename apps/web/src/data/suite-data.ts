export interface AppModule {
  id: string
  name: string
  extension: string
  accentColor: string
  accentGlow: string
  icon: string
  tagline: string
  description: string
  features: string[]
  engineDetails: string
  uiPreview: {
    title: string
    mockContent: string
    aiPrompt: string
    aiResult: string
    metrics: { label: string; value: string }[]
  }
}

export const APP_MODULES: AppModule[] = [
  {
    id: 'docs',
    name: 'Docs',
    extension: '.docx',
    accentColor: '#3276cd',
    accentGlow: 'rgba(50, 118, 205, 0.4)',
    icon: '/file-docx.svg',
    tagline: 'Word Processor with Byte-Preserving Precision',
    description:
      'Edit real Microsoft Word (.docx) files natively. Zero format drift, complex equation typesetting, ink annotations, and paginated canvas rendering.',
    engineDetails: 'Engine: @revelith/docx-engine OOXML delta block patcher + WASM font metrics',
    features: [
      'Byte-preserving round-trip saves without re-serializing untouched XML',
      'True paginated layout engine matching desktop Word print views',
      'Track changes, rich comments, and equation editor',
      'Context-aware AI refactoring, summarization, and tone shifting',
    ],
    uiPreview: {
      title: 'Q3_Engineering_Architecture_Report.docx',
      mockContent:
        'ReveLith implements a micro-kernel document model that maps OOXML blocks into memory structures. By generating delta-patches on save, all embedded macros, shapes, and custom XML parts remain 100% byte-for-byte identical.',
      aiPrompt: 'Summarize key engineering takeaways and highlight risk points for stakeholders.',
      aiResult:
        'Generated executive summary: Document roundtrips preserve 100% fidelity. Risk mitigation achieved through isolated memory virtualization.',
      metrics: [
        { label: 'Save Drift', value: '0.00% (Byte-Match)' },
        { label: 'Parse Time', value: '14.2 ms' },
        { label: 'Memory Footprint', value: '42 MB' },
      ],
    },
  },
  {
    id: 'sheets',
    name: 'Sheets',
    extension: '.xlsx',
    accentColor: '#4fa16b',
    accentGlow: 'rgba(79, 161, 107, 0.4)',
    icon: '/file-xlsx.svg',
    tagline: 'High-Performance Rust-Powered Spreadsheet Engine',
    description:
      'Process millions of rows with instantaneous calculations powered by our custom in-process Rust sidecar and dynamic WebAssembly engine.',
    engineDetails: 'Engine: Native Rust sidecar calculation core + dynamic virtualized grid',
    features: [
      'Sub-millisecond formula execution for complex Excel equations',
      'Interactive Pivot Tables, Slicers, and Dynamic Charting',
      'Formula auditing, dependency tree tracing, and error diagnostics',
      'Autonomous AI Copilot for data queries, trend analysis, and formula synthesis',
    ],
    uiPreview: {
      title: 'Financial_Projections_2026.xlsx',
      mockContent:
        '=LET(Rev, SUM(B2:B12), Growth, 1.34, FORECAST.ETS(C13, B2:B12, A2:A12)) -> ,850,200 (Projected)',
      aiPrompt: 'Detect anomalies in the Q2 operating expense column and build a trend chart.',
      aiResult:
        'Identified 2 outliers in Row 47 & 82. Rendered animated variance waterfall and updated chart.',
      metrics: [
        { label: 'Calc Engine', value: 'Native Rust Core' },
        { label: 'Grid Virtualization', value: '1,000,000+ Rows' },
        { label: 'FPS on Scroll', value: '60 FPS Steady' },
      ],
    },
  },
  {
    id: 'slides',
    name: 'Slides',
    extension: '.pptx',
    accentColor: '#d33922',
    accentGlow: 'rgba(211, 57, 34, 0.4)',
    icon: '/file-pptx.svg',
    tagline: 'Presentation Designer with Canvas Projection',
    description:
      'Craft stunning, modern slide decks with full master-layout inheritance, shape transforms, non-destructive cropping, and smart snapping.',
    engineDetails: 'Engine: @revelith/pptx-engine + @revelith/pptx-render custom canvas pipeline',
    features: [
      'Comprehensive OOXML slide tree parser and layout hierarchy resolver',
      'Vector shape rendering, geometric path transforms, and WordArt support',
      'Non-destructive image cropping, gradient fills, and smart alignment guides',
      'AI slide architect: Generate entire thematic decks from raw outlines',
    ],
    uiPreview: {
      title: 'ReveLith_Seed_Pitch_Deck.pptx',
      mockContent:
        'Slide 04: The Offline-First Paradigm Shift. Why local compute outperforms cloud latency for enterprise compliance.',
      aiPrompt:
        'Reorganize this slide into a 3-column benefit matrix with clean modern typography.',
      aiResult:
        'Applied 3-column sci-fi layout template with auto-aligned icons and high-contrast callouts.',
      metrics: [
        { label: 'Master Sync', value: '100% Inherited' },
        { label: 'Render Pipeline', value: 'Hardware Canvas' },
        { label: 'Export Support', value: 'PPTX / PDF' },
      ],
    },
  },
  {
    id: 'pdf',
    name: 'PDF',
    extension: '.pdf',
    accentColor: '#ef4444',
    accentGlow: 'rgba(239, 68, 68, 0.4)',
    icon: '/file-pdf.svg',
    tagline: 'Direct Content Stream & Font-Preserving Editor',
    description:
      'Edit text in existing PDF files with automatic font embedding, fill interactive forms, apply vector annotations, and sign documents securely.',
    engineDetails: 'Engine: PDFium stream modifier + font metric synthesizer',
    features: [
      'In-place text editing with automatic font matching and metrics preservation',
      'Vector annotations, callouts, ink pens, and freehand drawing',
      'Cryptographic digital signatures and certificate validation',
      'Interactive form filling, field extraction, and OCR document query AI',
    ],
    uiPreview: {
      title: 'Enterprise_Service_Agreement_v4.pdf',
      mockContent:
        'SECTION 4.2: Data Ownership. All intellectual property, proprietary algorithms, and documents remain strictly confidential on customer premise.',
      aiPrompt: 'Review contract indemnity clauses and generate redline suggestions.',
      aiResult:
        'Scanned 18 pages. Verified zero data leakage provisions. Flagged clause 9.1 for review.',
      metrics: [
        { label: 'Stream Patch', value: 'Lossless Vector' },
        { label: 'Font Synthesizer', value: 'Exact Match' },
        { label: 'Encryption', value: 'AES-256 Validated' },
      ],
    },
  },
  {
    id: 'markdown',
    name: 'Markdown',
    extension: '.md',
    accentColor: '#8b5cf6',
    accentGlow: 'rgba(139, 92, 246, 0.4)',
    icon: '/file-md.svg',
    tagline: 'Block-Based Rich Text Workspace for Engineers',
    description:
      'The ultimate technical writing environment. Instant bi-directional plain text synchronization, math formulas, code execution blocks, and Mermaid diagrams.',
    engineDetails: 'Engine: Prosemirror-based block tree with bidirectional plain text sync',
    features: [
      'Seamless toggle between raw Markdown and WYSIWYG rich block editing',
      'Live syntax highlighting for 120+ programming languages',
      'Interactive Mermaid diagram generation and KaTeX math formulas',
      'Autonomous AI coding assistant embedded directly in your documentation',
    ],
    uiPreview: {
      title: 'Distributed_Systems_Spec.md',
      mockContent:
        '# Consensus Protocols\n```rust\npub fn apply_delta_patch(doc: &mut Document, patch: &Delta) -> Result<(), Error> {\n    doc.nodes.update(patch)?;\n    Ok(())\n}\n```',
      aiPrompt: 'Generate a Mermaid sequence diagram illustrating the Raft leader election flow.',
      aiResult: 'Inserted live Mermaid sequence diagram with interactive node inspection.',
      metrics: [
        { label: 'Sync Speed', value: '0 ms (Real-Time)' },
        { label: 'Syntax Engines', value: '120+ Languages' },
        { label: 'Diagrams', value: 'Mermaid / KaTeX' },
      ],
    },
  },
  {
    id: 'html',
    name: 'HTML',
    extension: '.html',
    accentColor: '#e34f26',
    accentGlow: 'rgba(227, 79, 38, 0.4)',
    icon: '/file-html.svg',
    tagline: 'Source-of-Truth HTML Editing with Live Preview',
    description:
      'Edit HTML as real source in a dedicated tab, watching a live preview that updates as you type.',
    engineDetails:
      'Engine: source-of-truth HTML editing with a sandboxed preview document and owned local assets',
    features: [
      'Edit the actual HTML source with a live preview beside it — no hidden generated markup',
      'Sandboxed preview document served over an internal protocol, plus a focused present view',
      'Image and asset handling with local copies, MIME checks and atomic writes',
      'Export a single self-contained HTML file with images inlined, or present straight from the tab',
    ],
    uiPreview: {
      title: 'Release_Notes_Page.html',
      mockContent:
        '<section class="release">\n  <h2>0.10.100</h2>\n  <p>Draw, Forms and Tasks are now part of the suite.</p>\n</section>',
      aiPrompt:
        'Turn this section into a two-column release layout and keep the existing class names.',
      aiResult:
        'Restructured the section into two columns and preserved every existing class and id.',
      metrics: [
        { label: 'Preview', value: 'Live, Sandboxed' },
        { label: 'Export', value: 'Single-File HTML' },
        { label: 'Assets', value: 'Local & MIME-Checked' },
      ],
    },
  },
  {
    id: 'draw',
    name: 'AI Draw',
    extension: '.draw',
    accentColor: '#0ea5e9',
    accentGlow: 'rgba(14, 165, 233, 0.4)',
    icon: '/file-draw.svg',
    tagline: 'AI-Native Drawing Board for Sketches and Diagrams',
    description:
      'Sketch, diagram, and lay out ideas on an infinite board, with an AI panel that can act on the board itself.',
    engineDetails:
      'Engine: canvas element model with agent tool routing across 33 board operations',
    features: [
      'Full canvas toolkit: shapes, arrows, frames, freehand, text, images, laser and library',
      'Arrange, align, distribute, group, lock and flip operations with real undo history',
      'AI chat with vision input — attach, paste or drop an image and ask about it',
      'Export to PNG, SVG or a .draw board file; opens legacy boards and autosaves',
    ],
    uiPreview: {
      title: 'System_Architecture_Board.draw',
      mockContent:
        'Infinite board with a request flow: client to gateway to service to store, annotated with notes and a legend frame.',
      aiPrompt: 'Lay these four services out as a clean left-to-right flow and align the labels.',
      aiResult:
        'Arranged 4 nodes, aligned 9 labels and grouped the legend without moving user-placed annotations.',
      metrics: [
        { label: 'Board Tools', value: '33 Agent Tools' },
        { label: 'Export', value: 'PNG / SVG / .draw' },
        { label: 'Autosave', value: '30 s' },
      ],
    },
  },
  {
    id: 'forms',
    name: 'AI Forms',
    extension: '.form',
    accentColor: '#d97706',
    accentGlow: 'rgba(217, 119, 6, 0.4)',
    icon: '/file-form.svg',
    tagline: 'Local-First Form Builder with Offline Collection',
    description:
      'Build forms with conditional logic and collect responses without a hosted service.',
    engineDetails:
      'Engine: .form.json schema with routing rules, scoring and a hash-locked offline runtime',
    features: [
      'Choice, contact, file, signature, date-range, table and nested group field types',
      'Conditional visibility, branching, calculated variables and scored quizzes',
      'Single-file offline HTML export that collects responses locally and returns them as JSON',
      'Manually authored translations with bundled respondent messages in nine languages',
    ],
    uiPreview: {
      title: 'Vendor_Onboarding.form',
      mockContent:
        'Section 2 — Compliance. Conditional branch: if "handles personal data" is yes, require a DPA reference and a signature field.',
      aiPrompt:
        'Add a DPA reference field that only appears when the vendor handles personal data.',
      aiResult:
        'Added one conditional field and one visibility rule; no other questions were modified.',
      metrics: [
        { label: 'Field Types', value: '14+' },
        { label: 'Languages', value: '9 Bundled' },
        { label: 'Hosting', value: 'None Required' },
      ],
    },
  },
  {
    id: 'tasks',
    name: 'AI Tasks',
    extension: '.tasks',
    accentColor: '#16a34a',
    accentGlow: 'rgba(22, 163, 74, 0.4)',
    icon: '/file-tasks.svg',
    tagline: 'Local-First Kanban Boards with an AI Panel',
    description:
      'Plan work on kanban boards that live in local storage or a board file you control.',
    engineDetails:
      'Engine: local board model with WIP limits, relations and a shell-bridged AI panel',
    features: [
      'Unlimited projects, each with its own columns, labels, custom fields and ticket key',
      'Task priority, start and due dates, estimates, time logging, sub-tasks and comments',
      'Blocks, blocked_by, relates_to and duplicates relations between cards',
      'Named saved views, archived tasks, and board export you keep on your own device',
    ],
    uiPreview: {
      title: 'Release_0.10_Board.tasks',
      mockContent:
        'Columns: Backlog, In progress, Review, Done. WIP limit of 3 on In progress, with ENG-14 blocking ENG-18.',
      aiPrompt: 'Summarise what is blocking the current release and flag anything past due.',
      aiResult: 'Found 1 blocking relation (ENG-14 to ENG-18) and 2 overdue cards in Review.',
      metrics: [
        { label: 'Projects', value: 'Unlimited' },
        { label: 'Relations', value: '4 Types' },
        { label: 'Storage', value: 'Local Only' },
      ],
    },
  },
]

/* ---------------------------------------------------------------------------
 * Workspace preview fixtures
 * These drive the realistic in-app canvases rendered by AppCanvas.tsx.
 * They are display data only — nothing here is fetched or computed.
 * ------------------------------------------------------------------------- */

export interface SheetCell {
  v: string
  /** bold cell */
  b?: boolean
  /** right-aligned numeric */
  n?: boolean
  /** positive / negative accent */
  tone?: 'good' | 'bad' | 'muted'
}

export interface SheetRow {
  /** Excel row number, 1-based */
  r: number
  cells: (SheetCell | null)[]
}

export interface SheetTab {
  name: string
  accent?: boolean
}

/** The B13 formula shown in the formula bar, broken into syntax-highlighted parts. */
export const SHEET_FORMULA: { t: string; k: 'fn' | 'str' | 'num' | 'ref' | 'op' }[] = [
  { t: '=LET(', k: 'fn' },
  { t: 'Rev', k: 'ref' },
  { t: ', ', k: 'op' },
  { t: 'SUM', k: 'fn' },
  { t: '(B2:B5)', k: 'ref' },
  { t: ', ', k: 'op' },
  { t: 'Growth', k: 'ref' },
  { t: ', ', k: 'op' },
  { t: '1.34', k: 'num' },
  { t: ', ', k: 'op' },
  { t: 'FORECAST.ETS', k: 'fn' },
  { t: '(B6, B2:B5, A2:A5)', k: 'ref' },
  { t: ')', k: 'fn' },
]

export const SHEET_GRID: { cols: string[]; rows: SheetRow[] } = {
  cols: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  rows: [
    {
      r: 1,
      cells: [
        { v: 'Revenue Forecast Model', b: true },
        null,
        null,
        null,
        null,
        null,
        { v: 'FY2026', b: true },
        null,
      ],
    },
    {
      r: 2,
      cells: [
        { v: 'Quarter' },
        { v: 'Revenue', n: true },
        { v: 'OpEx', n: true },
        { v: 'Gross', n: true },
        { v: 'Margin', n: true },
        { v: 'Headcount', n: true },
        null,
        null,
      ],
    },
    {
      r: 3,
      cells: [
        { v: 'Q1' },
        { v: '1,204,500', n: true },
        { v: '742,100', n: true, tone: 'muted' },
        { v: '462,400', n: true },
        { v: '38.4%', n: true, tone: 'muted' },
        { v: '64', n: true, tone: 'muted' },
        null,
        null,
      ],
    },
    {
      r: 4,
      cells: [
        { v: 'Q2' },
        { v: '1,486,900', n: true },
        { v: '868,400', n: true, tone: 'bad' },
        { v: '618,500', n: true, tone: 'good' },
        { v: '41.6%', n: true, tone: 'muted' },
        { v: '71', n: true, tone: 'muted' },
        { v: '▲ 23.4%', n: true, tone: 'good' },
        null,
      ],
    },
    {
      r: 5,
      cells: [
        { v: 'Q3' },
        { v: '1,772,300', n: true },
        { v: '1,046,900', n: true, tone: 'bad' },
        { v: '725,400', n: true, tone: 'good' },
        { v: '40.9%', n: true, tone: 'muted' },
        { v: '78', n: true, tone: 'muted' },
        null,
        null,
      ],
    },
    {
      r: 6,
      cells: [
        { v: 'Q4 (projected)', b: true },
        { v: '4,850,200', n: true, b: true, tone: 'good' },
        { v: '1,284,600', n: true, b: true },
        { v: '3,565,600', n: true, b: true, tone: 'good' },
        { v: '73.5%', n: true, b: true, tone: 'muted' },
        { v: '92', n: true, b: true, tone: 'muted' },
        null,
        null,
      ],
    },
    {
      r: 7,
      cells: [
        { v: 'Total / Blended' },
        { v: '9,313,900', n: true },
        { v: '3,942,000', n: true },
        { v: '5,371,900', n: true, tone: 'good' },
        { v: '57.7%', n: true },
        { v: '92', n: true },
      ],
    },
    {
      r: 8,
      cells: [
        { v: 'Variance vs plan', tone: 'muted' },
        { v: '+312,400', n: true, tone: 'good' },
        { v: '-88,200', n: true, tone: 'bad' },
        { v: '+400,600', n: true, tone: 'good' },
        { v: '—', n: true, tone: 'muted' },
        { v: '—', n: true, tone: 'muted' },
      ],
    },
    { r: 9, cells: [null, null, null, null, null, null, null, null] },
    {
      r: 10,
      cells: [
        { v: 'Audit flags', b: true, tone: 'muted' },
        { v: '2 outliers', tone: 'bad' },
        { v: 'Row 47, Row 82', tone: 'muted' },
        null,
        null,
        null,
        null,
        null,
      ],
    },
    {
      r: 11,
      cells: [
        { v: 'Formula engine', tone: 'muted' },
        { v: 'Rust sidecar', tone: 'muted' },
        { v: '0.4 ms', n: true, tone: 'good' },
        null,
        null,
        null,
        null,
        null,
      ],
    },
  ],
}

export const SHEET_TABS: SheetTab[] = [
  { name: 'Revenue' },
  { name: 'OpEx Detail' },
  { name: 'Headcount' },
  { name: 'Scenario', accent: true },
  { name: 'Pivot' },
  { name: 'Raw Import' },
]

export interface SlideDeckItem {
  n: number
  title: string
  kind: 'title' | 'bullets' | 'columns' | 'flow' | 'metrics' | 'closing'
  kicker?: string
  heading: string
  sub?: string
  bullets?: string[]
  columns?: { title: string; body: string }[]
  flow?: string[]
  note?: string
  metrics?: { v: string; l: string }[]
}

export const SLIDE_DECK: SlideDeckItem[] = [
  {
    n: 1,
    title: 'Cover',
    kind: 'title',
    kicker: 'ReveLith · Seed Round 2026',
    heading: 'Documents that stay yours.',
    sub: 'The offline-first office suite for sovereign teams',
  },
  {
    n: 2,
    title: 'The problem',
    kind: 'bullets',
    kicker: 'Today',
    heading: 'Your files leave the building.',
    bullets: [
      'Every "free" editor is a data pipeline',
      'Round-tripping destroys macros and custom XML',
      'Compliance teams cannot approve cloud authoring',
    ],
  },
  {
    n: 3,
    title: 'Three pillars',
    kind: 'columns',
    kicker: 'The thesis',
    heading: 'Local compute wins on every axis.',
    columns: [
      { title: 'Sovereign', body: 'Inference and rendering never leave the device boundary.' },
      { title: 'Fast', body: 'Rust sidecar keeps 1M-row grids at a steady 60 FPS.' },
      { title: 'Lossless', body: 'Delta block patching preserves bytes on every save.' },
    ],
  },
  {
    n: 4,
    title: 'Architecture',
    kind: 'flow',
    kicker: 'Under the hood',
    heading: 'Parse once. Patch precisely.',
    flow: [
      'OOXML container',
      'Block index',
      'In-memory model',
      'Delta patch',
      'Byte-identical save',
    ],
    note: 'Each stage is independently testable — divergence halts the write.',
  },
  {
    n: 5,
    title: 'Market',
    kind: 'metrics',
    kicker: 'Opportunity',
    heading: 'Sovereign tooling is compounding.',
    metrics: [
      { v: '$14.2B', l: 'Productivity software TAM' },
      { v: '38%', l: 'Regulated orgs blocking cloud AI' },
      { v: '0', l: 'Credible offline-first incumbents' },
    ],
  },
  {
    n: 6,
    title: 'Thank you',
    kind: 'closing',
    heading: 'Let us build it in the open.',
    sub: 'github.com/sainibhaowal/ReveLith',
  },
]

export const MARKDOWN_SOURCE = [
  { t: '# Consensus Protocols', k: 'h1' },
  { t: '', k: 'blank' },
  { t: 'ReveLith syncs document state with a **delta patch log**. Every', k: 'text' },
  { t: 'replica converges without a coordinator.', k: 'text' },
  { t: '', k: 'blank' },
  { t: '## Implementation', k: 'h2' },
  { t: '', k: 'blank' },
  { t: '- [x] Block-level three-way merge', k: 'check' },
  { t: '- [x] Deterministic patch ordering', k: 'check' },
  { t: '- [ ] Conflict UI for divergent vectors', k: 'todo' },
  { t: '', k: 'blank' },
  { t: '```rust', k: 'fence' },
  { t: 'pub fn apply_delta(', k: 'code' },
  { t: '    doc: &mut Document,', k: 'code' },
  { t: '    patch: &Delta,', k: 'code' },
  { t: ') -> Result<(), Error> {', k: 'code' },
  { t: '    doc.nodes.update(patch)?;', k: 'code' },
  { t: '    Ok(())', k: 'code' },
  { t: '}', k: 'code' },
  { t: '```', k: 'fence' },
  { t: '', k: 'blank' },
  { t: '> Latency matters: local apply is **0 ms** versus 240 ms', k: 'quote' },
  { t: '> for a round trip to a hosted editor.', k: 'quote' },
]

export interface FaqItem {
  q: string
  a: string
}

/**
 * Answers are deliberately narrow and factual — each is either a claim the site
 * already makes elsewhere or a documented capability of the product. Formats
 * are listed per engine rather than summarised, so a reader can check one.
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    q: 'Where does my data go?',
    a: 'Nowhere. Parsing, rendering, editing and saving all happen on your own machine, so there is no upload queue and no server of ours holding your files. The app ships with no analytics SDK and no crash reporter, and document content is never used to train models.',
  },
  {
    q: 'Can I use a local model?',
    a: 'Yes — that is the default. The built-in copilot runs inference on your own hardware with a locally hosted model. No API key, no account and no network round trip are required, so it keeps working with the network switched off entirely.',
  },
  {
    q: 'Can I bring my own API key?',
    a: 'Yes, optionally. If you would rather use a hosted model, you can point ReveLith at a provider using your own key. Those requests travel directly from your machine to that provider under their terms, and we never proxy, log or observe them. Leave the key unset to stay fully local.',
  },
  {
    q: 'Which file formats are supported?',
    a: 'Docs opens .docx and .doc. Sheets opens .xlsx, .xls and .csv. Slides opens .pptx. PDF opens .pdf, and Markdown opens .md and .markdown. Alongside those, HTML opens .html, Draw opens .draw, Forms opens .form and Tasks opens .tasks. Saves patch the original container in place, so untouched macros, custom XML, styles and embedded media stay byte-for-byte identical.',
  },
  {
    q: 'Do the drawing, forms and task apps need a server?',
    a: 'No. AI Draw, AI Forms and AI Tasks are local-first. Forms can be exported as a single offline HTML file that collects responses without a hosted service, and task boards live in local storage or a board file you control. Draw autosaves to your own device.',
  },
  {
    q: 'What is the license?',
    a: 'Apache License 2.0 — free to use, modify and redistribute, including commercially. No subscription, no account and no seat count. The full licence text and third-party notices ship with the application and live in the source repository.',
  },
]

export const COMPARISON_DATA = [
  {
    feature: 'Byte-Preserving Roundtrip Fidelity',
    revelith: '100% Patch Delta (Zero Drift)',
    traditional: 'Lossy Re-serialization',
    cloud: 'Converts to Proprietary Format',
  },
  {
    feature: 'Data Privacy & Offline Independence',
    revelith: '100% Local (Zero Telemetry)',
    traditional: 'Requires Account & Tracking',
    cloud: 'Stores All Files on Remote Servers',
  },
  {
    feature: 'Native Embedded AI Copilot',
    revelith: 'Built-in Local & Custom API Models',
    traditional: 'Expensive Add-on Subscription',
    cloud: 'Sends All Prompts/Docs to Cloud',
  },
  {
    feature: 'Spreadsheet Calculation Speed',
    revelith: 'Rust-Powered Sub-millisecond',
    traditional: 'Legacy C++ Monolith',
    cloud: 'Network-Throttled JS Runtime',
  },
  {
    feature: 'Unified Multi-Document Workspace',
    revelith: 'All 9 Apps in One Cohesive Shell',
    traditional: '9 Heavyweight Separate Apps',
    cloud: 'Dozens of Browser Tabs',
  },
  {
    feature: 'Licensing & Freedom',
    revelith: 'Open Source (Apache 2.0)',
    traditional: 'Expensive Annual Subscription',
    cloud: 'Vendor Lock-in Subscription',
  },
]

export const GITHUB_REPO_URL = 'https://github.com/sainibhaowal/ReveLith'
export const RELEASES_URL = 'https://github.com/sainibhaowal/ReveLith/releases'
