import React, { useEffect, useRef, useState } from 'react'
import { X, ShieldCheck, FileText } from 'lucide-react'
import { GITHUB_REPO_URL } from '../data/suite-data'
import { BUILD_RELEASE } from '../release-manifest'
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
    updated: `Applies to the ReveLith application and this website | ${version}`,
    intro:
      'This policy covers the ReveLith desktop application and public website. Ordinary document editing happens on your device. Some optional features and external services make network requests, as described below.',
    sections: [
      {
        heading: '1. Local document work and provider requests',
        body: [
          'Opening, rendering, editing and saving files are performed on your device. ReveLith does not upload or store your files on a ReveLith-operated server as part of ordinary document editing.',
          'When you invoke a provider-backed AI, search, image or media feature, the request may include your prompt and the selected text, document context or media needed for that task. The request is sent to the provider configured for that feature. Review that provider’s terms and privacy policy before sending sensitive information.',
        ],
      },
      {
        heading: '2. Local and online AI features',
        body: [
          'Whether an AI request stays on your device depends on the model and endpoint you select. A locally hosted model can process requests locally; a hosted provider requires a network connection and receives the request content described above.',
          'Provider requests are sent from your device to the configured provider, which can receive your IP address and standard request metadata as well as the request content. The provider’s handling, retention and use of those requests are governed by its own terms. Leaving an API key unset does not make the entire application or website offline.',
        ],
      },
      {
        heading: '3. Usage analytics in configured desktop builds',
        body: [
          'Some packaged desktop builds can include Google Analytics 4 credentials. When present, usage reporting is enabled by default and can be turned off in Settings > General > Send anonymous usage statistics. Reporting may begin on first launch before onboarding appears. Source builds and packages without those credentials do not send these analytics events.',
          'When enabled, events can report app launch, first launch, file open (extension only), file creation (file type only), and login click or success. Event metadata includes app version, platform, operating-system version, interface language, a random installation ID, session information, engagement time and, when available, the country code from the device’s regional settings. It does not include document contents, file names or paths, account identity or email address.',
          'Analytics requests go to Google Analytics over HTTPS. Google receives the connection’s public IP address and standard transport metadata. The public website currently has no ReveLith analytics tag in its source code.',
        ],
      },
      {
        heading: '4. Other network requests',
        body: [
          'The desktop application can also contact update services when checking for updates or downloading an update you choose. AI, search, image and media features may contact their configured providers when you invoke them.',
          'The public website is hosted on a VPS, which receives your IP address and request metadata to serve the page; whether and how long access logs are retained depends on the server configuration. The site also requests fonts from Google Fonts and links to GitHub Releases. Those providers may receive your IP address and standard request metadata when your browser requests their resources or you follow those links.',
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
          'ReveLith is a general-purpose productivity tool and is not directed at children. Take particular care before using provider-backed features with confidential, personal or regulated information; your organization’s rules and the selected provider’s terms may apply.',
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
          'You retain all rights to the documents you open, edit or create with ReveLith. ReveLith claims no ownership of your content. If you choose to use a provider-backed feature, the content included in that request is sent to the configured provider and is subject to that provider’s terms.',
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
  version = BUILD_RELEASE.version,
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
