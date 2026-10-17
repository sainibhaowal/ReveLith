import type { FieldType } from '../types'

const strokes: Record<FieldType, React.ReactNode> = {
  text: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M7 10h10M7 14h7" /></>,
  textarea: <><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M7 8h10M7 12h10M7 16h6" /></>,
  email: <><rect x="3.5" y="5" width="17" height="14" rx="2" /><path d="m4 7 8 6 8-6" /></>,
  phone: <><path d="M7 3h3l2 5-2 2a14 14 0 0 0 4 4l2-2 5 2v3l-2 3C10 20 4 14 4 6z" /></>,
  number: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M8 9v6m-1-5 2-1m-1 6 2-1m4-5h2l-2 3h2m-2 2h2" /></>,
  currency: <><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.6-.7-1.5-1-2.6-1-1.4 0-2.4.7-2.4 1.8 0 2.8 5.2 1.1 5.2 4 0 1.2-1.1 2-2.7 2-1.1 0-2.2-.4-2.9-1.2M12 6v12" /></>,
  date: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4m8-4v4M4 9h16M8 13h2m4 0h2m-8 3h2" /></>,
  date_range: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M7 3v4m10-4v4M3 9h18M6 14h4m4 0h4" /></>,
  time: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  url: <><path d="M10 13.5 8.5 15a3 3 0 0 1-4-4l3-3a3 3 0 0 1 4-.2m2-1.3L15 5a3 3 0 0 1 4 4l-3 3a3 3 0 0 1-4 .2m-5 0h10" /></>,
  fullname: <><circle cx="12" cy="8" r="3" /><path d="M5 20a7 7 0 0 1 14 0M4 4h3m10 0h3" /></>,
  country: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  select: <><rect x="4" y="5" width="16" height="14" rx="2" /><path d="M7 10h6m-6 4h4m6-2 2 2 2-2" /></>,
  radio: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" /></>,
  checkbox: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12 2.5 2.5L16 9" /></>,
  picture_choice: <><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><circle cx="9" cy="9" r="1.5" /><path d="m5 17 5-5 3 3 2-2 4 4" /></>,
  yesno: <><rect x="3" y="7" width="18" height="10" rx="5" /><circle cx="8" cy="12" r="3" /><path d="M15 12h3" /></>,
  rating: <><path d="m12 3 2.7 5.6 6.2.9-4.5 4.4 1.1 6.2-5.5-2.9-5.5 2.9 1.1-6.2-4.5-4.4 6.2-.9z" /></>,
  nps: <><path d="M4 6h16M4 12h16M4 18h16" /><circle cx="7" cy="6" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="17" cy="18" r="1.5" fill="currentColor" /></>,
  group: <><rect x="3" y="4" width="18" height="7" rx="2" /><rect x="3" y="14" width="18" height="6" rx="2" /><path d="M7 7.5h6m-6 9.5h9" /></>,
  file: <><path d="M12 15V4m-4 4 4-4 4 4" /><path d="M4 14v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" /></>,
  signature: <><path d="M3 17c4-1 4-9 7-9 2 0-1 8 1 8 1 0 2-4 3-4 1.5 0 .5 4 2 4 1.5 0 2-2 5-2" /><path d="M3 21h18" /></>,
  address: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  legal_terms: <><path d="M6 3h9l4 4v14H6z" /><path d="M14 3v5h5M9 13h7m-7 4h5" /></>,
  input_table: <><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M9 9v11m6-11v11" /></>,
  statement: <><path d="M5 5h14M5 10h14M5 15h10M5 20h7" /></>,
  welcome: <><path d="M5 20V5m0 0h13l-3 4 3 4H5" /><path d="m10 16 2 2 4-5" /></>,
  thankyou: <><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></>,
  hidden: <><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.8 10.8 0 0 1 12 5c5.5 0 9 7 9 7a14 14 0 0 1-3.2 4.2M6.2 6.2C4.2 7.5 3 12 3 12s3.5 7 9 7c.8 0 1.6-.2 2.3-.4" /></>,
  section: <><path d="M4 5h16M4 10h10M4 15h16M4 20h10" /></>,
  pagebreak: <><path d="M5 3h9l5 5v13H5z" /><path d="M14 3v5h5M8 13h8m-8 4h8" /></>,
}

export function FieldPaletteIcon({ type }: { type: FieldType }) {
  return <svg className="forms-field-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{strokes[type]}</svg>
}
