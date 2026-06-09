# Supabase Storage buckets (Haka Live)

The backend uploads chat and profile assets via the **service role** key. Create these buckets in **Supabase Dashboard → Storage** before enabling `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the API.

## Required buckets

| Bucket | Public? | Used for |
|--------|---------|----------|
| `dm-chat-images` | **Yes** | DM photo messages (`POST /api/v1/chat/conversations/:userId/images`) |
| `room-chat-images` | **Yes** | Live room chat photos |
| `admin-uploads` | **Yes** | Avatars, admin assets (default bucket in `uploadToStorage`) |
| `support-screenshots` | Private OK | Support ticket screenshots (signed URLs for admin) |

Object key prefixes:

- DM images: `dms/<sorted-user-id-pair>/<uuid>.jpg`
- Room images: `rooms/<roomId>/<uuid>.jpg`

## Setup steps

1. Create each bucket with the **exact** name (lowercase, hyphens).
2. For `dm-chat-images` and `room-chat-images`, enable **Public bucket** so `getPublicUrl()` links work in the mobile app.
3. In repo root `.env` (loaded by `docker-compose.dev.yml`):

   ```env
   SUPABASE_URL=https://<project-ref>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service-role-key>
   ```

4. Restart backend: `docker compose -f docker-compose.dev.yml restart backend`

5. Send a test DM image. The API `201` body should include:

   `https://<project>.supabase.co/storage/v1/object/public/dm-chat-images/dms/...`

   Open that URL on the phone’s network; it must return **200** and `image/*`.

## Local dev without Supabase

If `SUPABASE_*` is unset, uploads fall back to `./uploads/` and URLs like `http://localhost:3010/uploads/...`. Physical devices cannot load those unless `API_BASE_URL` matches a host the phone can reach (see `docker-compose.dev.yml`).

## Troubleshooting green DM thumbnails

Sent-message bubbles used to show a green background when the image failed to load. If thumbnails still fail after the UI fix, the `mediaUrl` is unreachable—fix bucket visibility or Supabase env vars above.
