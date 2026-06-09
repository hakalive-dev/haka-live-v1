/** Dev-only login funnel timing (see login performance plan). */
export function logAuthTiming(label: string): void {
  if (!__DEV__) return;
  console.log(`[auth:timing] ${label} @ ${Date.now()}`);
}

export function authTimingMark(): number {
  return Date.now();
}

export function logAuthTimingElapsed(label: string, startedAt: number): void {
  if (!__DEV__) return;
  console.log(`[auth:timing] ${label} +${Date.now() - startedAt}ms`);
}
