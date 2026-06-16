# YourLifeBroker — Website

Marketing site for **YourLifeBroker**, an independent life insurance brokerage.
Built on the YourLifeBroker brand identity (Ink Navy + Heritage Gold, Spectral + Archivo)
with a calm, plain-spoken broker voice — "we work for you, not the insurer."

Built as a self-contained static site — no build step, no dependencies. Just open `index.html`.

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

- **Home** (`index.html`) — Hero → Carriers → Why a Broker → Coverage Options → How It Works →
  The Broker Difference/Stats → Testimonials → FAQ → Quote → Footer.
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
├── js/main.js          # nav, dropdown, reveal, counters, accordion, form
└── assets/             # logo lockups (SVG), hero photo, carrier logos
```

## Notes for going live

- The quote form is a front-end demo. Wire `#quoteForm` submit in `js/main.js` to the real
  CRM / email endpoint.
- **Phone numbers** are placeholders — `(888) 888-8888` throughout. Replace with the real line.
- **Email/domain** assume `yourlifebroker.com` (canonicals, OG URLs, `hello@yourlifebroker.com`).
  Confirm the live domain and mailbox.
- Replace the placeholder testimonials with real, attributed client reviews.
- Stat figures (families protected, total benefits, satisfaction) are placeholders — confirm
  the real numbers before launch.

Website by Delray Web Design.
