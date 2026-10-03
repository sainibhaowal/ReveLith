import type { Author, CitationStyle, FormattedCitation, SourceItem } from './types'

export function parseAuthorString(raw: string): Author[] {
  if (!raw.trim()) return []
  return raw
    .split(/;|\band\b/i)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((name) => {
      if (name.includes(',')) {
        const [last, first] = name.split(',').map((s) => s.trim())
        return { lastName: last || '', firstName: first || '' }
      }
      const parts = name.split(/\s+/)
      if (parts.length === 1) return { lastName: parts[0] || '' }
      const lastName = parts.pop() || ''
      const firstName = parts.join(' ')
      return { lastName, firstName }
    })
}

function formatAuthorsList(authors: Author[], style: CitationStyle): string {
  if (!authors || authors.length === 0) return 'Anonymous'

  if (style === 'apa') {
    if (authors.length === 1) {
      const a = authors[0]!
      const init = a.initials || (a.firstName ? `${a.firstName[0]}.` : '')
      return init ? `${a.lastName}, ${init}` : a.lastName
    }
    if (authors.length === 2) {
      const a1 = authors[0]!
      const a2 = authors[1]!
      const init1 = a1.initials || (a1.firstName ? `${a1.firstName[0]}.` : '')
      const init2 = a2.initials || (a2.firstName ? `${a2.firstName[0]}.` : '')
      return `${a1.lastName}, ${init1} & ${a2.lastName}, ${init2}`
    }
    const first = authors[0]!
    const init = first.initials || (first.firstName ? `${first.firstName[0]}.` : '')
    return `${first.lastName}, ${init} et al.`
  }

  if (style === 'harvard') {
    if (authors.length === 1) {
      const a = authors[0]!
      const init = a.initials || (a.firstName ? `${a.firstName[0]}.` : '')
      return init ? `${a.lastName}, ${init}` : a.lastName
    }
    if (authors.length === 2) {
      return `${authors[0]!.lastName} and ${authors[1]!.lastName}`
    }
    return `${authors[0]!.lastName} et al.`
  }

  if (style === 'mla') {
    if (authors.length === 1) {
      const a = authors[0]!
      return a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName
    }
    if (authors.length === 2) {
      const a1 = authors[0]!
      const a2 = authors[1]!
      const n1 = a1.firstName ? `${a1.lastName}, ${a1.firstName}` : a1.lastName
      const n2 = a2.firstName ? `${a2.firstName} ${a2.lastName}` : a2.lastName
      return `${n1}, and ${n2}`
    }
    const first = authors[0]!
    const n = first.firstName ? `${first.lastName}, ${first.firstName}` : first.lastName
    return `${n}, et al.`
  }

  if (style === 'ieee') {
    if (authors.length === 1) {
      const a = authors[0]!
      const init = a.initials || (a.firstName ? `${a.firstName[0]}. ` : '')
      return `${init}${a.lastName}`
    }
    if (authors.length <= 6) {
      return authors
        .map((a) => {
          const init = a.initials || (a.firstName ? `${a.firstName[0]}. ` : '')
          return `${init}${a.lastName}`
        })
        .join(', ')
    }
    const first = authors[0]!
    const init = first.initials || (first.firstName ? `${first.firstName[0]}. ` : '')
    return `${init}${first.lastName} et al.`
  }

  // Chicago
  if (authors.length === 1) {
    const a = authors[0]!
    return a.firstName ? `${a.lastName}, ${a.firstName}` : a.lastName
  }
  if (authors.length === 2) {
    const a1 = authors[0]!
    const a2 = authors[1]!
    return `${a1.lastName}, ${a1.firstName || ''} and ${a2.firstName || ''} ${a2.lastName}`
  }
  return `${authors[0]!.lastName} et al.`
}

export function formatInTextCitation(
  source: SourceItem,
  style: CitationStyle,
  pageOrNum?: string | number,
): string {
  const authors = source.authors || []
  const year = source.year || (source.publicationDate ? source.publicationDate.slice(0, 4) : 'n.d.')
  const firstAuthorLast = authors.length > 0 ? authors[0]!.lastName : source.title.slice(0, 20)

  switch (style) {
    case 'apa':
      if (authors.length === 1) {
        return `(${firstAuthorLast}, ${year}${pageOrNum ? `, p. ${pageOrNum}` : ''})`
      }
      if (authors.length === 2) {
        return `(${authors[0]!.lastName} & ${authors[1]!.lastName}, ${year}${pageOrNum ? `, p. ${pageOrNum}` : ''})`
      }
      return `(${firstAuthorLast} et al., ${year}${pageOrNum ? `, p. ${pageOrNum}` : ''})`

    case 'harvard':
      if (authors.length <= 2) {
        const authStr = authors.map((a) => a.lastName).join(' and ') || firstAuthorLast
        return `(${authStr} ${year}${pageOrNum ? `: ${pageOrNum}` : ''})`
      }
      return `(${firstAuthorLast} et al. ${year}${pageOrNum ? `: ${pageOrNum}` : ''})`

    case 'mla': {
      const p = pageOrNum ? ` ${pageOrNum}` : ''
      if (authors.length <= 2) {
        const authStr = authors.map((a) => a.lastName).join(' and ') || firstAuthorLast
        return `(${authStr}${p})`
      }
      return `(${firstAuthorLast} et al.${p})`
    }

    case 'ieee':
      return `[${pageOrNum || 1}]`

    case 'chicago':
      return `(${firstAuthorLast} ${year}${pageOrNum ? `, ${pageOrNum}` : ''})`
  }
}

export function formatFullReference(
  source: SourceItem,
  style: CitationStyle,
  indexNumber: number = 1,
): string {
  const authorStr = formatAuthorsList(source.authors, style)
  const year = source.year || (source.publicationDate ? source.publicationDate.slice(0, 4) : 'n.d.')
  const title = source.title.trim()
  const pub = source.publicationTitle || source.publisher || ''
  const pages = source.pages ? `pp. ${source.pages}` : ''
  const doiOrUrl = source.doi ? `https://doi.org/${source.doi}` : source.url || ''

  switch (style) {
    case 'apa':
      // Author, A. A. (Year). Title of work. Publisher / Journal, pages. DOI/URL
      return `${authorStr} (${year}). ${title}.${pub ? ` *${pub}*.` : ''}${pages ? ` ${pages}.` : ''}${doiOrUrl ? ` ${doiOrUrl}` : ''}`

    case 'harvard':
      // Author, A. (Year) 'Title of work', Publication/Publisher, pages. Available at: URL
      return `${authorStr} (${year}) '${title}'${pub ? `, ${pub}` : ''}${pages ? `, ${pages}` : ''}.${doiOrUrl ? ` Available at: ${doiOrUrl}` : ''}`

    case 'mla':
      // Author. "Title." Publication, Publisher, Year, pages. URL.
      return `${authorStr}. "${title}."${pub ? ` *${pub}*,` : ''} ${year}${pages ? `, ${pages}` : ''}.${doiOrUrl ? ` ${doiOrUrl}.` : ''}`

    case 'ieee':
      // [#] A. Author, "Title," Publication, vol, no, pp. pages, Year.
      return `[${indexNumber}] ${authorStr}, "${title},"${pub ? ` *${pub}*,` : ''}${pages ? ` ${pages},` : ''} ${year}.${doiOrUrl ? ` [Online]. Available: ${doiOrUrl}` : ''}`

    case 'chicago':
      return `${authorStr}. ${year}. "${title}."${pub ? ` ${pub}.` : ''}${doiOrUrl ? ` ${doiOrUrl}.` : ''}`
  }
}

export function formatCitation(
  source: SourceItem,
  style: CitationStyle,
  indexNumber: number = 1,
  page?: string | number,
): FormattedCitation {
  return {
    style,
    inText: formatInTextCitation(source, style, style === 'ieee' ? indexNumber : page),
    fullReference: formatFullReference(source, style, indexNumber),
    footnote: `${indexNumber}. ${formatFullReference(source, style, indexNumber)}`,
  }
}

export function generateBibliography(sources: SourceItem[], style: CitationStyle): string {
  if (!sources || sources.length === 0) return ''
  const sorted = [...sources].sort((a, b) => {
    const aLast = a.authors?.[0]?.lastName || a.title
    const bLast = b.authors?.[0]?.lastName || b.title
    return aLast.localeCompare(bLast)
  })

  return sorted.map((s, idx) => formatFullReference(s, style, idx + 1)).join('\n\n')
}
