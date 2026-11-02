<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# GRIT Drinking

Cloudflare Worker (API in `worker/`) + Workers Assets (React SPA) + D1, live at https://drinking.grit2great.uk.

## Run locally

1. `npm install`
2. `npx wrangler d1 migrations apply grit-drinking --local`
3. `npm run dev`

## Deploy

- Schema changes: add a file in `migrations/`, then `npm run db:migrate`
- `npm run deploy`
