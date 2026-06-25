# YourLifeBroker — Website

Marketing site for **YourLifeBroker**, an independent life insurance agency.
Built on the YourLifeBroker brand identity (Ink Navy + Heritage Gold, Spectral + Archivo)
with a calm, plain-spoken agent voice — "we work for you, not the insurer."

The site is static HTML/CSS/JS. A tiny Node/Express server (`server.js`) serves those files
**and** exposes a `/api/lead` endpoint that forwards quote-form submissions to monday.com.
For pure front-end work you can still just open `index.html`; to test the lead flow, run the
server (see *Monday CRM integration* below).

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
| `COL_*` | The **column IDs** on your board for email, phone, state, coverage, age, gender, nicotine, and optional status |

> Reuse the **same board** as the existing `ylb-monday-aircall` (Aircall→Monday) service so
> web-form leads and inbound-call leads land together.

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
fly secrets set MONDAY_TOKEN=xxx MONDAY_BOARD_ID=123 COL_EMAIL=email COL_PHONE=phone \
  COL_STATE=text_state COL_COVERAGE=text_coverage COL_AGE=numbers_age \
  COL_GENDER=text_gender COL_NICOTINE=text_nicotine
fly deploy
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
