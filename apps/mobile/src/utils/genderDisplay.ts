export type NormalizedGender = 'male' | 'female';

export function normalizeGender(raw?: string | null): NormalizedGender | null {
  const g = (raw ?? '').trim().toLowerCase();
  if (g === 'male') return 'male';
  if (g === 'female') return 'female';
  return null;
}

export function getGenderSymbol(raw?: string | null): string | null {
  const g = normalizeGender(raw);
  if (g === 'male') return '♂';
  if (g === 'female') return '♀';
  return null;
}

/** Solid pill background (PublicProfile, applicant badges). */
export function getGenderPillBackground(raw?: string | null): string {
  return normalizeGender(raw) === 'male' ? '#4DA6FF' : '#FF6B9D';
}

/** Gradient pair for overlay pills (male blue, female pink). */
export function getGenderPillGradient(raw?: string | null): [string, string] {
  return normalizeGender(raw) === 'male'
    ? ['#4DA6FF', '#2A7FD4']
    : ['#FF6BB5', '#D13A8E'];
}
