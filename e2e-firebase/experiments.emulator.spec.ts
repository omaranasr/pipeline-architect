import { expect, test, type Page } from '@playwright/test'

// Full sign-in + Firestore persistence flow against the Firebase Emulator Suite.
// Run with `npm run test:e2e:firebase` (starts the emulators; requires Java 11+).

const PROJECT = 'demo-pipeline-architect'

test.beforeEach(async ({ request }) => {
  // Start every test from an empty emulator.
  await request.delete(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT}/databases/(default)/documents`)
  await request.delete(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT}/accounts`)
})

async function signIn(page: Page, email: string, name: string) {
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /^Sign in/ }).first().click()])
  await popup.waitForLoadState('load')
  // The emulator's account picker attaches its handlers after load; retry until the form opens.
  await expect(async () => {
    await popup.getByRole('button', { name: /Add new account/ }).click({ timeout: 2_000 })
    await expect(popup.locator('#email-input')).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 20_000 })
  await popup.locator('#email-input').fill(email)
  await popup.locator('#display-name-input').fill(name)
  await popup.locator('#sign-in').click()
  // The popup result is relayed through Firebase's auth iframe (which loads Google's gapi script),
  // so completion time varies with network latency.
  await expect(page.getByText(name).first()).toBeVisible({ timeout: 30_000 })
}

async function saveCurrent(page: Page, name: string) {
  await page.getByRole('button', { name: /Save/ }).first().click()
  const dlg = page.getByRole('dialog', { name: 'Save experiment' })
  await dlg.getByLabel('Name').fill(name)
  await dlg.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(dlg.getByText('Saved to My Experiments.')).toBeVisible()
  await dlg.getByRole('button', { name: 'Done' }).click()
}

test('sign in, save, list, rename, persist across reload, reopen and delete', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('pipeline-architect:lab-config'))
  await page.goto('/#/datapath')
  await expect(page.getByText('emulator', { exact: true })).toBeVisible()

  // Saving while signed out asks the user to sign in first.
  await page.getByRole('button', { name: /Save/ }).first().click()
  await expect(page.getByRole('dialog', { name: 'Sign in to save' })).toBeVisible()
  await page.getByRole('button', { name: 'Not now' }).click()

  await signIn(page, 'alice@example.test', 'Alice Tester')

  // Configure: load-use workload, forwarding OFF, 0.8 ns.
  await page.getByRole('button', { name: /Load-Use Hazards/ }).click()
  await page.getByRole('switch', { name: /Forwarding/ }).click()
  await page.getByRole('spinbutton').fill('0.8')
  await expect(page.getByText(/cycle\s*1\s*\/\s*15/)).toBeVisible()
  await saveCurrent(page, 'Alice load-use study')

  // Change the live configuration so reopening must restore it.
  await page.getByRole('button', { name: /Independent Instructions/ }).click()
  await page.getByRole('switch', { name: /Forwarding/ }).click()
  await expect(page.getByText(/cycle\s*1\s*\/\s*9/)).toBeVisible()

  await page.goto('/#/experiments')
  await expect(page.getByText('1 saved experiment')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alice load-use study' })).toBeVisible()
  await expect(page.getByText('Forwarding: OFF')).toBeVisible()

  await page.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('New name').fill('Alice renamed')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Alice renamed' })).toBeVisible()

  // Auth state and data persist across a full reload.
  await page.reload()
  await expect(page.getByText('Alice Tester').first()).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Alice renamed' })).toBeVisible()

  // Reopen: parameters restored and re-simulated by the server.
  const sim = page.waitForResponse((r) => r.url().endsWith('/api/simulate') && r.request().postData()?.includes('"load-use"') === true)
  await page.getByRole('button', { name: 'Open & simulate' }).click()
  const res = await sim
  expect(JSON.parse(res.request().postData()!)).toEqual({ workloadId: 'load-use', forwardingEnabled: false, clockPeriodNs: 0.8 })
  await expect(page.getByRole('heading', { name: 'Datapath Explorer' })).toBeVisible()
  await expect(page.getByText(/cycle\s*1\s*\/\s*15/)).toBeVisible()
  await expect(page.getByRole('switch', { name: /Forwarding/ })).toHaveAttribute('aria-checked', 'false')

  await page.goto('/#/experiments')
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('0 saved experiments')).toBeVisible()

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
})

test("a second user cannot see the first user's experiments", async ({ page }) => {
  await page.goto('/#/datapath')
  await signIn(page, 'alice@example.test', 'Alice Tester')
  await saveCurrent(page, 'Alice private experiment')
  await page.getByRole('button', { name: 'Sign out' }).click()

  await page.goto('/#/experiments')
  await signIn(page, 'bob@example.test', 'Bob Tester')
  await expect(page.getByText('0 saved experiments')).toBeVisible()
  await expect(page.getByText('Alice private experiment')).toHaveCount(0)
})

test('closing the sign-in popup is handled gracefully', async ({ page }) => {
  await page.goto('/#/experiments')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Sign in with Google' }).click()])
  await popup.close()
  // The button stays usable immediately: the user can retry and complete sign-in right away.
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeEnabled()
  await signIn(page, 'carol@example.test', 'Carol Tester')
  // Cancelling was not reported as an error.
  await expect(page.getByRole('alert')).toHaveCount(0)
})

test('closing the popup without retrying settles back to signed-out without an error', async ({ page }) => {
  await page.goto('/#/experiments')
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Sign in with Google' }).click()])
  await popup.close()
  // Firebase reports auth/popup-closed-by-user after a short delay; the header returns to "Sign in".
  await expect(page.getByRole('banner').getByRole('button', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('alert')).toHaveCount(0)
})
