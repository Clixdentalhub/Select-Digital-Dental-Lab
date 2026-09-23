import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  timeout: 45_000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    launchOptions: { executablePath: '/opt/pw-browsers/chromium' },
  },
  webServer: {
    command: 'node tests/serve.mjs',
    url: 'http://127.0.0.1:4321/index.html',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
