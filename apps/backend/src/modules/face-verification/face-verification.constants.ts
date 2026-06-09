/** Ordered liveness steps shown in the mobile app. */
export const FACE_CHALLENGE_STEPS = [
  { key: 'nod', label: 'Nod your head slowly' },
  { key: 'turn_left', label: 'Turn your head to the left' },
  { key: 'turn_right', label: 'Turn your head to the right' },
  { key: 'blink', label: 'Blink your eyes' },
  { key: 'smile', label: 'Smile or open your mouth' },
] as const;

export type FaceChallengeKey = (typeof FACE_CHALLENGE_STEPS)[number]['key'];

export const FACE_CHALLENGE_KEYS: FaceChallengeKey[] = FACE_CHALLENGE_STEPS.map((s) => s.key);

export const FACE_STORAGE_BUCKET = 'admin-uploads';

export const FACE_MIN_CONFIDENCE = 90;
export const FACE_MIN_SIMILARITY = 85;
