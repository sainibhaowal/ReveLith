export type CitationStyle = 'apa' | 'harvard' | 'chicago' | 'mla' | 'ieee'

export type SourceType =
  'book' | 'journal' | 'website' | 'report' | 'contract' | 'conference' | 'dataset' | 'other'

export interface Author {
  firstName?: string
  lastName: string
  initials?: string
}

export interface SourceItem {
  id: string
  docSessionId: string
  title: string
  authors: Author[]
  year?: number | string
  publicationDate?: string
  publicationTitle?: string
  publisher?: string
  volume?: string
  issue?: string
  pages?: string
  url?: string
  doi?: string
  sourceType: SourceType
  summary?: string
  keyFindings?: string[]
  fullText?: string
  createdAt: number
  updatedAt: number
  tags?: string[]
}

export interface FormattedCitation {
  inText: string
  fullReference: string
  footnote?: string
  style: CitationStyle
}
