/**
 * Producers in the OpenXML SDK family bind the spreadsheetml namespace to a
 * prefix (`<x:workbook><x:sheets>…`), which is invisible to a text-based patch
 * pipeline: every element pattern here is written unprefixed, so a prefixed
 * part silently matches nothing and the edit appears to do nothing.
 *
 * Parts are normalized at read time instead — the prefix is stripped and
 * re-declared as the default namespace. Only parts that are actually rewritten
 * reach the file, so untouched archive entries keep their bytes.
 *
 * Anything ambiguous returns the input unchanged rather than guessing. A
 * normalized-by-mistake part is worse than an un-normalized one: the save then
 * fails with the same error it produced before this pass existed, which is
 * debuggable, instead of producing a corrupt workbook.
 */

const NORMALIZABLE_NAMESPACES = new Set([
  'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
  'http://schemas.openxmlformats.org/package/2006/relationships',
  'http://schemas.openxmlformats.org/package/2006/content-types',
])

const SPREADSHEETML_NAMESPACE = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const OFFICE_RELATIONSHIPS_NAMESPACE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships'

/**
 * Root start tag. The alternation keeps a `>` inside an attribute value (legal
 * in XML) from ending the match early.
 */
const ROOT_START_TAG = /<(?![?!])(?:[^>"']|"[^"]*"|'[^']*')*?\/?>/

/**
 * The elements this pipeline appends carry `r:`-prefixed attributes, and some
 * producers bind `r` on individual elements only. Binding it on the host root
 * first keeps such an insertion well-formed.
 */
export function ensureRelationshipNamespace(partXml: string): string {
  const root = ROOT_START_TAG.exec(partXml)?.[0]
  if (!root || /\bxmlns:r\s*=/.test(root)) return partXml
  const bound = root.replace(/^<([^\s/>]+)/, `<$1 xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"`)
  // a function replacer, so a "$" inside the root tag's own attribute values is
  // not read as a String.replace pattern
  return partXml.replace(root, () => bound)
}

export function normalizeOoxmlPartPrefix(xml: string): string {
  const root = /<(?![?!])([^\s/>]+)((?:[^>"']|"[^"]*"|'[^']*')*?)\/?>/.exec(xml)
  if (!root?.[1]) return xml
  const colon = root[1].indexOf(':')
  if (colon <= 0) return xml
  const prefix = root[1].slice(0, colon)
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(prefix)) return xml

  const rootTag = root[0]
  const declarationPattern = new RegExp(`xmlns:${prefix}\\s*=\\s*"([^"]*)"`)
  const declaration = declarationPattern.exec(rootTag)
  const uri = declaration?.[1]
  if (declaration === null || uri === undefined || !NORMALIZABLE_NAMESPACES.has(uri)) return xml

  // Sections where plain text substitution could corrupt content.
  if (xml.includes('<![CDATA[') || xml.includes('<!--')) return xml
  // An existing default binding would capture the de-prefixed elements.
  if (/\sxmlns\s*=\s*["']/.test(xml)) return xml
  // The prefix rebound to a different namespace somewhere deeper in the tree.
  for (const other of xml.matchAll(new RegExp(`\\sxmlns:${prefix}\\s*=\\s*"([^"]*)"`, 'g'))) {
    if (other[1] !== uri) return xml
  }

  const stripped = xml.replaceAll(`<${prefix}:`, '<').replaceAll(`</${prefix}:`, '</')
  // Attributes may still use the prefix, so keep its binding alongside the new
  // default declaration rather than dropping it.
  const bindings = new RegExp(`\\s${prefix}:`).test(stripped)
    ? `xmlns="${uri}" ${declaration[0]}`
    : `xmlns="${uri}"`
  let result = stripped.replace(declaration[0], bindings)

  // Appended elements carry `r:`-prefixed attributes (a new `<sheet r:id=…>`),
  // and these producers bind `r` per element rather than on the root, so a
  // root-level binding keeps such additions well-formed.
  if (
    uri === SPREADSHEETML_NAMESPACE &&
    !new RegExp(`xmlns:r\\s*=\\s*"`).test(ROOT_START_TAG.exec(result)?.[0] ?? '') &&
    [...result.matchAll(/\sxmlns:r\s*=\s*"([^"]*)"/g)].every(
      (other) => other[1] === OFFICE_RELATIONSHIPS_NAMESPACE,
    )
  ) {
    result = result.replace(
      `xmlns="${uri}"`,
      `xmlns="${uri}" xmlns:r="${OFFICE_RELATIONSHIPS_NAMESPACE}"`,
    )
  }
  return result
}
