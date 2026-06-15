-- =============================================================================
-- State Star seed — top 4 Indian states × top 4 female hosts each (16 users)
-- =============================================================================
--
-- Run in Supabase SQL Editor (PostgreSQL).
--
-- IMPORTANT: State leaderboard *scores* live in Redis, not Postgres.
-- After this SQL, run the companion Redis block at the bottom (or
-- prisma/sql/seed-state-ranking-top4-india.redis).
--
-- Haka IDs: MAX(numeric hakaId in DB) + 1 … +16 (auto-computed below).
-- Login password for all seeded hosts: haka2024
--   (bcrypt hash embedded below)
--
-- States (national rank 1–4):
--   MH Maharashtra · KA Karnataka · TN Tamil Nadu · UP Uttar Pradesh
--
-- Safe to re-run: upserts on fixed user UUIDs; hakaId only set on INSERT.
--
-- Also runs automatically once on API deploy boot (see
-- src/scripts/seed-state-ranking-top4-india.ts) when marker user is absent.
-- =============================================================================

BEGIN;

-- ── Fixed user IDs (referenced by Redis ZADD) ───────────────────────────────
-- MH hosts 01–04 · KA 05–08 · TN 09–12 · UP 13–16

CREATE TEMP TABLE _sr_seed_hosts (
  ord         INT PRIMARY KEY,
  id          UUID NOT NULL,
  state_code  TEXT NOT NULL,
  host_rank   INT NOT NULL,
  gift_score  BIGINT NOT NULL,
  username    TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar      TEXT NOT NULL,
  rich_level  INT NOT NULL,
  charm_level INT NOT NULL
) ON COMMIT DROP;

INSERT INTO _sr_seed_hosts (ord, id, state_code, host_rank, gift_score, username, display_name, avatar, rich_level, charm_level) VALUES
  ( 1, 'ff4e0001-0000-4000-8000-000000000001', 'MH', 1,  520000, 'sr_mh_ananya',   'Ananya Deshmukh', 'https://i.pravatar.cc/150?u=sr_mh_01', 42, 38),
  ( 2, 'ff4e0002-0000-4000-8000-000000000002', 'MH', 2,  410000, 'sr_mh_priya',    'Priya Kulkarni',  'https://i.pravatar.cc/150?u=sr_mh_02', 35, 31),
  ( 3, 'ff4e0003-0000-4000-8000-000000000003', 'MH', 3,  305000, 'sr_mh_isha',     'Isha Patil',      'https://i.pravatar.cc/150?u=sr_mh_03', 28, 44),
  ( 4, 'ff4e0004-0000-4000-8000-000000000004', 'MH', 4,  198000, 'sr_mh_kavya',    'Kavya Joshi',     'https://i.pravatar.cc/150?u=sr_mh_04', 22, 27),
  ( 5, 'ff4e0005-0000-4000-8000-000000000005', 'KA', 1,  480000, 'sr_ka_meera',    'Meera Reddy',     'https://i.pravatar.cc/150?u=sr_ka_01', 39, 41),
  ( 6, 'ff4e0006-0000-4000-8000-000000000006', 'KA', 2,  375000, 'sr_ka_divya',    'Divya Iyer',      'https://i.pravatar.cc/150?u=sr_ka_02', 33, 36),
  ( 7, 'ff4e0007-0000-4000-8000-000000000007', 'KA', 3,  280000, 'sr_ka_shreya',   'Shreya Nair',     'https://i.pravatar.cc/150?u=sr_ka_03', 26, 29),
  ( 8, 'ff4e0008-0000-4000-8000-000000000008', 'KA', 4,  175000, 'sr_ka_lakshmi',  'Lakshmi Rao',     'https://i.pravatar.cc/150?u=sr_ka_04', 19, 24),
  ( 9, 'ff4e0009-0000-4000-8000-000000000009', 'TN', 1,  445000, 'sr_tn_kavitha',  'Kavitha Murugan', 'https://i.pravatar.cc/150?u=sr_tn_01', 37, 52),
  (10, 'ff4e0010-0000-4000-8000-000000000010', 'TN', 2,  350000, 'sr_tn_deepa',    'Deepa Selvam',    'https://i.pravatar.cc/150?u=sr_tn_02', 31, 45),
  (11, 'ff4e0011-0000-4000-8000-000000000011', 'TN', 3,  265000, 'sr_tn_janani',   'Janani Krishnan', 'https://i.pravatar.cc/150?u=sr_tn_03', 24, 33),
  (12, 'ff4e0012-0000-4000-8000-000000000012', 'TN', 4,  160000, 'sr_tn_malini',   'Malini Venkat',   'https://i.pravatar.cc/150?u=sr_tn_04', 18, 21),
  (13, 'ff4e0013-0000-4000-8000-000000000013', 'UP', 1,  400000, 'sr_up_pooja',    'Pooja Singh',     'https://i.pravatar.cc/150?u=sr_up_01', 36, 34),
  (14, 'ff4e0014-0000-4000-8000-000000000014', 'UP', 2,  310000, 'sr_up_neha',     'Neha Verma',      'https://i.pravatar.cc/150?u=sr_up_02', 29, 28),
  (15, 'ff4e0015-0000-4000-8000-000000000015', 'UP', 3,  230000, 'sr_up_riya',     'Riya Gupta',      'https://i.pravatar.cc/150?u=sr_up_03', 23, 26),
  (16, 'ff4e0016-0000-4000-8000-000000000016', 'UP', 4,  145000, 'sr_up_sunita',   'Sunita Yadav',    'https://i.pravatar.cc/150?u=sr_up_04', 17, 19);

-- bcrypt('haka2024', cost 10)
-- Regenerate: node -e "require('bcryptjs').hash('haka2024',10).then(console.log)"
CREATE TEMP TABLE _sr_constants (
  dev_password_hash TEXT NOT NULL
) ON COMMIT DROP;

INSERT INTO _sr_constants (dev_password_hash) VALUES
  ('$2a$10$bYsQXCosh1OPtQQkDNiQUuQToIhg7GYfKVmcSwRvZRUqppQBg4R1i');

-- Next hakaId = MAX(numeric) + 1
CREATE TEMP TABLE _sr_haka_base AS
SELECT COALESCE(MAX(CAST("hakaId" AS BIGINT)), 500000000::BIGINT) AS base_id
FROM users
WHERE "hakaId" ~ '^[0-9]+$';

-- ── Users ───────────────────────────────────────────────────────────────────
INSERT INTO users (
  id,
  "supabaseUid",
  password,
  role,
  "hostType",
  "hostApplicationPath",
  gender,
  "isVerifiedHost",
  "faceVerificationStatus",
  "onboardingComplete",
  "displayName",
  username,
  "hakaId",
  avatar,
  country,
  state,
  bio,
  "createdAt",
  "updatedAt"
)
SELECT
  h.id,
  'seed-sr4-' || h.state_code || '-' || LPAD(h.host_rank::TEXT, 2, '0'),
  c.dev_password_hash,
  'host',
  'independent',
  'self_apply_independent',
  'female',
  TRUE,
  'approved',
  TRUE,
  h.display_name,
  h.username,
  (b.base_id + h.ord)::TEXT,
  h.avatar,
  'India',
  h.state_code,
  'State Star seed · ' || h.state_code || ' rank #' || h.host_rank,
  NOW(),
  NOW()
FROM _sr_seed_hosts h
CROSS JOIN _sr_haka_base b
CROSS JOIN _sr_constants c
ON CONFLICT (id) DO UPDATE SET
  role                   = EXCLUDED.role,
  "hostType"             = EXCLUDED."hostType",
  "hostApplicationPath"  = EXCLUDED."hostApplicationPath",
  gender                 = EXCLUDED.gender,
  "isVerifiedHost"       = EXCLUDED."isVerifiedHost",
  "faceVerificationStatus" = EXCLUDED."faceVerificationStatus",
  "onboardingComplete"   = EXCLUDED."onboardingComplete",
  "displayName"          = EXCLUDED."displayName",
  username               = EXCLUDED.username,
  avatar                 = EXCLUDED.avatar,
  country                = EXCLUDED.country,
  state                  = EXCLUDED.state,
  bio                    = EXCLUDED.bio,
  password               = EXCLUDED.password,
  "updatedAt"            = NOW();

-- ── Wallets ─────────────────────────────────────────────────────────────────
INSERT INTO wallets (id, "userId", "coinBalance", "beanBalance", "createdAt", "updatedAt")
SELECT
  ('ee4e0001-0000-4000-8000-' || LPAD(h.ord::TEXT, 12, '0'))::UUID,
  h.id,
  (15000 + (h.ord * 137) % 40000)::BIGINT,
  (h.gift_score / 4)::BIGINT,
  NOW(),
  NOW()
FROM _sr_seed_hosts h
ON CONFLICT ("userId") DO UPDATE SET
  "coinBalance" = EXCLUDED."coinBalance",
  "beanBalance" = EXCLUDED."beanBalance",
  "updatedAt"   = NOW();

-- ── Levels ──────────────────────────────────────────────────────────────────
INSERT INTO user_levels (id, "userId", "richLevel", "richXp", "charmLevel", "charmXp", "createdAt", "updatedAt")
SELECT
  ('dd4e0001-0000-4000-8000-' || LPAD(h.ord::TEXT, 12, '0'))::UUID,
  h.id,
  h.rich_level,
  (h.rich_level * 8500 + h.ord * 111)::BIGINT,
  h.charm_level,
  (h.charm_level * 12000 + h.ord * 97)::BIGINT,
  NOW(),
  NOW()
FROM _sr_seed_hosts h
ON CONFLICT ("userId") DO UPDATE SET
  "richLevel"  = EXCLUDED."richLevel",
  "richXp"     = EXCLUDED."richXp",
  "charmLevel" = EXCLUDED."charmLevel",
  "charmXp"    = EXCLUDED."charmXp",
  "updatedAt"  = NOW();

COMMIT;

-- ── Verify (run after commit) ───────────────────────────────────────────────
SELECT
  u."hakaId",
  u.username,
  u."displayName",
  u.state,
  ul."richLevel",
  ul."charmLevel"
FROM users u
LEFT JOIN user_levels ul ON ul."userId" = u.id
WHERE u.id IN (
  'ff4e0001-0000-4000-8000-000000000001',
  'ff4e0002-0000-4000-8000-000000000002',
  'ff4e0003-0000-4000-8000-000000000003',
  'ff4e0004-0000-4000-8000-000000000004',
  'ff4e0005-0000-4000-8000-000000000005',
  'ff4e0006-0000-4000-8000-000000000006',
  'ff4e0007-0000-4000-8000-000000000007',
  'ff4e0008-0000-4000-8000-000000000008',
  'ff4e0009-0000-4000-8000-000000000009',
  'ff4e0010-0000-4000-8000-000000000010',
  'ff4e0011-0000-4000-8000-000000000011',
  'ff4e0012-0000-4000-8000-000000000012',
  'ff4e0013-0000-4000-8000-000000000013',
  'ff4e0014-0000-4000-8000-000000000014',
  'ff4e0015-0000-4000-8000-000000000015',
  'ff4e0016-0000-4000-8000-000000000016'
)
ORDER BY
  CASE u.state WHEN 'MH' THEN 1 WHEN 'KA' THEN 2 WHEN 'TN' THEN 3 WHEN 'UP' THEN 4 END,
  u."hakaId";
