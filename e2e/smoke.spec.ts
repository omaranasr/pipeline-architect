import { expect, test } from '@playwright/test'

test('landing page runs a live server simulation', async ({ page }) => {
  const api = page.waitForResponse((r) => r.url().endsWith('/api/simulate') && r.status() === 200)
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('five-stage pipeline')
  await api
  await expect(page.getByRole('img', { name: /Five-stage datapath at cycle/ })).toBeVisible()
  await expect(page.getByText(/cycle \d+\/9/)).toBeVisible()
})

test('every main view renders without API errors', async ({ page }) => {
  for (const [hash, heading] of [
    ['datapath', 'Datapath Explorer'],
    ['timeline', 'Cycle Timeline'],
    ['hazards', 'Hazard & Forwarding Analysis'],
    ['performance', 'Performance Lab'],
    ['experiments', 'My Experiments'],
    ['architecture', 'Architecture & Assumptions'],
  ] as const) {
    await page.goto(`/#/${hash}`)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  await expect(page.getByRole('alert')).toHaveCount(0)
})
