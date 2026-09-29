/**
 * Minimal sfnt cmap reader moved to @revelith/font-metrics (the docs metrics
 * pipeline and the PDF text-edit fallback chain need the same coverage test);
 * re-exported here so text-edit's import path stays stable.
 */

export { fontCoversText } from '@revelith/font-metrics'
