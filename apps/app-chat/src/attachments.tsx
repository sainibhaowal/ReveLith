/// <reference types="vite/client" />
/**
 * ReveLith's attachment artwork, shared by the app-chat panel and the drawboard
 * panel so both read like the older apps (docs/sheets/slides/html) instead of
 * hand-drawn stand-ins: the brand paperclip for the attach control, and the
 * brand file-type tiles for the attachment cards.
 *
 * The PNGs are the same files the older apps ship in their own assets/ — byte
 * identical, so a chip here and a chip there are the same picture.
 */
import attachIcon from './assets/attach-icon.png'
import fileDocumentIcon from './assets/file-document.png'
import fileExcelIcon from './assets/file-excel.png'
import fileGeneralIcon from './assets/file-general.png'
import fileImageIcon from './assets/file-image.png'
import filePdfIcon from './assets/file-pdf.png'
import filePptIcon from './assets/file-ppt.png'
import fileVideoIcon from './assets/file-video.png'
import fileVoiceIcon from './assets/file-voice.png'
import fileWordIcon from './assets/file-word.png'
import sendEnterOn from './assets/send-enter-on.png'
import sendEnterOff from './assets/send-enter-off.png'
import sendStop from './assets/send-stop.png'

/** The 20×20 brand paperclip used by every attach control. */
export const ATTACH_ICON = attachIcon

/** The composer's icon-only send art: enabled, disabled and stop (36×36). */
export const SEND_ICONS = {
  enabled: sendEnterOn,
  disabled: sendEnterOff,
  stop: sendStop,
} as const

const ATTACHMENT_CARD_ICON_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [fileWordIcon, ['doc', 'docx']],
  [fileExcelIcon, ['xls', 'xlsx', 'xlsm', 'csv', 'tsv']],
  [filePptIcon, ['ppt', 'pptx']],
  [filePdfIcon, ['pdf']],
  [fileImageIcon, ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'tiff', 'heic']],
  [fileVideoIcon, ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v']],
  [fileVoiceIcon, ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg', 'opus']],
  [
    fileDocumentIcon,
    [
      'txt',
      'md',
      'markdown',
      'rtf',
      'log',
      'json',
      'yaml',
      'yml',
      'xml',
      'html',
      'htm',
      'js',
      'ts',
      'tsx',
      'jsx',
      'py',
      'java',
      'c',
      'h',
      'cpp',
      'go',
      'rs',
      'rb',
      'sh',
      'sql',
      'css',
    ],
  ],
]

const ATTACHMENT_CARD_ICONS: Record<string, string> = Object.fromEntries(
  ATTACHMENT_CARD_ICON_GROUPS.flatMap(([icon, exts]) => exts.map((ext) => [ext, icon])),
)

/** Brand file-type tile for one attachment extension. */
export function attachmentCardIcon(ext: string): string {
  return ATTACHMENT_CARD_ICONS[ext.toLowerCase()] ?? fileGeneralIcon
}

/** The file-type tile as an element, matching the older apps' attachment cards. */
export function AttachmentCardIcon({ ext }: { ext: string }): React.JSX.Element {
  return <img src={attachmentCardIcon(ext)} alt="" aria-hidden />
}

/** Card size line: "1.50 MB" / "24.00 KB", as the older apps print it. */
export function formatAttachmentSize(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(2)} MB`
    : `${(bytes / 1024).toFixed(2)} KB`
}

/** Ellipsize a card name like the design: cut at the limit, drop trailing
 *  punctuation so it never sits against the ellipsis (CSS ellipsis stays as the
 *  fallback; a non-browser canvas just gets the plain name). */
const CARD_NAME_MAX_WIDTH = 116
let cardNameCtx: CanvasRenderingContext2D | null | undefined

export function truncateAttachmentName(name: string): string {
  if (cardNameCtx === undefined) {
    cardNameCtx =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  }
  if (!cardNameCtx) return name
  cardNameCtx.font =
    "500 13px 'Segoe UI', -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  if (cardNameCtx.measureText(name).width <= CARD_NAME_MAX_WIDTH) return name
  let lo = 1
  let hi = name.length
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (cardNameCtx.measureText(`${name.slice(0, mid)}…`).width <= CARD_NAME_MAX_WIDTH) lo = mid
    else hi = mid - 1
  }
  return `${name.slice(0, lo).replace(/[-_.\s]+$/, '')}…`
}
