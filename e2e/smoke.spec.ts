import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/** Fakes the Worker: signed in, nothing to sync. Tests can add routes before calling this. */
async function mockServer(page: Page) {
  await page.route('**/api/**', (route) => {
    const url = route.request().url()
    if (url.includes('/api/health')) return route.fulfill({ json: { ok: true, authenticated: true, devices: 1, scan: false } })
    if (url.includes('/api/sync')) return route.fulfill({ json: { cursor: 0, changes: [], more: false, accepted: 0 } })
    return route.fulfill({ status: 404, json: { error: 'not mocked' } })
  })
}

/** Writes records straight into the app's IndexedDB, then reloads so the app reads them. */
async function seed(page: Page, data: Record<string, object[]>) {
  await page.goto('/')
  await page.evaluate(
    (data) =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('miovino2')
        open.onsuccess = () => {
          const tx = open.result.transaction(Object.keys(data), 'readwrite')
          for (const [store, rows] of Object.entries(data)) for (const row of rows) tx.objectStore(store).put(row)
          tx.oncomplete = () => resolve()
          tx.onerror = () => reject(tx.error)
        }
      }),
    data,
  )
  await page.reload()
}

const now = Date.now()
const wine = (id: string, extra: object = {}) => ({ id, producer: 'Gaja', name: 'Barbaresco', vintage: 2016, type: 'red', grapes: ['Nebbiolo'], external: [], tags: [], favourite: false, bottleSize: 750, drinkFrom: 2022, drinkTo: 2030, createdAt: now, updatedAt: now, ...extra })

test.beforeEach(async ({ page }) => {
  await mockServer(page)
  await page.addInitScript(() => localStorage.setItem('miovino.lang', 'en'))
})

test('add a wine by hand, drink a bottle, find it in the journal', async ({ page }) => {
  await page.goto('/add/manual')
  await page.getByPlaceholder('e.g. Giacomo Fenocchio').fill('Vietti')
  await page.getByPlaceholder('e.g. Barolo Villero').fill('Barolo Castiglione')
  await page.locator('select').first().selectOption('2019')
  await page.getByRole('button', { name: /Add to cellar/ }).click()

  await expect(page.getByRole('heading', { name: 'Barolo Castiglione' })).toBeVisible()
  await page.getByRole('button', { name: /Drink a bottle/ }).click()
  await page.getByRole('button', { name: '4 stars', exact: true }).click()
  await page.getByPlaceholder('Opened up after 30 min. Black cherry, leather, cedar…').fill('Tar and roses.')
  await page.getByRole('button', { name: /Save & mark bottle as drunk/ }).click()

  await expect(page.getByText('None left in the cellar.')).toBeVisible()
  await page.getByRole('link', { name: 'Journal' }).click()
  await expect(page.getByText('“Tar and roses.”')).toBeVisible()
})

test('cellar list, search and the monthly card', async ({ page }) => {
  await seed(page, {
    wines: [wine('w1', { drinkTo: new Date().getFullYear() }), wine('w2', { producer: 'Leflaive', name: 'Puligny-Montrachet', type: 'white', drinkFrom: 2024, drinkTo: 2035 })],
    bottles: [
      { id: 'b1', wineId: 'w1', status: 'cellar', createdAt: now, updatedAt: now },
      { id: 'b2', wineId: 'w2', status: 'cellar', createdAt: now, updatedAt: now },
    ],
  })
  await expect(page.getByText(/drink these first/)).toBeVisible()
  await expect(page.getByText('2 wines · 2 bottles')).toBeVisible()
  await page.getByPlaceholder('Search wine, producer, grape, rack…').fill('puligny')
  await expect(page.getByText('1 wine · 1 bottle')).toBeVisible()
})

test('rack map: lay out a rack and place a bottle', async ({ page }) => {
  await seed(page, {
    wines: [wine('w1')],
    bottles: [{ id: 'b1', wineId: 'w1', status: 'cellar', location: 'Rack A', createdAt: now, updatedAt: now }],
    locations: [{ id: 'l1', name: 'Rack A', order: 0, updatedAt: now }],
  })
  await page.goto('/rack')
  await page.getByRole('button', { name: 'Save' }).click() // default 4 × 6 grid
  await page.getByRole('button', { name: 'Place' }).click()
  await page.getByRole('button', { name: 'B2: empty' }).click()
  await expect(page.getByRole('button', { name: /^B2: Gaja Barbaresco 2016/ })).toBeVisible()
  await expect(page.getByText('1 of 24 slots filled')).toBeVisible()
})

test('switching to Italian translates the app', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('button', { name: 'Italiano' }).click()
  await expect(page.getByRole('link', { name: 'Cantina', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Altro' })).toBeVisible()
})

for (const path of ['/', '/wine/w1', '/suggest', '/more', '/rack', '/stats']) {
  test(`no accessibility violations on ${path}`, async ({ page }) => {
    await seed(page, {
      wines: [wine('w1', { marketPrice: 200 })],
      bottles: [{ id: 'b1', wineId: 'w1', status: 'cellar', location: 'Rack A', slot: 'A1', purchasePrice: 150, purchaseDate: '2022-01-01', createdAt: now, updatedAt: now }],
      locations: [{ id: 'l1', name: 'Rack A', order: 0, rows: 3, cols: 4, updatedAt: now }],
    })
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
}
