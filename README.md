# Haka Live

Social audio/video live streaming platform — built with Node.js, React Native, Agora, and Redis.

## Stack

| Layer | Technology |
|---|---|
| Backend API | Node.js + Express (TypeScript) |
| Real-time | Socket.IO + Redis adapter |
| Audio/Video | Agora |
| Database | PostgreSQL 16 + Prisma ORM |
| Cache / Leaderboards | Redis 7 (sorted sets) |
| Auth | JWT |
| Storage | Supabase Storage |
| Payments | Stripe + Google Pay |
| Mobile | React Native (Expo) |
| Admin | Vue 3 + Vite (served by the backend at `/admin`) |
| Infra | Docker + Nginx |

## Quick Start (Development)

### Prerequisites
- Docker & Docker Compose
- Node.js 20+

### 1. Clone & configure
```bash
git clone <repo>
cd haka-live
cp .env.example .env
# Edit .env with your values
```

### 2. Start services
```bash
docker compose -f docker-compose.dev.yml up --build
```

### 3. Run migrations & seed
```bash
docker compose -f docker-compose.dev.yml exec backend npx prisma migrate deploy
docker compose -f docker-compose.dev.yml exec backend npm run seed
docker compose -f docker-compose.dev.yml exec backend npm run seed:admin
```

### 4. API
Backend runs at http://localhost:3010 (API at `/api/v1`, admin SPA at `/admin`).

## Project Structure

```
haka-live/
├── apps/
│   ├── backend/          Node/Express API (feature modules under src/modules)
│   ├── admin/            Vue 3 admin SPA
│   └── mobile/           React Native (Expo)
├── packages/
│   └── shared-types/     Shared TypeScript types
├── docker/               Dockerfiles + nginx config
├── docker-compose.yml    Production compose
└── docker-compose.dev.yml  Development compose (hot reload)
```

## Running Tests

```bash
docker compose -f docker-compose.dev.yml exec backend npm test
```
