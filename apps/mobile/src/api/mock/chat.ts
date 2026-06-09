import { ChatMessage, DirectMessage, DMConversation } from '../../types';

// Current user (amara)
const amara = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  username: 'amara_live',
  displayName: 'Amara Okafor',
  avatar: 'https://i.pravatar.cc/150?u=amara_live',
  hakaId: 'HK294817',
};

// Contacts matching design
const hakaTeam = {
  id: 'f1111111-1111-4111-8111-111111111111',
  username: 'haka_live_team',
  displayName: 'Haka Team',
  avatar: 'https://i.pravatar.cc/150?u=haka_live_team',
  hakaId: 'HK000001',
  profileHidden: true as const,
};

const johnManny = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  username: 'john_manny',
  displayName: 'John Manny',
  avatar: 'https://i.pravatar.cc/150?u=john_manny',
  hakaId: 'HK381924',
};

const janetMane = {
  id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  username: 'janet_mane',
  displayName: 'Janet Mane',
  avatar: 'https://i.pravatar.cc/150?u=janet_mane',
  hakaId: 'HK472036',
};

const maryMane = {
  id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  username: 'mary_mane',
  displayName: 'Mary Mane',
  avatar: 'https://i.pravatar.cc/150?u=mary_mane',
  hakaId: 'HK563148',
};

const julieMane = {
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  username: 'julie_mane',
  displayName: 'Julie Mane',
  avatar: 'https://i.pravatar.cc/150?u=julie_mane',
  hakaId: 'HK654259',
};

const wateen1 = {
  id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
  username: 'wateen',
  displayName: 'Wateen',
  avatar: 'https://i.pravatar.cc/150?u=wateen',
  hakaId: 'HK745360',
};

const wateen2 = {
  id: 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d',
  username: 'wateen2',
  displayName: 'Wateen',
  avatar: 'https://i.pravatar.cc/150?u=wateen2',
  hakaId: 'HK836471',
};

export const mockChat: {
  roomMessages: ChatMessage[];
  conversations: DMConversation[];
  dmMessages: DirectMessage[];
  onlineFriends: Array<{ id: string; displayName: string; avatar: string | null; isOnline: boolean }>;
} = {
  onlineFriends: [
    { id: janetMane.id, displayName: 'Janet Mane', avatar: janetMane.avatar, isOnline: true },
    { id: wateen1.id, displayName: 'Wateen', avatar: wateen1.avatar, isOnline: true },
  ],

  roomMessages: [
    { id: 'cm-7a1b2c3d', sender: johnManny, content: 'Yo this beat is fire', createdAt: '2026-04-01T19:05:00Z' },
    { id: 'cm-8b2c3d4e', sender: janetMane, content: 'Love this room!!', createdAt: '2026-04-01T19:06:30Z' },
    { id: 'cm-9c3d4e5f', sender: amara, content: 'Welcome fam! Glad you\'re all here', createdAt: '2026-04-01T19:07:00Z' },
    { id: 'cm-0d4e5f6a', sender: maryMane, content: 'Can you play some Afrobeats next?', createdAt: '2026-04-01T19:08:15Z' },
    { id: 'cm-1e5f6a7b', sender: julieMane, content: 'First time here, this room is amazing', createdAt: '2026-04-01T19:09:00Z' },
  ],

  conversations: [
    {
      otherUser: hakaTeam,
      lastMessage: {
        id: 'dm-official-1',
        sender: hakaTeam,
        recipient: amara,
        content: 'You received 20000 point.',
        isRead: true,
        createdAt: '2026-04-03T11:30:00Z',
      },
      unreadCount: 0,
      isOnline: false,
      isOfficial: true,
    },
    {
      otherUser: johnManny,
      lastMessage: {
        id: 'dm-john-1',
        sender: johnManny,
        recipient: amara,
        content: 'Message not replied for few days',
        isRead: true,
        createdAt: '2026-04-03T10:15:00Z',
      },
      unreadCount: 0,
      isOnline: false,
      isFollowing: true,
      isFriend: false,
    },
    {
      otherUser: janetMane,
      lastMessage: {
        id: 'dm-janet-1',
        sender: janetMane,
        recipient: amara,
        content: '[Invite Share]',
        isRead: true,
        createdAt: '2026-04-02T14:30:00Z',
      },
      unreadCount: 0,
      isOnline: true,
      level: 4.5,
      levelColor: '#22C97A',
      isFollowing: true,
      isFriend: true,
      isFamiliar: true,
    },
    {
      otherUser: maryMane,
      lastMessage: {
        id: 'dm-mary-1',
        sender: amara,
        recipient: maryMane,
        content: 'Yes received',
        isRead: true,
        createdAt: '2026-04-02T10:30:00Z',
      },
      unreadCount: 0,
      isOnline: false,
      level: 35,
      levelColor: '#FF69B4',
      isFollowing: true,
      isFriend: true,
      isFamiliar: true,
    },
    {
      otherUser: julieMane,
      lastMessage: {
        id: 'dm-julie-1',
        sender: julieMane,
        recipient: amara,
        content: 'Message not replied',
        isRead: true,
        createdAt: '2026-09-03T15:00:00Z',
      },
      unreadCount: 0,
      level: 75,
      levelColor: '#7B4FFF',
      giftCount: 500000,
      isFollowing: true,
      isFriend: false,
      isFamiliar: true,
    },
  ],

  // DM messages for Janet Mane conversation (shown in Open Chat design)
  dmMessages: [
    {
      id: 'dm-conv-1',
      sender: amara,
      recipient: janetMane,
      content: 'Hello Jane',
      isRead: true,
      createdAt: '2026-04-03T14:12:00Z',
    },
    {
      id: 'dm-conv-2',
      sender: janetMane,
      recipient: amara,
      content: 'Lorem ipsum dolor sit amet consectetur. Mattis eget morbi nibh lectus sapien netus dolor.',
      isRead: false,
      createdAt: '2026-04-03T14:13:00Z',
    },
  ],
};
