// ── Colors ────────────────────────────────────────────────────────────────────

export const Colors = {
  // Backgrounds
  background:       '#FFFFFF',
  surface:          '#F5F5F7',
  surfaceElevated:  '#FFFFFF',
  surfaceHighlight: '#E8E8ED',

  // Brand
  primary:          '#7B4FFF',
  primaryDark:      '#5B2FD4',
  primaryLight:     '#9D7FFF',
  primarySubtle:    '#7B4FFF22',

  // Accent
  gold:             '#E8A020',
  goldLight:        '#F5C842',
  goldSubtle:       '#E8A02018',

  // Economy
  coin:             '#E8A020',
  bean:             '#22C97A',
  beanSubtle:       '#22C97A18',

  // Semantic
  success:          '#22C97A',
  danger:           '#FF4D4D',
  warning:          '#E8A020',
  info:             '#4DA6FF',

  // Text
  textPrimary:      '#1A1A1A',
  textSecondary:    '#666666',
  textTertiary:     '#999999',
  textInverse:      '#FFFFFF',

  // Borders
  border:           '#E0E0E0',
  borderLight:      '#EEEEEE',

  // Live / Status
  live:             '#FF4444',
  payroll:          '#FF2D55',
  online:           '#22C97A',

  // Gradients (arrays for LinearGradient)
  gradientPurple:   ['#7B4FFF', '#4A1FCC'] as [string, string],
  gradientGold:     ['#F5C842', '#E8A020'] as [string, string],
  gradientDark:     ['#F5F5F7', '#FFFFFF'] as [string, string],
  gradientCard:     ['#FFFFFF00', '#FFFFFFFF'] as [string, string],
} as const;

// ── Spacing ───────────────────────────────────────────────────────────────────

export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  xxl:  32,
  xxxl: 48,
} as const;

// ── Border Radius ─────────────────────────────────────────────────────────────

export const Radius = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
} as const;

// ── Shadows ───────────────────────────────────────────────────────────────────

export const Shadows = {
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  purple: {
    shadowColor: '#7B4FFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  bottom: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
} as const;

// ── Typography ────────────────────────────────────────────────────────────────

export const Typography = {
  fontFamily: 'Inter',

  sizes:       { xs: 11, sm: 13, md: 15, lg: 17, xl: 20, xxl: 24, hero: 30 },
  weights:     { regular: '400', medium: '500', semibold: '600', bold: '700' },
  lineHeights: { tight: 1.2, normal: 1.5, relaxed: 1.7 },

  styles: {
    hero:      { fontSize: 30, fontWeight: '700' as const, color: '#1A1A1A' },
    h1:        { fontSize: 24, fontWeight: '700' as const, color: '#1A1A1A' },
    h2:        { fontSize: 20, fontWeight: '600' as const, color: '#1A1A1A' },
    h3:        { fontSize: 17, fontWeight: '600' as const, color: '#1A1A1A' },
    body:      { fontSize: 15, fontWeight: '400' as const, color: '#1A1A1A' },
    bodySmall: { fontSize: 13, fontWeight: '400' as const, color: '#666666' },
    caption:   { fontSize: 11, fontWeight: '400' as const, color: '#999999' },
    label:     { fontSize: 13, fontWeight: '500' as const, color: '#1A1A1A' },
    button:    { fontSize: 15, fontWeight: '600' as const, color: '#FFFFFF' },
    buttonSm:  { fontSize: 13, fontWeight: '600' as const, color: '#FFFFFF' },
    username:  { fontSize: 13, fontWeight: '400' as const, color: '#666666' },
    badge:     { fontSize: 11, fontWeight: '700' as const, color: '#FFFFFF' },
  },
} as const;

// ── Legacy aliases (backward-compat) ─────────────────────────────────────────

export const colors = {
  background:    Colors.background,
  surface:       Colors.surface,
  border:        Colors.border,
  primary:       Colors.primary,
  textPrimary:   Colors.textPrimary,
  textSecondary: Colors.textSecondary,
  error:         Colors.danger,
} as const;

export const spacing = Spacing;
