import type { SVGProps } from 'react'

export type FormIconName =
  | 'new'
  | 'open'
  | 'save'
  | 'save-as'
  | 'undo'
  | 'redo'
  | 'polish'
  | 'format'
  | 'generate'
  | 'audit'
  | 'fields'
  | 'preview'
  | 'section'
  | 'page'
  | 'export'
  | 'settings'
  | 'sliders'
  | 'inbox-check'
  | 'calendar-clock'
  | 'branch'
  | 'test-run'
  | 'properties-panel'
  | 'chart'

const paths: Record<FormIconName, React.ReactNode> = {
  new: (
    <>
      <path d="M12 5v14M5 12h14" />
      <path d="M4 3h11l5 5v13H4z" />
    </>
  ),
  open: (
    <>
      <path d="M3 7V4h7l2 2h9v14H3z" />
      <path d="M3 11h18" />
    </>
  ),
  save: (
    <>
      <path d="M4 3h14l3 3v15H3V4a1 1 0 0 1 1-1Z" />
      <path d="M7 3v6h10V3M7 21v-8h10v8" />
    </>
  ),
  'save-as': (
    <>
      <path d="M4 3h13l4 4v5M7 3v6h9V3M7 21v-7h7" />
      <path d="m16 18 2 2 4-4" />
    </>
  ),
  undo: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 0 12h-2" />
    </>
  ),
  redo: (
    <>
      <path d="m15 14 5-5-5-5" />
      <path d="M20 9H10a6 6 0 0 0 0 12h2" />
    </>
  ),
  polish: (
    <>
      <path d="m15 4 5 5M4 20l8-8" />
      <path d="M14 3 3 14l7 7L21 10z" />
      <path d="m4 4 .7 2.3L7 7l-2.3.7L4 10l-.7-2.3L1 7l2.3-.7z" />
    </>
  ),
  format: (
    <>
      <path d="M4 6h16M4 12h10M4 18h13" />
      <path d="m18 10 3 3-3 3" />
    </>
  ),
  generate: (
    <>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8m7.2 7.2 2.8 2.8m0-12.8-2.8 2.8m-7.2 7.2-2.8 2.8" />
      <path d="M12 8v8m-4-4h8" />
    </>
  ),
  audit: (
    <>
      <path d="M9 4h6l2 2h4v15H3V6h4z" />
      <path d="m7 13 3 3 7-7" />
    </>
  ),
  fields: (
    <>
      <rect x="4" y="4" width="16" height="5" rx="1" />
      <rect x="4" y="12" width="16" height="8" rx="1" />
      <path d="M8 15h8M8 18h5" />
    </>
  ),
  preview: (
    <>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  section: (
    <>
      <path d="M4 5h16M4 10h10M4 15h16M4 20h10" />
      <path d="M17 9v4m-2-2h4" />
    </>
  ),
  page: (
    <>
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M14 3v5h5M9 13h7M9 17h7" />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5" />
      <path d="M4 17v4h16v-4" />
    </>
  ),
  settings: (
    <>
      <path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
      <path d="m19.4 15 .1.1 1.4 1.1-1.5 2.6-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-3l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.5-2.6 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.5-2.6 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h3l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.5 2.6-1.4 1.1a7 7 0 0 1-.1 1.7Z" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 6h5m4 0h7M4 12h9m4 0h3M4 18h2m4 0h10" />
      <circle cx="11" cy="6" r="2" />
      <circle cx="15" cy="12" r="2" />
      <circle cx="8" cy="18" r="2" />
    </>
  ),
  'inbox-check': (
    <>
      <path d="M4 4h16l1 11-4 5H7l-4-5 1-11Z" />
      <path d="M3.5 14h5l1.5 2h4l1.5-2h5" />
      <path d="m9 9 2 2 4-4" />
    </>
  ),
  'calendar-clock': (
    <>
      <rect x="3" y="5" width="15" height="16" rx="2" />
      <path d="M7 3v4M14 3v4M3 10h15" />
      <circle cx="17" cy="17" r="4" />
      <path d="M17 15v2l1.3 1" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="18" cy="7" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M6 7v9a2 2 0 0 0 2 2h8M8 5h4a4 4 0 0 1 4 4v7" />
    </>
  ),
  'test-run': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8 6 4-6 4z" />
      <path d="m4.5 5.5 1.4 1.4" />
    </>
  ),
  'properties-panel': (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16M12 8h6M12 12h6M12 16h4" />
      <circle cx="6" cy="8" r=".6" />
      <circle cx="6" cy="12" r=".6" />
      <circle cx="6" cy="16" r=".6" />
    </>
  ),
  chart: (
    <>
      <path d="M4 19V5M4 19h17" />
      <path d="m7 15 4-4 3 2 5-6" />
      <path d="M17 7h2v2" />
    </>
  ),
}

export function FormIcon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: FormIconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {paths[name]}
    </svg>
  )
}
