import React, { useEffect, useMemo, useRef, useState } from 'react'
import { X, Download, CheckCircle2, ShieldCheck, ExternalLink, Link2, Check, Cpu } from 'lucide-react'
import { RELEASES_URL } from '../data/suite-data'
import type { ReleaseManifest } from '../release-manifest'
import { useFocusTrap } from '../hooks/useFocusTrap'
import confetti from 'canvas-confetti'

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
  release: ReleaseManifest
}

interface Installer {
  key: string
  os: string
  variant?: string
  file: string
  note: string
  url: string
  recommended?: boolean
  primary?: boolean
}

/** Maps a release asset to the platform mark shown on its card. */
function markKeyFor(os: string, format: string): 'win' | 'mac' | 'linux' {
  const lower = `${os} ${format}`.toLowerCase()
  if (lower.includes('windows') || lower.endsWith('.exe')) return 'win'
  if (lower.includes('macos') || lower.endsWith('.dmg')) return 'mac'
  return 'linux'
}

/**
 * Builds the card list from the live release manifest rather than hardcoding
 * filenames, versions, sizes or checksums. Asset names differ per platform and
 * are not stable between releases (`ReveLith.Setup.<v>.exe` versus
 * `ReveLith-<v>-arm64.dmg` versus `revelith_<v>_amd64.deb`), so anything typed
 * here would silently go stale and 404.
 */
function toInstallers(release: ReleaseManifest): Installer[] {
  return release.downloads.map((item, index) => {
    const key = markKeyFor(item.os, item.format)
    const lower = item.format.toLowerCase()
    const note = lower.endsWith('.exe') ? 'Windows installer'
      : lower.endsWith('.dmg') ? 'Apple Silicon'
      : lower.endsWith('.deb') ? 'Debian / Ubuntu'
      : lower.endsWith('.rpm') ? 'Fedora / RPM'
      : lower.endsWith('.appimage') ? 'Portable AppImage'
      : item.tag
    return {
      key: `${key}-${index}`,
      os: item.os,
      file: item.format,
      note,
      url: item.url,
      recommended: item.recommended,
      primary: index === 0,
    }
  })
}

/* ---------------------------- platform marks -----------------------------
 * Windows 11 mark: Microsoft's official four-square logo (#0078d4).
 * Tux: Boxicons "bxl-tux" (CC-BY 4.0) — retains its belly/eye detail at
 * small sizes where a hand-drawn silhouette degrades into a blob.
 * ------------------------------------------------------------------------ */

/* Windows 11 mark — Microsoft's four-square logo (official #0078d4). */
const WindowsMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <g transform="translate(1.5 1.5) scale(0.0049)">
      <path
        fill="#0078d4"
        d="M0 0h2311v2310H0zm2564 0h2311v2310H2564zM0 2564h2311v2311H0zm2564 0h2311v2311H2564"
      />
    </g>
  </svg>
)

const AppleMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M17.05 12.54c-.02-2.3 1.88-3.4 1.96-3.46-1.07-1.56-2.73-1.78-3.32-1.8-1.41-.14-2.76.83-3.48.83-.72 0-1.83-.81-3.01-.79-1.55.02-2.98.9-3.78 2.29-1.61 2.8-.41 6.94 1.16 9.21.77 1.11 1.68 2.35 2.88 2.31 1.16-.05 1.6-.75 3-.75s1.79.75 3.01.72c1.24-.02 2.03-1.13 2.79-2.24.88-1.28 1.24-2.52 1.26-2.58-.03-.01-2.42-.93-2.44-3.69zM14.79 5.6c.63-.77 1.06-1.83.94-2.9-.91.04-2.02.61-2.67 1.37-.58.68-1.09 1.76-.95 2.8 1.02.08 2.05-.52 2.68-1.27z"
    />
  </svg>
)

/* Tux — Boxicons' bxl-tux (CC-BY 4.0). Scales cleanly at small sizes. */
const LinuxMark: React.FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="currentColor"
      d="M12.642 8.084c-.364.189-.79.42-1.242.42s-.81-.209-1.066-.413c-.13-.101-.234-.202-.313-.276-.137-.108-.12-.259-.064-.254.094.012.108.136.168.191.08.075.18.172.302.269.243.192.567.38.973.38s.878-.238 1.167-.4c.163-.092.371-.256.541-.381.13-.095.125-.21.232-.198.107.013.028.127-.122.258a3.404 3.404 0 0 1-.576.404z"
    />
    <path
      fill="currentColor"
      d="M19.649 17.77c-.142-.16-.209-.456-.281-.771s-.153-.654-.411-.874l-.002-.001a1.054 1.054 0 0 0-.317-.192c.359-1.065.219-2.126-.145-3.084-.444-1.177-1.222-2.202-1.815-2.903-.664-.838-1.313-1.633-1.301-2.808.021-1.793.197-5.118-2.958-5.122a4.66 4.66 0 0 0-.401.017c-3.526.283-2.59 4.008-2.643 5.255-.064.912-.249 1.631-.877 2.523-.736.876-1.774 2.295-2.266 3.771-.232.697-.342 1.407-.241 2.08a1.9 1.9 0 0 0-.091.089c-.216.231-.376.511-.555.699-.166.167-.403.229-.664.323s-.547.231-.721.565l-.001.002a1 1 0 0 0-.108.484c0 .154.023.311.046.461.048.313.097.609.032.81-.206.564-.232.954-.087 1.237.146.284.444.409.783.479.676.141 1.592.106 2.314.489l.062-.117-.061.118c.773.404 1.557.547 2.182.405.454-.104.821-.374 1.011-.789.489-.002 1.025-.209 1.885-.256.583-.047 1.312.207 2.149.16a1.119 1.119 0 0 0 .099.264c.324.649.928.946 1.571.896s1.329-.43 1.883-1.089l-.102-.085.102.084c.527-.64 1.403-.905 1.984-1.255.29-.175.525-.395.544-.713.018-.318-.169-.675-.599-1.152zm-7.79-11.708c-.003-.234.036-.435.126-.639s.201-.351.358-.47.312-.174.494-.176h.009c.179 0 .332.053.489.167.159.116.274.261.366.463a1.493 1.493 0 0 1 .141.636c.002.235-.038.435-.127.639a1.23 1.23 0 0 1-.18.299l-.074-.033c-.089-.038-.167-.069-.237-.096s-.124-.044-.181-.064c.041-.049.122-.108.151-.181a.943.943 0 0 0 .072-.347l.002-.016a.953.953 0 0 0-.05-.337c-.038-.113-.086-.195-.155-.263s-.139-.099-.223-.101h-.011a.324.324 0 0 0-.217.086.618.618 0 0 0-.174.25.944.944 0 0 0-.072.348l-.001.015a.992.992 0 0 0 .014.2 2.463 2.463 0 0 0-.507-.171 1.681 1.681 0 0 1-.014-.19v-.019zm-2.144.052c-.012-.202.009-.376.064-.556s.13-.311.238-.418a.516.516 0 0 1 .349-.168h.03c.118 0 .225.04.335.127a.968.968 0 0 1 .284.389c.076.171.116.343.127.545v.002a1.51 1.51 0 0 1-.002.243c-.023.006-.046.014-.068.021-.128.044-.23.093-.328.158a.845.845 0 0 0 .003-.214v-.012a.95.95 0 0 0-.068-.274.523.523 0 0 0-.138-.203c-.052-.044-.1-.065-.153-.064l-.017.001c-.061.005-.11.034-.157.092a.536.536 0 0 0-.101.223.912.912 0 0 0-.019.293l.001.012c.01.103.031.189.067.275a.528.528 0 0 0 .166.224c-.059.045-.098.078-.146.113l-.11.081a.995.995 0 0 1-.229-.342 1.528 1.528 0 0 1-.128-.546v-.002zm.155 1.228c.187-.14.315-.234.402-.298.086-.063.121-.086.148-.112h.001c.14-.132.362-.374.699-.49.115-.04.245-.065.39-.066.275-.001.608.089 1.01.348.247.16.439.174.882.363h.001c.213.087.338.202.399.321.061.12.063.25.012.387-.103.273-.429.562-.887.705h-.001c-.224.072-.418.233-.647.364a1.449 1.449 0 0 1-.842.217 1.105 1.105 0 0 1-.374-.083 1.202 1.202 0 0 1-.27-.167c-.161-.131-.303-.295-.51-.416h-.002c-.333-.19-.515-.408-.573-.598-.057-.189-.003-.351.162-.475zm.131 13.018v.001c-.047.623-.398.961-.938 1.085-.539.123-1.27 0-1.999-.381h-.001c-.808-.427-1.768-.385-2.384-.514-.308-.064-.509-.161-.602-.341-.092-.18-.094-.494.102-1.028l.001-.002.001-.002c.097-.299.025-.626-.021-.934-.047-.307-.07-.586.034-.781l.001-.002c.135-.259.332-.352.576-.439.245-.088.534-.157.764-.386l.001-.001.001-.001c.212-.223.371-.503.557-.702.157-.167.314-.279.551-.28h.009c.041 0 .085.003.132.011.314.047.588.268.853.625l.762 1.389h.001c.202.423.631.89.994 1.365.362.475.644.952.607 1.317l-.002.001zm-.063-1.01a6.721 6.721 0 0 0-.333-.469 13.467 13.467 0 0 0-.229-.293c.151 0 .28-.024.384-.072a.486.486 0 0 0 .266-.274c.09-.242 0-.583-.288-.973-.29-.39-.778-.83-1.494-1.269-.527-.328-.821-.729-.959-1.165s-.119-.907-.013-1.373c.204-.894.729-1.762 1.063-2.308.09-.066.032.123-.339.811-.332.629-.953 2.081-.103 3.214a6.722 6.722 0 0 1 .538-2.398c.472-1.067 1.456-2.919 1.534-4.395.041.029.18.123.241.158.182.106.316.262.492.403.177.142.396.264.729.283l.093.003c.343 0 .61-.112.833-.239.242-.138.436-.292.618-.351h.001c.387-.122.694-.335.869-.585.302 1.186 1.001 2.897 1.45 3.733.239.443.715 1.385.92 2.52.13-.004.273.015.427.054.537-1.393-.455-2.892-.909-3.31-.184-.178-.192-.258-.102-.254.492.436 1.139 1.311 1.374 2.3.107.451.13.925.016 1.393.056.023.113.048.171.076.862.42 1.181.785 1.027 1.283-.05-.002-.1-.001-.148 0h-.014c.125-.395-.151-.687-.889-1.02-.764-.336-1.373-.303-1.476.379a1.302 1.302 0 0 0-.017.109c-.057.02-.114.045-.172.076-.358.197-.555.553-.664.99-.108.437-.14.964-.17 1.558-.019.298-.141.702-.266 1.129-1.249.897-2.986 1.283-4.461.276zm9.628.057c-.524.317-1.456.593-2.05 1.313-.517.615-1.146.952-1.7.996-.555.044-1.033-.186-1.315-.752v-.001l-.001-.003c-.175-.333-.102-.858.045-1.412.147-.554.359-1.123.388-1.585v-.001c.03-.592.063-1.11.163-1.509.1-.399.256-.669.533-.821l.039-.02c.031.513.285 1.036.734 1.149.491.129 1.199-.292 1.498-.636.06-.002.118-.006.175-.007.262-.006.481.009.707.205v.001h.001c.173.146.255.423.326.733.071.31.128.647.342.888h.001c.41.456.542.764.531.96-.011.198-.153.344-.417.502z"
    />
    <path
      fill="currentColor"
      d="M11.738 6.762c.015.048.093.04.138.063.04.02.071.065.116.066.042.001.107-.015.113-.057.008-.056-.073-.091-.126-.111-.067-.026-.153-.039-.216-.004-.014.008-.03.027-.025.043zm-.46 0c-.016.048-.094.04-.139.063-.039.02-.071.065-.115.066-.042.001-.108-.015-.114-.057-.007-.056.074-.091.126-.111.067-.026.153-.039.217-.004.015.008.03.027.025.043z"
    />
  </svg>
)

const MARKS: Record<string, React.FC> = {
  win: WindowsMark,
  mac: AppleMark,
  linux: LinuxMark,
}

/* -------------------------------- helpers -------------------------------- */

/** Short, centred confetti pop anchored to the clicked control. */
const pop = (el: HTMLElement) => {
  const r = el.getBoundingClientRect()
  confetti({
    particleCount: 70,
    spread: 65,
    startVelocity: 32,
    scalar: 0.85,
    ticks: 110,
    origin: {
      x: (r.left + r.width / 2) / window.innerWidth,
      y: (r.top + r.height / 2) / window.innerHeight,
    },
    colors: ['#6c47ff', '#ff6b35', '#00b4d8', '#10b981'],
  })
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose, release }) => {
  const [copied, setCopied] = useState<string | null>(null)
  const installers = useMemo(() => toInstallers(release), [release])
  // `mounted` keeps the dialog in the DOM through its exit transition. It is
  // initialised from the prop and only ever flips to false from a timer, so no
  // state is written during render.
  const [mounted, setMounted] = useState(isOpen)
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const dialogRef = useRef<HTMLDivElement | null>(null)

  // Open immediately when asked, and close only once the exit transition has
  // played — the dialog must stay mounted while it animates out.
  useEffect(() => {
    if (isOpen) {
      if (mounted) return
      const id = window.setTimeout(() => setMounted(true), 0)
      return () => window.clearTimeout(id)
    }
    if (!mounted) return
    const id = window.setTimeout(() => setMounted(false), 200)
    return () => window.clearTimeout(id)
  }, [isOpen, mounted])

  // Escape to dismiss, and hold background scrolling for as long as the dialog
  // is on screen — including its exit transition, so the page cannot shift
  // underneath a dialog that is still visible.
  useEffect(() => {
    if (!mounted) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [mounted, onClose])

  // Move focus into the dialog so keyboard users are not left behind it.
  useEffect(() => {
    if (isOpen) closeRef.current?.focus()
  }, [isOpen])

  // Keep Tab inside the dialog while it is open.
  useFocusTrap(dialogRef, isOpen)

  if (!mounted) return null

  // Derived: parent says closed but we are still mounted, so we are exiting.
  const closing = !isOpen

  const copyLink = (item: Installer) => {
    navigator.clipboard?.writeText(item.url).catch(() => {})
    setCopied(item.key)
    window.setTimeout(() => setCopied((c) => (c === item.key ? null : c)), 1600)
  }

  return (
    <div
      className={`download-overlay ${closing ? 'is-closing' : 'is-open'}`}
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className={`download-dialog ${closing ? 'is-closing' : 'is-open'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Download ReveLith"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="download-header">
          <div className="download-verified">
            <ShieldCheck size={13} />
            Verified secure binaries
            <span className="download-version">{release.version}</span>
          </div>

          <h3 className="download-title" style={{ fontFamily: 'var(--font-heading)' }}>
            Download ReveLith
          </h3>
          <p className="download-subtitle">
            Pick your platform for a direct installer. No account, no telemetry.
          </p>

          <button ref={closeRef} onClick={onClose} className="download-close" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        {/* Installer grid */}
        <div className="download-grid">
          {installers.map((item) => {
            const key = markKeyFor(item.os, item.file)
            const Mark = MARKS[key]
            return (
              <div
                key={item.key}
                className={[
                  'dl-card',
                  item.primary && 'is-primary',
                  item.recommended && 'is-recommended',
                ].filter(Boolean).join(' ')}
              >
                <div className="dl-card-top">
                  <span className={`dl-mark dl-mark-${key}`}>
                    <Mark />
                  </span>
                  <span className="dl-names">
                    <span className="dl-os">
                      {item.os}
                      {item.recommended && <span className="dl-chip">Recommended</span>}
                    </span>
                    <span className="dl-variant">
                      {item.variant && <span className="dl-variant-text">{item.variant}</span>}
                      <span className="dl-arch"><Cpu size={9} />{item.note}</span>
                    </span>
                  </span>
                </div>

                <div className="dl-file">
                  <span className="dl-file-name" title={item.file}>{item.file}</span>
                </div>

                <div className="dl-hash">
                  <span className="dl-hash-label">Package</span>
                  <code>{item.note}</code>
                  <button
                    type="button"
                    className={copied === item.key ? 'dl-copy is-copied' : 'dl-copy'}
                    onClick={() => copyLink(item)}
                    aria-label={`Copy download link for ${item.os}`}
                  >
                    {copied === item.key ? <Check size={11} /> : <Link2 size={11} />}
                    {copied === item.key ? 'Copied' : 'Copy link'}
                  </button>
                </div>

                <a
                  className="dl-get"
                  href={item.url}
                  onClick={(e) => pop(e.currentTarget as HTMLElement)}
                >
                  <Download size={14} />
                  Download
                </a>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="download-footer">
          <span className="download-free">
            <CheckCircle2 size={13} />
            100% free &amp; open source · Apache 2.0
          </span>
          <a href={RELEASES_URL} target="_blank" rel="noopener noreferrer" className="download-notes">
            All release notes <ExternalLink size={12} />
          </a>
        </div>
      </div>
    </div>
  )
}

export default DownloadModal
