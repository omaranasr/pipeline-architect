import { chromium, type FullConfig } from '@playwright/test'

// Vite transforms modules on first request. A cold first page load is slow enough to break the
// Auth emulator's popup hand-off in the first test, so warm the dev server (app + lazily loaded
// Firebase client) once before any test runs.
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL ?? 'http://localhost:5174'
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${baseURL}/#/experiments`)
  await page.getByRole('button', { name: 'Sign in with Google' }).waitFor({ timeout: 60_000 })
  // Open and close one popup so the emulator's handler page and auth iframe are warm too.
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Sign in with Google' }).click()])
  await popup.waitForLoadState('load')
  await popup.close()
  await browser.close()
}
