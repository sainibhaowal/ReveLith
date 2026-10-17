import React from 'react'
import {
  Save,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Highlighter,
  Type,
  Link2,
  Image as ImageIcon,
  Table,
  MessageSquare,
  PenTool,
  Eraser,
  Sparkles,
  FileText,
  MonitorPlay,
  Download,
  ZoomIn,
  ZoomOut,
  Plus,
  Trash2,
  Copy,
  Scissors,
  ClipboardPaste,
  ChevronRight,
  Circle,
  Square,
  Minus,
  Layers,
  Grid3x3,
  Send,
  Search,
  BookOpen,
  AlignJustify,
  Indent,
  Outdent,
  Superscript,
  Subscript,
  PaintBucket,
  ArrowRight,
  ArrowLeftRight,
  Frame,
  MousePointer2,
} from 'lucide-react'
import { SLIDE_DECK, MARKDOWN_SOURCE, type AppModule } from '../data/suite-data'

/* ===========================================================================
 * ReveLith workspace — nine app canvases modelled on the real desktop shell.
 *
 * Shared anatomy, mirroring the product:
 *   1. dark window bar   — traffic lights, product tabs, window controls
 *   2. menu tab row      — File / Home / Insert / … with a leading app chip
 *   3. ribbon            — real, labelled buttons for that app
 *   4. left rail         — AI assistant plus the app's own panel (thumbnails,
 *                          field list, navigator) and a prompt box
 *   5. content           — dense, populated, pretending nothing
 *   6. status bar        — live document state
 * ========================================================================= */

/* ------------------------------- 1. window bar ---------------------------- */

const ProductTabs: React.FC<{ active: string; accent: string }> = ({ active, accent }) => (
  <div className="wx-tabs">
    {[
      'Aurora Home — Product Brief',
      'The Problem.pptx',
      'test.docx',
      'Monthly Personal Budget Tracker',
    ].map((t) => (
      <span key={t} className={t === active ? 'wx-tab is-active' : 'wx-tab'}>
        <span className="wx-tab-dot" style={t === active ? { background: accent } : undefined} />
        {t}
      </span>
    ))}
    <span className="wx-tab-new">
      <Plus size={10} />
    </span>
  </div>
)

const WindowBar: React.FC<{ active: string; accent: string }> = ({ active, accent }) => (
  <div className="wx-windowbar">
    <span className="wx-lights">
      <i />
      <i />
      <i />
    </span>
    <span className="wx-brand">
      <span className="wx-brand-mark">
        <ReveMark />
      </span>
      <b>ReveLith</b>
    </span>
    <ProductTabs active={active} accent={accent} />
    <span className="wx-wincontrols">
      <span className="wx-wbtn">
        <Minus size={9} />
      </span>
      <span className="wx-wbtn">
        <Square size={7} />
      </span>
      <span className="wx-wbtn wx-wbtn-close">×</span>
    </span>
  </div>
)

const ReveMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g>
      <circle cx="12" cy="12" r="1.8" fill="#38bdf8" />
      <ellipse cx="12" cy="12" rx="10" ry="4.3" fill="none" stroke="#38bdf8" strokeWidth="1.6" />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.3"
        fill="none"
        stroke="#60a5fa"
        strokeWidth="1.6"
        transform="rotate(60 12 12)"
      />
      <ellipse
        cx="12"
        cy="12"
        rx="10"
        ry="4.3"
        fill="none"
        stroke="#818cf8"
        strokeWidth="1.6"
        transform="rotate(120 12 12)"
      />
    </g>
  </svg>
)

/* ------------------------------- 2. menu tabs ----------------------------- */

const MenuTabs: React.FC<{ app: string; accent: string; tabs: string[]; active: number }> = ({
  app,
  accent,
  tabs,
  active,
}) => (
  <div className="wx-menutabs">
    <span className="wx-appchip" style={{ borderColor: accent }}>
      <span className="wx-appchip-dot" style={{ background: accent }} />
      {app}
    </span>
    {tabs.map((t, i) => (
      <span key={t} className={i === active ? 'wx-menutab is-active' : 'wx-menutab'}>
        {t}
      </span>
    ))}
  </div>
)

/* --------------------------------- 3. ribbon ------------------------------ */

const RGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="wx-rgroup">
    <div className="wx-rgroup-items">{children}</div>
    <div className="wx-rgroup-label">{label}</div>
  </div>
)

const RBtn: React.FC<{
  icon?: React.ReactNode
  label?: string
  active?: boolean
  big?: boolean
}> = ({ icon, label, active, big }) => (
  <span className={['wx-rbtn', active && 'is-active', big && 'is-big'].filter(Boolean).join(' ')}>
    {icon && <span className="wx-rbtn-icon">{icon}</span>}
    {label && <span className="wx-rbtn-label">{label}</span>}
  </span>
)

const RText: React.FC<{ children: React.ReactNode; active?: boolean }> = ({ children, active }) => (
  <span className={['wx-rbtn', 'is-big', active && 'is-active'].filter(Boolean).join(' ')}>
    <span className="wx-rbtn-label wx-rbtn-label-lg">{children}</span>
  </span>
)

const RSelect: React.FC<{ children: React.ReactNode; w?: number }> = ({ children, w }) => (
  <span className="wx-rselect" style={w ? { width: w } : undefined}>
    {children}
    <ChevronRight size={9} className="wx-rs-arrow" />
  </span>
)

/* ------------------------------- 4. left rail ----------------------------- */

const AiRail: React.FC<{
  prompt: string
  quick: string[]
  bullets: string[]
  ask: string
}> = ({ prompt, quick, bullets, ask }) => (
  <aside className="wx-rail">
    <div className="wx-rail-head">
      <Sparkles size={12} />
      <b>Gemspark</b>
    </div>
    <p className="wx-rail-lede">{prompt}</p>
    <div className="wx-rail-quick">
      {quick.map((q) => (
        <span key={q} className="wx-rail-btn">
          {q}
        </span>
      ))}
    </div>
    <div className="wx-rail-divider" />
    <div className="wx-rail-answer">
      {bullets.map((b, i) => (
        <p key={i}>
          <span className="wx-rail-dot" />
          {b}
        </p>
      ))}
    </div>
    <div className="wx-rail-ask">
      <span>{ask}</span>
      <Send size={11} />
    </div>
  </aside>
)

/* ------------------------------ 5. status bar ----------------------------- */

const StatusBar: React.FC<{ left: React.ReactNode; right?: React.ReactNode }> = ({
  left,
  right,
}) => (
  <div className="wx-statusbar">
    <div className="wx-status-left">{left}</div>
    {right && <div className="wx-status-right">{right}</div>}
  </div>
)

/* =============================== 1. DOCS ================================== */

const DocsCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="test.docx" accent="#3276cd" />
    <MenuTabs
      app="Docs"
      accent="#3276cd"
      tabs={['File', 'Home', 'Insert', 'Draw', 'Layout', 'References', 'Review', 'View']}
      active={1}
    />
    <div className="wx-ribbon">
      <RGroup label="Clipboard">
        <RBtn icon={<ClipboardPaste size={15} />} label="Paste" big />
        <div className="wx-rcol">
          <RBtn icon={<Scissors size={12} />} label="Cut" />
          <RBtn icon={<Copy size={12} />} label="Copy" />
        </div>
      </RGroup>
      <RGroup label="Font">
        <div className="wx-rcol">
          <RSelect w={78}>Calibri (Body)</RSelect>
          <RSelect w={34}>11</RSelect>
        </div>
        <RBtn icon={<Bold size={13} />} active />
        <RBtn icon={<Italic size={13} />} />
        <RBtn icon={<Underline size={13} />} />
        <RBtn icon={<Superscript size={13} />} />
        <RBtn icon={<Subscript size={13} />} />
        <RBtn icon={<Highlighter size={13} />} />
        <RBtn icon={<PaintBucket size={13} />} />
      </RGroup>
      <RGroup label="Paragraph">
        <RBtn icon={<List size={13} />} />
        <RBtn icon={<ListOrdered size={13} />} />
        <RBtn icon={<Outdent size={13} />} />
        <RBtn icon={<Indent size={13} />} />
        <RBtn icon={<AlignLeft size={13} />} active />
        <RBtn icon={<AlignCenter size={13} />} />
        <RBtn icon={<AlignRight size={13} />} />
        <RBtn icon={<AlignJustify size={13} />} />
      </RGroup>
      <RGroup label="Styles">
        <RText active>AaBbCc</RText>
        <RText>AaBbCc</RText>
        <RText>AaBbCc</RText>
        <RText>AaBbCc</RText>
      </RGroup>
      <RGroup label="Editing">
        <RBtn icon={<Search size={14} />} label="Find" big />
        <RBtn icon={<FileText size={14} />} label="Replace" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Let AI help you write and edit"
        quick={[
          'Summarize the key points of this document',
          'Polish the whole document for a more professional tone',
          'Continue writing from where the document leaves off',
        ]}
        bullets={[
          '3 pages · resume.docx — Gemini 2.5 Pro (preview)',
          'Senior ML engineer with a strong research and production record',
          'Two research roles and one teaching assistantship listed',
          'Technical Skills section is still open',
        ]}
        ask="Describe an edit or writing task, or ask a question"
      />
      <div className="wx-canvas wx-canvas-doc">
        <div className="wx-docpage">
          <h1>John Doe</h1>
          <p className="wx-docrole">Software Engineer | Machine Learning Researcher</p>
          <p className="wx-doccontact">
            Palo Alto, CA · (650) 555-0142 · johnd@stanford.edu · linkedin.com/in/john ·
            github.com/john
          </p>
          <h2>Highlights</h2>
          <p>
            Stanford Computer Science M.S. graduate specialising in Artificial Intelligence and
            distributed systems. Proven track record of delivering production-grade machine learning
            systems at scale through internships at leading technology companies. Passionate about
            building intelligent, reliable software that solves real-world problems, with published
            research in top-tier venues.
          </p>
          <h2>Education</h2>
          <div className="wx-docline">
            <b>Stanford University — Stanford, CA</b>
          </div>
          <p className="wx-docsub">
            Master of Science in Computer Science, Specialization in Artificial Intelligence · Aug
            2022 – June 2024
          </p>
          <ol className="wx-doclist">
            <li>GPA: 3.975 / 4.00</li>
            <li>
              Relevant Coursework: Deep Learning (CS230), Natural Language Processing with Deep
              Learning (CS224N), Distributed Systems (CS244B), Reinforcement Learning (CS234)
            </li>
            <li>
              Teaching Assistant for CS229: Machine Learning (Winter 2024) — mentored 40+ students,
              led weekly sections
            </li>
          </ol>
          <div className="wx-docline">
            <b>University of California, Berkeley — CA</b>
          </div>
          <p className="wx-docsub">
            Bachelor of Science in Electrical Engineering and Computer Sciences · Aug 2018 – May
            2022
          </p>
          <ol className="wx-doclist">
            <li>GPA: 3.92 / 4.00, summa cum laude, Phi Beta Kappa</li>
            <li>Honors: Regent's and Chancellor's Scholar; EECS Departmental Honors</li>
          </ol>
          <h2>Technical Skills</h2>
          <p>
            <b>Languages:</b> Python, C++, Java, TypeScript, Rust, SQL
          </p>
          <p>
            <b>ML:</b> PyTorch, TensorFlow, JAX, scikit-learn, Hugging Face, CUDA
          </p>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Page 1 of 1</span>
          <span>3 words</span>
          <span className="wx-note">
            — Blank document created. Describe what to generate in the AI pane on the left.
          </span>
        </>
      }
      right={
        <>
          <ZoomIn size={11} />
          <span>100%</span>
        </>
      }
    />
  </div>
)

/* ============================== 2. SHEETS ================================= */

interface BRow {
  section?: string
  label?: string
  item?: string
  budget?: string
  actual?: string
  pct?: boolean
  bold?: boolean
}

const SHEET_ROWS: BRow[] = [
  { section: 'INCOME' },
  { label: 'Salary (net)', budget: '5,200.00', actual: '$5,200.00' },
  { label: 'Freelance', budget: '600.00', actual: '$850.00', pct: true },
  { label: 'Interest & dividends', budget: '50.00', actual: '$42.00' },
  { label: 'Other income', budget: '100.00', actual: '—', pct: true },
  { label: 'Total income', budget: '$5,950.00', actual: '$6,092.00', bold: true },
  { section: 'EXPENSES' },
  { label: 'Rent / mortgage', budget: '1500', actual: '1500' },
  { label: 'Utilities', budget: '180', actual: '205' },
  { label: 'Internet & phone', budget: '90', actual: '90' },
  { label: 'Groceries', budget: '500', actual: '548' },
  { label: 'Dining out', budget: '200', actual: '265' },
  { label: 'Fuel / transit', budget: '180', actual: '162' },
  { label: 'Car insurance', budget: '120', actual: '120' },
  { label: 'Health insurance', budget: '250', actual: '250' },
  { label: 'Gym & wellness', budget: '60', actual: '60' },
  { label: 'Clothing', budget: '100', actual: '145' },
  { label: 'Entertainment', budget: '120', actual: '180' },
  { label: 'Subscriptions', budget: '50', actual: '58' },
]

const SheetsCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="Monthly Personal Budget Tracker" accent="#4fa16b" />
    <MenuTabs
      app="Sheets"
      accent="#4fa16b"
      tabs={['File', 'Home', 'Insert', 'Page Layout', 'Formulas', 'Data', 'Review', 'View', 'Help']}
      active={1}
    />
    <div className="wx-ribbon">
      <RGroup label="Clipboard">
        <RBtn icon={<ClipboardPaste size={15} />} label="Paste" big />
        <div className="wx-rcol">
          <RBtn icon={<Scissors size={12} />} label="Cut" />
          <RBtn icon={<Copy size={12} />} label="Copy" />
        </div>
      </RGroup>
      <RGroup label="Font">
        <div className="wx-rcol">
          <RSelect w={74}>Aptos</RSelect>
          <RSelect w={32}>11</RSelect>
        </div>
        <RBtn icon={<Bold size={13} />} />
        <RBtn icon={<Italic size={13} />} />
        <RBtn icon={<Underline size={13} />} />
        <RBtn icon={<PaintBucket size={13} />} />
      </RGroup>
      <RGroup label="Alignment">
        <RBtn icon={<AlignLeft size={13} />} />
        <RBtn icon={<AlignCenter size={13} />} />
        <RBtn icon={<AlignRight size={13} />} />
        <RBtn icon={<AlignJustify size={13} />} />
      </RGroup>
      <RGroup label="Number">
        <RSelect w={62}>General</RSelect>
        <RBtn icon={<span className="wx-fmt">₹</span>} />
        <RBtn icon={<span className="wx-fmt">%</span>} />
        <RBtn icon={<span className="wx-fmt">,</span>} />
        <RBtn icon={<span className="wx-fmt">.00</span>} />
      </RGroup>
      <RGroup label="Styles">
        <RBtn label="Conditional Formatting" big />
        <RBtn label="Format as Table" big />
        <RBtn label="Cell Styles" big />
      </RGroup>
      <RGroup label="Cells">
        <RBtn icon={<Table size={14} />} label="Insert" big />
        <RBtn icon={<Trash2 size={14} />} label="Delete" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Gemspark"
        quick={['Explain', 'Analyze', 'Auto-Pilot', 'Clean', 'Format']}
        bullets={[
          'Net cash flow: still positive. $864 | + 10.1% — You planned to end the month with $970 left over; the extra freelance income (mostly not fully absorbed) supports the expense overruns.',
          'Savings rate: ~19.7% vs actual, 20.2% (planned; now 38).',
          'Rate: Savings transfer $600 + retirement contribution $440) + interest & dividends',
          'Because your income grew but your automatic savings amount stayed fixed, the rate dipped slightly. Bumping the $860 to $1,100 would bring the savings rate up to about 33.9%.',
          'Takeaway: the month ended in the black, but discretionary headings (dining, entertainment, clothing) drifted 30–50% over budget.',
        ]}
        ask="Ask AI to analyze or update this workbook…"
      />
      <div className="wx-canvas wx-canvas-sheet">
        <div className="wx-formulabar">
          <span className="wx-namebox">A1</span>
          <span className="wx-fx">fx</span>
          <span className="wx-formulatext">Monthly Personal Budget Tracker</span>
        </div>
        <div className="wx-gridwrap">
          <table className="wx-grid">
            <thead>
              <tr>
                <th className="wx-corner" />
                {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((c) => (
                  <th key={c} className="wx-colhead">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th className="wx-rowhead">1</th>
                <td className="wx-band" colSpan={8}>
                  Monthly Personal Budget Tracker
                </td>
              </tr>
              <tr>
                <th className="wx-rowhead">2</th>
                <td className="wx-g-strong">Month:</td>
                <td className="wx-g-band">2025-01</td>
                <td colSpan={6} />
              </tr>
              <tr className="wx-sec">
                <th className="wx-rowhead">3</th>
                <td colSpan={8}>INCOME</td>
              </tr>
              <tr>
                <th className="wx-rowhead">4</th>
                <td />
                <td className="wx-g-strong">Item</td>
                <td className="wx-g-strong wx-num">Budgeted</td>
                <td className="wx-g-strong wx-num">Actual</td>
                <td className="wx-g-strong wx-num">Difference</td>
                <td className="wx-g-strong wx-num">% of Budget</td>
                <td />
                <td />
              </tr>
              {SHEET_ROWS.map((r, i) => {
                const n = 5 + i
                if (r.section === 'EXPENSES')
                  return (
                    <tr key={n} className="wx-sec">
                      <th className="wx-rowhead">{n}</th>
                      <td colSpan={8}>EXPENSES</td>
                    </tr>
                  )
                if (r.section) return null
                const diff = r.bold
                  ? '142.00'
                  : String(
                      (Number(String(r.actual).replace(/[^0-9.]/g, '')) || 0) -
                        (Number(String(r.budget).replace(/[^0-9.]/g, '')) || 0),
                    )
                return (
                  <tr key={n} className={r.bold ? 'wx-total' : undefined}>
                    <th className="wx-rowhead">{n}</th>
                    <td />
                    <td className="wx-g-label">{r.label}</td>
                    <td className="wx-num">{r.budget}</td>
                    <td className="wx-num">{r.actual}</td>
                    <td className="wx-num">{r.pct ? diff : diff}</td>
                    <td className="wx-num">{r.bold ? '1.023865546' : '1'}</td>
                    <td />
                    <td />
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="wx-sheettabs">
          <span className="wx-tabnav">
            <Plus size={10} />
          </span>
          {['Sheet1', 'Sheet2', 'Sheet3'].map((t, i) => (
            <span key={t} className={i === 0 ? 'wx-sheettab is-active' : 'wx-sheettab'}>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Ready</span>
          <span>Count: 8</span>
          <span>Sum: 0.1</span>
        </>
      }
      right={
        <>
          <span>100%</span>
        </>
      }
    />
  </div>
)

/* ============================== 3. SLIDES ================================= */

const SlidePane: React.FC<{ item: (typeof SLIDE_DECK)[number] }> = ({ item }) => (
  <div className={`wx-slide wx-slide-${item.kind}`}>
    {item.kind === 'title' && (
      <>
        <div className="wx-sl-kicker">{item.kicker}</div>
        <div className="wx-sl-h1">{item.heading}</div>
        <div className="wx-sl-sub">{item.sub}</div>
      </>
    )}
    {item.kind === 'bullets' && (
      <>
        <div className="wx-sl-kicker">{item.kicker}</div>
        <div className="wx-sl-h2">{item.heading}</div>
        <ul className="wx-sl-ul">
          {item.bullets?.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      </>
    )}
    {item.kind === 'columns' && (
      <>
        <div className="wx-sl-kicker">{item.kicker}</div>
        <div className="wx-sl-h2">{item.heading}</div>
        <div className="wx-sl-cols">
          {item.columns?.map((c) => (
            <div key={c.title} className="wx-sl-col">
              <div className="wx-sl-col-t">{c.title}</div>
              <div className="wx-sl-col-b">{c.body}</div>
            </div>
          ))}
        </div>
      </>
    )}
    {item.kind === 'flow' && (
      <>
        <div className="wx-sl-kicker">{item.kicker}</div>
        <div className="wx-sl-h2">{item.heading}</div>
        <div className="wx-sl-flow">
          {item.flow?.map((f, i) => (
            <React.Fragment key={f}>
              <span className="wx-sl-node">{f}</span>
              {i < (item.flow?.length ?? 0) - 1 && <ArrowRight size={10} className="wx-sl-arrow" />}
            </React.Fragment>
          ))}
        </div>
      </>
    )}
    {item.kind === 'metrics' && (
      <>
        <div className="wx-sl-kicker">{item.kicker}</div>
        <div className="wx-sl-h2">{item.heading}</div>
        <div className="wx-sl-metrics">
          {item.metrics?.map((m) => (
            <div key={m.l} className="wx-sl-metric">
              <div className="wx-sl-mv">{m.v}</div>
              <div className="wx-sl-ml">{m.l}</div>
            </div>
          ))}
        </div>
      </>
    )}
    {item.kind === 'closing' && (
      <>
        <div className="wx-sl-h1">{item.heading}</div>
        <div className="wx-sl-sub">{item.sub}</div>
      </>
    )}
  </div>
)

const SlidesCanvas: React.FC<{ module: AppModule }> = () => {
  const active = SLIDE_DECK[2]
  return (
    <div className="wx-app">
      <WindowBar active="The Problem.pptx" accent="#d33922" />
      <MenuTabs
        app="Slides"
        accent="#d33922"
        tabs={[
          'File',
          'Home',
          'Insert',
          'Draw',
          'Design',
          'Transitions',
          'Animations',
          'Slide Show',
          'Review',
          'View',
        ]}
        active={1}
      />
      <div className="wx-ribbon">
        <RGroup label="Clipboard">
          <RBtn icon={<ClipboardPaste size={15} />} label="Paste" big />
        </RGroup>
        <RGroup label="Slides">
          <RBtn icon={<Plus size={14} />} label="New Slide" big />
          <div className="wx-rcol">
            <RSelect w={70}>Layout</RSelect>
            <RSelect w={70}>Reset</RSelect>
          </div>
        </RGroup>
        <RGroup label="Font">
          <div className="wx-rcol">
            <RSelect w={74}>Calibri</RSelect>
            <RSelect w={32}>18</RSelect>
          </div>
          <RBtn icon={<Bold size={13} />} active />
          <RBtn icon={<Italic size={13} />} />
          <RBtn icon={<Underline size={13} />} />
          <RBtn icon={<Highlighter size={13} />} />
        </RGroup>
        <RGroup label="Paragraph">
          <RBtn icon={<AlignLeft size={13} />} />
          <RBtn icon={<AlignCenter size={13} />} />
          <RBtn icon={<List size={13} />} />
          <RBtn icon={<Indent size={13} />} />
        </RGroup>
        <RGroup label="Drawing">
          <RBtn icon={<Square size={13} />} />
          <RBtn icon={<Circle size={13} />} />
          <RBtn icon={<Minus size={13} />} />
          <RBtn icon={<ArrowLeftRight size={13} />} />
        </RGroup>
        <RGroup label="Editing">
          <RBtn icon={<Search size={14} />} label="Find" big />
        </RGroup>
      </div>
      <div className="wx-body">
        <AiRail
          prompt="Generate a deck, or ask anything"
          quick={[
            'Collected questionnaire answers',
            'Auto-generated 6-8 pages',
            'All 6 rich slides are generated and on the canvas. Here is what to build:',
          ]}
          bullets={[
            'Nestly — Seed Pitch 2025 (clean minimalist white + coral accent, mint highlights)',
            'The Problem — 3-column cards (fragmentation, $130B energy waste, 68% feature abandonment)',
            'The Solution — 2-column with a smart-home stack diagram (Nestly Hub orchestrating HVAC, lights, solar, EV, security, sensors)',
            'The Product — hero product visual + 3 feature blocks (unified control, auto-pilot AI, on-device privacy)',
          ]}
          ask="Describe a change to this deck, or ask a question"
        />
        <div className="wx-slide-stage">
          <div className="wx-thumbrail wx-thumbrail-dark">
            {SLIDE_DECK.map((s) => (
              <div key={s.n} className="wx-thumbwrap">
                <span className="wx-thumbnum">{s.n}</span>
                <div className={s.n === active.n ? 'wx-thumb is-active' : 'wx-thumb'}>
                  <SlidePane item={s} />
                </div>
              </div>
            ))}
          </div>
          <div className="wx-slide-main">
            <div className="wx-slide-frame">
              <SlidePane item={active} />
            </div>
          </div>
        </div>
      </div>
      <StatusBar
        left={
          <>
            <span>Slide 3 of 6</span>
            <span>English (US)</span>
            <span className="wx-note">Notes off</span>
          </>
        }
        right={
          <>
            <span>Fit</span>
            <span>7.5%</span>
          </>
        }
      />
    </div>
  )
}

/* =============================== 4. PDF =================================== */

const PdfCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="Aurora Home — Product Brief" accent="#ef4444" />
    <MenuTabs
      app="PDF"
      accent="#ef4444"
      tabs={['File', 'Home', 'View', 'Annotations', 'Form', 'Protect', 'Tools']}
      active={1}
    />
    <div className="wx-ribbon">
      <RGroup label="Page display">
        <RBtn icon={<BookOpen size={14} />} label="Thumbnail" big active />
        <RBtn icon={<List size={14} />} label="Outline" big />
        <RBtn icon={<Search size={14} />} label="Search" big />
        <RBtn icon={<Layers size={14} />} label="Two pages" big />
        <RBtn icon={<MonitorPlay size={14} />} label="Night mode" big />
      </RGroup>
      <RGroup label="Zoom">
        <div className="wx-rcol">
          <RSelect w={54}>1</RSelect>
          <span className="wx-zoomline">of 144%</span>
        </div>
        <RBtn icon={<ZoomIn size={13} />} />
        <RBtn icon={<ZoomOut size={13} />} />
        <RBtn label="Fit width" big />
        <RBtn label="Fit page" big />
      </RGroup>
      <RGroup label="Annotate">
        <RBtn icon={<Highlighter size={13} />} label="Highlight" big />
        <RBtn icon={<Underline size={13} />} label="Underline" big />
        <RBtn icon={<Minus size={13} />} label="Strikethrough" big />
        <RBtn icon={<PenTool size={13} />} label="Draw" big />
        <RBtn icon={<Square size={13} />} label="Rectangle" big />
        <RBtn icon={<Circle size={13} />} label="Ellipse" big />
        <RBtn icon={<ArrowRight size={13} />} label="Arrow" big />
        <RBtn icon={<Type size={13} />} label="Note" big />
        <RBtn icon={<Type size={13} />} label="Sign" big />
      </RGroup>
      <RGroup label="Colour">
        <span className="wx-swatches">
          {['#111827', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#8b5cf6'].map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Gemspark"
        quick={[
          'Lighting: Scenes, schedules, adaptive brightness → Circadian presets',
          'Climate: Multi-zone thermostat control → Humidity balancing',
          'Security: Door/window sensors, local alerts → Camera clip storage',
          'Platform: Matter 1.3, offline automations → Energy dashboard',
        ]}
        bullets={[
          'Risks (3): Matter certification lead times are the main schedule risk. Fallback: ship the EU SKU two weeks after US launch. Secondary MCU supply confirmed through Q1 next year.',
          'Open Decisions (4): Final EU pricing is EUR 579 (USD 772) — this will preserve the 42% target margin. Retail channel mix is pending the September planning review.',
        ]}
        ask="Ask about this PDF. Add to a note"
      />
      <div className="wx-canvas wx-canvas-pdf">
        <div className="wx-pdfpage">
          <div className="wx-pdf-rail">
            <div className="wx-pdf-mini is-active">
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="wx-pdf-mini">
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="wx-pdf-sheet">
            <h1>Aurora Home — Product Brief</h1>
            <div className="wx-pdf-meta">Rev 1.4 · Product Team · For internal review</div>
            <h2>1. Overview</h2>
            <p>
              Aurora Home is a matter-native hub that unifies lighting, climate and security devices
              under a single local-first controller. This brief summarizes the launch scope for the
              Q3 release and the open decisions that require sign-off.
            </p>
            <div className="wx-pdf-quote">
              Launch target: September 15 · Hardware freeze: August 8 · Firmware RC: August 29
            </div>
            <h2>2. Launch scope</h2>
            <table className="wx-pdf-table">
              <thead>
                <tr>
                  <th>Area</th>
                  <th>Committed</th>
                  <th>Stretch</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Lighting</td>
                  <td>Scenes, schedules, adaptive brightness</td>
                  <td>Circadian presets</td>
                </tr>
                <tr>
                  <td>Climate</td>
                  <td>Multi-zone thermostat control</td>
                  <td>Humidity balancing</td>
                </tr>
                <tr>
                  <td>Security</td>
                  <td>Door/window sensors, local alerts</td>
                  <td>Camera clip storage</td>
                </tr>
                <tr>
                  <td>Platform</td>
                  <td>Matter 1.3, offline automations</td>
                  <td>Energy dashboard</td>
                </tr>
              </tbody>
            </table>
            <h2>3. Risks</h2>
            <p>
              Matter certification lead times are the main schedule risk. Nothing leaves the device
              unless the user explicitly enables remote access.
            </p>
          </div>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Page 1 of 1</span>
          <span>1 / 1</span>
          <span className="wx-note">No annotations yet</span>
        </>
      }
      right={
        <>
          <span>146%</span>
          <span>Fit width</span>
        </>
      }
    />
  </div>
)

/* ============================ 5. MARKDOWN ================================= */

const MarkdownCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="test.docx" accent="#8b5cf6" />
    <MenuTabs
      app="Markdown"
      accent="#8b5cf6"
      tabs={['File', 'Home', 'Insert', 'Format', 'View', 'Export']}
      active={4}
    />
    <div className="wx-ribbon">
      <RGroup label="File">
        <RBtn icon={<Save size={15} />} label="Save" big />
      </RGroup>
      <RGroup label="Blocks">
        <RBtn icon={<Type size={14} />} label="Heading" big />
        <RBtn icon={<Bold size={13} />} />
        <RBtn icon={<Italic size={13} />} />
        <RBtn icon={<Link2 size={13} />} />
        <RBtn icon={<Table size={13} />} />
      </RGroup>
      <RGroup label="Mode">
        <span className="wx-modeswitch">
          <span className="is-on">Split</span>
          <span>Rich</span>
          <span>Source</span>
        </span>
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Documentation assistant"
        quick={['Explain this section', 'Add a sequence diagram', 'Tighten the prose']}
        bullets={[
          'Block tree stays in sync with plain text in both directions',
          '120+ languages highlighted, KaTeX and Mermaid inline',
        ]}
        ask="Ask about this document"
      />
      <div className="wx-canvas wx-canvas-md">
        <div className="wx-mdpane">
          <div className="wx-mdpane-head">
            <span>Distributed_Systems_Spec.md</span>
            <span>UTF-8 · LF</span>
          </div>
          <div className="wx-mdcode">
            {MARKDOWN_SOURCE.map((line, i) => (
              <div key={i} className="wx-mdline">
                <span className="wx-mdnum">{i + 1}</span>
                <span className={`wx-mdtok wx-mdtok-${line.k}`}>{line.t || '\u00A0'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="wx-mdpane">
          <div className="wx-mdpane-head">
            <span>Rich block preview</span>
            <span>Updated live</span>
          </div>
          <div className="wx-mdpreview">
            <h1>Consensus Protocols</h1>
            <p>
              ReveLith syncs document state with a <strong>delta patch log</strong>. Every replica
              converges without a coordinator.
            </p>
            <h2>Implementation</h2>
            <ul className="wx-mdchecks">
              <li className="is-done">Block-level three-way merge</li>
              <li className="is-done">Deterministic patch ordering</li>
              <li>Conflict UI for divergent vectors</li>
            </ul>
            <pre className="wx-mdpre">
              <code>
                {
                  'pub fn apply_delta(\n    doc: &mut Document,\n    patch: &Delta,\n) -> Result<(), Error> {\n    doc.nodes.update(patch)?;\n    Ok(())\n}'
                }
              </code>
            </pre>
          </div>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Ln 12, Col 26</span>
          <span>1,148 words</span>
          <span>Rust</span>
        </>
      }
      right={
        <>
          <span>Spaces: 2</span>
          <span>UTF-8</span>
        </>
      }
    />
  </div>
)

/* ============================== 6. HTML =================================== */

const HTML_SOURCE = [
  '<!doctype html>',
  '<section class="release">',
  '  <h2 class="release__title">0.10.100</h2>',
  '  <p class="release__lede">',
  '    Draw, Forms and Tasks are now part of the suite.',
  '  </p>',
  '  <ul class="release__list">',
  '    <li>Nine native editors</li>',
  '    <li>Single-file HTML export</li>',
  '  </ul>',
  '</section>',
]

const HtmlCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="Aurora Home — Product Brief" accent="#e34f26" />
    <MenuTabs
      app="HTML"
      accent="#e34f26"
      tabs={['File', 'Edit', 'Markup', 'Insert', 'Preview', 'Export']}
      active={2}
    />
    <div className="wx-ribbon">
      <RGroup label="File">
        <RBtn icon={<Save size={15} />} label="Save" big />
      </RGroup>
      <RGroup label="Markup">
        <span className="wx-tagchip">&lt;div&gt;</span>
        <span className="wx-tagchip">&lt;section&gt;</span>
        <span className="wx-tagchip">&lt;ul&gt;</span>
        <RBtn icon={<Type size={14} />} label="Text" big />
      </RGroup>
      <RGroup label="Assets">
        <RBtn icon={<ImageIcon size={14} />} label="Image" big />
        <RBtn icon={<Link2 size={14} />} label="Link" big />
      </RGroup>
      <RGroup label="Output">
        <RBtn icon={<MonitorPlay size={14} />} label="Present" big />
        <RBtn icon={<Download size={14} />} label="Single file" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Page assistant"
        quick={['Turn into two columns', 'Add a favicon', 'Check accessibility']}
        bullets={[
          'Preview renders over an internal protocol',
          'Local assets are copied, MIME-checked and written atomically',
        ]}
        ask="Ask about this page"
      />
      <div className="wx-canvas wx-canvas-md">
        <div className="wx-mdpane">
          <div className="wx-mdpane-head">
            <span>Release_Notes_Page.html</span>
            <span>UTF-8 · source of truth</span>
          </div>
          <div className="wx-mdcode">
            {HTML_SOURCE.map((line, i) => (
              <div key={i} className="wx-mdline">
                <span className="wx-mdnum">{i + 1}</span>
                <span className="wx-mdtok wx-mdtok-tag">{line}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="wx-mdpane">
          <div className="wx-mdpane-head">
            <span>Live preview</span>
            <span className="wx-live">
              <i /> Sandboxed
            </span>
          </div>
          <div className="wx-htmlpreview">
            <article className="wx-htmlcard">
              <div className="wx-htmlh2">0.10.100</div>
              <p>Draw, Forms and Tasks are now part of the suite.</p>
              <ul>
                <li>Nine native editors</li>
                <li>Single-file HTML export</li>
              </ul>
            </article>
          </div>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Ln 7, Col 9</span>
          <span>HTML</span>
        </>
      }
      right={
        <>
          <span>Spaces: 2</span>
        </>
      }
    />
  </div>
)

/* ============================== 7. DRAW =================================== */

const DrawCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="test.docx" accent="#0ea5e9" />
    <MenuTabs
      app="AI Draw"
      accent="#0ea5e9"
      tabs={['File', 'Edit', 'Arrange', 'Style', 'View', 'Export', 'AI']}
      active={2}
    />
    <div className="wx-ribbon">
      <RGroup label="File">
        <RBtn icon={<Save size={15} />} label="Save" big />
      </RGroup>
      <RGroup label="Tools">
        <RBtn icon={<MousePointer2 size={14} />} active />
        <RBtn icon={<Square size={14} />} />
        <RBtn icon={<Circle size={14} />} />
        <RBtn icon={<Minus size={14} />} />
        <RBtn icon={<PenTool size={14} />} />
        <RBtn icon={<Type size={14} />} />
        <RBtn icon={<Eraser size={14} />} />
        <RBtn icon={<Frame size={14} />} />
      </RGroup>
      <RGroup label="Arrange">
        <RBtn icon={<AlignLeft size={14} />} label="Align" big />
        <RBtn icon={<Layers size={14} />} label="Group" big />
        <RBtn icon={<Grid3x3 size={14} />} label="Distribute" big />
      </RGroup>
      <RGroup label="View">
        <RBtn icon={<Grid3x3 size={14} />} label="Grid" big />
        <RBtn icon={<ZoomIn size={13} />} />
        <RBtn icon={<ZoomOut size={13} />} />
      </RGroup>
      <RGroup label="Export">
        <RBtn icon={<ImageIcon size={14} />} label="PNG" big />
        <RBtn icon={<FileText size={14} />} label="SVG" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="Gemspark"
        quick={['Summarise board', 'Neaten layout', 'Add labels']}
        bullets={[
          'Arranged 4 nodes, aligned 9 labels and grouped the legend',
          'No user-placed annotations were moved',
        ]}
        ask="Describe a change, or ask a question"
      />
      <div className="wx-canvas wx-canvas-draw">
        <div className="wx-board">
          <span className="wx-board-grid" />
          <div className="wx-node wx-node-a">Client</div>
          <span className="wx-edge wx-edge-1" />
          <div className="wx-node wx-node-b">Gateway</div>
          <span className="wx-edge wx-edge-2" />
          <div className="wx-node wx-node-c is-selected">Service</div>
          <span className="wx-edge wx-edge-3" />
          <div className="wx-node wx-node-d">Store</div>
          <div className="wx-frame">
            <div className="wx-frame-label">Legend</div>
            <span className="wx-chip wx-chip-a">request</span>
            <span className="wx-chip wx-chip-b">async</span>
          </div>
          <div className="wx-board-tools">
            <MousePointer2 size={13} />
            <Square size={13} />
            <Circle size={13} />
            <Minus size={13} />
            <PenTool size={13} />
            <Type size={13} />
            <Eraser size={13} />
            <Frame size={13} />
          </div>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>100%</span>
          <span>Grid on</span>
          <span>Snap on</span>
        </>
      }
      right={
        <>
          <span>PNG / SVG / .draw</span>
          <span>30 s autosave</span>
        </>
      }
    />
  </div>
)

/* ============================= 8. FORMS =================================== */

const FORM_FIELDS = [
  ['Full name', 'short'],
  ['Work email', 'short'],
  ['Handles personal data?', 'choice'],
  ['DPA reference', 'short'],
  ['Signature', 'file'],
  ['Country', 'country'],
  ['Start date', 'date'],
  ['Additional notes', 'long'],
]

const FormsCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="Aurora Home — Product Brief" accent="#d97706" />
    <MenuTabs
      app="AI Forms"
      accent="#d97706"
      tabs={['File', 'Edit', 'Insert', 'Logic', 'Preview', 'Collect']}
      active={3}
    />
    <div className="wx-ribbon">
      <RGroup label="File">
        <RBtn icon={<Save size={15} />} label="Save" big />
      </RGroup>
      <RGroup label="Add field">
        <RBtn icon={<Type size={14} />} label="Text" big />
        <RBtn icon={<List size={14} />} label="Choice" big />
        <RBtn icon={<FileText size={14} />} label="File" big />
      </RGroup>
      <RGroup label="Logic">
        <RBtn icon={<ArrowRight size={14} />} label="Branch" big />
        <RBtn icon={<Sparkles size={14} />} label="AI edit" big />
      </RGroup>
      <RGroup label="Collect">
        <RBtn icon={<MonitorPlay size={14} />} label="Preview" big />
        <RBtn icon={<Download size={14} />} label="Offline HTML" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <div className="wx-rail wx-rail-fields">
        <div className="wx-rail-head">
          <Sparkles size={12} />
          <b>AI Forms</b>
        </div>
        <p className="wx-rail-lede">
          Add a DPA reference field that only appears when the vendor handles personal data.
        </p>
        <div className="wx-rail-answer">
          <p>
            <span className="wx-rail-dot" />
            Added one conditional field and one visibility rule; no other questions were modified.
          </p>
        </div>
        <div className="wx-rail-divider" />
        <div className="wx-fieldlist">
          {FORM_FIELDS.map(([t, k], i) => (
            <div key={t} className={i === 3 ? 'wx-fielditem is-selected' : 'wx-fielditem'}>
              <span className="wx-fieldgrip" />
              <span className="wx-fieldname">{t}</span>
              <span className="wx-fieldtype">{k}</span>
            </div>
          ))}
        </div>
        <div className="wx-rail-ask">
          <span>Describe a change…</span>
          <Send size={11} />
        </div>
      </div>
      <div className="wx-canvas wx-canvas-form">
        <div className="wx-formcard">
          <div className="wx-formsec">Section 2 — Compliance</div>
          <div className="wx-formq">
            <span>Handles personal data?</span>
            <span className="wx-ctl">
              <i>Yes</i>
              <i className="is-on">No</i>
            </span>
          </div>
          <div className="wx-formq is-cond">
            <span>DPA reference</span>
            <span className="wx-input" />
            <span className="wx-condtag">
              <ArrowRight size={9} /> shown when Yes
            </span>
          </div>
          <div className="wx-formq">
            <span>Signature</span>
            <span className="wx-sign">Sign here</span>
          </div>
          <div className="wx-formq">
            <span>Country</span>
            <span className="wx-input" />
          </div>
        </div>
        <div className="wx-logicpanel">
          <div className="wx-panellabel">Logic</div>
          <div className="wx-rule">
            <div className="wx-rule-h">Show field</div>
            <div className="wx-rule-b">DPA reference</div>
          </div>
          <div className="wx-rule">
            <div className="wx-rule-h">When</div>
            <div className="wx-rule-b">Handles personal data = Yes</div>
          </div>
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>8 fields</span>
          <span>1 rule</span>
          <span>Schema v1</span>
        </>
      }
      right={
        <>
          <span>14+ field types</span>
          <span>9 languages</span>
        </>
      }
    />
  </div>
)

/* ============================= 9. TASKS =================================== */

const TASK_COLUMNS = [
  {
    name: 'Backlog',
    cards: [
      ['ENG-21', 'Ribbon icons', 'low'],
      ['ENG-24', 'Board templates', 'low'],
      ['ENG-27', 'Saved view badges', 'low'],
    ],
  },
  {
    name: 'In progress',
    wip: 3,
    cards: [
      ['ENG-14', 'Preview protocol', 'high'],
      ['ENG-18', 'Asset MIME checks', 'med'],
    ],
  },
  {
    name: 'Review',
    cards: [
      ['ENG-11', 'Offline export', 'med'],
      ['ENG-09', 'Signature checks', 'low'],
    ],
  },
  {
    name: 'Done',
    cards: [
      ['ENG-08', 'Atomic writes', 'low'],
      ['ENG-06', 'Single-file export', 'low'],
      ['ENG-04', 'Board import', 'low'],
    ],
  },
]

const TasksCanvas: React.FC<{ module: AppModule }> = () => (
  <div className="wx-app">
    <WindowBar active="test.docx" accent="#16a34a" />
    <MenuTabs
      app="AI Tasks"
      accent="#16a34a"
      tabs={['File', 'Edit', 'Board', 'View', 'Filter', 'AI']}
      active={2}
    />
    <div className="wx-ribbon">
      <RGroup label="File">
        <RBtn icon={<Save size={15} />} label="Save" big />
      </RGroup>
      <RGroup label="Board">
        <RBtn icon={<Plus size={14} />} label="Task" big />
        <RBtn icon={<Table size={14} />} label="Column" big />
      </RGroup>
      <RGroup label="View">
        <RSelect w={72}>Board</RSelect>
        <RBtn icon={<BookOpen size={14} />} label="Saved view" big />
      </RGroup>
      <RGroup label="AI">
        <RBtn icon={<MessageSquare size={14} />} label="Ask board" big />
      </RGroup>
    </div>
    <div className="wx-body">
      <AiRail
        prompt="AI Tasks"
        quick={['What is blocked?', 'This week', 'Summarise']}
        bullets={[
          'Found 1 blocking relation (ENG-14 → ENG-18)',
          '2 overdue cards sitting in Review',
        ]}
        ask="Ask about this board"
      />
      <div className="wx-canvas wx-canvas-tasks">
        <div className="wx-boardcols">
          {TASK_COLUMNS.map((col) => (
            <div key={col.name} className="wx-column">
              <div className="wx-column-head">
                <span>{col.name}</span>
                {col.wip && <span className="wx-wip">WIP {col.wip}</span>}
                <span className="wx-count">{col.cards.length}</span>
              </div>
              {col.cards.map(([id, title, pri]) => (
                <div key={id} className="wx-card">
                  <div className="wx-card-top">
                    <span className="wx-ticket">{id}</span>
                    <span className={`wx-pri wx-pri-${pri}`} />
                  </div>
                  <div className="wx-card-title">{title}</div>
                </div>
              ))}
              {col.name === 'In progress' && (
                <div className="wx-blocked">
                  <Link2 size={9} /> ENG-14 blocks ENG-18
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
    <StatusBar
      left={
        <>
          <span>Unlimited projects</span>
          <span>4 relation types</span>
          <span>Local only</span>
        </>
      }
      right={
        <>
          <span>ENG</span>
        </>
      }
    />
  </div>
)

/* ------------------------------- registry --------------------------------- */

const CANVASES: Record<string, React.FC<{ module: AppModule }>> = {
  docs: DocsCanvas,
  sheets: SheetsCanvas,
  slides: SlidesCanvas,
  pdf: PdfCanvas,
  markdown: MarkdownCanvas,
  html: HtmlCanvas,
  draw: DrawCanvas,
  forms: FormsCanvas,
  tasks: TasksCanvas,
}

/**
 * Real captures of each engine, taken from the running ReveLith desktop app
 * (Windows build 0.10.100) after driving it with a real AI prompt. These are
 * screenshots, not mockups — files live at `public/apps/<module id>.webp`.
 *
 * Served as 1500px-wide WebP (0.68 MB for all nine) rather than the original
 * 1916px PNGs (1.82 MB). The frame renders ~1075px wide, so 1500px keeps it
 * sharp on 1.4x displays with far less to decode while scrolling.
 *
 * If a capture is missing or fails to load, the synthetic canvas is used
 * instead, so the showcase can never render an empty frame.
 */
export const AppCanvas: React.FC<{ module: AppModule }> = ({ module }) => {
  const [failed, setFailed] = React.useState(false)

  if (failed) {
    const Canvas = CANVASES[module.id] ?? DocsCanvas
    return <Canvas module={module} />
  }

  return (
    <img
      className="wx-shot"
      src={`/apps/${module.id}.webp`}
      alt={`ReveLith ${module.name} — ${module.tagline}`}
      width={1500}
      height={806}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
    />
  )
}

export default AppCanvas
