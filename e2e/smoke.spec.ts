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
  await page.getByRole('button', { name: /Barbaresco 2016 Place$/ }).click() // the bottle in "Not on the grid yet"
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

test('demo mode: sample cellar with no server, then back to the real app', async ({ page }) => {
  await page.goto('/demo')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('note')).toContainText('Demo')
  // First visit: a short intro for visitors, shown once.
  await expect(page.getByRole('dialog', { name: 'About MioVino' })).toBeVisible()
  await page.getByRole('button', { name: 'Start exploring' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('38 wines · 78 bottles')).toBeVisible()
  // The fake AI answers in the browser.
  await page.goto('/ask')
  await page.getByRole('button', { name: 'What should I open this weekend?' }).click()
  await expect(page.getByText(/Demo mode: answers come from the built-in recommender/)).toBeVisible()
  // The real cellar is a different database: leaving the demo shows it empty.
  await page.getByRole('button', { name: 'Exit' }).click()
  await expect(page.getByRole('note')).toHaveCount(0)
  await expect(page.getByText('38 wines · 78 bottles')).toHaveCount(0)
})

test('rack map: place a wine — pick it first, get slots next to its other bottles', async ({ page }) => {
  await seed(page, {
    wines: [wine('w1'), wine('w2', { producer: 'Leflaive', name: 'Puligny-Montrachet', type: 'white' })],
    bottles: [
      { id: 'b1', wineId: 'w1', status: 'cellar', location: 'Rack A', slot: 'A1', createdAt: now, updatedAt: now },
      { id: 'b2', wineId: 'w1', status: 'cellar', location: 'Rack A', createdAt: now, updatedAt: now },
      { id: 'b3', wineId: 'w1', status: 'cellar', createdAt: now, updatedAt: now },
      { id: 'b4', wineId: 'w2', status: 'drunk', createdAt: now, updatedAt: now },
    ],
    locations: [{ id: 'l1', name: 'Rack A', order: 0, rows: 2, cols: 3, updatedAt: now }],
  })
  await page.goto('/rack')
  await page.getByRole('button', { name: 'Place a wine' }).click()
  const sheet = page.getByRole('dialog')
  await expect(sheet.getByText('Puligny-Montrachet')).toHaveCount(0) // nothing left in the cellar to place
  await sheet.getByRole('button', { name: /Barbaresco 2016/ }).click()
  await expect(sheet.getByText('2 without a slot')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'More' })).toBeDisabled() // can't place more than you have
  await sheet.getByRole('button', { name: 'Suggest slots' }).click()
  await expect(page.getByRole('button', { name: 'A2: chosen' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'A3: chosen' })).toBeVisible()
  await page.getByRole('button', { name: 'Place 2 bottles' }).click()
  await expect(page.getByText('3 of 6 slots filled')).toBeVisible()
})

test('several cellars: give a location its own cellar, then switch on the Cellar screen', async ({ page }) => {
  await seed(page, {
    wines: [wine('w1'), wine('w2', { producer: 'Leflaive', name: 'Puligny-Montrachet', type: 'white' })],
    bottles: [
      { id: 'b1', wineId: 'w1', status: 'cellar', location: 'Rack A', createdAt: now, updatedAt: now },
      { id: 'b2', wineId: 'w2', status: 'cellar', location: 'Barn', createdAt: now, updatedAt: now },
    ],
    locations: [
      { id: 'l1', name: 'Rack A', order: 0, updatedAt: now },
      { id: 'l2', name: 'Barn', order: 1, updatedAt: now },
    ],
  })
  await expect(page.getByRole('group', { name: 'Cellar' })).toHaveCount(0) // one cellar: no switcher
  await page.goto('/more')
  page.once('dialog', (d) => d.accept('Country house'))
  await page.getByRole('combobox', { name: 'Cellar of Barn' }).selectOption({ label: 'New cellar…' })
  await expect(page.getByRole('combobox', { name: 'Cellar of Barn' })).toHaveValue('Country house')

  await page.getByRole('link', { name: 'Cellar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'All cellars' })).toBeVisible()
  await page.getByRole('group', { name: 'Cellar' }).getByRole('button', { name: 'Country house' }).click()
  await expect(page.getByRole('heading', { name: 'Country house' })).toBeVisible()
  await expect(page.getByText('1 wine · 1 bottle')).toBeVisible()
  await expect(page.getByText('Puligny-Montrachet')).toBeVisible()
})

test('several cellars: "Show in rack" opens the right rack even when another cellar is chosen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('miovino.cellar', 'Country house'))
  await seed(page, {
    wines: [wine('w1')],
    bottles: [{ id: 'b1', wineId: 'w1', status: 'cellar', location: 'Rack A', slot: 'A1', createdAt: now, updatedAt: now }],
    locations: [
      { id: 'l1', name: 'Rack A', order: 0, rows: 2, cols: 2, updatedAt: now },
      { id: 'l2', name: 'Barn', order: 1, rows: 2, cols: 2, cellar: 'Country house', updatedAt: now },
    ],
  })
  await page.goto('/rack?w=w1')
  await expect(page.locator('header p', { hasText: 'Rack A' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^A1: Gaja Barbaresco 2016/ })).toBeVisible()
})

test.describe('demo on a laptop', () => {
  test.use({ viewport: { width: 1366, height: 860 }, isMobile: false, hasTouch: false })

  test('shows the intro beside the app in a phone frame', async ({ page }) => {
    await page.goto('/demo')
    await expect(page.getByRole('heading', { name: 'Your wine cellar, in your pocket.' })).toBeVisible()
    const phone = page.frameLocator('iframe[title="MioVino demo"]')
    await expect(phone.getByText('38 wines · 78 bottles')).toBeVisible()
    await expect(phone.getByRole('dialog')).toHaveCount(0) // the intro is beside it, not on top of it
    await page.getByRole('button', { name: 'Rack map' }).click()
    await expect(phone.getByRole('heading', { name: 'Rack map' })).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([])
  })
})

test('wine list: price verdicts, anchored on what you paid when the wine is in your cellar', async ({ page }) => {
  await seed(page, {
    wines: [wine('wine-gaja-0001')],
    bottles: [{ id: 'bottle-gaja-0001', wineId: 'wine-gaja-0001', status: 'cellar', purchasePrice: 38, createdAt: now, updatedAt: now }],
  })
  const pick = { byTheGlass: false, fit: 'great', why: 'Your favourite Nebbiolo.', valueNote: 'about 3× shop price' }
  await page.route('**/api/winelist', (route) =>
    route.fulfill({
      json: {
        result: {
          isWineList: true,
          currency: '£',
          picks: [
            { ...pick, producer: 'Gaja', name: 'Barbaresco', vintage: 2016, price: 95, inCellar: true, retailEstimate: 30, verdict: 'fair' },
            { ...pick, producer: 'Vietti', name: 'Barolo Castiglione', vintage: 2019, price: 180, inCellar: false, retailEstimate: 32, verdict: 'ripoff' },
          ],
          deals: [{ producer: 'Ridge', name: 'Geyserville', vintage: 2021, price: 70, retailEstimate: 45, valueNote: 'a bargain', verdict: 'steal' }],
          note: null,
        },
      },
    }),
  )
  await page.goto('/winelist')
  // A 1×1 PNG stands in for a photo of the list.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  await page.locator('input[type=file]').setInputFiles({ name: 'list.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Find my bottle' }).click()

  await expect(page.getByText('You paid £38 · here 2.5×')).toBeVisible() // their own price beats the estimate
  await expect(page.getByText('Fair price')).toBeVisible()
  await expect(page.getByText('Rip-off')).toBeVisible()
  await expect(page.getByText('~£32 in shops · 5.6× · about 3× shop price')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Prices worth knowing' })).toBeVisible()
  await expect(page.getByText('Steal', { exact: true })).toBeVisible()
  await expect(page.getByText('Best value on this list: Ridge Geyserville 2021 — 1.6× shop price')).toBeVisible()
  await expect(page.getByText(/Shop prices are AI estimates/)).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze()).violations).toEqual([])
})

test('wishlist: where to buy — past sellers, live-price links, and an AI price hint saved on the item', async ({ page }) => {
  await seed(page, {
    wines: [wine('wine-gaja-0001')],
    bottles: [{ id: 'bottle-gaja-0001', wineId: 'wine-gaja-0001', status: 'drunk', seller: 'Lay & Wheeler', purchasePrice: 150, purchaseDate: '2024-05-10', createdAt: now, updatedAt: now }],
    wishlist: [{ id: 'wish-gaja-0001', producer: 'Gaja', name: 'Barbaresco', vintage: 2019, wineId: 'wine-gaja-0001', createdAt: now, updatedAt: now }],
  })
  let asked = 0
  await page.route('**/api/pricehint', (route) => {
    asked++
    return route.fulfill({ json: { hint: { low: 160, high: 210, where: 'Fine-wine merchants and the UK importer.' } } })
  })
  await page.goto('/wishlist')
  const toggle = page.getByRole('button', { name: 'Where to buy' })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')

  await expect(page.getByText('Where you bought it before')).toBeVisible()
  await expect(page.getByText('Lay & Wheeler', { exact: true })).toBeVisible()
  await expect(page.getByText(/£150 · May 2024/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Wine-Searcher \(UK\)/ })).toHaveAttribute('href', 'https://www.wine-searcher.com/find/gaja+barbaresco/2019/uk')
  // £150 paid before: fine-wine merchants come first.
  await expect(page.getByRole('link').filter({ hasText: /Berry Bros|Wine Society/ }).first()).toContainText('Berry Bros')

  await page.getByRole('button', { name: 'Typical UK price (AI)' }).click()
  await expect(page.getByText('Usually £160–210 in UK shops.')).toBeVisible()
  await expect(page.getByText(/AI estimate/)).toBeVisible()
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice']).analyze()).violations).toEqual([])

  // Cached on the item: no second AI call after a reload.
  await page.reload()
  await page.getByRole('button', { name: 'Where to buy' }).click()
  await expect(page.getByText('Usually £160–210 in UK shops.')).toBeVisible()
  expect(asked).toBe(1)
})
