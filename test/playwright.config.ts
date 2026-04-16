import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
    screenshot: 'only-on-failure',
    launchOptions: {
      args: ['--disable-gpu', '--no-sandbox'],
    },
  },
  // No webServer config — tests expect gateway + webapp to be running
  // Start them manually or via: scripts/ctl.sh startup all
})
