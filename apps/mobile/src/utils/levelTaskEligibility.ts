import type { User } from '@/types';

/** Level tasks require verified female hosts (backend enforces the same rule). */
export function canAccessLevelTask(user: User | null | undefined): boolean {
  if (!user || user.role !== 'host') return false;
  return user.gender === 'female' && user.isVerifiedHost === true;
}
