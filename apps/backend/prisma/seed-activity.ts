/**
 * Activity seed — populates realistic live-room activity on top of seed-demo.
 * Adds: seat occupants, mic sessions (for Room Data stats), chat messages,
 * recent-day gift transactions. Run AFTER seed-demo.ts.
 *
 * Run: docker compose -f docker-compose.dev.yml exec backend npx ts-node prisma/seed-activity.ts
 *
 * Safe to re-run: clears prior activity rows for the seeded rooms before re-inserting.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const IDS = {
  agent1: 'a0000001-0000-4000-8000-000000000001',
  agent2: 'a0000002-0000-4000-8000-000000000002',
  host1:  'b0000001-0000-4000-8000-000000000001',
  host2:  'b0000002-0000-4000-8000-000000000002',
  host3:  'b0000003-0000-4000-8000-000000000003',
  host4:  'b0000004-0000-4000-8000-000000000004',
  ihost1: 'c0000001-0000-4000-8000-000000000001',
  ihost2: 'c0000002-0000-4000-8000-000000000002',
  user1:  'd0000001-0000-4000-8000-000000000001',
  user2:  'd0000002-0000-4000-8000-000000000002',
  user3:  'd0000003-0000-4000-8000-000000000003',
  user4:  'd0000004-0000-4000-8000-000000000004',
  user5:  'd0000005-0000-4000-8000-000000000005',
  room1:  'e0000001-0000-4000-8000-000000000001', // host1, music, 5 seats, live
  room2:  'e0000002-0000-4000-8000-000000000002', // host3, talk, 10 seats, live
  room5:  'e0000005-0000-4000-8000-000000000005', // ihost2, education, 5 seats, idle
};

const now = new Date();
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000);
const daysAgoAt = (d: number, hour = 14, minute = 0) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() - d);
  dt.setHours(hour, minute, 0, 0);
  return dt;
};

async function main() {
  console.log('🌱 Seeding activity data...\n');

  // ── 1. Bump viewerCount & ensure rooms are live ───────────────────────────
  console.log('→ Refreshing room live state...');
  await prisma.room.update({
    where: { id: IDS.room1 },
    data: { status: 'live', viewerCount: 128, startedAt: hoursAgo(3) },
  });
  await prisma.room.update({
    where: { id: IDS.room2 },
    data: { status: 'live', viewerCount: 214, startedAt: hoursAgo(5) },
  });
  await prisma.room.update({
    where: { id: IDS.room5 },
    data: { status: 'live', viewerCount: 42, startedAt: hoursAgo(1) },
  });

  // ── 2. Seat occupants ─────────────────────────────────────────────────────
  console.log('→ Seat occupants...');
  // Clear existing seats for these rooms first (idempotent)
  await prisma.roomSeat.deleteMany({
    where: { roomId: { in: [IDS.room1, IDS.room2, IDS.room5] } },
  });

  const seatData: { roomId: string; position: number; userId: string | null; micConfig: number }[] = [
    // room1 (host1, 5 seats) — host + 3 speakers
    { roomId: IDS.room1, position: 1, userId: IDS.host1, micConfig: 5 },
    { roomId: IDS.room1, position: 2, userId: IDS.user1, micConfig: 5 },
    { roomId: IDS.room1, position: 3, userId: IDS.user2, micConfig: 5 },
    { roomId: IDS.room1, position: 4, userId: null,      micConfig: 5 },
    { roomId: IDS.room1, position: 5, userId: IDS.user4, micConfig: 5 },
    // room2 (host3, 10 seats) — host + 5 speakers
    { roomId: IDS.room2, position: 1,  userId: IDS.host3, micConfig: 10 },
    { roomId: IDS.room2, position: 2,  userId: IDS.user3, micConfig: 10 },
    { roomId: IDS.room2, position: 3,  userId: IDS.host2, micConfig: 10 },
    { roomId: IDS.room2, position: 4,  userId: IDS.user5, micConfig: 10 },
    { roomId: IDS.room2, position: 5,  userId: null,      micConfig: 10 },
    { roomId: IDS.room2, position: 6,  userId: IDS.host4, micConfig: 10 },
    { roomId: IDS.room2, position: 7,  userId: IDS.agent1, micConfig: 10 },
    // room5 (ihost2, 5 seats)
    { roomId: IDS.room5, position: 1, userId: IDS.ihost2, micConfig: 5 },
    { roomId: IDS.room5, position: 2, userId: IDS.user3,  micConfig: 5 },
    { roomId: IDS.room5, position: 3, userId: IDS.user5,  micConfig: 5 },
  ];

  // Fill remaining empty seats per room
  const roomConfigs = [
    { roomId: IDS.room1, micConfig: 5 },
    { roomId: IDS.room2, micConfig: 10 },
    { roomId: IDS.room5, micConfig: 5 },
  ];
  for (const rc of roomConfigs) {
    for (let pos = 1; pos <= rc.micConfig; pos++) {
      if (!seatData.find((s) => s.roomId === rc.roomId && s.position === pos)) {
        seatData.push({ roomId: rc.roomId, position: pos, userId: null, micConfig: rc.micConfig });
      }
    }
  }

  await prisma.roomSeat.createMany({
    data: seatData.map((s) => ({
      roomId: s.roomId,
      position: s.position,
      userId: s.userId,
      isLocked: false,
      isMuted: false,
    })),
  });

  // ── 3. HostMicSession history (for Room Data mic duration) ────────────────
  console.log('→ Mic sessions across past days...');
  // Clear prior activity-seeded sessions (rooms 1/2/5)
  await prisma.hostMicSession.deleteMany({
    where: { roomId: { in: [IDS.room1, IDS.room2, IDS.room5] } },
  });

  const micSessions: {
    userId: string; roomId: string; seatIndex: number;
    startedAt: Date; endedAt: Date | null; minutes: number;
  }[] = [];

  // Helper to build a closed session
  const closed = (userId: string, roomId: string, seat: number, startedAt: Date, minutes: number) => ({
    userId, roomId, seatIndex: seat,
    startedAt,
    endedAt: new Date(startedAt.getTime() + minutes * 60_000),
    minutes,
  });

  // Past 5 days of daily live activity for room1 host1
  for (let d = 1; d <= 5; d++) {
    micSessions.push(closed(IDS.host1, IDS.room1, 1, daysAgoAt(d, 20, 0),  120));
    micSessions.push(closed(IDS.user1, IDS.room1, 2, daysAgoAt(d, 20, 15), 60));
    micSessions.push(closed(IDS.user2, IDS.room1, 3, daysAgoAt(d, 20, 30), 75));
    micSessions.push(closed(IDS.user4, IDS.room1, 5, daysAgoAt(d, 21, 0),  45));
  }
  // Room2 host3 past days
  for (let d = 1; d <= 5; d++) {
    micSessions.push(closed(IDS.host3, IDS.room2, 1, daysAgoAt(d, 22, 0),  180));
    micSessions.push(closed(IDS.user3, IDS.room2, 2, daysAgoAt(d, 22, 10), 90));
    micSessions.push(closed(IDS.host2, IDS.room2, 3, daysAgoAt(d, 22, 20), 70));
    micSessions.push(closed(IDS.user5, IDS.room2, 4, daysAgoAt(d, 23, 0),  50));
    micSessions.push(closed(IDS.host4, IDS.room2, 6, daysAgoAt(d, 23, 10), 40));
  }

  // Today — open (live) sessions matching current seat occupants
  micSessions.push({ userId: IDS.host1, roomId: IDS.room1, seatIndex: 1, startedAt: hoursAgo(3),     endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user1, roomId: IDS.room1, seatIndex: 2, startedAt: minutesAgo(90),  endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user2, roomId: IDS.room1, seatIndex: 3, startedAt: minutesAgo(55),  endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user4, roomId: IDS.room1, seatIndex: 5, startedAt: minutesAgo(25),  endedAt: null, minutes: 0 });

  micSessions.push({ userId: IDS.host3, roomId: IDS.room2, seatIndex: 1, startedAt: hoursAgo(5),     endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user3, roomId: IDS.room2, seatIndex: 2, startedAt: minutesAgo(140), endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.host2, roomId: IDS.room2, seatIndex: 3, startedAt: minutesAgo(95),  endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user5, roomId: IDS.room2, seatIndex: 4, startedAt: minutesAgo(60),  endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.host4, roomId: IDS.room2, seatIndex: 6, startedAt: minutesAgo(35),  endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.agent1, roomId: IDS.room2, seatIndex: 7, startedAt: minutesAgo(20), endedAt: null, minutes: 0 });

  micSessions.push({ userId: IDS.ihost2, roomId: IDS.room5, seatIndex: 1, startedAt: hoursAgo(1),    endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user3,  roomId: IDS.room5, seatIndex: 2, startedAt: minutesAgo(40), endedAt: null, minutes: 0 });
  micSessions.push({ userId: IDS.user5,  roomId: IDS.room5, seatIndex: 3, startedAt: minutesAgo(15), endedAt: null, minutes: 0 });

  await prisma.hostMicSession.createMany({ data: micSessions });

  // ── 4. Chat messages ──────────────────────────────────────────────────────
  console.log('→ Chat messages...');
  await prisma.roomMessage.deleteMany({
    where: { roomId: { in: [IDS.room1, IDS.room2, IDS.room5] } },
  });

  type Msg = { roomId: string; senderId: string; content: string; ago: number };
  const room1Chat: Msg[] = [
    { roomId: IDS.room1, senderId: IDS.user3, content: 'Good vibes tonight 🎶', ago: 180 },
    { roomId: IDS.room1, senderId: IDS.user5, content: 'Yuki you sound amazing!', ago: 160 },
    { roomId: IDS.room1, senderId: IDS.user1, content: 'Just hopped on mic 🎤', ago: 90 },
    { roomId: IDS.room1, senderId: IDS.user2, content: 'Requesting that jazz song pls', ago: 70 },
    { roomId: IDS.room1, senderId: IDS.host1, content: 'Coming up next 🎹', ago: 65 },
    { roomId: IDS.room1, senderId: IDS.user4, content: 'Yessss finally made it in', ago: 25 },
    { roomId: IDS.room1, senderId: IDS.user3, content: 'Sent a little gift ❤️', ago: 18 },
    { roomId: IDS.room1, senderId: IDS.user5, content: 'Who else is here?', ago: 8 },
    { roomId: IDS.room1, senderId: IDS.user2, content: 'This is my happy place', ago: 3 },
  ];
  const room2Chat: Msg[] = [
    { roomId: IDS.room2, senderId: IDS.user2, content: 'Late night squad 🌙', ago: 280 },
    { roomId: IDS.room2, senderId: IDS.user4, content: 'Kai your takes are wild lol', ago: 240 },
    { roomId: IDS.room2, senderId: IDS.host2, content: 'Joined from the other room 👋', ago: 200 },
    { roomId: IDS.room2, senderId: IDS.user5, content: 'Can we talk about the finale??', ago: 140 },
    { roomId: IDS.room2, senderId: IDS.host3, content: 'No spoilers yet! 🤫', ago: 120 },
    { roomId: IDS.room2, senderId: IDS.host4, content: 'I have thoughts 🧐', ago: 45 },
    { roomId: IDS.room2, senderId: IDS.user3, content: 'LOL that clap back', ago: 30 },
    { roomId: IDS.room2, senderId: IDS.agent1, content: 'Supporting my hosts tonight ✨', ago: 15 },
    { roomId: IDS.room2, senderId: IDS.user5, content: 'This room is fire 🔥', ago: 4 },
  ];
  const room5Chat: Msg[] = [
    { roomId: IDS.room5, senderId: IDS.user3, content: 'Study session start 📚', ago: 55 },
    { roomId: IDS.room5, senderId: IDS.ihost2, content: "Let's do 45 min focus then break", ago: 48 },
    { roomId: IDS.room5, senderId: IDS.user5, content: 'Ready! Coffee in hand ☕', ago: 40 },
    { roomId: IDS.room5, senderId: IDS.user3, content: 'Half way done...', ago: 15 },
  ];

  const allMsgs = [...room1Chat, ...room2Chat, ...room5Chat];
  await prisma.roomMessage.createMany({
    data: allMsgs.map((m) => ({
      roomId: m.roomId,
      senderId: m.senderId,
      content: m.content,
      type: 'text',
      createdAt: minutesAgo(m.ago),
    })),
  });

  // ── 5. Recent gift transactions (for Room Data gift coin stats) ──────────
  console.log('→ Recent gift transactions...');
  const gifts = await prisma.gift.findMany({
    select: { id: true, name: true, coinCost: true, beanValue: true },
  });
  if (gifts.length === 0) {
    console.warn('  ⚠ No gifts found — skipping gift tx seed. Run seed.ts first.');
  } else {
    const pick = (name: string) => gifts.find((g) => g.name === name) || gifts[0];
    const heart  = pick('Heart');
    const rose   = pick('Rose');
    const teddy  = pick('Teddy Bear');
    const crown  = pick('Crown');
    const rocket = pick('Rocket');
    const diamond = pick('Diamond');

    type GT = { senderId: string; recipientId: string; gift: typeof gifts[0]; roomId: string; qty: number; when: Date };
    const gtx: GT[] = [];

    // Room1 — today
    gtx.push({ senderId: IDS.user3, recipientId: IDS.host1, gift: rose,   roomId: IDS.room1, qty: 5, when: minutesAgo(150) });
    gtx.push({ senderId: IDS.user5, recipientId: IDS.host1, gift: heart,  roomId: IDS.room1, qty: 10, when: minutesAgo(120) });
    gtx.push({ senderId: IDS.user2, recipientId: IDS.host1, gift: teddy,  roomId: IDS.room1, qty: 1, when: minutesAgo(60) });
    gtx.push({ senderId: IDS.user4, recipientId: IDS.host1, gift: crown,  roomId: IDS.room1, qty: 1, when: minutesAgo(20) });
    gtx.push({ senderId: IDS.user1, recipientId: IDS.host1, gift: heart,  roomId: IDS.room1, qty: 3, when: minutesAgo(5) });

    // Room1 — past days
    for (let d = 1; d <= 4; d++) {
      gtx.push({ senderId: IDS.user2, recipientId: IDS.host1, gift: rocket, roomId: IDS.room1, qty: 1, when: daysAgoAt(d, 21, 0) });
      gtx.push({ senderId: IDS.user5, recipientId: IDS.host1, gift: rose,   roomId: IDS.room1, qty: 10, when: daysAgoAt(d, 21, 30) });
      gtx.push({ senderId: IDS.user3, recipientId: IDS.host1, gift: heart,  roomId: IDS.room1, qty: 20, when: daysAgoAt(d, 22, 15) });
    }

    // Room2 — today
    gtx.push({ senderId: IDS.user4, recipientId: IDS.host3, gift: diamond, roomId: IDS.room2, qty: 1, when: minutesAgo(200) });
    gtx.push({ senderId: IDS.user2, recipientId: IDS.host3, gift: rose,    roomId: IDS.room2, qty: 10, when: minutesAgo(150) });
    gtx.push({ senderId: IDS.agent1, recipientId: IDS.host3, gift: crown,  roomId: IDS.room2, qty: 2, when: minutesAgo(80) });
    gtx.push({ senderId: IDS.user5, recipientId: IDS.host3, gift: heart,   roomId: IDS.room2, qty: 15, when: minutesAgo(30) });
    gtx.push({ senderId: IDS.user3, recipientId: IDS.host2, gift: teddy,   roomId: IDS.room2, qty: 1, when: minutesAgo(10) });

    // Room2 — past days
    for (let d = 1; d <= 4; d++) {
      gtx.push({ senderId: IDS.user2, recipientId: IDS.host3, gift: rocket, roomId: IDS.room2, qty: 2, when: daysAgoAt(d, 23, 0) });
      gtx.push({ senderId: IDS.user4, recipientId: IDS.host3, gift: crown,  roomId: IDS.room2, qty: 1, when: daysAgoAt(d, 23, 30) });
    }

    // Room5 — today small gifts
    gtx.push({ senderId: IDS.user3, recipientId: IDS.ihost2, gift: heart, roomId: IDS.room5, qty: 5, when: minutesAgo(35) });
    gtx.push({ senderId: IDS.user5, recipientId: IDS.ihost2, gift: rose,  roomId: IDS.room5, qty: 1, when: minutesAgo(12) });

    await prisma.giftTransaction.createMany({
      data: gtx.map((t) => ({
        senderId: t.senderId,
        recipientId: t.recipientId,
        giftId: t.gift.id,
        roomId: t.roomId,
        qty: t.qty,
        coinCost: t.gift.coinCost * t.qty,
        beanValue: t.gift.beanValue * t.qty,
        createdAt: t.when,
      })),
    });
  }

  // ── Moments + Videos feed ───────────────────────────────────────────────────
  const MOMENTS: Array<{
    id: string;
    userId: string;
    postType: 'moment' | 'video';
    mediaUrl: string;
    posterUrl?: string;
    caption: string;
    hashtag: string;
    likesCount: number;
    commentsCount: number;
    sharesCount: number;
    giftsCount: number;
    createdAt: Date;
  }> = [
    { id: 'f0000001-0000-4000-8000-000000000001', userId: IDS.host1,  postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=800&h=600&fit=crop', caption: 'Golden hour vibes from Mumbai 🌅',                 hashtag: '#SHOWYOURSELF',  likesCount: 342,  commentsCount: 3, sharesCount: 12,  giftsCount: 8,   createdAt: minutesAgo(10) },
    { id: 'f0000002-0000-4000-8000-000000000002', userId: IDS.host2,  postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&h=600&fit=crop', caption: 'Soft life loading... 🖤✨',                         hashtag: '#Enjoyingsoftlife', likesCount: 1280, commentsCount: 2, sharesCount: 31,  giftsCount: 19,  createdAt: minutesAgo(18) },
    { id: 'f0000003-0000-4000-8000-000000000003', userId: IDS.host3,  postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop', caption: 'DJ set from last night — 3 hours non-stop 🎧🔥',     hashtag: '#ManilaVibes',   likesCount: 2450, commentsCount: 4, sharesCount: 76,  giftsCount: 42,  createdAt: minutesAgo(45) },
    { id: 'f0000004-0000-4000-8000-000000000004', userId: IDS.host4,  postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=800&h=600&fit=crop', caption: 'Cherry blossom season is here 🌸',                  hashtag: '#TokyoNights',   likesCount: 890,  commentsCount: 1, sharesCount: 24,  giftsCount: 15,  createdAt: hoursAgo(1) },
    { id: 'f0000005-0000-4000-8000-000000000005', userId: IDS.ihost1, postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=800&h=600&fit=crop', caption: 'Thank you for 10K followers!! 🥳💜 You guys are family', hashtag: '#QueenVibes',     likesCount: 5400, commentsCount: 2, sharesCount: 180, giftsCount: 98,  createdAt: hoursAgo(2) },
    { id: 'f0000006-0000-4000-8000-000000000006', userId: IDS.ihost2, postType: 'moment', mediaUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=800&h=600&fit=crop', caption: 'New beat dropped today 🎵 Link in bio!',              hashtag: '#CairoNights',   likesCount: 320,  commentsCount: 1, sharesCount: 9,   giftsCount: 3,   createdAt: hoursAgo(3) },

    { id: 'f0000007-0000-4000-8000-000000000007', userId: IDS.host2,  postType: 'video',  mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4', posterUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=430&h=932&fit=crop', caption: 'Just wrapped up a 3-hour stream 🎤 Thank you to everyone who sent gifts tonight! #HakaLive #Lagos', hashtag: '#HakaLive',       likesCount: 1840, commentsCount: 2, sharesCount: 45,  giftsCount: 67,  createdAt: hoursAgo(4) },
    { id: 'f0000008-0000-4000-8000-000000000008', userId: IDS.host1,  postType: 'video',  mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4', posterUrl: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=430&h=932&fit=crop', caption: 'Bollywood night was INCREDIBLE 💃🔥 2,000 beans earned in one session!! #BollywoodNights',         hashtag: '#BollywoodNights',likesCount: 3200, commentsCount: 3, sharesCount: 89,  giftsCount: 134, createdAt: hoursAgo(6) },
    { id: 'f0000009-0000-4000-8000-000000000009', userId: IDS.host3,  postType: 'video',  mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4', posterUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=430&h=932&fit=crop', caption: 'Late night DJ set from Manila 🎧🌙 New Afro x Filipino fusion mix dropping Friday',              hashtag: '#DJLife',         likesCount: 980,  commentsCount: 1, sharesCount: 32,  giftsCount: 28,  createdAt: hoursAgo(8) },
    { id: 'f0000010-0000-4000-8000-000000000010', userId: IDS.ihost1, postType: 'video',  mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4', posterUrl: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=430&h=932&fit=crop', caption: 'Behind the scenes of our Golden Phoenix family meetup in Mexico City 🔥👑',                        hashtag: '#GoldenPhoenix',  likesCount: 6100, commentsCount: 2, sharesCount: 210, giftsCount: 156, createdAt: hoursAgo(10) },
    { id: 'f0000011-0000-4000-8000-000000000011', userId: IDS.ihost2, postType: 'video',  mediaUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4', posterUrl: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=430&h=932&fit=crop', caption: 'First week on Haka and already got 200 followers! This community is amazing 🙏',                 hashtag: '#NewHere',        likesCount: 245,  commentsCount: 1, sharesCount: 8,   giftsCount: 5,   createdAt: hoursAgo(12) },
  ];

  const momentIds = MOMENTS.map((m) => m.id);
  await prisma.momentComment.deleteMany({ where: { momentId: { in: momentIds } } });
  await prisma.momentLike.deleteMany({ where: { momentId: { in: momentIds } } });
  await prisma.moment.deleteMany({ where: { id: { in: momentIds } } });
  await prisma.moment.createMany({ data: MOMENTS });

  const COMMENTERS = [IDS.user1, IDS.user2, IDS.user3, IDS.user4, IDS.user5];
  const COMMENT_TEXTS = [
    'This is fire 🔥🔥',
    'Queen!! Can we do a collab? 👑',
    'Sent you a Galaxy gift, did you see it?? 🌌',
    'New here but already a fan! 🙌',
    'My fam showing up 💜🔥',
    'The energy is unmatched ⚡',
  ];
  const commentRows: { momentId: string; userId: string; text: string; createdAt: Date }[] = [];
  for (const m of MOMENTS) {
    for (let i = 0; i < m.commentsCount; i++) {
      commentRows.push({
        momentId: m.id,
        userId: COMMENTERS[(i + MOMENTS.indexOf(m)) % COMMENTERS.length],
        text: COMMENT_TEXTS[(i + MOMENTS.indexOf(m)) % COMMENT_TEXTS.length],
        createdAt: new Date(m.createdAt.getTime() + (i + 1) * 5 * 60 * 1000),
      });
    }
  }
  if (commentRows.length) await prisma.momentComment.createMany({ data: commentRows });

  const likeRows: { momentId: string; userId: string }[] = [];
  for (const m of MOMENTS) {
    for (const u of COMMENTERS) likeRows.push({ momentId: m.id, userId: u });
  }
  if (likeRows.length) await prisma.momentLike.createMany({ data: likeRows, skipDuplicates: true });

  console.log('\n✅ Activity seed complete.');
  console.log('   Live rooms: room1 (Chill Vibes), room2 (Late Night Talk), room5 (Study With Me)');
  console.log('   Seats, mic sessions, chat, and gifts populated for the last 5 days.');
  console.log(`   Moments: ${MOMENTS.filter((m) => m.postType === 'moment').length} · Videos: ${MOMENTS.filter((m) => m.postType === 'video').length} · Comments: ${commentRows.length} · Likes: ${likeRows.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
