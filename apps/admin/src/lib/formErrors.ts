// Turns the backend's per-field Zod errors (attached to rejected errors as
// `fieldErrors` by the axios client) into a short, human-readable summary for a toast.

/** Optional map from raw field keys (e.g. "appUser") to friendly labels. */
export type FieldLabels = Record<string, string>

export function formatFieldErrors(
  fieldErrors: Record<string, string[]> | undefined | null,
  labels: FieldLabels = {},
): string {
  if (!fieldErrors) return ''
  const parts: string[] = []
  for (const [field, msgs] of Object.entries(fieldErrors)) {
    if (!msgs?.length) continue
    const label = labels[field] ?? field
    parts.push(`${label}: ${msgs.join(', ')}`)
  }
  return parts.join('\n')
}

/** Reads the `fieldErrors` bag the axios client attaches to a rejected error. */
export function fieldErrorsOf(e: unknown): Record<string, string[]> | undefined {
  return (e as { fieldErrors?: Record<string, string[]> } | null)?.fieldErrors
}
