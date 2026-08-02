import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.e2e.ts',
  timeout: 45_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: [
    {
      command: 'npm start --prefix ../../server',
      url: 'http://127.0.0.1:8787/health',
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npm run dev',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
});
