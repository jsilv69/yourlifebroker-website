# Tomorrow Life — Website Redesign

A modernized redesign of [tomorrowlife.org](https://tomorrowlife.org/) for Tomorrow Life, Inc.
Keeps the existing brand (deep purple + gold), messaging, and content while delivering a
faster, cleaner, conversion-focused user experience.

Built as a self-contained static site — no build step, no dependencies. Just open `index.html`.

## What changed vs. the original

- **Modern visual system** — purple radial-gradient brand (pulled straight from the logo) paired
  with the gold accent, generous spacing, soft shadows, rounded cards, and the Inter typeface.
- **Stronger hero** — clear value prop, dual CTA (quote + call), trust checklist, and floating
  social-proof cards over the family photo.
- **Better information architecture** — Why Us → Coverage → How It Works → Excellence/Stats →
  Testimonials → FAQ → Quote → Footer, each with a focused CTA.
- **Quiz-style quote form** — the quote request is a 5-step quiz (coverage → state → age &
  gender → nicotine → contact) with an animated progress bar, large tap-friendly option cards,
  auto-advance on single-choice steps, Back/Continue navigation, per-step validation, and a
  "Thank you" success state.
- **Conversion UX** — sticky header, animated stat counters, single-open FAQ accordion,
  auto-formatting phone field, and a sticky mobile call/quote bar.
- **Fully responsive** — 3-col → 2-col → 1-col layouts, mobile menu, reduced-motion support, and
  accessible markup (skip link, ARIA, focus styles).

## Structure

```
tomorrowlife-redesign/
├── index.html          # all page sections
├── css/styles.css      # brand tokens + full stylesheet
├── js/main.js          # nav, reveal, counters, accordion, form
└── assets/             # logo (SVG), hero photo, carrier logos
```

## Notes for going live

- The quote form is a front-end demo. Wire `#quoteForm` submit in `js/main.js` to the real
  CRM / email endpoint (or embed the existing lead form).
- Replace the placeholder testimonials with real, attributed client reviews.
- Update the Instagram URL in the header and footer to the live handle.
- Stat figures (families protected, total benefits, satisfaction) are placeholders — confirm
  the real numbers before launch.

Website by Delray Web Design.
