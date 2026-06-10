export const GIFT_CATEGORY_OPTIONS = [
  { value: 'bag', label: 'Bag' },
  { value: 'hot', label: 'Hot' },
  { value: 'lucky', label: 'Lucky' },
  { value: 'event', label: 'Event' },
  { value: 'svip', label: 'SVIP' },
  { value: 'customized', label: 'Customized' },
] as const

const LABELS: Record<string, string> = Object.fromEntries(
  GIFT_CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

const LEGACY_LABELS: Record<string, string> = {
  basic: 'Bag',
  premium: 'Hot',
  special: 'Lucky',
  luxury: 'Hot',
}

export function formatGiftCategory(value: string | null | undefined): string {
  const key = (value ?? '').toLowerCase()
  return LABELS[key] ?? LEGACY_LABELS[key] ?? value ?? '—'
}

/** Map stored category (incl. legacy values) to a form select value. */
export function normalizeGiftFormCategory(value: string | null | undefined): string {
  const key = (value ?? '').toLowerCase()
  const legacy: Record<string, string> = {
    basic: 'bag',
    premium: 'hot',
    special: 'lucky',
    luxury: 'hot',
  }
  if (legacy[key]) return legacy[key]
  if (key in LABELS) return key
  return 'bag'
}
