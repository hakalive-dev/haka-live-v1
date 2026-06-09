import { User } from '../../types';
import { AuthResult } from '../auth';

export const mockUser: User = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  phone: '+447911234567',
  email: 'amara.okafor@gmail.com',
  username: 'amara_live',
  displayName: 'Amara Okafor',
  avatar: 'https://i.pravatar.cc/150?u=amara_live',
  bio: 'Singer & live host from Lagos 🇳🇬 | Streaming daily 8PM WAT 🎤✨',
  country: 'Nigeria',
  hakaId: 'HAKAABC12345',
  role: 'host',
  hostType: 'independent',
  hostApplicationPath: 'self_apply_independent',
  agentId: null,
  onboardingComplete: true,
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
