import { defineConfig, devices } from '@playwright/test'

// End-to-end smoke tests against the production build. Run: `npm run build && npm run e2e`.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4174',
    ...devices['iPhone 13'],
    browserName: 'chromium',
    serviceWorkers: 'block', // the app's service worker would bypass the API mocks
    trace: 'retain-on-failure',
  },
  webServer: { command: 'node e2e/serve.mjs', url: 'http://localhost:4174', reuseExistingServer: !process.env.CI },
})
