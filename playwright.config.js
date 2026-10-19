import { defineConfig, devices } from '@playwright/test';

const PORT = 8735;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Software GL keeps the WebGL globe deterministic and off the developer's GPU.
const SOFTWARE_GL = [
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist',
];
const launchOptions = { args: SOFTWARE_GL };

// The site defaults to the browser language, so every test starts from Brazilian Portuguese unless it says otherwise.
const environment = {
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  permissions: ['clipboard-read', 'clipboard-write'],
};

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.test.js',
  outputDir: 'reports/playwright/artifacts',
  reporter: process.env.CI
    ? [['github'], ['html', { outputFolder: 'reports/playwright/html', open: 'never' }]]
    : [['list'], ['html', { outputFolder: 'reports/playwright/html', open: 'never' }]],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
  timeout: process.env.CI ? 90_000 : 60_000, // a shared runner draws the WebGL page slowly
  expect: { timeout: 10_000 },
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], ...environment, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], ...environment, launchOptions } },
  ],
  webServer: {
    command: `node tools/serve.mjs --port ${PORT} --root ${process.env.SITE_ROOT ?? 'source'}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 15_000,
  },
});
