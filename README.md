# Select Digital Dental Lab — ad landing page

The landing page for the **Campaign 1 (no offer)** video and image ads. The audience is private-practice
dentists. It's built on the reusable dental funnel template: one HTML file per page, no framework, a three-step
qualifier form, a GoHighLevel paste build and a Playwright test suite.

All copy comes from the campaign scripts (hooks, the four bodies and both CTAs), so the page repeats what the ad
promised:

| Section | Source in the ad scripts |
| --- | --- |
| Hero: "The Dental Lab Built by Dentists, for Dentists" + qualifier | Headline 1, CTA 2 ("limited number of private practices… right fit") |
| Trust strip: Dentist-led · Every case · 100% digital · 10 days | Recurring proof points |
| Sound familiar? (`#problem`) | Body 1 "The Remake Cycle", hooks 2 and 7 |
| Why digital (`#digital`) | Body 3 "Why Digital Changes The Fit", hook 4 |
| How it works (`#how`) | Bodies 1 and 3 |
| Your name is on it (`#reputation`) | Body 4 and the "Your Reputation" image ad |
| What we make (`#services`) | Body 2 |
| Speak the same language (`#included`) | "Speak The Same Language" ad, hook 9 |
| FAQs · final CTA | Every body, plus CTA 2 |

The page makes **no claims beyond the scripts**. There are no prices, no testimonials, no named people and no
address. Add them only once they're confirmed.

## Run it

```bash
npm install
npm run serve     # http://localhost:4321/index.html
npm test          # 49 tests: contrast, no overflow at 7 widths, form, typography, GHL isolation
```

## Before going live

1. **Form endpoint.** In `index.html`, set `ENDPOINT` to the GoHighLevel inbound webhook. The form posts:
   `practiceType`, `frustration`, `firstName`, `lastName`, `practiceName`, `phone`, `email`.
2. **Logo** (optional). Add `assets/img/logo.png`. Without it, the header uses a text lockup.
3. **Conversion tag.** Paste the pixel or GTM event into the marked block at the bottom of `thank-you.html`.
   Fire it only there.
4. **GoHighLevel.** Run `npm run ghl`, then paste `ghl-embedded.html` (and `ghl-thank-you-embedded.html`) into
   custom-code blocks. After that, set `THANK_YOU` in the fragment to your GHL thank-you step path.

Both pages ship with `noindex`. This is deliberate for a paid-traffic page: remove the tag in `index.html` only if
you want the page to be indexed.

## Rebranding

The colours live in the `★ BRAND CONFIG` block at the top of `index.html` (currently slate blue). The fonts are the
Google Fonts `<link>` plus `--font-head` / `--font-body`. Run `npm test` after any colour change: the contrast
suite fails any text/background pair that drops below WCAG AA.
