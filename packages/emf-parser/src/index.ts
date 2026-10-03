/**
 * EMF/EMF+ Parser - Core Types and Re-exports
 *
 * Enhanced Metafile Format (EMF) and EMF+ parser for ReveLith.
 * Supports both EMF (GDI) and EMF+ (GDI+) records.
 *
 * References:
 * - [MS-EMF]: Enhanced Metafile Format
 * - [MS-EMFPLUS]: Enhanced Metafile Format Plus Extensions
 * - [MS-WMF]: Windows Metafile Format (base for EMF)
 */

import type { Point, Rect, Size, Color } from './utils'

export type { Point, Rect, Size, Color } from './utils'
export { BinaryReader, parseColorRef, parseRect, parsePoint } from './utils'

export interface Matrix {
  m11: number
  m12: number
  m21: number
  m22: number
  dx: number
  dy: number
}

export interface LogPalette {
  version: number
  entries: Color[]
}

export interface EmfHeader {
  type: 'EMF' | 'EMF+'
  bounds: Rect
  frame: Rect
  size: Size
  dpi: Point
  recordsCount: number
  handCount: number
  description?: string
  pixelFormat?: number
  emfPlusFlags?: number
  logPalette?: LogPalette
}

export type EmfRecordType =
  | 'EMR_HEADER'
  | 'EMR_EOF'
  | 'EMR_COMMENT'
  | 'EMR_SAVEDC'
  | 'EMR_RESTOREDC'
  | 'EMR_SETBKMODE'
  | 'EMR_SETMAPMODE'
  | 'EMR_SETLAYOUT'
  | 'EMR_SETWORLDTRANSFORM'
  | 'EMR_MODIFYWORLDTRANSFORM'
  | 'EMR_SETROP2'
  | 'EMR_SETBKCOLOR'
  | 'EMR_SETTEXTCOLOR'
  | 'EMR_SETTEXALIGN'
  | 'EMR_SETTEXTCHAREXTRA'
  | 'EMR_SETMITERLIMIT'
  | 'EMR_CREATEPEN'
  | 'EMR_CREATEBRUSHINDIRECT'
  | 'EMR_DELETEOBJECT'
  | 'EMR_SELECTOBJECT'
  | 'EMR_EXTCREATEPEN'
  | 'EMR_CREATEMONOBRUSH'
  | 'EMR_CREATEDIBPATTERNBRUSHPT'
  | 'EMR_BEGINPATH'
  | 'EMR_ENDPATH'
  | 'EMR_CLOSEFIGURE'
  | 'EMR_FLATTENPATH'
  | 'EMR_WIDENPATH'
  | 'EMR_SELECTCLIPPATH'
  | 'EMR_SETROPOLYGONMODE'
  | 'EMR_MOVETOEX'
  | 'EMR_LINETO'
  | 'EMR_ARC'
  | 'EMR_ARCTO'
  | 'EMR_CHORD'
  | 'EMR_PIE'
  | 'EMR_RECTANGLE'
  | 'EMR_ELLIPSE'
  | 'EMR_ROUNDRECT'
  | 'EMR_POLYLINE'
  | 'EMR_POLYLINE16'
  | 'EMR_POLYLINETO'
  | 'EMR_POLYLINETO16'
  | 'EMR_POLYPOLYLINE'
  | 'EMR_POLYPOLYLINE16'
  | 'EMR_POLYGON'
  | 'EMR_POLYGON16'
  | 'EMR_POLYBEZIER'
  | 'EMR_POLYBEZIER16'
  | 'EMR_POLYBEZIERTO'
  | 'EMR_POLYBEZIERTO16'
  | 'EMR_POLYDRAW'
  | 'EMR_POLYDRAW16'
  | 'EMR_EXTTEXTOUTW'
  | 'EMR_EXTTEXTOUTA'
  | 'EMR_SMALLTEXTOUT'
  | 'EMR_BITBLT'
  | 'EMR_STRETCHBLT'
  | 'EMR_STRETCHDIBITS'
  | 'EMR_SETDIBITSTODEVICE'
  | 'EMR_CREATEBITMAP'
  | 'EMR_CREATEMONOBRUSH'
  | 'EMR_CREATEREGION'
  | 'EMR_FRAMERGN'
  | 'EMR_PAINTRGN'
  | 'EMR_INVERTRGN'
  | 'EMR_OFFSETCLIPRGN'
  | 'EMR_EXTSELECTCLIPRGN'

export interface EmfRecord {
  type: EmfRecordType
  size: number
  data: Uint8Array
}

export type EmfPlusRecordType =
  | 'EmfPlusSerializableObject'
  | 'EmfPlusTerminalServerObject'
  | 'EmfPlusObject'
  | 'EmfPlusDrawLines'
  | 'EmfPlusDrawRects'
  | 'EmfPlusDrawEllipses'
  | 'EmfPlusDrawArcs'
  | 'EmfPlusDrawBeziers'
  | 'EmfPlusDrawPath'
  | 'EmfPlusDrawImage'
  | 'EmfPlusDrawImagePoints'
  | 'EmfPlusDrawString'
  | 'EmfPlusDrawDriverString'
  | 'EmfPlusFillRects'
  | 'EmfPlusFillEllipses'
  | 'EmfPlusFillPath'
  | 'EmfPlusFillPie'
  | 'EmfPlusFillRegion'
  | 'EmfPlusFillPolygon'
  | 'EmfPlusSetWorldTransform'
  | 'EmfPlusResetWorldTransform'
  | 'EmfPlusMultiplyWorldTransform'
  | 'EmfPlusTranslateWorldTransform'
  | 'EmfPlusScaleWorldTransform'
  | 'EmfPlusRotateWorldTransform'
  | 'EmfPlusSetClipRect'
  | 'EmfPlusSetClipPath'
  | 'EmfPlusSetClipRegion'
  | 'EmfPlusOffsetClip'
  | 'EmfPlusSetRenderingOrigin'
  | 'EmfPlusSetAntiAliasMode'
  | 'EmfPlusSetTextRenderingHint'
  | 'EmfPlusSetTextContrast'
  | 'EmfPlusSetInterpolationMode'
  | 'EmfPlusSetPixelOffsetMode'
  | 'EmfPlusSetCompositingMode'
  | 'EmfPlusSetCompositingQuality'
  | 'EmfPlusSetSmoothingMode'
  | 'EmfPlusSetPageUnit'
  | 'EmfPlusSetPageScale'
  | 'EmfPlusFillRectangles'
  | 'EmfPlusFillEllipse'
  | 'EmfPlusFillPie'
  | 'EmfPlusFillClosedCurve'
  | 'EmfPlusSolidBrush'
  | 'EmfPlusHatchBrush'
  | 'EmfPlusTextureBrush'
  | 'EmfPlusPathGradientBrush'
  | 'EmfPlusLinearGradientBrush'
  | 'EmfPlusPen'
  | 'EmfPlusFont'
  | 'EmfPlusImage'
  | 'EmfPlusImageAttributes'
  | 'EmfPlusRegion'
  | 'EmfPlusPath'
  | 'EmfPlusDrawPath'
  | 'EmfPlusStringFormat'
  | 'EmfPlusHeader'
  | 'EmfPlusEndOfFile'
  | 'EmfPlusComment'

export interface EmfPlusRecord {
  type: EmfPlusRecordType
  size: number
  flags: number
  data: Uint8Array
}

export interface EmfPen {
  style: number
  width: number
  color: Color
}

export interface EmfBrush {
  style: number
  color: Color
  hatch?: number
  pattern?: EmfBitmap
}

export interface EmfBitmap {
  width: number
  height: number
  planes: number
  bitsPixel: number
  bits: Uint8Array
}

export interface EmfFont {
  height: number
  width: number
  escapement: number
  orientation: number
  weight: number
  italic: boolean
  underline: boolean
  strikeOut: boolean
  charSet: number
  outPrecision: number
  clipPrecision: number
  quality: number
  pitchAndFamily: number
  faceName: string
}

export interface EmfRegion {
  data: Uint8Array
}

export interface EmfPath {
  points: Point[]
  types: number[]
}

export interface EmfPlusPenData {
  color: Color
  width: number
  style: number
  startCap: number
  endCap: number
  join: number
  miterLimit: number
  dashStyle: number
  dashOffset: number
  customDashPattern?: number[]
}

export interface EmfPlusBrushData {
  type: 'solid' | 'hatch' | 'texture' | 'pathGradient' | 'linearGradient'
  color?: Color
  hatchStyle?: number
  foregroundColor?: Color
  backgroundColor?: Color
  textureImage?: EmfPlusImageData
  gradientPoints?: Point[]
  gradientColors?: Color[]
  gradientPositions?: number[]
  wrapMode?: number
  focusScales?: Point
  centerPoint?: Point
  centerColor?: Color
  surroundColors?: Color[]
}

export interface EmfPlusFontData {
  fontFamily: string
  size: number
  style: number
  unit: number
}

export interface EmfPlusImageData {
  type: 'png' | 'jpeg' | 'gif' | 'tiff' | 'bmp' | 'wmf' | 'emf'
  width: number
  height: number
  data: Uint8Array
}

export interface EmfPlusPathData {
  points: Point[]
  types: number[]
}

export interface EmfPlusRegionData {
  rects: Rect[]
}

export interface EmfPlusStringFormatData {
  alignment: number
  lineAlignment: number
  formatFlags: number
  language: string
  digitSubstitution: number
  digitSubstitutionLanguage: string
  firstTabOffset: number
  tabStops: number[]
  hotkeyPrefix: number
  digitSubstitutionMethod: number
}

export interface EmfPlusImageAttributesData {
  colorMatrix?: number[]
  colorMatrixFlags: number
  wrapMode: number
  colorKeyLow?: Color
  colorKeyHigh?: Color
  gamma?: number
  iccProfile?: Uint8Array
}

export interface EmfPlusHeader {
  version: number
  emfPlusFlags: number
  width: number
  height: number
  dpiX: number
  dpiY: number
  maxRecord: number
}

export interface ParsedEmfPlusRecord {
  type: string
  typeValue: number
  flags: number
  size: number
  data: Uint8Array
}

export interface SvgElement {
  tag: string
  attrs: Record<string, string>
  children: SvgElement[]
  text?: string
}

export interface SvgDocument {
  width: number
  height: number
  viewBox: string
  elements: SvgElement[]
  defs?: SvgElement[]
}

export interface EmfParserOptions {
  dpi?: number
  defaultFontFamily?: string
  embedImages?: boolean
  precision?: number
}

export interface EmfParseResult {
  header: EmfHeader
  records: EmfRecord[]
  emfPlusRecords?: any[]
  svg?: SvgDocument
  errors: string[]
}

export { parseEmf } from './emf'
export { parseEmfPlus, parseEmfPlusHeader, parseEmfPlusRecords, emfPlusToSvg } from './emfp'
