/**
 * Resolve model-emitted field keys without relaxing the form's field-ID
 * validation. Exact IDs always win; the only fallback repairs the common
 * hyphen-to-underscore normalization, and only when the canonical hyphenated
 * ID exists in the current form.
 */
export function resolveTranslationFieldId(
  candidate: string,
  fieldIds: ReadonlySet<string>,
): string | undefined {
  if (fieldIds.has(candidate)) return candidate
  const hyphenated = candidate.replace(/_/g, '-')
  return hyphenated !== candidate && fieldIds.has(hyphenated) ? hyphenated : undefined
}
