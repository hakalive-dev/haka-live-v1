import { PaginatedResult, Room, Seat } from '../../types';

const hostAmara = {
  id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  username: 'amara_live',
  displayName: 'Amara Okafor',
  avatar: 'https://i.pravatar.cc/150?u=amara_live',
  hakaId: 'HAKAABC12345',
};

const hostKai = {
  id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
  username: 'kai_streams',
  displayName: 'Kai Rivera',
  avatar: 'https://i.pravatar.cc/150?u=kai_streams',
  hakaId: 'HAKABCD23456',
};

const speakerPreeti = {
  id: 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f',
  username: 'preeti_music',
  displayName: 'Preeti Sharma',
  avatar: 'https://i.pravatar.cc/150?u=preeti_music',
};

const speakerYuki = {
  id: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  username: 'yuki_chan',
  displayName: 'Yuki Tanaka',
  avatar: 'https://i.pravatar.cc/150?u=yuki_chan',
};

const speakerOmar = {
  id: 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8a9b',
  username: 'omar_beats',
  displayName: 'Omar Hassan',
  avatar: 'https://i.pravatar.cc/150?u=omar_beats',
};

function seat(position: number, user: typeof speakerPreeti | null, isLocked = false): Seat {
  return {
    id: `seat-${position}`,
    roomId: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
    position,
    userId: user ? user.id : null,
    user,
    isLocked,
    isMuted: false,
    createdAt: '2026-04-01T19:00:00Z',
    updatedAt: '2026-04-01T19:00:00Z',
  };
}

const detailSeats: Seat[] = [
  seat(1, hostAmara),
  seat(2, speakerPreeti),
  seat(3, speakerYuki),
  seat(4, null),
  seat(5, null, true),
];

const detailRoom: Room = {
  id: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
  hostId: hostAmara.id,
  host: hostAmara,
  title: 'Afrobeats & Chill 🎶',
  description: 'Playing the hottest Afrobeats tracks and chatting with the fam. Come vibe with us! 🔥🇳🇬',
  coverImage: 'https://picsum.photos/seed/room1/400/200',
  category: 'music',
  type: 'public',
  roomMode: 'chat',
  status: 'live',
  micConfig: 5,
  isLocked: false,
  viewerCount: 187,
  agoraChannel: 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f8a9b0c',
  startedAt: '2026-04-01T19:00:00Z',
  endedAt: null,
  createdAt: '2026-04-01T19:00:00Z',
  updatedAt: '2026-04-01T19:25:00Z',
  seats: detailSeats,
};

function paged<T>(items: T[]): PaginatedResult<T> {
  return { items, total: items.length, page: 1, limit: 20, hasMore: false };
}

export const mockRooms: { list: PaginatedResult<Room>; detail: Room } = {
  list: paged([
    detailRoom,
    {
      id: 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d',
      hostId: hostKai.id,
      host: hostKai,
      title: 'Late Night Lounge 🌙',
      description: '',
      coverImage: 'https://picsum.photos/seed/room2/400/200',
      category: 'talk',
      type: 'public',
      roomMode: 'chat',
      status: 'live',
      micConfig: 10,
      isLocked: false,
      viewerCount: 342,
      agoraChannel: 'a7b8c9d0-e1f2-4a3b-4c5d-6e7f8a9b0c1d',
      startedAt: '2026-04-01T22:30:00Z',
      endedAt: null,
      createdAt: '2026-04-01T22:30:00Z',
      updatedAt: '2026-04-01T22:30:00Z',
    },
    {
      id: 'b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e',
      hostId: speakerOmar.id,
      host: speakerOmar,
      title: 'Gaming Squad 🎮',
      description: '',
      coverImage: 'https://picsum.photos/seed/room4/400/200',
      category: 'gaming',
      type: 'public',
      roomMode: 'chat',
      status: 'live',
      micConfig: 15,
      isLocked: false,
      viewerCount: 64,
      agoraChannel: 'b8c9d0e1-f2a3-4b4c-5d6e-7f8a9b0c1d2e',
      startedAt: '2026-04-01T21:00:00Z',
      endedAt: null,
      createdAt: '2026-04-01T21:00:00Z',
      updatedAt: '2026-04-01T21:00:00Z',
    },
  ]),
  detail: detailRoom,
};
