# YourLifeBroker — Website

Marketing site for **YourLifeBroker**, an independent life insurance agency.
Built on the YourLifeBroker brand identity (Ink Navy + Heritage Gold, Spectral + Archivo)
with a calm, plain-spoken agent voice — "we work for you, not the insurer."

The site is static HTML/CSS/JS, with a `/api/lead` endpoint that forwards quote-form
submissions to monday.com.

**Hosting is split across two platforms:**

- **Static site → Cloudflare** (Workers Static Assets). Config in `wrangler.jsonc`; deployed
  with `wrangler deploy`. `.assetsignore` keeps the server/deploy files out of the upload.
- **`/api/lead` API → Fly** (the Node/Express `server.js`, which Cloudflare can't run). See
  *Monday CRM integration* below.

Because they're on different origins, the form posts to the **absolute Fly URL** (the
`LEAD_ENDPOINT` constant in `js/main.js`) and the Fly server allows the Cloudflare origin via
the `ALLOW_ORIGIN` env var (CORS).

> ⚠️ Two things to keep in sync: `LEAD_ENDPOINT` in `js/main.js` must point at your Fly app URL,
> and `ALLOW_ORIGIN` on Fly must list your Cloudflare site origin(s).

`server.js` can still serve the static files too (handy for local dev: `npm start`), but in
production the canonical site is served by Cloudflare.

## Brand system

- **Color** — Ink Navy `#0E2747` (primary) with Heritage Gold `#B68B4C` used sparingly as an
  accent. Supporting Trust Blue, Steel, Mist, and a Parchment neutral. All tokens live in
  `:root` in `css/styles.css`.
- **Type** — Spectral (serif) for headings and the wordmark; Archivo (sans) for body, labels,
  and UI. Loaded from Google Fonts.
- **Logo** — the shield crest + wordmark lockups ship in `assets/` (horizontal, stacked,
  wordmark, monogram, reverse, and a path-based shield used as the favicon). The header and
  footer use the lockup inline as SVG so it always renders in the brand fonts.
- **Iconography** — a calm linear set (24px grid, navy stroke, never filled), used for the
  feature cards, coverage options, and the Plans dropdown.

## Pages

- **Home** (`index.html`) — Hero → Carriers → Why an Agent → Coverage Options → How It Works →
  The Agent Difference/Stats → Testimonials → FAQ → Quote → Footer.
- **Plans** (`plans/*.html`) — one SEO-targeted sub-page per coverage option (whole life, term
  life, final expense, indexed universal life, children & spouse, accidental & living benefits),
  each with unique title/meta/keywords, JSON-LD (`BreadcrumbList` + `FAQPage`), tailored copy,
  an FAQ, and cross-links. Reached from the **Plans** nav dropdown.

## Features

- **Plans dropdown** — desktop hover/focus menu + mobile expandable submenu listing all six
  coverage options.
- **Quiz-style quote form** — 5-step quiz (coverage → state → age & gender → nicotine → contact)
  with progress bar, auto-advance, per-step validation, and a success state.
- **Conversion UX** — sticky header, animated stat counters, single-open FAQ accordion,
  auto-formatting phone field, sticky mobile call/quote bar.
- **Responsive & accessible** — 3→2→1 column layouts, reduced-motion support, skip link, ARIA.

## Structure

```
yourlifebroker-site/
├── index.html          # homepage
├── plans/              # one page per coverage option (SEO landing pages)
├── css/styles.css      # brand tokens + full stylesheet
├── js/main.js          # nav, dropdown, reveal, counters, accordion, form → /api/lead
├── assets/             # logo lockups (SVG), hero photo, carrier logos
├── server.js           # Express: serves the site + POST /api/lead → monday.com
├── package.json        # Node deps (express)
├── Dockerfile          # container for Fly
├── fly.toml            # Fly.io app config
└── .env.example        # required env vars (Monday token, board, column IDs)
```

## SEO

- `robots.txt` (allows all, references the sitemap) and `sitemap.xml` (7 canonical URLs) sit at
  the site root.
- Every page has a unique title (~50–60 chars), meta description (~150–160), self-referencing
  canonical, Open Graph + Twitter Card tags, and a shared 1200×630 `assets/og-image.jpg`.
- Structured data: `InsuranceAgency` + `WebSite` site-wide; `BreadcrumbList` + `FAQPage` on each
  plan page.
- Performance: hero image preloaded and served as WebP with a responsive `srcset`; Google Fonts
  loaded non-render-blocking; all images carry width/height (CLS ≈ 0).
- Lighthouse (mobile, local): home 96 / 100 / 100 / 100; plan pages 100 / 100 / 100 / 100
  (Performance / Accessibility / Best Practices / SEO). Core Web Vitals in "Good".

## Monday CRM integration

The quote form posts to `POST /api/lead`, which creates a new item (lead) on a monday.com board.
The Monday API token lives only in server-side env vars — never in the browser.

**Flow:** browser form → `/api/lead` (Express, holds the token) → monday.com GraphQL `create_item`.

### 1. Configure
Copy `.env.example` → `.env` and fill in:

| Var | What |
|-----|------|
| `MONDAY_TOKEN` | API token (monday.com → avatar → Developers → My access tokens) |
| `MONDAY_BOARD_ID` | The board that receives leads (the number in the board URL) |
| `MONDAY_GROUP_ID` | *(optional)* group/section to drop leads into |
| `COL_PHONE` / `COL_STATUS` / `COL_SOURCE` | Confirmed columns on the YLB Leads board (`lead_phone`, `lead_status`, `text_mm4f2gw1`) |
| `COL_NOTES` | Long-text column (`long_text_mm4k9vaw`) — gets a full summary of every answer |
| `COL_EMAIL` / `COL_STATE` / `COL_COVERAGE` / `COL_AGE` / `COL_GENDER` / `COL_NICOTINE` | *(optional)* set only if you create dedicated columns for these web-only fields |

> **Any `COL_*` left blank is skipped** — no error, the field just isn't written as its own
> column (it still appears in the Notes summary). The defaults in `.env.example` are pre-filled
> with the **YLB Leads board** (`18417923566`) and the columns already used by the
> `ylb-monday-aircall` (Aircall→Monday) service, so web-form leads and inbound-call leads land
> on the **same board**.

### 2. Find your column IDs
Column IDs are not the column titles. List them with:

```bash
curl https://api.monday.com/v2 -H "Authorization: $MONDAY_TOKEN" -H "Content-Type: application/json" \
  -d '{"query":"query { boards(ids: YOUR_BOARD_ID) { columns { id title type } groups { id title } } }"}'
```

Map each returned `id` into the matching `COL_*` var. (Email/phone columns must be Monday
"email"/"phone" types; status must be a "status" column whose label matches `MONDAY_STATUS_LABEL`.)

### 3. Run locally
```bash
npm install
node server.js          # serves the site + /api/lead on http://localhost:8080
```

### 4. Deploy to Fly
```bash
fly launch --no-deploy   # first time — creates the app from fly.toml
fly secrets set \
  MONDAY_TOKEN=your_token_here \
  MONDAY_BOARD_ID=18417923566 \
  COL_PHONE=lead_phone COL_STATUS=lead_status COL_SOURCE=text_mm4f2gw1 COL_NOTES=long_text_mm4k9vaw \
  ALLOW_ORIGIN="https://yourlifebroker.com,https://yourlifebroker-website.pages.dev"
fly deploy
```

`ALLOW_ORIGIN` is a comma-separated list of the Cloudflare origins allowed to call the API
(your custom domain and/or the `*.workers.dev` / `*.pages.dev` URL). It can also be `*` to
allow any origin.

### 5. Deploy the static site to Cloudflare
With `wrangler.jsonc` in the repo, the build is non-interactive:
```bash
npx wrangler deploy
```
Secrets are encrypted by Fly and injected as env vars — none are committed to the repo.

## Notes for going live

- **Set the Monday secrets** (above) before launch — until `MONDAY_TOKEN`/`MONDAY_BOARD_ID` are
  set, `/api/lead` returns a 500 and the form shows an error.
- **Phone numbers** are placeholders — `(888) 888-8888` throughout. Replace with the real line.
- **Email/domain** assume `yourlifebroker.com` (canonicals, OG URLs, sitemap, `hello@yourlifebroker.com`).
  Confirm the live domain and mailbox; if it changes, update those absolute URLs.
- **Host config (not in static files):** enforce one canonical host (301 `www` → non-`www`),
  serve over HTTPS, and enable Brotli/Gzip + CSS/JS/HTML minification. Re-run Lighthouse against
  the production URL (PageSpeed Insights) to confirm field Core Web Vitals.
- Replace the placeholder testimonials with real, attributed client reviews.
- Stat figures (families protected, total benefits, satisfaction) are placeholders — confirm
  the real numbers before launch.

Website by Delray Web Design.
