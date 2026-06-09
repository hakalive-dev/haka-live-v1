import type { Family, FamilyDetail, FamilyMember } from '@/types';

const MOCK_MEMBERS: FamilyMember[] = [
  {
    id: 'fm-a1b2c3d4',
    user: { id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c', username: 'rosa_queen', displayName: 'Rosa Martinez', avatar: '', hakaId: 'HK110234', role: 'host' },
    role: 'owner',
    joinedAt: '2025-06-15T10:00:00Z',
    createdAt: '2025-06-15T10:00:00Z',
  },
  {
    id: 'fm-b2c3d4e5',
    user: { id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', username: 'amara_live', displayName: 'Amara Okafor', avatar: '', hakaId: 'HK294817', role: 'host' },
    role: 'admin',
    joinedAt: '2025-07-02T14:30:00Z',
    createdAt: '2025-07-02T14:30:00Z',
  },
  {
    id: 'fm-c3d4e5f6',
    user: { id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e', username: 'kai_streams', displayName: 'Kai Rivera', avatar: '', hakaId: 'HK381924', role: 'normal_user' },
    role: 'member',
    joinedAt: '2025-07-18T09:00:00Z',
    createdAt: '2025-07-18T09:00:00Z',
  },
];

const MOCK_FAMILY_DETAIL: FamilyDetail = {
  id: 'fam-1a2b3c4d',
  name: 'Golden Phoenix',
  owner: { id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c', username: 'rosa_queen', displayName: 'Rosa Martinez', avatar: '' },
  badge: '🔥',
  announcement: 'We rise together 🔥 Top 3 family in Haka Live.',
  tier: 'gold',
  weeklyBeans: 50_000,
  totalBeans: 414_400,
  createdAt: '2025-06-15T10:00:00Z',
  _count: { members: 3 },
  members: MOCK_MEMBERS,
};

export const mockFamily = {
  myFamily: MOCK_FAMILY_DETAIL,

  families: [
    {
      id: 'fam-1a2b3c4d',
      name: 'Golden Phoenix',
      owner: { id: 'f1a2b3c4-d5e6-4f7a-8b9c-0d1e2f3a4b5c', username: 'rosa_queen', displayName: 'Rosa Martinez', avatar: '' },
      badge: '🔥',
      announcement: 'We rise together 🔥',
      tier: 'gold' as const,
      weeklyBeans: 50_000,
      totalBeans: 414_400,
      createdAt: '2025-06-15T10:00:00Z',
      _count: { members: 6 },
    },
    {
      id: 'fam-2b3c4d5e',
      name: 'Silver Wolves',
      owner: { id: 'x1y2z3a4-b5c6-4d7e-8f9a-0b1c2d3e4f5a', username: 'luna_night', displayName: 'Luna Reyes', avatar: '' },
      badge: '🐺',
      announcement: 'Nocturnal streamers unite 🌙',
      tier: 'silver' as const,
      weeklyBeans: 18_600,
      totalBeans: 188_600,
      createdAt: '2025-04-20T08:00:00Z',
      _count: { members: 14 },
    },
  ] as Family[],
};
