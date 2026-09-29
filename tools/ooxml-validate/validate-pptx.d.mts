export interface SchemaProblem {
  /** ZIP part path the problem was found in */
  part: string
  /** xmllint's message for that part */
  message: string
}
export function xmllintAvailable(): boolean
export function mcePreprocess(xml: string): string
export function validatePptx(input: string | Uint8Array): Promise<SchemaProblem[]>
export function newProblems(base: SchemaProblem[], edited: SchemaProblem[]): SchemaProblem[]
