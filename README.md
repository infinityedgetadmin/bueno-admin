# Bueno Admin

Back office for the Bueno Leisure tour catalog: prices, seasons, promotions, currency, team access and an activity log. Next.js 16, no external services. Everything it manages is stored as JSON files, so it runs offline.

## Run it

```bash
npm ci
npm run dev:seeded      # seeds three demo accounts and a house exchange rate, then starts on http://localhost:3000/admin
```

Demo accounts (seeded by `npm run seed`): `owner@bueno-test.example.com` / `owner-demo-pass-2026` (admin), `editor@bueno-test.example.com` / `editor-demo-pass-2026` (editor), `viewer@bueno-test.example.com` / `viewer-demo-pass-2026` (viewer).

To start from an empty team instead:

```bash
npm run admin:grant -- --email you@example.com --role admin --password 'choose-a-long-password'
npm run dev
```

## Data

- `data/*.json`: the website content (tour packages, destinations, blog, activities, services). Edit by hand.
- `data/store/`: what the back office writes (`catalog.json`, `team.json`, `credentials.json`, `audit.json`). Gitignored. Move it with `BUENO_DATA_DIR`.

Copy `.env.example` to `.env.local` and set `ADMIN_SESSION_SECRET` for anything beyond local use.

## Checks

```bash
npm run typecheck
npm test                 # unit + component tests
npm run test:integration # repositories and sessions against a temporary data folder
npm run test:e2e         # Playwright against a production build
```
