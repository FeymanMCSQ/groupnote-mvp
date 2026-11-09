# GroupNote — minimal group-card web app

A real shareable group-card MVP. The organiser creates a card, contributors add notes without accounts, and the recipient reads the completed card at a link. No subscriptions, email integrations, or AI API calls.

## What works

- Create a card with 9 occasions, 12 occasion-specific templates and 3 classic neutral looks
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

- `src/marketing.js` — server-rendered occasion pages, public metadata, sitemap and robots
- `public/templates.js` — shared template IDs, occasions, palettes, greetings and preview markup
- `public/templates.css` — card layouts, accessible miniature picker and print styling
- `public/card-art.svg` — reusable, local vector decorations for the twelve designs
- `test/templates.test.mjs` — catalogue, artwork, contrast and template-persistence tests
- `public/_headers` — default noindex protection for static HTML fallbacks
- `test/marketing.test.mjs` — marketing HTML, indexing directives and occasion compatibility tests

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

## Occasion landing pages and SEO

The public marketing routes are `/`, `/farewell-card`, `/birthday-card`, `/thank-you-card`, `/diwali-card`, `/christmas-card` and `/new-year-card`. The Worker renders distinct landing copy, examples, FAQs, titles, descriptions, canonical links and Open Graph metadata into the existing app shell before returning HTML. These pages work for crawlers without JavaScript. The homepage footer links all six occasion collections using ordinary anchors. Static CSS, JavaScript and images continue through the asset service. Marketing HTML uses `no-store` because indexing directives depend on query parameters.

The occasion CTAs open the existing creator, with an editable suggested title, occasion and theme. Each main occasion offers two designs from the shared template catalogue, with three neutral alternatives. There is one creator and one set of card/contribution/organiser APIs. No dependencies or database migrations are required. Landing pages reuse the existing landing/form analytics, session deduplication, campaign labels and browser opt-out, without adding analytics dimensions. `?src=uni_email` works on each occasion page.

### Local checks and release

```bash
npm test
npm run demo
# Open http://localhost:8787/farewell-card (also birthday-card and christmas-card)
# Optional production bundle validation, without publishing
npx wrangler deploy --dry-run
```

After reviewing and approving publication, deploy the Worker and assets together with the existing script. A static-assets-only upload will not include the server-rendered pages.

```bash
npm run deploy
```

This update needs no production database command. Existing migrations remain unchanged. Verify all six occasion routes, `/sitemap.xml`, `/robots.txt` and a shared card's `X-Robots-Tag` response header after deployment. The local demo uses its own loopback origin in canonical links. Wrangler local development uses the configured public origin, matching production output.

Local verification on 8 November 2026 passed all 45 automated tests, including the original 34 analytics/regression tests. A separate disposable demo database and isolated Chrome contexts passed no-JavaScript landing/FAQ checks, all three preset creations, editable titles, campaign-session deduplication, real clipboard sharing, independent guest contribution persistence, organiser permissions, close/reopen, closed-card rejection and persistent opt-out. Landing pages and forms had no horizontal overflow at 320, 375, 768 and 1365 pixels. Desktop/mobile screenshots were reviewed, with no uncaught JavaScript errors. All browser assertions completed and the report was saved, but the browser test process subsequently exited with Windows access-violation code `0xC0000005` during shutdown. Twelve read-only checks against Wrangler's local emulator verified actual asset routing, canonical output, private/fallback/API noindex headers, sitemap and robots. The production bundle also passed a Wrangler dry run. Browser tooling and screenshots remain in ignored `.dist/` folders. No production deployment or database change was performed.

### Public origin and future domains

`PUBLIC_SITE_ORIGIN` in `wrangler.toml` is the single production origin setting used for all canonical URLs, Open Graph URLs and sitemap locations. It currently points to `https://groupnote.sssafiullahhh.workers.dev`. Query parameters are excluded from these metadata URLs.

After you own and attach a custom domain to this Worker, change `PUBLIC_SITE_ORIGIN` to its HTTPS origin. To enable permanent redirects, optionally add `MARKETING_REDIRECT_FROM` under `[vars]`, set to the old origin. Only public marketing requests on that explicitly configured old origin receive a 301 redirect. Campaign query parameters are preserved. Shared cards, organiser links and creator queries continue on their existing origin. Leave this optional setting absent until the new domain is attached and tested. No custom domain or redirect is configured by this change.

### Indexing protection

Only the seven public marketing URLs are in the sitemap. Requests with `card`, `key` or `occasion` query parameters receive `noindex, nofollow` in both the HTML and the HTTP response header. Card API responses also carry this header. The SPA sets its robots meta tag to noindex while displaying creation, sample or card views. The static shell and `_headers` default to noindex, protecting alternative asset URLs and unknown SPA fallback paths. Marketing responses explicitly enable indexing only on the allowlisted public routes. Card contents and organiser keys are never interpolated into marketing HTML or SEO metadata.

`robots.txt` allows crawling so crawlers can read the noindex directives. Blocking those URLs in robots.txt would prevent Google from seeing noindex. These directives guide cooperative search engines. Existing invitation-link access still applies to people who have a card link. [Google's noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

### Google Search Console setup after deployment

The operator-provided Google HTML verification token is configured as `GOOGLE_SITE_VERIFICATION` in `wrangler.toml`. After publishing, return to the matching URL-prefix property in Search Console and click **Verify**, then submit the sitemap using the steps below. Keep this public token configured for ongoing ownership checks.

1. In Google Search Console, add a **URL-prefix** property for `https://groupnote.sssafiullahhh.workers.dev/`, including HTTPS and the trailing slash. A URL-prefix property fits this hosted subdomain.
2. Choose **HTML tag** verification. Copy the actual `content` value Google supplies into an optional `GOOGLE_SITE_VERIFICATION` variable under `[vars]` in `wrangler.toml`. The Worker will insert the escaped tag into the document head. This public verification value is not a credential. No token is provided or fabricated in this repository. Deploy that configuration after approval, confirm the tag in the homepage's initial HTML, then click **Verify** in Search Console. Keep the token published for ongoing verification. If you choose Google's HTML-file method instead, put the exact supplied file in `public/` and publish it unchanged. [Ownership verification](https://support.google.com/webmasters/answer/9008080?hl=en)
3. Open **Sitemaps**, submit `https://groupnote.sssafiullahhh.workers.dev/sitemap.xml`, and check the fetch status. [Sitemaps report](https://support.google.com/webmasters/answer/7451001?hl=en)
4. Use **URL Inspection** for the homepage and each occasion URL. Run **Test live URL** to check fetchability and indexing eligibility, then **Request indexing**. Use only the clean public marketing URLs.
5. Revisit **URL Inspection** to check whether each URL is on Google and which canonical Google selected. Use the **Page indexing** report to investigate exclusions. A live test alone does not confirm indexing, and submission does not guarantee indexing or rankings. [URL Inspection](https://support.google.com/webmasters/answer/9012289/)

Search Console ownership and Google indexing require the operator's account and published pages. They have not been performed by local tests. Open Graph titles, descriptions and URLs are provided, with no dedicated social-preview image. Existing Google Fonts usage is unchanged.

## Occasion collections and card designs

The creator offers two illustrated designs for each main collection, plus the original three neutral looks for every occasion. The homepage hero shows six linked card miniatures, beside the introduction on desktop and beneath it on mobile.

| Collection | Templates |
| --- | --- |
| Farewell | New Beginnings, Best Wishes |
| Birthday | Birthday Confetti, Birthday Balloons |
| Thank you | Floral Gratitude, Warm Appreciation |
| Diwali | Festival of Lights, Golden Celebration |
| Christmas | Evergreen Christmas, Winter Wishes |
| New Year | Midnight Celebration, Golden Fireworks |

Congratulations, Get well and Just because remain in the occasion selector and use the classic looks. Diwali artwork uses diyas and rangoli-inspired ornamentation. Evergreen Christmas has pine branches and berries. Winter Wishes offers a general seasonal greeting. Both New Year designs have year-independent artwork.

### Catalogue and compatibility

`public/templates.js` is the shared catalogue imported by the browser, Worker validation and marketing renderer. Every entry has a stable ID, name, occasion, palette, suggested greeting and decorative/layout styling. Local SVG symbols in `public/card-art.svg` supply the same artwork to picker thumbnails, creation previews, finished cards and PDF exports. `public/templates.css` controls the layouts at those sizes. The frontend uses native JavaScript modules served by the existing local or Cloudflare server.

Occasion and visual appearance remain separate fields. The existing `cards.theme` TEXT column stores the selected template ID. The backend validates IDs against the shared catalogue and retains the existing fallback for unknown values. **No migration or new table is required.** The original `peach`, `sage` and `sky` IDs retain their previous card styling and stay selectable. Existing card records are never rewritten. Keep published template IDs stable to preserve future compatibility.

Selecting an occasion displays its two illustrated choices and all three classic options. Selecting a design updates the live preview and suggested greeting. Once the title receives manual input, changing occasions or templates preserves that title, including an intentionally cleared title. Recipient, organiser name and personal note are preserved during selection changes. The picker uses labelled native radio inputs with keyboard navigation, a visible focus outline and an explicit selected indicator.

The six occasion landing pages reuse the existing server-rendered marketing pages and creator. The sitemap now contains seven public URLs including the homepage. Private cards, organiser links and API responses retain their indexing protections. Existing acquisition, lifetime events, browser exclusion, campaign attribution and SELECT-only statistics continue through their existing code and tables.

### Review and deployment

Run local checks and review the designs before approving a production release.

```bash
npm test
npm run demo
# Open http://localhost:8787/diwali-card or any other occasion page
npx wrangler deploy --dry-run
```

After explicit release approval, publish the Worker and all assets together using the existing script.

```bash
npm run deploy
```

There is no production migration command for this expansion. Local browser tests use disposable databases under ignored `.dist/` folders. Screenshots and PDF exports are test evidence in that folder. The classic font stack and system handwriting-style fallback vary by platform. Browser testing uses isolated Chrome with emulated mobile viewports. Actual physical-printer output remains a manual check.

Local verification on 9 November 2026 passed all 57 automated tests and the complete isolated Chrome suite with a clean exit. Browser checks covered all twelve designs, six server-rendered landing pages without JavaScript, keyboard template selection, live previews, manual-title preservation, campaign deduplication, real clipboard sharing, independent guest persistence, organiser permissions, close/reopen and deletion. All six landing pages and twelve previews passed no-horizontal-overflow checks at 320, 375, 768 and 1365 pixels, including checks that thumbnail text stays inside the cards. All fifteen designs, including the three classic themes, exported readable one-page synthetic-fixture PDFs with organiser/sharing controls excluded. Visual PDF review led to portrait proportions for illustrated print covers, preserving the artwork. Local Wrangler checks passed for all six occasion routes, JavaScript/CSS/SVG asset types, the seven-URL sitemap, robots and private noindex headers. The final Worker dry run passed. Production release awaits explicit approval.
