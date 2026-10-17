import type { LazyWorkbookState } from './univer-state'

// Formula-view sheets for blank/demo workbooks (no LazyWorkbookState).
const demoFormulaViewSheets = new Set<string>()

export function formulaViewSheets(state: LazyWorkbookState | null): Set<string> {
  return state ? state.showFormulaSheets : demoFormulaViewSheets
}
