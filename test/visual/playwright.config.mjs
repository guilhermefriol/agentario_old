import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.spec\.mjs/,
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.003, animations: 'disabled' } },
  use: { browserName: 'chromium', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4749' },
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4749/', reuseExistingServer: false, cwd: '.' },
});
