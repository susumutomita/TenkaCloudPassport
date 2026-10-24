import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.pw.ts',
  fullyParallel: true,
  workers: 2,
  use: {
    deviceScaleFactor: 2,
    baseURL: 'http://127.0.0.1:4173',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']
      ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] }
      : {},
  },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'node tests/responsive/server.mjs',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env['CI'],
  },
});
