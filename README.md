# GroupNote — minimal group-card web app

A real shareable group-card MVP. The organiser creates a card, contributors add notes without accounts, and the recipient reads the completed card at a link. No subscriptions, email integrations, or AI API calls.

## What works

- Create a card with 6 occasions and 3 themes
- Separate organiser link (private key) and contributor invitation link
- Add notes and emoji from separate devices, stored in Cloudflare D1
- Automatically refresh new notes every 15 seconds while viewing a card
- Close/reopen contributions using the organiser link
- Permanently delete a card and its messages using the organiser link
- Print/export the card with the browser's **Save as PDF**
- Basic daily anti-abuse quotas: 5 new cards and 30 notes per network address, plus a 200-message limit per card
- Mobile-responsive layout; accessibility labels on primary form controls

**Not included:** Payments, premium designs, email sending, rich-text/photo uploads, individual message moderation, user accounts, or a dashboard for browsing existing cards.

## Test locally without paid services

Prerequisite: Node.js 22 or newer. The demo command enables experimental built-in `node:sqlite` (required by Node.js 22.12) and may print an experimental warning. No dependency installation is needed for the demo.

```bash
npm run demo
```

Open `http://localhost:8787`. Data is stored in `.local-demo.sqlite` and persists across restarts. The local demo is not publicly shareable across the internet.

## Deploy live on Cloudflare Workers + D1

Cloudflare offers a free-tier Workers plan and a D1 free tier (within limits). You need a free Cloudflare account, Node.js and npm. This project has not been deployed to your Cloudflare account.

1. Run `npm install` to get Wrangler.
2. Authenticate with `npx wrangler login`.
3. Create the database: `npx wrangler d1 create groupnote-db`.
4. Copy the database **UUID** printed by Cloudflare to `database_id` in `wrangler.toml`. Keep `binding = "DB"`.
5. Apply the SQL migration to the live database: `npx wrangler d1 migrations apply groupnote-db --remote`.
6. Set an unpredictable daily quota hashing secret: `npx wrangler secret put RATE_SALT` and paste a long random value when prompted.
7. Deploy the app: `npm run deploy`.
8. Open the resulting `https://groupnote.<your-subdomain>.workers.dev` URL and test with two different browser sessions (or phones): create card, copy **invite link**, sign as a guest, close and reopen.

To test via Wrangler's local emulator, run `npx wrangler d1 migrations apply groupnote-db --local` then `npm run dev`.

**Do not use Netlify Drop alone:** the static files require the Worker and D1 database for live collaboration.

## Before inviting the public

- Edit `public/privacy.html` to include a valid operator support contact and your actual data retention practices.
- Test deleting cards and make sure the organiser understands that their **URL with `&key=` grants admin rights**. Only use the in-app **Copy invite link** button for contributors.
- Protect public endpoints against automated spam with Cloudflare's available bot controls / Turnstile before large-scale promotion, and consider adding per-message deletion/moderation.
- Card links are *unlisted*, not encrypted or access-controlled. Anyone with the invite link can read the card. Don't put secrets or sensitive information in messages.
- There is no payment flow. Treat this as a free beta until you choose and integrate a payments provider.
- The `GroupNote` name is a placeholder; check names/trademarks before establishing a paid brand.

## First distribution experiment

Share the free tool with ten real card organisers: student societies, project groups, team leads, or birthday organisers. Track **cards created, contributors per card, completed cards, and return organisers** before building premium features. Contributors see the GroupNote branding, creating product exposure without relying on SEO.

## File map

- `public/index.html` — app screen structure
- `public/styles.css` — responsive styling
- `public/app.js` — app interactions and data loading
- `src/worker.js` — server API, quotas, organiser actions
- `migrations/0001_init.sql` — database schema
- `test/local-server.mjs` — self-contained local preview backend

## Notes

The front-end flows were checked in Chromium using an in-memory browser harness and a local HTTP API. The live API was exercised for card creation, reading, guest messages, owner-only close, closed-card rejection, and deletion. **Cloudflare production deployment and cross-device production tests have not been performed.**
