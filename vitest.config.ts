import { defineConfig } from 'vitest/config'

// Unit, simulation and API tests. Firestore rules tests (tests/rules) need the
// Firebase emulator and run via `npm run test:rules`; Playwright specs live in e2e/.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/rules/**', 'node_modules/**'],
    environment: 'node',
  },
})
