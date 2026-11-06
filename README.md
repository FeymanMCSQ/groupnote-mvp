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

## Read-only production statistics

With the project's dependencies installed (`npm ci`) and Wrangler authenticated (`npx wrangler login`, or `npx wrangler login --device` if the localhost callback fails), run:

```bash
npm run stats
```

This reads the existing production `groupnote-db` configured in `wrangler.toml` using Wrangler. It reports:

- Total currently stored cards.
- Currently stored cards created in the last 24 hours.
- Total currently stored contributions (messages).
- Currently stored cards with at least 3 contributions.
- Daily card creation counts for the last 14 Australia/Sydney dates: today (partial) and the previous 13 dates, including days with zero cards. Daylight saving is handled automatically.
- An acquisition funnel by campaign source (landing sessions, create-form sessions and card-creation events since tracking was enabled), plus daily source counts for the last 14 Sydney dates.
- A **GroupNote activation funnel**: recorded historical creations/deletions, current cards, distinct cards with share/invitation/contribution activity, 3+ recorded contributions, historical contribution totals, share outcomes and 14 zero-filled Sydney dates of lifecycle events.

**The stored-card and contribution metrics exclude deleted data. Existing test cards and messages may appear.** Those metrics describe data still stored, rather than lifetime usage or unique people. Acquisition counters are separate cumulative counts and remain after card deletion. Database timestamps remain UTC; the command converts hourly aggregate card counts into Australia/Sydney calendar dates. The last-24-hours count remains a rolling window of 24 elapsed hours, rather than a calendar-day count.

The command runs only the read-only SELECT queries in `scripts/stats.sql` and `scripts/activation.sql`. A small Node wrapper passes the SQL to Wrangler's `--command` option, groups the hourly aggregates into Sydney dates and fills zero-count days. It does not deploy the app, apply migrations, modify production data, or return message content, personal names, credentials or organiser keys. No third-party analytics service or extra dependencies are used. Before migration `0002_acquisition_counts.sql` is applied, the original card/contribution statistics still work and acquisition counts are reported as unavailable. Before `0003_card_lifecycle.sql` is applied, acquisition statistics still work and the activation section is unavailable.

If a request fails, the command retries once. If both attempts fail, it exits with an error and reports a safe diagnostic for missing Wrangler dependencies, connectivity, authentication or an invalid response, rather than printing raw CLI output. Follow the reported action; an authentication error can be resolved with `npx wrangler login --device`.

## Minimal acquisition analytics

Campaign example: `https://groupnote.sssafiullahhh.workers.dev/?src=uni_email`.

- Allowed labels are `direct`, `uni_email` and `other`. A missing source uses the tab's saved label, or `direct`; an unknown value becomes `other` before it is saved or sent. To add a campaign, update the allowlists in `public/app.js` and `src/worker.js`, plus the source filters in `scripts/stats.sql`. Use campaign labels, never names, addresses or recipient identifiers.
- Landing and create-form events are counted at most once per tab session, Sydney date and source, using flags in browser `sessionStorage`. No session identifier is sent or stored in D1. The campaign label survives navigation/reloads within that tab. When session storage is blocked, in-memory deduplication works until reload.
- Direct shared-card visits and sample views do not count as landing visits. If a guest later navigates to the homepage or create form, that actual view can count. Opening `/#create` directly records a form open without a landing event. Guest contributions do not emit acquisition events.
- Each successful new card schedules one `card_created` counter, attributed to its allowed campaign label. Older clients/API callers without a source use `direct`. This background write is separate from the card insert; failures cannot turn a successfully created card into a failed request.
- The new `acquisition_counts` table contains **only** Sydney date, allowed source, event type and count. It has no IP address, email, fingerprint, session identifier, card ID, content or organiser-key columns. The write-only, same-origin `POST /api/acquisition` endpoint accepts only landing/form events and source labels; it provides no reporting access and does not use the IP-based abuse quotas. Existing card/message abuse prevention is unchanged.
- These are **approximate tab sessions and independent event counts, not unique users or a linked conversion rate**. Multiple tabs/days can count again, copied tab sessions can share flags, a session may create several cards, and blocked requests can undercount. Client-side counts can also include bots or fabricated requests; they are not an audited traffic measure.
- Acquisition counts start when this change is deployed, have no historical backfill or automatic expiry, and remain after cards are deleted. The existing stored-card/contribution statistics continue to exclude deleted data. Tests and operator visits can appear in both reports.

### Exclude your own browser

Open `https://groupnote.sssafiullahhh.workers.dev/?analytics=off` once in each browser/profile/device you use for testing. A confirmation appears. This saves only a local `groupnote-analytics-excluded=1` preference, with no identifier or account. It persists across normal tab sessions and browser restarts. Reload any other open GroupNote tabs after changing the preference. Do not share the opt-out link in outreach; use the normal campaign link.

Excluded browsers send no landing/form/share/invitation events. A boolean opt-out on creation, contribution and deletion requests tells the Worker to skip their analytics; that flag is not stored on the card or in D1. Normal card creation, contributions and organiser controls still work. Operational retry receipts still apply to excluded creations. **Stored-card/contribution totals still include your test cards and messages**; this switch excludes analytics only. Previously recorded events cannot be identified as yours and are not removed or reset. Other visitors can still generate events for a card created by an excluded browser. This repository has no IP-based analytics exclusion; IP hashing remains confined to existing abuse quotas.

To resume counting in that browser, open `https://groupnote.sssafiullahhh.workers.dev/?analytics=on`. Clearing site storage, changing browser/profile/device or using a new private-browsing session loses the preference, so opt out again. If browser storage is blocked, `?analytics=off` excludes the current page only and the confirmation says so; use that URL again for each new page load.

## Permanent card lifecycle analytics

The existing acquisition table and its historical counts are preserved. Migration `0003_card_lifecycle.sql` adds three tables and two indexes, with no ALTER, reset, deletion or historical backfill:

- `card_analytics` is a live-card bridge to a new cryptographically random analytics alias and an allowed campaign label. Its foreign key cascades away when the card is deleted. Older cards acquire an alias only when a new tracked action occurs; their original campaign is unknown (`NULL`), and no historical creation/contribution is invented.
- `card_events` retains `card_created`, `share_clicked`, `invite_opened`, `contribution_added` and `card_deleted`, UTC timestamps, the random card alias, fixed share-method/outcome labels and a creation-counter sync marker. Event IDs are deduplication keys, not cross-card visitor IDs. The event table has no foreign key to live cards, so content-free history survives deletion. No full URLs, private keys, names, titles, IPs, emails or message bodies are recorded in it.
- `card_creation_requests` stores only a request-token hash and an operational card ID. These retry receipts survive deletion to prevent an uncertain create request from recreating a deleted card. They contain no raw request token, organiser key or card contents and are separate from analytics filtering.

**Authoritative mutations:** the Worker inserts a card/message and its success event in one D1 batch. A deletion event is guarded by the owner-key hash and committed in the same transaction as the deletion. Failed or unauthorised mutations cannot commit success events. D1 batches are [transactional](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). If analytics preparation or the batch fails, its transaction rolls back and the Worker retries the operational statements without analytics, logging only a generic warning. Preserving real cards/messages takes priority; this exceptional path can leave history gaps. There is no content-bearing analytics outbox or automatic repair/backfill.

**Acquisition reconciliation:** `card_created` still comes from a successful server insert, not a frontend click. Its existing daily acquisition counter is synced in the background using a transactional per-event marker, so normal retries cannot increment it twice. Stats prints all acquisition creations, lifecycle creations, creations linked to acquisition and pending sync counts. Existing acquisitions without lifecycle links remain unchanged; they may predate this feature or indicate a tracking gap. The November 5, 2026 discrepancy cannot retroactively prove deletion, failed persistence or an incorrect old count.

**Retry handling:** the updated browser generates a private 192-bit token per form submission, reuses it for retries of unchanged fields, and clears it on success. It is held only in page memory and is never stored raw or sent in analytics events. Domain-separated hashes derive the same card result/organiser key or message ID on a repeated request; operational receipts prevent restoring deleted cards. API clients can supply the same 48-character lowercase hex `requestId` when retrying. Keep it private like an organiser key. Older callers without a token remain compatible, but indistinguishable repeated POSTs can create separate real records. New tokens or changed fields represent new submissions. A page reload does not submit a form or create a success event.

**Sharing:** existing Copy Invite Link and Share Card buttons emit `share_clicked` with `copy_link` or `native_share`. One event per click starts as `attempted` and can become `copied`, `completed`, `cancelled`, `failed`, `manual_copy` (prompt shown, copying unknown), or `fallback_copied` (native sharing unavailable). Out-of-order/retried outcome packets cannot add events or downgrade a terminal result. Browser-reported success never means confirmed delivery; people may also share links outside these buttons without an event.

**Invitation opens:** only a successfully loaded card without a `key` query parameter emits an event. A card-specific random event token in tab `sessionStorage` survives refreshes; the server scopes/hashes it to that card and deduplicates it. This is an approximate per-card tab session, not a unique person, invitation delivery or proof that a visitor differs from the organiser. Copied tabs may share storage; blocked storage, cleared storage or new sessions can count again. Browser opt-out applies to all new events.

`POST /api/cards/:id/events` is write-only: same-origin JSON, a 512-character payload limit, fixed fields/events/methods/outcomes, a valid existing card and at most 2,000 new browser events per card per UTC day. Existing action outcomes can finish at that cap. The cap uses event counts rather than IP tracking and never throttles real card/message mutations. Clients cannot send authoritative creation, contribution or deletion events. These checks bound basic abuse; invitation links are public capabilities, so forged client events/bots remain possible and client counts are not an audited measure. There is no public reporting endpoint.

The activation report distinguishes lifetime **recorded** events, distinct card aliases and all currently stored records. Older, excluded or lost events mean these populations differ. Historical contribution totals and the 3+ threshold concern recorded contributions, not reconstructed old messages. Daily counts cover the last 14 Sydney calendar dates including zeroes and today (partial). No conversion percentages are shown. Event history and retry receipts have no automatic expiry. Historical activity that was never recorded cannot be recovered, and anonymous analytics cannot identify genuine separate people.

### Review and deployment instructions

Lifecycle tracking requires the additive `migrations/0003_card_lifecycle.sql`; retain `0001` and `0002` unchanged. Migration `0002` was already applied in the earlier acquisition deployment. **Do not apply production migrations or deploy until the owner explicitly approves this update.** Review pending migrations and the privacy notice first, then apply `0003` **before** deploying the Worker/assets:

```bash
npm test
npx wrangler d1 migrations list groupnote-db --remote
npx wrangler d1 migrations apply groupnote-db --remote
npm run deploy
npm run stats
```

For a local check, run `npm run demo` and visit `http://localhost:8787/?src=uni_email`, then open the create form. The demo loads the included idempotent migrations at startup. The tests use in-memory SQLite and mocked browser requests; they do not contact or change production. Tracking initialization errors, blocked session storage, failed requests, missing analytics tables and failed counter writes are tested alongside normal card creation and guest contributions.

Additional local browser verification on 6 November 2026 passed 15 scenarios using an isolated headless Chrome 156 profile through Playwright 1.65.0; all 34 automated tests also passed. Checks covered real clipboard copying, separate organiser/guest sessions, campaign/session counts, creation/message retries after deliberately dropped responses, contribution persistence, close/reopen and closed-card rejection, browser opt-out, blocked storage/tracking, deletion with retained lifecycle history, and 375px mobile layouts. Visual review caught invisible theme radio inputs expanding the mobile create form to 480px; scoping/sizing those hidden inputs fixed it without changing the visible theme. The final browser rerun verifies layout width against the configured viewport, rather than mobile `innerWidth` alone. Chromium exported five test messages on one A4 PDF page, which passed text and visual review. Native OS share-sheet completion/delivery was not verified; clipboard fallback was exercised and cancellation was simulated explicitly. Tooling and evidence stay in ignored `.dist/` folders, with no app dependency changes. All mutations used a separate disposable local database; production was untouched. The built-in Browser connection remains unavailable, so this verification used the owner-approved Playwright fallback.

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
- `migrations/0002_acquisition_counts.sql` — additive daily acquisition counters
- `migrations/0003_card_lifecycle.sql` — permanent lifecycle events, live aliases and operational retry receipts
- `src/analytics.js` — transactional lifecycle writes and bounded browser-event ingestion
- `test/local-server.mjs` — self-contained local preview backend
- `test/d1.mjs` — local transactional SQLite adapter for the demo and automated tests
- `scripts/stats.sql` — read-only aggregate queries used by `npm run stats`
- `scripts/activation.sql` — read-only lifecycle totals, daily events, share outcomes and acquisition reconciliation

## Notes

Local testing covered the card workflows, including organiser deletion. Browser checks confirmed guest-message submission, persistence after reloading, and a one-page PDF preview. Browser automation could not complete every check; the owner subsequently confirmed the application worked during manual local testing.

Production deployment verification on 3 November 2026 (Australia/Sydney) passed for the homepage and all static assets, privacy page, `/api/health`, card creation, anonymous guest contributions, organiser permission enforcement, close/reopen, closed-card rejection, and persistence across independent HTTP reads. A read-only D1 query confirmed the verification card's messages are stored remotely. `RATE_SALT` was verified as a `secret_text` binding without reading its value. The clearly labelled production verification card was retained; no production data was deleted or reset. Cross-device browser testing and PDF export have not been repeated against production.
