/**
 * Minimal workbook stylesheet for a workbook created from scratch.
 *
 * A workbook with no `xl/styles.xml` is tolerated by Excel, which falls back to
 * its own defaults — but not by a headless formula engine reading the archive,
 * which fails the whole import with "specified file not found in archive". So a
 * blank workbook plus a formula write used to produce a file the UI could open
 * and the CLI could not: every cell-level result was unreachable headlessly.
 *
 * The shape is what a later style edit expects to find, so a style write
 * extends this table instead of replacing it.
 */
export const MINIMAL_STYLESHEET_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'
