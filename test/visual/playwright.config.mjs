import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  snapshotPathTemplate: '{testDir}/__screenshots__/{arg}{ext}',
  timeout: 120_000,
  workers: 1,
  reporter: 'list',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.003, animations: 'disabled' } },
  use: { browserName: 'chromium', viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1, baseURL: 'http://127.0.0.1:4749' },
  projects: [
    { name: '2d', testMatch: /visual\.spec\.mjs/ },
    // WebGL por software (SwiftShader) pedido explicitamente: mesma imagem em qualquer máquina
    { name: '3d', testMatch: /visual3d\.spec\.mjs/, use: { launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } } },
  ],
  webServer: { command: 'node serve.mjs', url: 'http://127.0.0.1:4749/', reuseExistingServer: false, cwd: '.' },
});
