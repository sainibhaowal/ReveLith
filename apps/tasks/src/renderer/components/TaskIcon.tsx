import type { SVGProps } from 'react'

export type TaskIconName =
  | 'activity'
  | 'archive'
  | 'ai'
  | 'backlog'
  | 'board'
  | 'calendar'
  | 'columns'
  | 'download'
  | 'fields'
  | 'file'
  | 'folder-open'
  | 'gantt'
  | 'import'
  | 'keyboard'
  | 'list'
  | 'new'
  | 'people'
  | 'redo'
  | 'save'
  | 'save-as'
  | 'search'
  | 'settings'
  | 'share'
  | 'shortcuts'
  | 'tags'
  | 'undo'
  | 'views'

interface TaskIconProps extends SVGProps<SVGSVGElement> {
  name: TaskIconName
  size?: number
}

/** Small, distinct line icons for the Tasks ribbon. Each action gets a visual
 * cue that describes its job, while the shared ribbon supplies the suite-wide
 * typography, accent and spacing. */
export function TaskIcon({ name, size = 20, ...props }: TaskIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }

  switch (name) {
    case 'new':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'file':
      return <svg {...common}><path d="M6 3.5h8l4 4V20.5H6z" /><path d="M14 3.5v4h4M9 12h6M9 16h6" /></svg>
    case 'folder-open':
      return <svg {...common}><path d="M3.5 7.5h6l2 2h9v9.5h-17z" /><path d="m3.5 7.5 1.4 10.2h14.4l1.2-8.2H11l-2-2z" /></svg>
    case 'save':
      return <svg {...common}><path d="M5 3.5h12l2 2v15H5z" /><path d="M8 3.5v5h8v-5M8 20.5v-6h8v6" /></svg>
    case 'save-as':
      return <svg {...common}><path d="M5 3.5h12l2 2v15H5z" /><path d="M8 3.5v5h8v-5M8 20.5v-5h6" /><path d="M17 14v5M14.5 16.5H19.5" /></svg>
    case 'import':
      return <svg {...common}><path d="M12 3.5v11M8 10.5l4 4 4-4" /><path d="M5 14.5v5h14v-5" /></svg>
    case 'download':
      return <svg {...common}><path d="M12 3.5v11M8 10.5l4 4 4-4" /><path d="M5 18.5h14" /></svg>
    case 'undo':
      return <svg {...common}><path d="M9 7 4 12l5 5" /><path d="M5 12h8.5a6.5 6.5 0 0 1 6.5 6.5" /></svg>
    case 'redo':
      return <svg {...common}><path d="m15 7 5 5-5 5" /><path d="M19 12h-8.5A6.5 6.5 0 0 0 4 18.5" /></svg>
    case 'settings':
      return <svg {...common}><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /><path d="m19.4 15 .1.1-1.7 3-1.7-.7a7.8 7.8 0 0 1-2.1 1.2l-.3 1.8H10l-.3-1.8a7.8 7.8 0 0 1-2.1-1.2l-1.7.7-1.7-3 .1-.1 1.4-1a7.6 7.6 0 0 1 0-2l-1.4-1 .1-.1 1.7-3 1.7.7a7.8 7.8 0 0 1 2.1-1.2l.3-1.8h3.7l.3 1.8a7.8 7.8 0 0 1 2.1 1.2l1.7-.7 1.7 3-.1.1-1.4 1a7.6 7.6 0 0 1 0 2z" /></svg>
    case 'columns':
      return <svg {...common}><rect x="4" y="4" width="6" height="16" rx="1" /><rect x="14" y="4" width="6" height="16" rx="1" /><path d="M6.5 8h1M6.5 12h1M16.5 8h1M16.5 12h1" /></svg>
    case 'fields':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h8M8 12h5M8 16h8" /><circle cx="17" cy="12" r="1" fill="currentColor" stroke="none" /></svg>
    case 'tags':
      return <svg {...common}><path d="M4 5.5v5l8.7 8.7a2 2 0 0 0 2.8 0l3.7-3.7a2 2 0 0 0 0-2.8L10.5 4H5.5A1.5 1.5 0 0 0 4 5.5Z" /><circle cx="8" cy="8" r="1.2" /></svg>
    case 'people':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M15.5 5.5a3 3 0 0 1 0 5.9M17 14a4 4 0 0 1 3.5 5" /></svg>
    case 'board':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 8h3v5H8zM13 8h3v8h-3z" /></svg>
    case 'list':
      return <svg {...common}><path d="M8 6h11M8 12h11M8 18h11" /><circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
    case 'backlog':
      return <svg {...common}><path d="M5 4h14v4H5zM5 10h14v4H5zM5 16h14v4H5z" /><path d="M8 6h5M8 12h7M8 18h4" /></svg>
    case 'calendar':
      return <svg {...common}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3.5v3M16 3.5v3M4 9h16M8 13h.1M12 13h.1M16 13h.1M8 16.5h.1M12 16.5h.1" /></svg>
    case 'gantt':
      return <svg {...common}><path d="M4 6h3M4 12h8M4 18h15" /><path d="M9 5h7v2H9zM14 11h5v2h-5zM7 17h9v2H7z" fill="currentColor" stroke="none" /></svg>
    case 'activity':
      return <svg {...common}><path d="M4 17V9M9 17V5M14 17v-8M19 17v-5" /><path d="M3 20h18" /></svg>
    case 'views':
      return <svg {...common}><path d="M4 6h16M4 12h16M4 18h16" /><path d="M7 4v4M14 10v4M10 16v4" /></svg>
    case 'search':
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6" /><path d="m15 15 5 5" /></svg>
    case 'share':
      return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></svg>
    case 'shortcuts':
      return <svg {...common}><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="M7 9h1M10 9h1M13 9h1M16 9h1M7 13h5M14 13h3M7 16h10" /></svg>
    case 'archive':
      return <svg {...common}><path d="M4 6h16v4H4zM6 10v9h12v-9M9 14h6" /></svg>
    case 'ai':
      return <svg {...common}><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3M5.9 5.9l2.1 2.1M16 16l2.1 2.1M18.1 5.9 16 8M8 16l-2.1 2.1" /><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z" /></svg>
    case 'keyboard':
      return <svg {...common}><rect x="3.5" y="6" width="17" height="12" rx="2" /><path d="M7 10h.1M10 10h.1M13 10h.1M16 10h.1M7 14h10" /></svg>
    default:
      return <svg {...common}><circle cx="12" cy="12" r="7" /></svg>
  }
}
