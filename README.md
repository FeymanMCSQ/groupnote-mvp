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

Live application: **https://groupnote.sssafiullahhh.workers.dev**

Deployed on 3 November 2026 (Australia/Sydney) to the account's confirmed Workers Free plan. The Worker is `groupnote`, with the existing `DB` binding pointing to production D1 database `groupnote-db`. The account and database IDs are configured in `wrangler.toml`; these IDs are not credentials. Migration `0001_init.sql` has been applied. `RATE_SALT` is configured as a Cloudflare Worker secret and is not stored in this repository.

For routine updates to this deployment:

```bash
npm ci
npx wrangler login
npx wrangler d1 migrations list groupnote-db --remote
# Review any pending migrations before applying them:
npx wrangler d1 migrations apply groupnote-db --remote
npm run deploy
```

If browser login cannot reach the localhost callback, use `npx wrangler login --device` and complete the device authorization yourself. Routine deployments preserve the existing Worker secret. Do not recreate the production database or rotate `RATE_SALT` just to redeploy.

For a separate, first-time setup in another Cloudflare account:

1. Run `npm ci` to install the locked Wrangler dependency.
2. Authenticate with `npx wrangler login`.
3. Check `npx wrangler d1 list` first. Reuse `groupnote-db` if it exists; otherwise run `npx wrangler d1 create groupnote-db` once.
4. Configure the target account's `account_id` and the database **UUID** in `wrangler.toml`. Keep `binding = "DB"`.
5. Apply the SQL migration to the live database: `npx wrangler d1 migrations apply groupnote-db --remote`.
6. Configure a cryptographically random daily quota hashing secret using `npx wrangler secret put RATE_SALT`. Never put the secret in source code, Git, or a public message. It is already configured for the live deployment above.
7. Deploy the app: `npm run deploy`.
8. Open the resulting `https://groupnote.<your-subdomain>.workers.dev` URL and test with two different browser sessions (or phones): create card, copy **invite link**, sign as a guest, close and reopen.

To test via Wrangler's local emulator, run `npx wrangler d1 migrations apply groupnote-db --local` then `npm run dev`.

**Do not use Netlify Drop alone:** the static files require the Worker and D1 database for live collaboration.

## Before inviting the public

- Review `public/privacy.html` and confirm its operator contact details, service providers and data retention practices are still accurate before public launch.
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

Local testing covered the card workflows, including organiser deletion. Browser checks confirmed guest-message submission, persistence after reloading, and a one-page PDF preview. Browser automation could not complete every check; the owner subsequently confirmed the application worked during manual local testing.

Production deployment verification on 3 November 2026 (Australia/Sydney) passed for the homepage and all static assets, privacy page, `/api/health`, card creation, anonymous guest contributions, organiser permission enforcement, close/reopen, closed-card rejection, and persistence across independent HTTP reads. A read-only D1 query confirmed the verification card's messages are stored remotely. `RATE_SALT` was verified as a `secret_text` binding without reading its value. The clearly labelled production verification card was retained; no production data was deleted or reset. Cross-device browser testing and PDF export have not been repeated against production.
