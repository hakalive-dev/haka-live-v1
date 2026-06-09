# Haka Live — Marketing & Legal Site (`www.hakalive.com`)

Public, no-auth static site for `www.hakalive.com`. Hosts the landing page and the
legal pages (Privacy Policy, Terms & Conditions, Community Guidelines) that used to
live in the admin app.

Vue 3 + Vite + Tailwind — same stack as `apps/admin`, so the legal views were copied
over verbatim.

## Routes

| Path                     | Page                  |
| ------------------------ | --------------------- |
| `/`                      | Landing page          |
| `/privacy-policy`        | Privacy Policy        |
| `/terms`                 | Terms & Conditions    |
| `/community-guidelines`  | Community Guidelines  |

These are the URLs to reference from app store listings and the mobile app.

## Develop

```bash
cd apps/web
npm install
npm run dev      # http://localhost:5174
```

## Build

```bash
npm run build    # outputs to apps/web/dist/
npm run preview  # preview the production build
```

## Deploy

Deploy `apps/web/dist/` as a static site to any static host (Render Static Site,
Netlify, Vercel, Cloudflare Pages) and point `www.hakalive.com` at it.

- Build command: `npm run build`
- Publish directory: `apps/web/dist`
- SPA routing: `public/_redirects` (`/* /index.html 200`) handles deep links like
  `/privacy-policy` on Netlify / Render / Cloudflare. On Vercel, add an equivalent
  rewrite rule.
- On Render from this monorepo, set the static site's **Root Directory** to `apps/web`.

## Editing legal copy

Each legal page is a single self-contained `.vue` file under `src/views/legal/` with
its content and scoped styles inline. Update the copy directly there. The effective
date and contact email are constants at the top of each file's `<script setup>` block.
