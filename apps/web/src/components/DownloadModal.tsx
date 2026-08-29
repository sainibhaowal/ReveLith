import React from 'react'
import { X, Download, CheckCircle2, ShieldCheck, ExternalLink } from 'lucide-react'
import { GITHUB_REPO_URL, RELEASES_URL, LATEST_VERSION } from '../data/suite-data'
import type { ReleaseManifest } from '../release-manifest'

interface DownloadModalProps {
  isOpen: boolean
  onClose: () => void
  release: ReleaseManifest
}

const RELEASE_ASSET_BASE = `${GITHUB_REPO_URL}/releases/download/${LATEST_VERSION}`

const INSTALLERS = [
  { os: 'Windows 10 / 11', format: 'ReveLith-Setup-1.1.4.exe', tag: '64-bit NSIS Installer', size: '~95 MB', recommended: true, emoji: '🪟', downloadUrl: `${RELEASE_ASSET_BASE}/ReveLith-Setup-1.1.4.exe` },
  { os: 'macOS Apple Silicon', format: 'ReveLith-1.1.4-arm64.dmg', tag: 'M1 / M2 / M3 Universal', size: '~98 MB', recommended: false, emoji: '🍎', downloadUrl: `${RELEASE_ASSET_BASE}/ReveLith-1.1.4-arm64.dmg` },
  { os: 'macOS Intel (x64)', format: 'ReveLith-1.1.4-x64.dmg', tag: 'Intel DMG', size: '~102 MB', recommended: false, emoji: '🍎', downloadUrl: `${RELEASE_ASSET_BASE}/ReveLith-1.1.4-x64.dmg` },
  { os: 'Linux (Ubuntu / Debian / Arch)', format: 'ReveLith-1.1.4.AppImage / .deb', tag: 'Universal Linux Package', size: '~90 MB', recommended: false, emoji: '🐧', downloadUrl: `${RELEASE_ASSET_BASE}/ReveLith-1.1.4.AppImage` },
]

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose, release }) => {
  if (!isOpen) return null

  return (
    <div
      className="download-overlay"
      onClick={onClose}
    >
      <div
        className="download-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="download-accent" />

        {/* Header */}
        <div className="download-header">
          <button
            onClick={onClose}
            className="download-close pressable"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="download-verified">
            <ShieldCheck className="w-3.5 h-3.5" />
            Verified Secure Binaries · {release.version}
          </div>

          <h3
            className="download-title"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Download ReveLith
          </h3>
          <p className="download-subtitle">
            Choose your OS below for a direct installer.
          </p>
        </div>

        {/* Installer list */}
        <div className="download-installers">
          {release.downloads.map((item, i) => (
            <a
              key={i}
              href={item.url}
              className={`download-installer group pressable ${
                item.recommended
                  ? 'is-recommended'
                  : ''
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className="download-platform">{item.emoji}</div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="download-os">{item.os}</span>
                    {item.recommended && (
                      <span className="download-recommended">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="download-format">
                    {item.format} · {item.tag}
                  </div>
                </div>
              </div>
              <div className="download-get group-hover:translate-x-1">
                <Download className="w-3.5 h-3.5" />
                <span>Get</span>
              </div>
            </a>
          ))}
        </div>

        {/* Footer */}
        <div className="download-footer">
          <span className="download-free">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#059669]" />
            100% Free &amp; Open Source · Apache 2.0
          </span>
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="download-notes"
          >
            All Release Notes <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>
    </div>
  )
}
