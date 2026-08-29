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
    tagline: 'Native Word Editing with Provider-Choice AI',
    description: 'Open and edit Word (.docx) documents in a dedicated workspace, with optional AI help from a provider you configure.',
    engineDetails: 'Engine: @revelith/docx-engine OOXML delta block patcher + WASM font metrics',
    features: [
      'Native DOCX editing, paginated layout, revisions, comments, and images',
      'True paginated layout engine matching desktop Word print views',
      'Track changes, rich comments, and equation editor',
      'Context-aware AI writing with your chosen provider and discovered model',
    ],
    uiPreview: {
      title: 'Q3_Engineering_Architecture_Report.docx',
      mockContent: 'ReveLith implements a micro-kernel document model that maps OOXML blocks into memory structures. By generating delta-patches on save, all embedded macros, shapes, and custom XML parts remain 100% byte-for-byte identical.',
      aiPrompt: 'Summarize key engineering takeaways and highlight risk points for stakeholders.',
      aiResult: 'Generated executive summary: Document roundtrips preserve 100% fidelity. Risk mitigation achieved through isolated memory virtualization.',
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
    description: 'Open and work with spreadsheet (.xlsx) files in the same desktop workspace as your documents and presentations.',
    engineDetails: 'Engine: Native Rust sidecar calculation core + dynamic virtualized grid',
    features: [
      'Sub-millisecond formula execution for complex Excel equations',
      'Interactive Pivot Tables, Slicers, and Dynamic Charting',
      'Formula auditing, dependency tree tracing, and error diagnostics',
      'AI-assisted data queries, trend analysis, and formula synthesis through your provider',
    ],
    uiPreview: {
      title: 'Financial_Projections_2026.xlsx',
      mockContent: '=LET(Rev, SUM(B2:B12), Growth, 1.34, FORECAST.ETS(C13, B2:B12, A2:A12)) -> ,850,200 (Projected)',
      aiPrompt: 'Detect anomalies in the Q2 operating expense column and build a trend chart.',
      aiResult: 'Identified 2 outliers in Row 47 & 82. Rendered animated variance waterfall and updated chart.',
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
    tagline: 'Presentation Designer with Native Slide Tools',
    description: 'Create and edit presentation (.pptx) files with slide tools and optional AI help from your connected provider.',
    engineDetails: 'Engine: @revelith/pptx-engine + @revelith/pptx-render custom canvas pipeline',
    features: [
      'Comprehensive OOXML slide tree parser and layout hierarchy resolver',
      'Vector shape rendering, geometric path transforms, and WordArt support',
      'Non-destructive image cropping, gradient fills, and smart alignment guides',
      'Native deck and slide creation with provider-independent editing tools',
    ],
    uiPreview: {
      title: 'ReveLith_Seed_Pitch_Deck.pptx',
      mockContent: 'Slide 04: The Offline-First Paradigm Shift. Why local compute outperforms cloud latency for enterprise compliance.',
      aiPrompt: 'Reorganize this slide into a 3-column benefit matrix with clean modern typography.',
      aiResult: 'Applied 3-column sci-fi layout template with auto-aligned icons and high-contrast callouts.',
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
    description: 'Read, annotate, and work with PDF files in a dedicated local workspace.',
    engineDetails: 'Engine: PDFium stream modifier + font metric synthesizer',
    features: [
      'In-place text editing with automatic font matching and metrics preservation',
      'Vector annotations, callouts, ink pens, and freehand drawing',
      'Cryptographic digital signatures and certificate validation',
      'Interactive form filling, field extraction, and OCR document query AI',
    ],
    uiPreview: {
      title: 'Enterprise_Service_Agreement_v4.pdf',
      mockContent: 'SECTION 4.2: Data Ownership. All intellectual property, proprietary algorithms, and documents remain strictly confidential on customer premise.',
      aiPrompt: 'Review contract indemnity clauses and generate redline suggestions.',
      aiResult: 'Scanned 18 pages. Verified zero data leakage provisions. Flagged clause 9.1 for review.',
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
    description: 'Write and maintain Markdown notes and technical documentation in portable plain text.',
    engineDetails: 'Engine: Prosemirror-based block tree with bidirectional plain text sync',
    features: [
      'Seamless toggle between raw Markdown and WYSIWYG rich block editing',
      'Live syntax highlighting for 120+ programming languages',
      'Interactive Mermaid diagram generation and KaTeX math formulas',
      'Autonomous AI coding assistant embedded directly in your documentation',
    ],
    uiPreview: {
      title: 'Distributed_Systems_Spec.md',
      mockContent: '# Consensus Protocols\n```rust\npub fn apply_delta_patch(doc: &mut Document, patch: &Delta) -> Result<(), Error> {\n    doc.nodes.update(patch)?;\n    Ok(())\n}\n```',
      aiPrompt: 'Generate a Mermaid sequence diagram illustrating the Raft leader election flow.',
      aiResult: 'Inserted live Mermaid sequence diagram with interactive node inspection.',
      metrics: [
        { label: 'Sync Speed', value: '0 ms (Real-Time)' },
        { label: 'Syntax Engines', value: '120+ Languages' },
        { label: 'Diagrams', value: 'Mermaid / KaTeX' },
      ],
    },
  },
]

export const COMPARISON_DATA = [
  {
    feature: 'Byte-Preserving Roundtrip Fidelity',
    revelith: 'Native format-aware editing',
    traditional: 'Separate apps per format',
    cloud: 'Often converts to a web format',
  },
  {
    feature: 'Data Privacy & Offline Independence',
    revelith: 'Local or provider of your choice',
    traditional: 'Vendor-controlled account model',
    cloud: 'Provider-controlled cloud workflow',
  },
  {
    feature: 'Native Embedded AI Copilot',
    revelith: 'Local, BYOK & compatible API models',
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
    revelith: 'All 5 Apps in One Cohesive Shell',
    traditional: '5 Heavyweight Separate Apps',
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
export const LATEST_VERSION = 'v1.2.4'
