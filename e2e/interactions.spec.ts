import { expect, test, type Page } from '@playwright/test'

async function openLab(page: Page, view = 'datapath') {
  await page.addInitScript(() => localStorage.removeItem('pipeline-architect:lab-config'))
  await page.goto(`/#/${view}`)
  await expect(page.getByText(/cycle\s*1\s*\/\s*9/)).toBeVisible()
}

test('disabling forwarding adds stalls; stepping and the slider move through cycles', async ({ page }) => {
  await openLab(page)
  await page.getByRole('switch', { name: /Forwarding/ }).click()
  await expect(page.getByText(/cycle\s*1\s*\/\s*17/)).toBeVisible()

  await page.getByRole('button', { name: 'Step' }).click()
  await page.getByRole('button', { name: 'Step' }).click()
  await expect(page.getByText(/cycle\s*3\s*\/\s*17/)).toBeVisible()
  // cycle 3: SUB is held in ID by a RAW hazard
  await expect(page.getByText(/RAW hazard without forwarding: I2/).first()).toBeVisible()
  await expect(page.getByText('IF/ID · HOLD')).toBeVisible()

  await page.getByRole('button', { name: 'Previous cycle' }).click()
  await expect(page.getByText(/cycle\s*2\s*\/\s*17/)).toBeVisible()

  await page.getByRole('slider', { name: 'Cycle navigation' }).fill('16')
  await expect(page.getByText(/cycle\s*17\s*\/\s*17/)).toBeVisible()
  await expect(page.getByText('I5 retires.')).toBeVisible()
})

test('clicking a timeline column inspects that cycle', async ({ page }) => {
  await openLab(page, 'timeline')
  await page.getByRole('columnheader', { name: '4', exact: true }).click()
  await expect(page.getByText('Cycle 4 inspector')).toBeVisible()
  await expect(page.getByText(/Forwarding \(EX\/MEM→EX\): I2 takes R1 = 20/).first()).toBeVisible()
})

test('custom program: client validation, then a server 422 is shown without fallback', async ({ page }) => {
  await openLab(page)
  await page.getByRole('button', { name: /Custom/ }).click()
  const editor = page.getByRole('textbox', { name: 'Assembly program' })
  await editor.fill('ADD R1, R2, R3\nMUL R4, R5, R6')
  await expect(page.getByText(/line 2: unknown instruction "MUL"/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Simulate this program' })).toBeDisabled()

  await editor.fill('LW R1, 2(R0)')
  await page.getByRole('button', { name: 'Simulate this program' }).click()
  await expect(page.getByRole('alert')).toContainText('API error 422')
  await expect(page.getByRole('alert')).toContainText('not word-aligned')
})

test('backend outage shows an error instead of a client-side result', async ({ page }) => {
  await page.route('**/api/simulate', (route) => route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"service unavailable","details":[]}' }))
  await page.goto('/#/datapath')
  await expect(page.getByRole('alert')).toContainText('API error 503')
  await expect(page.getByRole('img', { name: /Five-stage datapath/ })).toHaveCount(0)
})

test('guided presentation: prediction is checked against the server result', async ({ page }) => {
  await openLab(page, 'home')
  await page.getByRole('button', { name: /Present/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Guided presentation' })
  await dlg.getByRole('tab').nth(1).click()
  await expect(dlg.getByRole('heading', { name: 'Ideal five-stage execution' })).toBeVisible()
  await dlg.getByRole('button', { name: '9', exact: true }).click()
  await dlg.getByRole('button', { name: 'Reveal the answer' }).click()
  await expect(dlg.getByText(/✓ Correct\. 5 instructions \+ 4 fill\/drain cycles = 9/)).toBeVisible()
  await dlg.getByRole('button', { name: /Exit/ }).click()
  await expect(dlg).toHaveCount(0)
})

test('signed-out users are invited to sign in before saving', async ({ page }) => {
  await page.goto('/#/experiments')
  // Without Firebase configuration the page explains how to enable it; with it, a sign-in button appears.
  await expect(page.getByText(/Firebase is not configured|Sign in with Google/).first()).toBeVisible()
})
