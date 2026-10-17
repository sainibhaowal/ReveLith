/** A new standalone build must not inherit stale creative content from chat history. */
export function startsStandaloneBuild(instruction: string): boolean {
  const text = instruction.trim().toLocaleLowerCase()
  if (!/^(?:now\s+)?(?:only\s+)?(?:build|create|design|draw|make)\b/.test(text)) return false
  if (
    /\b(?:continue|edit|fix|repair|improve|update|change|add to|same board|above|previous)\b/.test(
      text,
    )
  )
    return false
  return /\b(?:infographic|poster|guide|roadmap|diagram|drawing|sketch|board|canvas)\b/.test(text)
}
