import { test as base } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = join(DIR, 'fonts');
const MANIFEST = join(FONT_DIR, 'manifest.json');

/* Chromium cannot reach Google's font hosts here, and each blocked request
   stalls page load by ~12s while leaving the typography pass measuring the
   fallback stack. Serve the cached files instead: `node tests/fonts/fetch.mjs`.
   Without the cache the suite still runs, on fallback metrics, and says so. */
let fonts = null;
if (existsSync(MANIFEST)) {
  fonts = JSON.parse(readFileSync(MANIFEST, 'utf8'));
} else {
  console.warn('\n  ⚠ tests/fonts/manifest.json missing — running on FALLBACK font metrics.'
    + '\n    Run `node tests/fonts/fetch.mjs` for a meaningful typography pass.\n');
}

export const test = base.extend({
  page: async ({ page }, use) => {
    /* The Google Maps embed is unreachable from CI, and a `load` wait on it
       stalls every test. Fulfil it locally so the iframe still occupies its
       real box without the network round trip. */
    await page.route(/google\.com\/maps|maps\.googleapis\.com|maps\.gstatic\.com/, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>map</title>' }));

    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => {
      const entry = fonts && fonts[route.request().url()];
      if (!entry) return route.abort();
      return route.fulfill({
        status: 200,
        contentType: entry.type,
        headers: { 'access-control-allow-origin': '*' },
        body: readFileSync(join(FONT_DIR, entry.file)),
      });
    });

    await use(page);
  },
});

export { expect } from '@playwright/test';
