# Revamped League — site + weekly automation

A fast, mobile-first site for the Revamped Dynasty League and a weekly job that
refreshes it and emails a write-up. **No database, $0 to run.** Data is computed
from the public Sleeper API + FantasyCalc by a scheduled GitHub Action, written
to a JSON file, and served as a static site on Vercel.

## What's here

```
src/core/          Portable engine (half-win standings, 6-factor power model) — validated vs 2025
src/pipeline/      buildLive (Sleeper+FantasyCalc → bundle.json), writeup, email
src/data/          League identity + 2025 fixtures
web/               The static site (index.html, styles.css, app.js) + web/data/bundle.json
scripts/           validate2025, buildBundle (offline), render images, screenshots
.github/workflows/ weekly.yml — the Tuesday job
```

The half-win logic and power model are unit-validated against the 2025 sheet:
`npm run validate` → **50/50 checks pass** (exact top-6 half-win totals, OVW,
avg PF, season totals; sample-stdev deviation).

## One-time deploy (≈15 min)

### 1. Put the code on GitHub
Create a new **private** repo and push this folder to it (any name, e.g.
`revamped-league`).

### 2. Deploy the site on Vercel
- vercel.com → **Add New… → Project** → import the GitHub repo.
- Framework preset: **Other**. Build command: empty. **Output directory: `web`**.
- Deploy. You'll get a `*.vercel.app` URL — the site is live.

### 3. Point revampedleague.com (Cloudflare → Vercel)
- In Vercel → Project → **Settings → Domains** → add `revampedleague.com` and
  `www.revampedleague.com`. Vercel will show the exact records.
- In Cloudflare → **DNS** for revampedleague.com, add what Vercel gives you —
  typically:
  - `A` record, name `@` → `76.76.21.21`
  - `CNAME`, name `www` → `cname.vercel-dns.com`
- Set both to **DNS only** (grey cloud, not orange) so Vercel handles TLS.
- Back in Vercel, set the primary domain (apex or www) and it issues the SSL cert
  automatically. Live in a few minutes.

### 4. Turn on the weekly job
The workflow `.github/workflows/weekly.yml` runs **Tuesdays 12:00 UTC** (7–8 AM
ET) and can be run anytime from the repo's **Actions** tab (“Run workflow”).
It: pulls fresh data → commits `web/data/bundle.json` (which auto-redeploys
Vercel) → emails you the write-up + standings/power images.

### 5. Email (Resend, free)
- Create a free account at resend.com and make an **API key**.
- In the GitHub repo → **Settings → Secrets and variables → Actions**:
  - Secret `RESEND_API_KEY` = your key
  - Secret `EMAIL_TO` = your email
- On the free tier the from-address `onboarding@resend.dev` can email **your own
  account email** with no domain setup. To send from your own address (or to the
  group), verify a domain in Resend and set repo **variable** `EMAIL_FROM`
  (e.g. `Revamped League <league@yourdomain.com>`).
- No email secrets? The job still runs and updates the site; it just skips the email.

Optional repo **variable** `LEAGUE_ID` overrides the default league id (already
set to yours).

## Run locally

```
npm ci
npm run validate        # engine checks vs 2025
npm run build:live      # pull live data → web/data/bundle.json   (needs internet)
npm run build:bundle    # OR rebuild the offline preview bundle from fixtures
npm run standalone      # → web/standalone.html (single self-contained file)
npm run shots           # screenshot every page (desktop + mobile) into shots/
npx serve web           # preview the site at localhost
```

## How the weekly update flows

```
GitHub Action (Tue) ─► buildLive: Sleeper + FantasyCalc ─► core engine
   ─► web/data/bundle.json ─► git commit ─► Vercel redeploys the site
   ─► render standings/power PNGs ─► Resend emails you the write-up + images
```

## Notes / next steps
- **Season awareness:** preseason shows 2025 (final) + current rosters/values;
  standings, power, transactions, schedule light up automatically at Week 1.
- **Rulebook:** custom (non-Sleeper) rules are placeholders in `web/app.js`
  (`pageRules`) marked for your input.
- **iMessage:** direct posting to an iMessage group isn't supported by an API;
  the email (with images) is the forward-ready path for now. Discord/GroupMe/SMS
  auto-posting can be added later.
- **Player-value coverage:** the live job pulls the full FantasyCalc board, so
  deep-bench value is fully counted (the committed preview bundle used a top-~100
  slice).
