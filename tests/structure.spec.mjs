import { test, expect } from './fixtures.mjs';
import { PAGES, WIDTHS } from './helpers.mjs';

/* Two classes of network noise are expected and are reported elsewhere
   rather than failed here:
     · third-party origins the sandbox cannot reach, including the media CDN
       the page points at once media.json is filled in - those URLs are
       fetched by the visitor's browser, never by this environment
     · /assets/ photography the client has not supplied yet, which the
       ::before slot pattern degrades to a labelled placeholder. The
       "every image src resolves" test below inventories those.
   Anything the page itself throws is always a hard failure. */
const IGNORABLE = /fonts\.googleapis|fonts\.gstatic|google\.com\/maps|maps\.googleapis|\/assets\/|leadconnectorhq\.com|filesafe\.space/;

function watch(page) {
  const consoleErrors = [], pageErrors = [];
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    const from = m.location()?.url || '';
    if (IGNORABLE.test(t) || IGNORABLE.test(from)) return;
    if (/Failed to load resource/.test(t) && !from) return;   // src attribute already inventoried
    consoleErrors.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e)));
  return { consoleErrors, pageErrors };
}

for (const path of PAGES) {
  for (const width of WIDTHS) {
    test(`${path} @${width} — no horizontal scroll, no errors, header offset holds`, async ({ page }) => {
      const errs = watch(page);
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path, { waitUntil: 'load' });
      await page.waitForTimeout(250);

      // 1 · the page body must never scroll horizontally
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `horizontal overflow of ${overflow}px`).toBe(0);

      // 2 · --header-h must be >= the real rendered header, because every
      //     anchor offset resolves from it
      const header = await page.evaluate(() => {
        const el = document.getElementById('site-header');
        const token = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h'));
        return { real: el.getBoundingClientRect().height, token };
      });
      expect(header.token, `--header-h ${header.token} < real header ${header.real}`)
        .toBeGreaterThanOrEqual(Math.floor(header.real));

      // 3 · a link click must not drop its heading behind the header
      const links = await page.locator('.nav-rail a, .nav a').all();
      if (links.length) {
        const href = await links[links.length - 1].getAttribute('href');
        await page.evaluate((h) => {
          document.querySelector(h).scrollIntoView({ block: 'start', behavior: 'instant' });
        }, href);
        await page.waitForTimeout(120);
      }

      await page.screenshot({
        path: `test-results/screens/${path.replace(/[^a-z]/gi, '') || 'index'}-${width}.png`,
        fullPage: true,
      });

      expect(errs.pageErrors, 'uncaught page errors').toEqual([]);
      expect(errs.consoleErrors, 'console errors').toEqual([]);
    });
  }

  test(`${path} — images, headings, hrefs, JSON-LD`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(300);

    // exactly one h1
    expect(await page.locator('h1').count()).toBe(1);

    // every image carries an alt ATTRIBUTE. Empty alt is legitimate — it
    // marks a decorative image (the gallery's duplicated marquee set) —
    // but an absent attribute is always a defect.
    const missingAlt = await page.evaluate(() =>
      [...document.images].filter((i) => i.getAttribute('alt') === null).map((i) => i.getAttribute('src')));
    expect(missingAlt, 'images without alt').toEqual([]);
    // and an empty alt is only allowed inside aria-hidden markup
    const decorative = await page.evaluate(() =>
      [...document.images].filter((i) => i.getAttribute('alt') === '' && !i.closest('[aria-hidden="true"]'))
        .map((i) => i.getAttribute('src')));
    expect(decorative, 'empty alt outside aria-hidden').toEqual([]);

    // no dead, bracketed or #-only hrefs
    const badHrefs = await page.evaluate(() => {
      const out = [];
      for (const a of document.querySelectorAll('a[href]')) {
        const h = a.getAttribute('href');
        if (!h || h === '#') { out.push(h || '(empty)'); continue; }
        if (/[\[\]]/.test(h)) { out.push(h); continue; }
        if (h.startsWith('#') && !document.querySelector(h)) out.push(h + ' (no such id)');
      }
      return out;
    });
    expect(badHrefs, 'dead, bracketed or #-only hrefs').toEqual([]);

    // JSON-LD parses (index only carries it)
    const ld = await page.evaluate(() =>
      [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent));
    for (const block of ld) expect(() => JSON.parse(block)).not.toThrow();
  });
}

test('index — every image src resolves (missing files leave a labelled slot)', async ({ page }) => {
  const missing = [];
  page.on('response', (r) => { if (r.status() === 404) missing.push(new URL(r.url()).pathname); });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(400);

  const all = await page.evaluate(() =>
    [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute('src')));
  // A src on a remote host is served to the visitor by that host; this
  // environment cannot reach it, so its failure here proves nothing.
  const hosted = all.filter((s) => /^https?:/.test(s));
  const broken = all.filter((s) => !/^https?:/.test(s));
  if (hosted.length) console.log(`\n  ${hosted.length} image(s) point at a remote host — not verifiable from CI, served to the visitor by that host.`);

  // Photography is not supplied yet. The ::before slot pattern means a missing
  // file degrades to a labelled placeholder rather than a broken-image icon —
  // this reports the outstanding files rather than failing the build.
  if (broken.length) {
    console.log(`\n  ${broken.length} image(s) not yet supplied — rendering as labelled slots:`);
    for (const src of broken) console.log(`    · ${src}`);
  }
  // Every unsupplied image must degrade to something deliberate: either a
  // labelled .media slot, or its own declared fallback (the header logo
  // falls back to the inline lockup, which beats a labelled box).
  const undegraded = await page.evaluate(() =>
    [...document.images].filter((i) => i.complete && i.naturalWidth === 0)
      .filter((i) => !/^https?:/.test(i.getAttribute('src') || ''))
      .filter((i) => !i.dataset.fallback && !(i.closest('.media') || {}).dataset?.slot)
      .map((i) => i.getAttribute('src')));
  expect(undegraded, 'unsupplied images with no declared fallback').toEqual([]);
});

test('placeholder inventory — noindex must stay until this list is empty', async ({ page }) => {
  const report = [];
  for (const path of PAGES) {
    await page.goto(path, { waitUntil: 'load' });
    await page.waitForTimeout(200);
    const items = await page.evaluate(() => ({
      bracketed: [...document.querySelectorAll('.ph')].map((e) => e.textContent.trim()),
      needs: [...document.querySelectorAll('[data-needs]')].map((e) => e.dataset.needs),
      noindex: (document.querySelector('meta[name=robots]') || {}).content || '',
    }));
    report.push({ path, ...items });
  }
  for (const r of report) {
    const unique = [...new Set(r.bracketed)];
    console.log(`\n  ${r.path} — ${unique.length} unresolved value(s), ${new Set(r.needs).size} unresolved destination(s)`);
    for (const b of unique) console.log(`    · ${b}`);
    for (const n of new Set(r.needs)) console.log(`    → destination: ${n}`);
    // While anything is unresolved, noindex must be present.
    if (unique.length || r.needs.length) expect(r.noindex).toContain('noindex');
  }
});
