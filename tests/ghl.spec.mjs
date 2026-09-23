import { test, expect } from './fixtures.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

/* The GHL build is a fragment pasted inside a page that already has its own
   styles. These assert the two things that would break silently: the funnel
   leaking styles onto the host, and the host breaking the funnel. */
const HOST = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;font-family:Georgia,serif;background:#fff;color:#333}
.hl-footer{padding:24px;background:#eee;color:#333}</style></head><body>
<div class="hl-header">host chrome</div>
FRAGMENT
<div class="hl-footer">host chrome</div></body></html>`;

test.beforeAll(async () => {
  await run('node', ['build-ghl.mjs']);
  await run('python3', ['embed-images.py', 'ghl.html', 'ghl-embedded.html']);
  // the host page carries the EMBEDDED fragment — that is what gets pasted
  const frag = await readFile('ghl-embedded.html', 'utf8');
  await writeFile('test-results/ghl-host.html', HOST.replace('FRAGMENT', frag));
});

test('the fragment carries no document wrapper, and every local path survives the embed', async () => {
  const raw = await readFile('ghl.html', 'utf8');
  // The header comment names those tags in prose; a comment is not markup.
  const frag = raw.replace(/<!--[\s\S]*?-->/g, '');
  expect(frag).not.toMatch(/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i);
  // a local path in the intermediate fragment must be backed by a real file,
  // because embed-images.py can only inline what exists
  const { existsSync } = await import('node:fs');
  const local = [...new Set(
    [...raw.matchAll(/(?:src|poster)="(assets\/[^"]+)"|url\((assets\/[^)]+)\)/g)].map((m) => m[1] || m[2]),
  )];
  for (const p of local) expect(existsSync(p), `${p} referenced but not on disk`).toBe(true);
  // and the embedded deliverable must reference nothing local at all
  const embedded = await readFile('ghl-embedded.html', 'utf8');
  expect(embedded).not.toMatch(/(?:src|poster)="assets\//);
  expect(embedded).not.toMatch(/url\(assets\//);
  // nav must not point at a section the build dropped
  for (const href of [...raw.matchAll(/href="#([a-z-]+)"/g)].map((m) => m[1])) {
    expect(raw, `nav points at #${href}, which is not in the fragment`).toContain(`id="${href}"`);
  }
});

for (const width of [375, 768, 1280]) {
  test(`@${width} — the fragment and its host page do not fight`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/test-results/ghl-host.html', { waitUntil: 'load' });
    await page.waitForTimeout(400);

    const r = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sticky: getComputedStyle(document.getElementById('site-header')).position,
      hostFont: getComputedStyle(document.querySelector('.hl-footer')).fontFamily,
      hostBg: getComputedStyle(document.querySelector('.hl-footer')).backgroundColor,
    }));

    expect(r.overflow, 'horizontal overflow inside the host page').toBe(0);
    // overflow-x on the wrapper would silently kill this
    expect(r.sticky, 'the header stopped being sticky once wrapped').toBe('sticky');
    // the funnel must not restyle the rest of the GHL page
    expect(r.hostFont, 'the funnel leaked its font onto the host page').toContain('Georgia');
    expect(r.hostBg, 'the funnel leaked its background onto the host page').toBe('rgb(238, 238, 238)');
  });
}

test('the form still works inside the host page', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/test-results/ghl-host.html', { waitUntil: 'load' });
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#meter-count')).toHaveText('Step 2 of 3');
});
