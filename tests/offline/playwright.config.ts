import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.pw.ts',
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:4174',
    launchOptions: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH']
      ? { executablePath: process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] }
      : {},
  },
  webServer: {
    cwd: fileURLToPath(new URL('../..', import.meta.url)),
    command: 'bun tests/offline/server.ts',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: false,
  },
});
