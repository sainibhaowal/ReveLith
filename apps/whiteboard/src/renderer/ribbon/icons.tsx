// ReveLith Drawboard — ribbon icon set (same icon-over-label pattern as docs).
// Stroke icons that inherit the surrounding text color in both themes.
import type { ReactNode } from 'react'

function Svg({ size = 24, children }: { size?: number; children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

type P = { size?: number }

export const IconNew = ({ size }: P) => (
  <Svg size={size}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /><path d="M12 13v6M9 16h6" /></Svg>
)
export const IconOpen = ({ size }: P) => (
  <Svg size={size}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Svg>
)
export const IconSave = ({ size }: P) => (
  <Svg size={size}><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M8 3v5h7V3" /><rect x="8" y="13" width="8" height="8" rx="1" /></Svg>
)
export const IconSaveAs = ({ size }: P) => (
  <Svg size={size}><path d="M5 3h11l3 3v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M8 3v5h7V3" /><path d="M15 16l2 2 4-4" /></Svg>
)
export const IconImport = ({ size }: P) => (
  <Svg size={size}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 19h16" /></Svg>
)
export const IconExport = ({ size }: P) => (
  <Svg size={size}><path d="M12 15V3" /><path d="M7 8l5-5 5 5" /><path d="M4 19h16" /></Svg>
)
export const IconCopy = ({ size }: P) => (
  <Svg size={size}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></Svg>
)
export const IconUndo = ({ size }: P) => (
  <Svg size={size}><path d="M8 5L3 10l5 5" /><path d="M3 10h11a6 6 0 0 1 0 12h-3" /></Svg>
)
export const IconRedo = ({ size }: P) => (
  <Svg size={size}><path d="M16 5l5 5-5 5" /><path d="M21 10H10a6 6 0 0 0 0 12h3" /></Svg>
)
export const IconSelectAll = ({ size }: P) => (
  <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2" /><path d="M9 12l2 2 4-4" /></Svg>
)
export const IconReview = ({ size }: P) => (
  <Svg size={size}><path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M15 3v5h4" /><path d="M9 13l2 2 4-4M9 18h6" /></Svg>
)
export const IconDeselect = ({ size }: P) => (
  <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="2" strokeDasharray="3 2" /><path d="M9 9l6 6M15 9l-6 6" /></Svg>
)
export const IconDuplicate = ({ size }: P) => (
  <Svg size={size}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></Svg>
)
export const IconDelete = ({ size }: P) => (
  <Svg size={size}><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></Svg>
)
export const IconClear = ({ size }: P) => (
  <Svg size={size}><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M9 9l6 6M15 9l-6 6" /></Svg>
)
export const IconFront = ({ size }: P) => (
  <Svg size={size}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" strokeOpacity={0.45} /><path d="M12 3l9 5-9 5-9-5z" fill="currentColor" fillOpacity={0.18} stroke="none" /></Svg>
)
export const IconForward = ({ size }: P) => (
  <Svg size={size}><path d="M12 19V8" /><path d="M7 13l5-5 5 5" /><path d="M4 4h16" strokeOpacity={0.45} /></Svg>
)
export const IconBackward = ({ size }: P) => (
  <Svg size={size}><path d="M12 5v11" /><path d="M7 11l5 5 5-5" /><path d="M4 20h16" strokeOpacity={0.45} /></Svg>
)
export const IconBack = ({ size }: P) => (
  <Svg size={size}><path d="M12 3l9 5-9 5-9-5z" strokeOpacity={0.45} /><path d="M3 13l9 5 9-5" /><path d="M3 13l9 5 9-5" fill="currentColor" fillOpacity={0.18} stroke="none" /></Svg>
)
function AlignGlyph({ dir }: { dir: 'left' | 'centerX' | 'right' | 'top' | 'middle' | 'bottom' }) {
  const vertical = dir === 'left' || dir === 'centerX' || dir === 'right';
  const bar = vertical
    ? dir === 'left' ? <path d="M5 4v16" /> : dir === 'right' ? <path d="M19 4v16" /> : <path d="M12 4v16" strokeDasharray="2 2" />
    : dir === 'top' ? <path d="M4 5h16" /> : dir === 'bottom' ? <path d="M4 19h16" /> : <path d="M4 12h16" strokeDasharray="2 2" />;
  const box =
    dir === 'left' ? <rect x="7" y="9" width="9" height="6" rx="1" /> :
    dir === 'right' ? <rect x="8" y="9" width="9" height="6" rx="1" /> :
    dir === 'centerX' ? <rect x="8" y="9" width="8" height="6" rx="1" /> :
    dir === 'top' ? <rect x="9" y="7" width="6" height="9" rx="1" /> :
    dir === 'bottom' ? <rect x="9" y="8" width="6" height="9" rx="1" /> :
    <rect x="9" y="8" width="6" height="8" rx="1" />;
  return (<>{bar}{box}</>);
}
export const IconAlignLeft = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="left" /></Svg>);
export const IconAlignCenterX = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="centerX" /></Svg>);
export const IconAlignRight = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="right" /></Svg>);
export const IconAlignTop = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="top" /></Svg>);
export const IconAlignMiddle = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="middle" /></Svg>);
export const IconAlignBottom = ({ size }: P) => (<Svg size={size}><AlignGlyph dir="bottom" /></Svg>);
export const IconDistributeH = ({ size }: P) => (
  <Svg size={size}><rect x="3" y="9" width="4" height="6" rx="1" /><rect x="10" y="9" width="4" height="6" rx="1" /><rect x="17" y="9" width="4" height="6" rx="1" /><path d="M7 6v2M14 6v2M14 16v2M7 16v2" strokeOpacity={0.6} /></Svg>
)
export const IconDistributeV = ({ size }: P) => (
  <Svg size={size}><rect x="9" y="3" width="6" height="4" rx="1" /><rect x="9" y="10" width="6" height="4" rx="1" /><rect x="9" y="17" width="6" height="4" rx="1" /><path d="M6 5h2M6 19h2M16 5h2M16 19h2" strokeOpacity={0.6} /></Svg>
)
export const IconGroup = ({ size }: P) => (
  <Svg size={size}><rect x="3" y="3" width="18" height="18" rx="2" strokeDasharray="3 2" /><rect x="7" y="9" width="5" height="5" rx="1" /><rect x="12" y="10" width="5" height="5" rx="1" /></Svg>
)
export const IconUngroup = ({ size }: P) => (
  <Svg size={size}><rect x="7" y="9" width="5" height="5" rx="1" /><rect x="12" y="10" width="5" height="5" rx="1" /><path d="M4 4l3 3M20 4l-3 3M4 20l3-3M20 20l-3-3" /></Svg>
)
export const IconLock = ({ size }: P) => (
  <Svg size={size}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Svg>
)
export const IconUnlock = ({ size }: P) => (
  <Svg size={size}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 7.5-2" /></Svg>
)
export const IconFlipH = ({ size }: P) => (
  <Svg size={size}><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7L4 12l5 5z" /><path d="M15 7l5 5-5 5z" /></Svg>
)
export const IconFlipV = ({ size }: P) => (
  <Svg size={size}><path d="M3 12h18" strokeDasharray="2 2" /><path d="M7 9l5-5 5 5z" /><path d="M7 15l5 5 5-5z" /></Svg>
)
export const IconZoomIn = ({ size }: P) => (
  <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M11 8v6M8 11h6" /></Svg>
)
export const IconZoomOut = ({ size }: P) => (
  <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M8 11h6" /></Svg>
)
export const IconZoom100 = ({ size }: P) => (
  <Svg size={size}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /><path d="M9.5 9.5h.01M9.5 12.5h3M9.5 12.5v-3l1.5 1.5L9.5 12.5z" strokeWidth={2.2} /></Svg>
)
export const IconFit = ({ size }: P) => (
  <Svg size={size}><path d="M4 9V4h5" /><path d="M15 4h5v5" /><path d="M20 15v5h-5" /><path d="M9 20H4v-5" /></Svg>
)
export const IconGrid = ({ size }: P) => (
  <Svg size={size}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9.3h16M4 14.6h16M9.3 4v16M14.6 4v16" /></Svg>
)
export const IconSnap = ({ size }: P) => (
  <Svg size={size}><path d="M6 4v7a6 6 0 0 0 12 0V4" /><path d="M6 4h4v5H6zM14 4h4v5h-4z" /></Svg>
)
export const IconPresent = ({ size }: P) => (
  <Svg size={size}><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M10 10.5l4 1.5-4 1.5z" fill="currentColor" stroke="none" /><path d="M9 21h6" /></Svg>
)
export const IconImage = ({ size }: P) => (
  <Svg size={size}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M4 17l5-4 3 3 3-2 5 4" /></Svg>
)
export const IconFileSvg = ({ size }: P) => (
  <Svg size={size}><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v5h4" /><path d="M8 13l-2 2 2 2M16 13l2 2-2 2M13.5 12l-3 6" /></Svg>
)
export const IconBoardFile = ({ size }: P) => (
  <Svg size={size}><path d="M6 3h8l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M14 3v5h4" /><path d="M8 12h8M8 16h8M8 19h5" /></Svg>
)
export const IconSun = ({ size }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></Svg>
)
export const IconMoon = ({ size }: P) => (
  <Svg size={size}><path d="M20 13.5A8 8 0 0 1 10.5 4 8 8 0 1 0 20 13.5z" /></Svg>
)
export const IconAuto = ({ size }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fillOpacity={0.25} stroke="none" /><circle cx="12" cy="12" r="8" /></Svg>
)
export const IconSettings = ({ size }: P) => (
  <Svg size={size}><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></Svg>
)
export const IconTrackChanges = ({ size }: P) => (
  <Svg size={size}><path d="M6 3h8l4 4v3M14 3v5h4" /><path d="M6 8v12a1 1 0 0 0 1 1h4" /><path d="M9 12h4M9 16h2" /><circle cx="17" cy="17" r="4" /><path d="M17 14.8v2.5l1.6 1" /></Svg>
)
export const IconSparkle = ({ size }: P) => (
  <Svg size={size}><path d="M12 3l1.7 4.6L18 9.3l-4.3 1.7L12 15.6l-1.7-4.6L6 9.3l4.3-1.7z" /><path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" /></Svg>
)
export const IconSummarize = ({ size }: P) => (
  <Svg size={size}><path d="M6.5 3.5h8l4 4V16" /><path d="M14.5 3.5v4h4" /><path d="M8 10h7M8 13h5" /><path d="M17 14.5l.55 1.45L19 16.5l-1.45.55L17 18.5l-.55-1.45L15 16.5l1.45-.55z" /><path d="M6 6.5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1" /></Svg>
)
export const IconFlowchart = ({ size }: P) => (
  <Svg size={size}><rect x="9" y="3" width="6" height="5" rx="1" /><rect x="3" y="16" width="6" height="5" rx="1" /><rect x="15" y="16" width="6" height="5" rx="1" /><path d="M12 8v4M6 12h12M6 12v4M18 12v4" /></Svg>
)
export const IconBrainstorm = ({ size }: P) => (
  <Svg size={size}><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.5 1.5M16.5 16.5 18 18M18 6l-1.5 1.5M7.5 16.5 6 18" /><path d="M12 7.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" /></Svg>
)
export const IconChat = ({ size }: P) => (
  <Svg size={size}><path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9l-5 4z" /></Svg>
)
export const IconReveLith = ({ size }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="1.8" /><ellipse cx="12" cy="12" rx="9" ry="3.8" /><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" /></Svg>
)
export const IconTextSize = ({ size }: P) => (
  <Svg size={size}><path d="M5 18V9M3 9h4" /><path d="M14 18v-9M11 9h6" /><path d="M3 9l2-5 2 5M11 9l2.5-6L16 9" /></Svg>
)
export const IconOpacity = ({ size }: P) => (
  <Svg size={size}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" fillOpacity={0.35} stroke="none" /></Svg>
)
export const IconStrokeWidth = ({ size }: P) => (
  <Svg size={size}><path d="M4 7h16" strokeWidth={1.2} /><path d="M4 12h16" strokeWidth={2.6} /><path d="M4 17h16" strokeWidth={4} /></Svg>
)
export const IconFont = ({ size }: P) => (
  <Svg size={size}><path d="M6 20V7M4 7h4" /><path d="M6 7l1.5-4L9 7" /><path d="M13 20v-9M11 11h6" /></Svg>
)
