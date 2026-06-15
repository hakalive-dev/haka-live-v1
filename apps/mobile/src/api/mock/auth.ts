import { User } from '../../types';
import { AuthResult } from '../auth';

/** Matches backend `seed-state-ranking-host.ts` — female host in Tamil Nadu. */
export const mockUser: User = {
  id: '99999999-9999-4999-8999-900001000098',
  phone: '+919876543210',
  email: 'priya.sharma@example.com',
  username: 'priya_tn',
  displayName: 'Priya Sharma',
  avatar: 'https://i.pravatar.cc/150?u=priya_tn_state',
  bio: 'Tamil Nadu host · State Star rankings dev account',
  country: 'India',
  state: 'TN',
  gender: 'female',
  hakaId: '500000098',
  role: 'host',
  hostType: 'independent',
  hostApplicationPath: 'self_apply_independent',
  agentId: null,
  onboardingComplete: true,
  isVerifiedHost: true,
  faceVerificationStatus: 'approved',
  createdAt: '2025-09-12T14:30:00Z',
  updatedAt: '2025-09-12T14:30:00Z',
};

export const mockAuth = {
  me: mockUser,

  loginResult: {
    user: mockUser,
    tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
  } as AuthResult,
};
