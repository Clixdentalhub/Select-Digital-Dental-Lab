import { test, expect } from './fixtures.mjs';

/* Every fbq() call made so far, as [method, ...args] — the stubbed fbevents.js
   never drains the queue, so it is a complete log. */
const fbqCalls = (page) => page.evaluate(() =>
  (window.fbq && window.fbq.queue ? [...window.fbq.queue].map((a) => [...a]) : []));
const fbRequests = (page) => (page.__fb || []).length;

test('nothing from Meta loads until the visitor accepts', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await expect(page.locator('#cookie-banner')).toBeVisible();
  await page.waitForTimeout(400);
  expect(fbRequests(page), 'pixel requested before consent').toBe(0);
  expect(await page.evaluate(() => typeof window.fbq)).toBe('undefined');
  expect(await page.evaluate(() => document.cookie)).not.toContain('_fbp');
});

test('Reject loads nothing and is remembered', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#cookie-banner .cookie-reject').click();
  await expect(page.locator('#cookie-banner')).toBeHidden();
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(300);
  await expect(page.locator('#cookie-banner')).toBeHidden();
  expect(fbRequests(page)).toBe(0);
  expect(await page.evaluate(() => typeof window.fbq)).toBe('undefined');
});

test('Accept loads the pixel: PageView on the landing page, never Lead', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#cookie-banner .cookie-accept').click();
  await expect(page.locator('#cookie-banner')).toBeHidden();
  await expect.poll(() => fbRequests(page)).toBeGreaterThan(0);
  const calls = await fbqCalls(page);
  expect(calls).toContainEqual(['init', '28063400443329444']);
  expect(calls).toContainEqual(['track', 'PageView']);
  expect(calls.some((c) => c[1] === 'Lead')).toBe(false);
  // remembered: the next load fires PageView with no banner
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#cookie-banner')).toBeHidden();
  expect(await fbqCalls(page)).toContainEqual(['track', 'PageView']);
});

test('Cookie settings in the footer reopens the banner', async ({ page }) => {
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.locator('#cookie-banner .cookie-reject').click();
  await page.locator('[data-cookie-settings]').click();
  await expect(page.locator('#cookie-banner')).toBeVisible();
});

test('a real submission fires Lead once on the thank-you page, with the eventID sent to GHL', async ({ page }) => {
  await page.goto('/index.html?utm_source=facebook', { waitUntil: 'load' });
  await page.locator('#cookie-banner .cookie-accept').click();
  await page.locator('[data-open-form]').first().click();
  await page.locator('.step[data-step="1"] .opt').first().click();
  for (const [n, v] of [['firstName', 'Jane'], ['lastName', 'Doe'], ['practiceName', 'Doe Dental'], ['phone', '07700 900123'], ['email', 'jane@example.com']]) await page.fill(`input[name=${n}]`, v);
  const sent = page.waitForRequest(/leadconnectorhq\.com/);
  await page.locator('.step[data-step="2"] button[type=submit]').click();
  const eventId = new URLSearchParams((await sent).postData()).get('event_id');
  expect(eventId).toMatch(/^lead-\d+-\w+$/);

  await page.waitForURL(/thank-you\.html\?name=Jane/, { timeout: 20000 });
  await page.waitForLoadState('load');
  await expect(page.locator('#cookie-banner')).toBeHidden();       // choice carried over
  const calls = await fbqCalls(page);
  expect(calls).toContainEqual(['track', 'PageView']);
  const leads = calls.filter((c) => c[1] === 'Lead');
  expect(leads).toHaveLength(1);
  expect(leads[0][3]).toEqual({ eventID: eventId });

  // a refresh does not count the lead again
  await page.reload({ waitUntil: 'load' });
  expect((await fbqCalls(page)).filter((c) => c[1] === 'Lead')).toHaveLength(0);
});

test('a direct visit to the thank-you page fires no Lead, and no pixel without consent', async ({ page }) => {
  await page.goto('/thank-you.html?name=Jane', { waitUntil: 'load' });
  await expect(page.locator('#cookie-banner')).toBeVisible();
  expect(fbRequests(page)).toBe(0);
  await page.locator('#cookie-banner .cookie-accept').click();
  await expect.poll(() => fbRequests(page)).toBeGreaterThan(0);
  const calls = await fbqCalls(page);
  expect(calls).toContainEqual(['track', 'PageView']);
  expect(calls.some((c) => c[1] === 'Lead')).toBe(false);
});
