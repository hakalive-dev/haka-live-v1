import { createHash } from 'crypto';

/** Agora channel names must be < 64 bytes; sorted UUID pair is ~78 bytes. */
export function deriveCallChannelName(userIdA: string, userIdB: string): string {
  const [a, b] = [userIdA, userIdB].sort();
  const hash = createHash('sha256').update(`${a}:${b}`).digest('hex').slice(0, 32);
  return `call_${hash}`;
}
