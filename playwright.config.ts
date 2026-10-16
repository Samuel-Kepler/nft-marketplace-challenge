import { defineConfig, devices } from '@playwright/test';

// `webServer` só existe no nível raiz (dentro de `projects` o Playwright o ignora). Para que
// `test:unit` não suba servidor algum, cada servidor só entra quando um projeto que o usa é pedido.
const selected = process.argv.filter((a) => a.startsWith('--project=')).map((a) => a.slice('--project='.length));
const needs = (...names: string[]) => selected.length === 0 || selected.some((p) => names.includes(p));

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],
  use: {
    trace: 'retain-on-failure',
  },

  projects: [
    {
      // Node puro: schemas, utilitários, MockDb e handlers MSW (msw/node).
      name: 'unit',
      testMatch: 'tests/unit/**/*.spec.ts',
    },
    {
      // Chromium real + MSW no navegador + socket.io-client, servido pelo Vite (modo mocks).
      name: 'integration',
      testMatch: 'tests/integration/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${DEV_PORT}`,
        serviceWorkers: 'allow',
      },
    },
    {
      name: 'desktop',
      testMatch: 'tests/e2e/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: 'mobile',
      testMatch: 'tests/e2e/**/*.spec.ts',
      use: {
        ...devices['Pixel 5'],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: 'tablet',
      testMatch: 'tests/e2e/**/*.spec.ts',
      use: {
        ...devices['iPad Pro'],
        baseURL: `http://localhost:${PREVIEW_PORT}`,
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: 'visual',
      testMatch: 'tests/visual/**/*.spec.ts',
      use: { baseURL: `http://localhost:${PREVIEW_PORT}` },
      expect: {
        toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
      },
    },
  ],

  webServer: [
    ...(needs('integration')
      ? [
          {
            command: `npm run dev -- --port ${DEV_PORT} --strictPort`,
            url: `http://localhost:${DEV_PORT}/`,
            reuseExistingServer: !process.env.CI,
            timeout: 60_000,
          },
        ]
      : []),
    ...(needs('desktop', 'mobile', 'tablet', 'visual')
      ? [
          {
            command: `npm run build && npm run preview -- --port ${PREVIEW_PORT} --strictPort`,
            url: `http://localhost:${PREVIEW_PORT}/`,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
          },
        ]
      : []),
  ],

  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
});
