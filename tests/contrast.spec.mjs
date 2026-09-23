import { test, expect } from './fixtures.mjs';
import { PAGES, ratio, parseRGB } from './helpers.mjs';

/* Contrast is computed from relative luminance for every text/background
   pair actually rendered on a dark band — not asserted against the token
   list, which would only prove the tokens agree with themselves. */
for (const path of PAGES) {
  test(`${path} — contrast on dark bands`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });   // the mobile bar only exists here
    await page.goto(path, { waitUntil: 'load' });
    await page.evaluate(() => window.scrollTo(0, 800));         // reveal the sticky bar
    await page.waitForTimeout(400);

    const pairs = await page.evaluate(() => {
      const out = [];
      /* Every dark surface, not just the section bands. The sticky mobile
         bar was missing from this list and hid an invisible CTA. */
      const roots = document.querySelectorAll(
        '.dark, .deep, .site-header, .nav-rail, .site-footer, .form-card, .hero, .mobile-bar');

      function effectiveBg(el) {
        let node = el;
        while (node && node !== document.documentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          const m = bg.match(/rgba?\(([^)]+)\)/);
          if (m) {
            const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
            const a = p.length > 3 ? p[3] : 1;
            if (a >= 0.85) return bg;      // opaque enough to be the ground
          }
          node = node.parentElement;
        }
        return getComputedStyle(document.body).backgroundColor;
      }

      for (const root of roots) {
        for (const el of root.querySelectorAll('*')) {
          // only elements holding their own visible text
          const own = [...el.childNodes]
            .filter((n) => n.nodeType === 3 && n.textContent.trim())
            .map((n) => n.textContent.trim()).join(' ');
          if (!own) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          // an element parked off-screen by a transform is still shown later
          if (el.closest('.sr-only')) continue;

          const size = parseFloat(cs.fontSize);
          const weight = Number(cs.fontWeight) || 400;
          const large = size >= 24 || (size >= 18.66 && weight >= 700);
          out.push({
            text: own.slice(0, 48),
            selector: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
              ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
            color: cs.color,
            bg: effectiveBg(el),
            large,
          });
        }
      }
      return out;
    });

    expect(pairs.length, 'found no text on any dark band — the selector is wrong').toBeGreaterThan(20);

    const failures = [];
    for (const p of pairs) {
      const fg = parseRGB(p.color), bg = parseRGB(p.bg);
      if (!fg || !bg) continue;
      const need = p.large ? 3 : 4.5;
      const r = ratio(fg.rgb, bg.rgb);
      if (r < need) {
        failures.push(`${r.toFixed(2)}:1 (need ${need}) — ${p.selector} — "${p.text}" ${p.color} on ${p.bg}`);
      }
    }
    expect(failures, `${failures.length} contrast failure(s)`).toEqual([]);
    console.log(`\n  ${path}: ${pairs.length} text/background pairs measured on dark bands, all pass.`);
  });
}

/* A background video sits behind text, and the normal contrast pass measures
   against the band's own colour - which is only honest if the scrim over the
   footage actually delivers that colour. Nobody here has seen the video, so
   this checks the worst case the footage could present: a full white frame. */
test('/index.html — the video scrim holds contrast against white footage', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(300);

  const data = await page.evaluate(() => {
    const band = document.querySelector('.bg-video');
    if (!band) return null;
    // The gradient carries the stops; backgroundColor on ::after computes to
    // rgba(0,0,0,0) and would otherwise be read as a zero-alpha stop.
    const after = getComputedStyle(band, '::after');
    const scrim = after.backgroundImage !== 'none' ? after.backgroundImage : after.backgroundColor;
    const section = band.closest('section');
    const texts = [];
    for (const el of section.querySelectorAll('*')) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
      if (!own.length || el.closest('.sr-only') || el.closest('[aria-hidden="true"]')) continue;
      // Text on its own opaque surface (the form card, a button, a chip)
      // does not sit on the scrim — its contrast is measured against that
      // surface by the normal pass, not against the footage here.
      let onOwnSurface = false;
      for (let a = el; a && a !== section; a = a.parentElement) {
        const acs = getComputedStyle(a);
        const alpha = (acs.backgroundColor.match(/rgba?\([^)]*?([\d.]+)\)$/) || [])[1];
        if ((acs.backgroundColor.startsWith('rgb(') || Number(alpha) >= 0.9) ||
            acs.backgroundImage !== 'none') { onOwnSurface = true; break; }
      }
      if (onOwnSurface) continue;
      const cs = getComputedStyle(el);
      const size = parseFloat(cs.fontSize), weight = Number(cs.fontWeight) || 400;
      texts.push({ color: cs.color, large: size >= 24 || (size >= 18.66 && weight >= 700),
                   text: own.map((n) => n.textContent.trim()).join(' ').slice(0, 40) });
    }
    return { scrim, texts };
  });

  // The band only exists while a background video is wired in; when the source
  // is not supplied the section is a flat colour and the normal contrast pass
  // already covers it.
  test.skip(data === null, 'no background-video band in this build');

  // every rgba() alpha declared on the scrim; the weakest one governs
  const alphas = [...data.scrim.matchAll(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/g)]
    .map((m) => Number(m[1]));
  expect(alphas.length, 'scrim declares no rgba stops').toBeGreaterThan(0);
  const a = Math.min(...alphas);
  const scrimRGB = (data.scrim.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/) || []).slice(1).map(Number);
  const composite = scrimRGB.map((c) => a * c + (1 - a) * 255);   // worst case: white frame

  const failures = [];
  for (const t of data.texts) {
    const fg = parseRGB(t.color);
    if (!fg) continue;
    const need = t.large ? 3 : 4.5;
    const r = ratio(fg.rgb, composite);
    if (r < need) failures.push(`${r.toFixed(2)}:1 (need ${need}) — "${t.text}" ${t.color}`);
  }
  expect(failures, `weakest scrim alpha ${a} is too thin for ${failures.length} text colour(s)`).toEqual([]);
  console.log(`\n  scrim floor ${a} over a white frame → rgb(${composite.map(Math.round).join(',')}); ${data.texts.length} text colour(s) hold.`);
});
