import React, { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, FileText } from 'lucide-react'
import { GITHUB_REPO_URL, LATEST_VERSION } from '../data/suite-data'
import { useFocusTrap } from '../hooks/useFocusTrap'

export type LegalDoc = 'privacy' | 'terms'

interface LegalModalProps {
  doc: LegalDoc | null
  onClose: () => void
  /** Live release tag, so the policy date never drifts from the shipped build. */
  version?: string
}

interface Section {
  heading: string
  body: string[]
}

interface Doc {
  icon: React.ReactNode
  title: string
  updated: string
  intro: string
  sections: Section[]
}

const docs = (version: string): Record<LegalDoc, Doc> => ({
  privacy: {
    icon: <ShieldCheck size={14} />,
    title: 'Privacy Policy',
    updated: `Applies to the ReveLith application and this website Â· ${version}`,
    intro:
      'ReveLith is built on a simple boundary: your documents stay on your machine. This page states exactly what that means, including the few places where data does leave your device.',
    sections: [
      {
        heading: '1. Your documents never leave your device',
        body: [
          'All document parsing, rendering, editing and saving happens locally. ReveLith does not upload, replicate, mirror or cache your files on any server we operate.',
          'Document content is not used to train models. No derived artefacts â€” embeddings, previews, thumbnails or extracted text â€” are transmitted anywhere.',
        ],
      },
      {
        heading: '2. AI features run locally',
        body: [
          'The built-in AI copilot runs inference on your own hardware using a local model. Prompts, documents and responses stay in local memory and are written to disk only if you explicitly save them.',
          'If you configure an optional third-party API key, requests go directly from your machine to that provider under their terms. We never proxy, log or observe that traffic. Leaving the key unset keeps everything fully offline.',
        ],
      },
      {
        heading: '3. No telemetry or analytics',
        body: [
          'The application contains no analytics SDK, no crash reporter, no usage counters and no advertising identifiers. It does not phone home on launch, on save or on exit.',
          'This website loads no analytics, no tag managers and no advertising scripts. It is served as static files.',
        ],
      },
      {
        heading: '4. Network requests that do occur',
        body: [
          'The application contacts the network only for two things, both of which you control: checking for updates, and downloading an update you have chosen to install. Update checks send no document data and no identifiers beyond what is required to fetch a release manifest.',
          'This website requests web fonts from Google Fonts and, on the download dialog, links to GitHub Releases. Those requests are subject to the respective providers\u2019 privacy policies.',
        ],
      },
      {
        heading: '5. Files and settings on your device',
        body: [
          'ReveLith stores your preferences, recent-file list and window state in your operating system\u2019s standard per-user configuration directory. Recent-file entries are paths only, never document contents.',
          'Uninstalling removes the application. You may delete the configuration directory at any time to clear all local state.',
        ],
      },
      {
        heading: '6. Children and regulated data',
        body: [
          'ReveLith is a general-purpose productivity tool and is not directed at children. Because processing is local, you remain the sole controller of any regulated data you open in it.',
        ],
      },
      {
        heading: '7. Changes and contact',
        body: [
          'Material changes to this policy will be noted in the release notes for the version that introduces them.',
          `Questions, or a correction to this page: open an issue at ${GITHUB_REPO_URL}/issues.`,
        ],
      },
    ],
  },
  terms: {
    icon: <FileText size={14} />,
    title: 'Terms of Use',
    updated: `Terms for the ReveLith application and this website Â· ${version}`,
    intro:
      'Short version: ReveLith is free, open-source software provided as-is. You own your documents and your data. We make no warranty.',
    sections: [
      {
        heading: '1. Licence',
        body: [
          'ReveLith is released under the Apache License 2.0. You may use, modify and redistribute it under those terms. The full licence text ships with the application and is available in the source repository.',
        ],
      },
      {
        heading: '2. Your content',
        body: [
          'You retain all rights to the documents you open, edit or create with ReveLith. We claim no licence over your content, because your content never reaches us.',
        ],
      },
      {
        heading: '3. No warranty',
        body: [
          'ReveLith is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose and non-infringement.',
          'Although byte-preserving save behaviour is a core design goal and is tested, you are responsible for maintaining backups of important documents. Do not rely on any single tool as your only copy.',
        ],
      },
      {
        heading: '4. Limitation of liability',
        body: [
          'In no event shall the authors or copyright holders be liable for any claim, damages or other liability arising from, out of, or in connection with the software or its use.',
        ],
      },
      {
        heading: '5. Trademarks',
        body: [
          'The ReveLith name and logo identify this project. You may refer to them to describe the software accurately. You may not use them in a way that implies endorsement of a derivative product, or that suggests an unofficial build is an official release.',
          'Microsoft Word, Excel and PowerPoint, Apple macOS, and Linux are trademarks of their respective owners. ReveLith is not affiliated with or endorsed by any of them.',
        ],
      },
      {
        heading: '6. Acceptable use',
        body: [
          'You are responsible for complying with the laws that apply to the content you process and to any third-party AI provider you choose to connect.',
        ],
      },
      {
        heading: '7. Changes',
        body: [
          'These terms may be updated with a release. Continued use of a version constitutes acceptance of the terms published with it.',
        ],
      },
    ],
  },
})

const EXIT_MS = 200

export const LegalModal: React.FC<LegalModalProps> = ({
  doc,
  onClose,
  version = LATEST_VERSION,
}) => {
  const isOpen = doc !== null
  const [shown, setShown] = useState<LegalDoc | null>(doc)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  // Open immediately, but hold the panel in the DOM through its exit
  // transition and keep showing the last document while it animates out.
  useEffect(() => {
    if (isOpen) {
      if (shown) return
      const id = window.setTimeout(() => setShown(doc), 0)
      return () => window.clearTimeout(id)
    }
    if (!shown) return
    const id = window.setTimeout(() => setShown(null), EXIT_MS)
    return () => window.clearTimeout(id)
  }, [isOpen, shown, doc])

  useFocusTrap(panelRef, isOpen)

  // Move focus into the document so keyboard users start inside it.
  useEffect(() => {
    if (isOpen) closeRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
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
  }, [isOpen, onClose])

  if (!shown) return null

  const content = docs(version)[shown]
  const closing = !isOpen

  return (
    <div className={`legal-overlay ${closing ? 'is-closing' : 'is-open'}`} onClick={onClose}>
      <div
        ref={panelRef}
        className={`legal-dialog ${closing ? 'is-closing' : 'is-open'}`}
        role="dialog"
        aria-modal="true"
        aria-label={content.title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="legal-head">
          <div className="legal-eyebrow">
            {content.icon}
            {content.title}
          </div>
          <h3 className="legal-title" style={{ fontFamily: 'var(--font-heading)' }}>
            {content.title}
          </h3>
          <p className="legal-updated">{content.updated}</p>
          <button ref={closeRef} onClick={onClose} className="legal-close" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="legal-body">
          <p className="legal-intro">{content.intro}</p>
          {content.sections.map((section) => (
            <section key={section.heading} className="legal-section">
              <h4>{section.heading}</h4>
              {section.body.map((paragraph, i) => (
                <p key={i}>{paragraph}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="legal-foot">
          <span>ReveLith Â· Apache 2.0</span>
          <button onClick={onClose} className="legal-dismiss">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default LegalModal
