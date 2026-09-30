import { test, expect } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(250);
  await page.locator('[data-open-form]').first().click();
  await expect(page.locator('#lead-modal')).toBeVisible();
});

test('pointer selection advances the step', async ({ page }) => {
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#meter-count')).toHaveText('Step 2 of 2');
});

test('arrow keys do NOT advance — they move within the group', async ({ page }) => {
  const first = page.locator('.step[data-step="1"] input[type=radio]').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(600);
  // still on step 1, with the third option selected
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();
  await expect(page.locator('#meter-count')).toHaveText('Step 1 of 2');
  const checkedIndex = await page.evaluate(() =>
    [...document.querySelectorAll('.step[data-step="1"] input[type=radio]')].findIndex((r) => r.checked));
  expect(checkedIndex).toBe(2);
});

test('validation blocks an empty step and errors clear on input', async ({ page }) => {
  await page.locator('.step[data-step="1"] [data-next]').click();
  await expect(page.locator('#err-role')).not.toBeEmpty();
  await expect(page.locator('.step[data-step="1"] fieldset')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();

  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('#err-role')).toBeEmpty();
});

test('the details step validates each field and wires aria-invalid to aria-describedby', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();

  await page.locator('.step[data-step="2"] button[type=submit]').click();
  for (const name of ['firstName', 'lastName', 'practiceName', 'phone', 'email']) {
    await expect(page.locator(`#err-${name}`)).not.toBeEmpty();
    const input = page.locator(`input[name="${name}"]`);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', `err-${name}`);
  }

  await page.fill('input[name=email]', 'not-an-email');
  await page.locator('.step[data-step="2"] button[type=submit]').click();
  await expect(page.locator('#err-email')).toContainText('valid email');
});

test('back navigation preserves the answer', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').nth(1).click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();
  await expect(page.locator('#meter-count')).toHaveText('Step 2 of 2');
  await page.locator('.step[data-step="2"] [data-back]').click();
  await expect(page.locator('.step[data-step="1"] input[type=radio]').nth(1)).toBeChecked();
});

test('Enter advances a step rather than submitting early', async ({ page }) => {
  await page.locator('.step[data-step="1"] input[type=radio]').first().check();
  await page.locator('.step[data-step="1"] input[type=radio]').first().press('Enter');
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();
  await expect(page.locator('#form-done')).toBeHidden();
});

test('a completed form reaches the success state and forwards with a name', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();

  await page.fill('input[name=firstName]', 'Jane');
  await page.fill('input[name=lastName]', 'Doe');
  await page.fill('input[name=practiceName]', 'Doe Dental');
  await page.fill('input[name=phone]', '07700 900123');
  await page.fill('input[name=email]', 'jane@example.com');
  await page.locator('.step[data-step="2"] button[type=submit]').click();

  await expect(page.locator('#form-done')).toBeVisible();
  await page.waitForURL(/thank-you\.html\?name=Jane/, { timeout: 20000, waitUntil: 'commit' });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#greet-name')).toHaveText(', Jane');
});

test('the honeypot suppresses the forward without changing what a bot sees', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').first().click();
  await page.fill('input[name=firstName]', 'Bot');
  await page.fill('input[name=lastName]', 'Net');
  await page.fill('input[name=practiceName]', 'Net Dental');
  await page.fill('input[name=phone]', '07700 900123');
  await page.fill('input[name=email]', 'bot@example.com');
  await page.evaluate(() => { document.querySelector('input[name=company]').value = 'spam'; });
  await page.locator('.step[data-step="2"] button[type=submit]').click();

  await expect(page.locator('#form-done')).toBeVisible();
  await page.waitForTimeout(2200);
  expect(page.url()).toContain('index.html');
});

test('a hostile name in the query string is never printed', async ({ page }) => {
  const hostile = '<img src=x onerror=alert(1)>';
  await page.goto('/thank-you.html?name=' + encodeURIComponent(hostile), { waitUntil: 'load' });
  await expect(page.locator('#greet-name')).toBeEmpty();
  expect(await page.content()).not.toContain('onerror=alert');
});


test('the lead reaches the webhook with answers, UTMs and Meta click IDs', async ({ page }) => {
  await page.goto('/index.html?utm_source=facebook&utm_medium=paid&utm_campaign=c1-no-offer&utm_content=hook-2&utm_term=dentists&fbclid=ABC123', { waitUntil: 'load' });
  await page.locator('[data-open-form]').first().click();
  await expect(page.locator('#lead-modal')).toBeVisible();
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();
  await page.fill('input[name=firstName]', 'Jane');
  await page.fill('input[name=lastName]', 'Doe');
  await page.fill('input[name=practiceName]', 'Doe Dental');
  await page.fill('input[name=phone]', '07700 900123');
  await page.fill('input[name=email]', 'jane@example.com');
  const sent = page.waitForRequest(/leadconnectorhq\.com/);
  await page.locator('.step[data-step="2"] button[type=submit]').click();
  const req = await sent;
  const body = new URLSearchParams(req.postData());
  expect(req.method()).toBe('POST');
  expect(body.get('first_name')).toBe('Jane');
  expect(body.get('last_name')).toBe('Doe');
  expect(body.get('email')).toBe('jane@example.com');
  expect(body.get('phone')).toBe('07700 900123');
  expect(body.get('practice_name')).toBe('Doe Dental');
  expect(body.get('role')).toBe('Practice owner / principal dentist');
  expect(body.has('practice_type')).toBe(false);
  expect(body.has('lab_frustration')).toBe(false);
  expect(body.get('utm_source')).toBe('facebook');
  expect(body.get('utm_medium')).toBe('paid');
  expect(body.get('utm_campaign')).toBe('c1-no-offer');
  expect(body.get('utm_content')).toBe('hook-2');
  expect(body.get('utm_term')).toBe('dentists');
  expect(body.get('fbclid')).toBe('ABC123');
  expect(body.get('fbc')).toMatch(/^fb\.1\.\d{13}\.ABC123$/);
  expect(body.get('landing_page')).toContain('utm_campaign=c1-no-offer');
  expect(body.get('submitted_at')).toMatch(/^\d{4}-\d\d-\d\dT/);
  await page.waitForURL(/thank-you\.html\?name=Jane/, { timeout: 20000, waitUntil: 'commit' });
});

test('UTMs survive a click-around before the form is sent', async ({ page }) => {
  await page.goto('/index.html?utm_source=facebook&utm_campaign=c1&fbclid=XYZ', { waitUntil: 'load' });
  await page.goto('/index.html#faq', { waitUntil: 'load' });   // same session, no query string
  await page.reload({ waitUntil: 'load' });
  await page.locator('[data-open-form]').first().click();
  await expect(page.locator('#lead-modal')).toBeVisible();
  await page.locator('.step[data-step="1"] .opt').first().click();
  for (const [n, v] of [['firstName','A'],['lastName','B'],['practiceName','C'],['phone','07700 900123'],['email','a@b.co']]) await page.fill(`input[name=${n}]`, v);
  const sent = page.waitForRequest(/leadconnectorhq\.com/);
  await page.locator('.step[data-step="2"] button[type=submit]').click();
  const body = new URLSearchParams((await sent).postData());
  expect(body.get('utm_source')).toBe('facebook');
  expect(body.get('utm_campaign')).toBe('c1');
  expect(body.get('fbclid')).toBe('XYZ');
});

test('every CTA opens the popup, and Escape, the close button and the backdrop close it', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#lead-modal')).toBeHidden();
  const ctas = page.locator('a[href="#qualifier-card"]');
  const n = await ctas.count();
  expect(n).toBeGreaterThan(4);
  await page.locator('.header-cta').click();
  await expect(page.locator('#lead-modal')).toBeVisible();
  await page.locator('[data-close-form]').click();
  await expect(page.locator('#lead-modal')).toBeHidden();
  await page.locator('#how a[href="#qualifier-card"]').click();
  await expect(page.locator('#lead-modal')).toBeVisible();
  await page.mouse.click(8, 8);                                  // the backdrop
  await expect(page.locator('#lead-modal')).toBeHidden();
});

test('the VSL poster shows a play button and swaps to a player once a source is set', async ({ page }) => {
  await page.keyboard.press('Escape');
  await expect(page.locator('#vsl .vsl-play')).toBeVisible();
  await expect(page.locator('#vsl .vsl-soon')).toBeVisible();
  // no source yet: clicking does nothing
  await page.locator('#vsl .vsl-play').click();
  await expect(page.locator('#vsl iframe, #vsl video')).toHaveCount(0);
  // with a YouTube link it becomes an autoplaying embed
  await page.route(/youtube\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>yt</title>' }));
  await page.evaluate(() => document.getElementById('vsl').setAttribute('data-src', 'https://youtu.be/dQw4w9WgXcQ'));
  await page.locator('#vsl .vsl-play').click();
  await expect(page.locator('#vsl iframe')).toHaveAttribute('src', /youtube\.com\/embed\/dQw4w9WgXcQ\?autoplay=1/);
  await expect(page.locator('#vsl .vsl-poster')).toBeHidden();
});
