import { defineConfig, devices } from '@playwright/test'

// Browser tests for Google sign-in + Firestore persistence against the Firebase Emulator Suite.
// `npm run test:e2e:firebase` wraps this in `firebase emulators:exec --only auth,firestore`.
export default defineConfig({
  testDir: 'e2e-firebase',
  globalSetup: './e2e-firebase/global-setup.ts',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
  webServer: [
    {
      command: 'npm run dev:api',
      url: 'http://127.0.0.1:8788/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // A separate Vite instance in emulator mode, so it never collides with `npm run dev`.
      command: 'npx vite --port 5174 --strictPort',
      url: 'http://localhost:5174',
      reuseExistingServer: true,
      env: { VITE_USE_FIREBASE_EMULATORS: 'true' },
      timeout: 120_000,
    },
  ],
})
