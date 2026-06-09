import type { StoreCategoryItem, StoreItem, UserStoreItem } from '@/types';

const CATEGORIES: StoreCategoryItem[] = [
  { key: 'entry', label: 'Entry' },
  { key: 'frame', label: 'Frame' },
  { key: 'chat_bubble', label: 'Chat Bubble' },
  { key: 'theme', label: 'Theme' },
  { key: 'special_id', label: 'Special ID' },
  { key: 'profile_card', label: 'Profile Card' },
  { key: 'mic_voice_wave', label: 'Mic Voice Wave' },
  { key: 'dynamic_profile', label: 'Dynamic Profile' },
  { key: 'entry', label: 'Entry' },
  { key: 'ring', label: 'Ring' },
];

const ALL_ITEMS: StoreItem[] = [
  // ── Entry (vehicles, animals — entry effects when joining rooms) ────────
  { id: 'si-entry-1', name: 'Mountain Bike',        description: 'Ride into the room on a mountain bike', image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 75_000,   duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-entry-2', name: 'Sport Motorcycle',     description: 'Rev up with a sleek sport bike',       image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 100_000,  duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-entry-3', name: 'Purple Stallion',      description: 'Gallop in on a majestic purple horse', image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 150_000,  duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-entry-4', name: 'Dragon Rider',         description: 'Enter the room on a fire dragon',      image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 200_000,  duration_days: 30, duration_label: '30 days', sort_order: 3 },
  { id: 'si-entry-5', name: 'White Tiger',          description: 'Prowl in with a fierce white tiger',   image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 300_000,  duration_days: 30, duration_label: '30 days', sort_order: 4 },
  { id: 'si-entry-6', name: 'Jungle Explorer',      description: 'Arrive on a wild jungle jeep',         image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 600_000,  duration_days: 30, duration_label: '30 days', sort_order: 5 },

  // ── Frame (ornate avatar frames) ────────────────────────────────────────
  { id: 'si-frame-1', name: 'Stardom Frame',        description: 'Golden stardom avatar frame',           image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 15_000,   duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-frame-2', name: 'Golden Ring',          description: 'Classic gold circular frame',           image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 15_000,   duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-frame-3', name: 'Rose Heart',           description: 'Pink heart-shaped frame with roses',    image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 20_000,   duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-frame-4', name: 'Crystal Bloom',        description: 'Crystal flower frame with sparkles',    image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 25_000,   duration_days: 30, duration_label: '30 days', sort_order: 3 },
  { id: 'si-frame-5', name: 'Royal Shield',         description: 'Blue and gold royal shield frame',      image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 30_000,   duration_days: 30, duration_label: '30 days', sort_order: 4 },
  { id: 'si-frame-6', name: 'Diamond Crown',        description: 'Diamond crown frame with jewels',       image: null, preview_image: null, category: 'frame', category_label: 'Frame', coin_cost: 60_000,   duration_days: 30, duration_label: '30 days', sort_order: 5 },

  // ── Chat Bubble ─────────────────────────────────────────────────────────
  { id: 'si-chat-1',  name: 'Neon Glow',            description: 'Neon-outlined chat bubble',              image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-chat-2',  name: 'Flame Bubble',         description: 'Fiery red chat bubble',                  image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-chat-3',  name: 'Sakura Petal',         description: 'Cherry blossom themed bubble',           image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-chat-4',  name: 'Ice Crystal',          description: 'Frozen ice crystal bubble',              image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 3 },
  { id: 'si-chat-5',  name: 'Galaxy Swirl',         description: 'Purple galaxy themed bubble',            image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 20_000,  duration_days: 30, duration_label: '30 days', sort_order: 4 },
  { id: 'si-chat-6',  name: 'Royal Crest',          description: 'Gold royal crest bubble',                image: null, preview_image: null, category: 'chat_bubble', category_label: 'Chat Bubble', coin_cost: 25_000,  duration_days: 30, duration_label: '30 days', sort_order: 5 },

  // ── Theme ───────────────────────────────────────────────────────────────
  { id: 'si-theme-1', name: 'Midnight Aurora',      description: 'Northern lights room theme',             image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-theme-2', name: 'Cherry Blossom',       description: 'Spring cherry blossom theme',            image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-theme-3', name: 'Ocean Breeze',         description: 'Calm ocean waves theme',                 image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 15_000,  duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-theme-4', name: 'Cosmic Galaxy',        description: 'Deep space galaxy theme',                image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 20_000,  duration_days: 30, duration_label: '30 days', sort_order: 3 },
  { id: 'si-theme-5', name: 'Golden Palace',        description: 'Luxurious golden palace theme',          image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 25_000,  duration_days: 30, duration_label: '30 days', sort_order: 4 },
  { id: 'si-theme-6', name: 'Neon City',            description: 'Cyberpunk neon city theme',              image: null, preview_image: null, category: 'theme', category_label: 'Theme', coin_cost: 30_000,  duration_days: 30, duration_label: '30 days', sort_order: 5 },

  // ── Special ID ──────────────────────────────────────────────────────────
  { id: 'si-sid-1',   name: 'VIP Number',           description: 'Custom VIP special ID',                  image: null, preview_image: null, category: 'special_id', category_label: 'Special ID', coin_cost: 50_000,  duration_days: 0, duration_label: 'Permanent', sort_order: 0 },
  { id: 'si-sid-2',   name: 'Lucky Seven',          description: 'Lucky 777 special ID',                   image: null, preview_image: null, category: 'special_id', category_label: 'Special ID', coin_cost: 88_000,  duration_days: 0, duration_label: 'Permanent', sort_order: 1 },
  { id: 'si-sid-3',   name: 'Diamond ID',           description: 'Diamond-tier special ID',                image: null, preview_image: null, category: 'special_id', category_label: 'Special ID', coin_cost: 150_000, duration_days: 0, duration_label: 'Permanent', sort_order: 2 },
  { id: 'si-sid-4',   name: 'Crown ID',             description: 'Royal crown special ID',                 image: null, preview_image: null, category: 'special_id', category_label: 'Special ID', coin_cost: 300_000, duration_days: 0, duration_label: 'Permanent', sort_order: 3 },

  // ── Profile Card ────────────────────────────────────────────────────────
  { id: 'si-pc-1',    name: 'Sunset Glow',          description: 'Warm sunset gradient profile card',      image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 15_000, duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-pc-2',    name: 'Dark Knight',          description: 'Dark themed profile card',               image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 15_000, duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-pc-3',    name: 'Rose Garden',          description: 'Floral rose garden profile card',        image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 20_000, duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-pc-4',    name: 'Starlight',            description: 'Starlight sparkle profile card',         image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 25_000, duration_days: 30, duration_label: '30 days', sort_order: 3 },
  { id: 'si-pc-5',    name: 'Diamond Luxe',         description: 'Premium diamond profile card',           image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 50_000, duration_days: 30, duration_label: '30 days', sort_order: 4 },
  { id: 'si-pc-6',    name: 'Royal Crest',          description: 'Golden royal profile card',              image: null, preview_image: null, category: 'profile_card', category_label: 'Profile Card', coin_cost: 80_000, duration_days: 30, duration_label: '30 days', sort_order: 5 },

  // ── Mic Voice Wave ──────────────────────────────────────────────────────
  { id: 'si-mic-1',   name: 'Flame Wave',           description: 'Fire-themed mic animation',              image: null, preview_image: null, category: 'mic_voice_wave', category_label: 'Mic Voice Wave', coin_cost: 10_000, duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-mic-2',   name: 'Electric Pulse',       description: 'Electric pulse mic wave',                image: null, preview_image: null, category: 'mic_voice_wave', category_label: 'Mic Voice Wave', coin_cost: 10_000, duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-mic-3',   name: 'Rainbow Ripple',       description: 'Rainbow colored ripple effect',          image: null, preview_image: null, category: 'mic_voice_wave', category_label: 'Mic Voice Wave', coin_cost: 15_000, duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-mic-4',   name: 'Crystal Echo',         description: 'Crystal clear echo animation',           image: null, preview_image: null, category: 'mic_voice_wave', category_label: 'Mic Voice Wave', coin_cost: 20_000, duration_days: 30, duration_label: '30 days', sort_order: 3 },

  // ── Dynamic Profile ─────────────────────────────────────────────────────
  { id: 'si-dp-1',    name: 'Floating Hearts',      description: 'Animated floating hearts profile',       image: null, preview_image: null, category: 'dynamic_profile', category_label: 'Dynamic Profile', coin_cost: 20_000, duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-dp-2',    name: 'Sparkle Rain',         description: 'Sparkling rain effect on profile',       image: null, preview_image: null, category: 'dynamic_profile', category_label: 'Dynamic Profile', coin_cost: 20_000, duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-dp-3',    name: 'Aurora Wave',          description: 'Northern lights profile animation',      image: null, preview_image: null, category: 'dynamic_profile', category_label: 'Dynamic Profile', coin_cost: 30_000, duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-dp-4',    name: 'Flame Aura',           description: 'Blazing flame aura on profile',          image: null, preview_image: null, category: 'dynamic_profile', category_label: 'Dynamic Profile', coin_cost: 50_000, duration_days: 30, duration_label: '30 days', sort_order: 3 },

  // ── Entry Tag ───────────────────────────────────────────────────────────
  { id: 'si-et-1',    name: 'Star Entrance',        description: 'Starry entrance notification tag',       image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 10_000, duration_days: 30, duration_label: '30 days', sort_order: 0 },
  { id: 'si-et-2',    name: 'VIP Arrival',          description: 'VIP gold entrance tag',                  image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 15_000, duration_days: 30, duration_label: '30 days', sort_order: 1 },
  { id: 'si-et-3',    name: 'Royal Welcome',        description: 'Royal crown entrance tag',               image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 25_000, duration_days: 30, duration_label: '30 days', sort_order: 2 },
  { id: 'si-et-4',    name: 'Dragon Flame',         description: 'Fiery dragon entrance tag',              image: null, preview_image: null, category: 'entry', category_label: 'Entry', coin_cost: 40_000, duration_days: 30, duration_label: '30 days', sort_order: 3 },

  // ── Ring ────────────────────────────────────────────────────────────────
  { id: 'si-ring-1',  name: 'Silver Band',          description: 'Simple silver ring',                     image: null, preview_image: null, category: 'ring', category_label: 'Ring', coin_cost: 10_000,  duration_days: 0, duration_label: 'Permanent', sort_order: 0 },
  { id: 'si-ring-2',  name: 'Gold Heart',           description: 'Gold heart-shaped ring',                 image: null, preview_image: null, category: 'ring', category_label: 'Ring', coin_cost: 25_000,  duration_days: 0, duration_label: 'Permanent', sort_order: 1 },
  { id: 'si-ring-3',  name: 'Ruby Flame',           description: 'Ruby gemstone ring',                     image: null, preview_image: null, category: 'ring', category_label: 'Ring', coin_cost: 50_000,  duration_days: 0, duration_label: 'Permanent', sort_order: 2 },
  { id: 'si-ring-4',  name: 'Diamond Eternity',     description: 'Diamond eternity band',                  image: null, preview_image: null, category: 'ring', category_label: 'Ring', coin_cost: 100_000, duration_days: 0, duration_label: 'Permanent', sort_order: 3 },
  { id: 'si-ring-5',  name: 'Crown Jewel',          description: 'Crown jewel platinum ring',              image: null, preview_image: null, category: 'ring', category_label: 'Ring', coin_cost: 200_000, duration_days: 0, duration_label: 'Permanent', sort_order: 4 },
];

// User owns some items
const MY_ITEMS: UserStoreItem[] = [
  {
    id: 'usi-1',
    item: ALL_ITEMS[0], // Mountain Bike entry
    is_equipped: true,
    expires_at: '2026-05-04T10:00:00Z',
    is_expired: false,
    purchased_at: '2026-04-04T10:00:00Z',
  },
  {
    id: 'usi-2',
    item: ALL_ITEMS[6], // Stardom Frame
    is_equipped: true,
    expires_at: '2026-05-01T10:00:00Z',
    is_expired: false,
    purchased_at: '2026-04-01T10:00:00Z',
  },
  {
    id: 'usi-3',
    item: ALL_ITEMS[12], // Neon Glow chat bubble
    is_equipped: false,
    expires_at: '2026-04-15T10:00:00Z',
    is_expired: false,
    purchased_at: '2026-03-16T10:00:00Z',
  },
  {
    id: 'usi-4',
    item: ALL_ITEMS[24], // VIP Number special ID
    is_equipped: true,
    expires_at: null,
    is_expired: false,
    purchased_at: '2026-03-01T10:00:00Z',
  },
  {
    id: 'usi-5',
    item: ALL_ITEMS[7], // Golden Ring frame
    is_equipped: false,
    expires_at: '2026-03-01T10:00:00Z',
    is_expired: true,
    purchased_at: '2026-02-01T10:00:00Z',
  },
];

export const mockStore = {
  categories: CATEGORIES,
  items: ALL_ITEMS,
  myItems: MY_ITEMS,
};
