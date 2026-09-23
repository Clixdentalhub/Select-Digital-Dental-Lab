import { test, expect } from './fixtures.mjs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForTimeout(250);
});

test('pointer selection advances the step', async ({ page }) => {
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible({ timeout: 2000 });
  await expect(page.locator('#meter-count')).toHaveText('Step 2 of 3');
});

test('arrow keys do NOT advance — they move within the group', async ({ page }) => {
  const first = page.locator('.step[data-step="1"] input[type=radio]').first();
  await first.focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(600);
  // still on step 1, with the third option selected
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();
  await expect(page.locator('#meter-count')).toHaveText('Step 1 of 3');
  const checkedIndex = await page.evaluate(() =>
    [...document.querySelectorAll('.step[data-step="1"] input[type=radio]')].findIndex((r) => r.checked));
  expect(checkedIndex).toBe(2);
});

test('validation blocks an empty step and errors clear on input', async ({ page }) => {
  await page.locator('.step[data-step="1"] [data-next]').click();
  await expect(page.locator('#err-practiceType')).not.toBeEmpty();
  await expect(page.locator('.step[data-step="1"] fieldset')).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('.step[data-step="1"]')).toBeVisible();

  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('#err-practiceType')).toBeEmpty();
});

test('step 3 validates each field and wires aria-invalid to aria-describedby', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').first().click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();
  await page.locator('.step[data-step="2"] .opt').first().click();
  await expect(page.locator('.step[data-step="3"]')).toBeVisible();

  await page.locator('.step[data-step="3"] button[type=submit]').click();
  for (const name of ['firstName', 'lastName', 'practiceName', 'phone', 'email']) {
    await expect(page.locator(`#err-${name}`)).not.toBeEmpty();
    const input = page.locator(`input[name="${name}"]`);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAttribute('aria-describedby', `err-${name}`);
  }

  await page.fill('input[name=email]', 'not-an-email');
  await page.locator('.step[data-step="3"] button[type=submit]').click();
  await expect(page.locator('#err-email')).toContainText('valid email');
});

test('back navigation preserves answers', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').nth(1).click();
  await expect(page.locator('.step[data-step="2"]')).toBeVisible();
  await page.locator('.step[data-step="2"] .opt').nth(2).click();
  await expect(page.locator('.step[data-step="3"]')).toBeVisible();

  await page.locator('.step[data-step="3"] [data-back]').click();
  await expect(page.locator('.step[data-step="2"] input[type=radio]').nth(2)).toBeChecked();
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
  await page.locator('.step[data-step="2"] .opt').first().click();
  await expect(page.locator('.step[data-step="3"]')).toBeVisible();

  await page.fill('input[name=firstName]', 'Jane');
  await page.fill('input[name=lastName]', 'Doe');
  await page.fill('input[name=practiceName]', 'Doe Dental');
  await page.fill('input[name=phone]', '07700 900123');
  await page.fill('input[name=email]', 'jane@example.com');
  await page.locator('.step[data-step="3"] button[type=submit]').click();

  await expect(page.locator('#form-done')).toBeVisible();
  await page.waitForURL(/thank-you\.html\?name=Jane/, { timeout: 20000, waitUntil: 'commit' });
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#greet-name')).toHaveText(', Jane');
});

test('the honeypot suppresses the forward without changing what a bot sees', async ({ page }) => {
  await page.locator('.step[data-step="1"] .opt').first().click();
  await page.locator('.step[data-step="2"] .opt').first().click();
  await page.fill('input[name=firstName]', 'Bot');
  await page.fill('input[name=lastName]', 'Net');
  await page.fill('input[name=practiceName]', 'Net Dental');
  await page.fill('input[name=phone]', '07700 900123');
  await page.fill('input[name=email]', 'bot@example.com');
  await page.evaluate(() => { document.querySelector('input[name=company]').value = 'spam'; });
  await page.locator('.step[data-step="3"] button[type=submit]').click();

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

