/**
 * Spreadsheet OOXML domain logic.
 *
 * Deliberately free of Electron and of any spreadsheet UI dependency, so the
 * desktop app, the headless CLI and any future consumer share one
 * implementation of the rules rather than three that drift.
 */
export {
  applyTint,
  DEFAULT_THEME_PALETTE,
  describeStyleColor,
  echoStyleColor,
  fillDisplayColor,
  isGradientFill,
  isThemeColor,
  normalizeStyleColor,
  PATTERN_TYPES,
  resolveStyleColor,
  THEME_SHORTHAND_PATTERN,
  THEME_SLOT_NAMES,
  themeSlotIndex,
  themeSlotName,
} from './domain/style-color'
export type {
  FillSpec,
  GradientFill,
  GradientStop,
  PatternFill,
  PatternType,
  StyleColor,
  StyleColorEcho,
  ThemeColor,
  ThemeSlotName,
} from './domain/style-color'

export { decodeXlsxEscapes, encodeXlsxEscapes } from './gateway/xlsx-escapes'
export { MINIMAL_STYLESHEET_XML } from './gateway/xlsx-default-styles'
export { DEFAULT_THEME_XML } from './gateway/xlsx-default-theme'
export { ensureRelationshipNamespace, normalizeOoxmlPartPrefix } from './gateway/xlsx-namespace'
export { applyThemeState, ThemeStateError } from './gateway/xlsx-theme'
export type { WorkbookThemeState } from './gateway/xlsx-theme'
export { parseStylesheetFormats } from './gateway/xlsx-style-read'
export type { StylesheetFormats } from './gateway/xlsx-style-read'
export { spillsDynamicArray, withFutureFunctionMarkers } from './gateway/future-functions'

export {
  DEFAULT_SHORT_DATE,
  getSystemShortDate,
  setSystemShortDate,
  shortDateNumFmtId,
  shortDatePatternForSystemLocale,
} from './shared/short-date'
