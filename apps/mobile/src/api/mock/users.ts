import { PaginatedResult, PublicUser, SpecialAttentionEntry, VisitorEntry } from '../../types';

const u1: PublicUser = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  username: 'amara_live',
  displayName: 'Amara Okafor',
  avatar: 'https://i.pravatar.cc/150?u=amara_live',
  bio: 'Singer & live host from Lagos 🇳🇬 | Streaming daily 8PM WAT 🎤✨',
  hakaId: 'HAKAABC12345',
  country: 'Nigeria',
  role: 'host',
  hostType: 'independent',
  followerCount: 12_480,
  followingCount: 234,
  isFollowing: false,
  isSpecialAttention: false,
  createdAt: '2025-09-12T14:30:00Z',
};

const u2: PublicUser = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  username: 'kai_streams',
  displayName: 'Kai Rivera',
  avatar: 'https://i.pravatar.cc/150?u=kai_streams',
  bio: 'DJ & night owl 🌙 | Spinning tracks from Manila 🇵🇭 | DM for collabs',
  hakaId: 'HAKABCD23456',
  country: 'Philippines',
  role: 'host',
  hostType: 'agent_host',
  followerCount: 8_920,
  followingCount: 156,
  isFollowing: true,
  isSpecialAttention: false,
  createdAt: '2025-09-15T10:00:00Z',
};

const u3: PublicUser = {
  id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  username: 'preeti_music',
  displayName: 'Preeti Sharma',
  avatar: 'https://i.pravatar.cc/150?u=preeti_music',
  bio: 'Bollywood singer | Coffee addict ☕ | Mumbai vibes 🇮🇳',
  hakaId: 'HAKACDE34567',
  country: 'India',
  role: 'host',
  hostType: 'agent_host',
  followerCount: 24_300,
  followingCount: 89,
  isFollowing: true,
  isSpecialAttention: true,
  createdAt: '2025-08-20T08:00:00Z',
};

const u4: PublicUser = {
  id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  username: 'yuki_chan',
  displayName: 'Yuki Tanaka',
  avatar: 'https://i.pravatar.cc/150?u=yuki_chan',
  bio: 'Just here for good vibes 🌸 | Tokyo 🇯🇵',
  hakaId: 'HAKADE45678',
  country: 'Japan',
  role: 'normal_user',
  hostType: '',
  followerCount: 412,
  followingCount: 678,
  isFollowing: false,
  isSpecialAttention: false,
  createdAt: '2025-10-01T12:00:00Z',
};

const u5: PublicUser = {
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  username: 'omar_beats',
  displayName: 'Omar Hassan',
  avatar: 'https://i.pravatar.cc/150?u=omar_beats',
  bio: 'Producer | Gamer | Cairo nights 🇪🇬 🎮🎵',
  hakaId: 'HAKAEF56789',
  country: 'Egypt',
  role: 'normal_user',
  hostType: '',
  followerCount: 1_870,
  followingCount: 320,
  isFollowing: true,
  isSpecialAttention: false,
  createdAt: '2025-10-10T09:30:00Z',
};

function paged<T>(items: T[]): PaginatedResult<T> {
  return { items, total: items.length, page: 1, limit: 20, hasMore: false };
}

const MOCK_PUBLIC_USERS: PublicUser[] = [u1, u2, u3, u4, u5];

/** Resolves GET /users/:id mock — same as backend (UUID or hakaId). */
export function mockProfileByIdOrHaka(idOrHaka: string): PublicUser | null {
  const q = idOrHaka.trim();
  if (!q) return null;
  return MOCK_PUBLIC_USERS.find((u) => u.id === q || u.hakaId === q) ?? null;
}

export const mockUsers: {
  searchResults: PaginatedResult<PublicUser>;
  friends: PaginatedResult<PublicUser>;
  followers: PaginatedResult<PublicUser>;
  following: PaginatedResult<PublicUser>;
  visitors: PaginatedResult<VisitorEntry>;
  specialAttention: PaginatedResult<SpecialAttentionEntry>;
} = {
  searchResults: paged([u1, u2, u3]),
  friends: paged([u2, u3]),
  followers: paged([u2, u3, u4, u5]),
  following: paged([u2, u3, u5]),
  visitors: paged([
    { user: u4, visitedAt: '2026-03-31T16:42:00Z' },
    { user: u2, visitedAt: '2026-03-31T09:15:00Z' },
    { user: u5, visitedAt: '2026-03-30T22:08:00Z' },
  ]),
  specialAttention: paged([
    { user: u3, createdAt: '2026-02-14T12:00:00Z' },
  ]),
};
