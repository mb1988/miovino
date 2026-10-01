import type { Bottle, Location, Tasting, Wine, WineType, WishItem } from './types'

/**
 * Made-up cellar for demo mode. Deterministic (seeded), and every year is relative to `now`,
 * so the demo always has a healthy mix of ready / drink soon / hold wines whenever it is opened.
 */

// [producer, name, type, country, region, appellation, grapes, age, from, to, price, bottles, location]
// age = years since vintage (null = NV); from/to = drinking window relative to this year.
type Row = [string, string, WineType, string, string, string, string[], number | null, number, number, number, number, string]

const RACK_A = 'Cellar rack A'
const RACK_B = 'Cellar rack B'
const FRIDGE = 'Kitchen fridge'
const COUNTRY = 'Barn rack' // in a second cellar, "Country house"

const ROWS: Row[] = [
  ['Giacomo Conterno', 'Barolo Cascina Francia', 'red', 'Italy', 'Piedmont', 'Barolo DOCG', ['Nebbiolo'], 9, -1, 15, 145, 3, RACK_A],
  ['Bartolo Mascarello', 'Barolo', 'red', 'Italy', 'Piedmont', 'Barolo DOCG', ['Nebbiolo'], 7, 1, 20, 160, 2, RACK_A],
  ['Produttori del Barbaresco', 'Barbaresco Riserva Asili', 'red', 'Italy', 'Piedmont', 'Barbaresco DOCG', ['Nebbiolo'], 10, -2, 10, 58, 4, RACK_A],
  ['G.D. Vajra', 'Langhe Nebbiolo', 'red', 'Italy', 'Piedmont', 'Langhe DOC', ['Nebbiolo'], 3, -2, 2, 22, 3, RACK_B],
  ['Braida', "Barbera d'Asti Bricco dell'Uccellone", 'red', 'Italy', 'Piedmont', "Barbera d'Asti DOCG", ['Barbera'], 6, -3, 4, 48, 2, RACK_B],
  ['Biondi-Santi', 'Brunello di Montalcino', 'red', 'Italy', 'Tuscany', 'Brunello di Montalcino DOCG', ['Sangiovese'], 8, 2, 25, 120, 2, RACK_A],
  ['Il Poggione', 'Rosso di Montalcino', 'red', 'Italy', 'Tuscany', 'Rosso di Montalcino DOC', ['Sangiovese'], 3, -2, 1, 21, 4, RACK_B],
  ['Fontodi', 'Flaccianello della Pieve', 'red', 'Italy', 'Tuscany', 'Toscana IGT', ['Sangiovese'], 7, -1, 12, 95, 2, RACK_A],
  ['Felsina', 'Chianti Classico Riserva Rancia', 'red', 'Italy', 'Tuscany', 'Chianti Classico DOCG', ['Sangiovese'], 9, -6, -1, 38, 3, RACK_B],
  ['Tenuta San Guido', 'Sassicaia', 'red', 'Italy', 'Tuscany', 'Bolgheri Sassicaia DOC', ['Cabernet Sauvignon', 'Cabernet Franc'], 6, 2, 22, 260, 1, RACK_A],
  ['Le Macchiole', 'Bolgheri Rosso', 'red', 'Italy', 'Tuscany', 'Bolgheri DOC', ['Merlot', 'Cabernet Franc', 'Syrah'], 4, -1, 3, 26, 2, RACK_B],
  ['Quintarelli', 'Amarone della Valpolicella Classico', 'red', 'Italy', 'Veneto', 'Amarone della Valpolicella DOCG', ['Corvina', 'Rondinella', 'Molinara'], 12, -4, 15, 380, 1, COUNTRY],
  ['Pieropan', 'Soave Classico La Rocca', 'white', 'Italy', 'Veneto', 'Soave Classico DOC', ['Garganega'], 4, -2, 4, 29, 3, FRIDGE],
  ['Benanti', 'Etna Bianco Superiore Pietra Marina', 'white', 'Italy', 'Sicily', 'Etna DOC', ['Carricante'], 6, -2, 6, 45, 2, RACK_B],
  ['Tenuta delle Terre Nere', 'Etna Rosso Calderara Sottana', 'red', 'Italy', 'Sicily', 'Etna DOC', ['Nerello Mascalese'], 5, -2, 6, 42, 2, RACK_B],
  ['Mastroberardino', 'Taurasi Radici Riserva', 'red', 'Italy', 'Campania', 'Taurasi DOCG', ['Aglianico'], 11, -3, 9, 52, 2, COUNTRY],
  ['Ca\' del Bosco', 'Franciacorta Cuvée Prestige', 'sparkling', 'Italy', 'Lombardy', 'Franciacorta DOCG', ['Chardonnay', 'Pinot Noir', 'Pinot Blanc'], null, -1, 2, 34, 3, FRIDGE],
  ['Ferrari', 'Giulio Ferrari Riserva del Fondatore', 'sparkling', 'Italy', 'Trentino', 'Trento DOC', ['Chardonnay'], 13, -2, 10, 140, 1, RACK_A],
  ['Château Léoville Barton', 'Saint-Julien', 'red', 'France', 'Bordeaux', 'Saint-Julien', ['Cabernet Sauvignon', 'Merlot', 'Cabernet Franc'], 10, 0, 18, 85, 3, RACK_A],
  ['Château Pontet-Canet', 'Pauillac', 'red', 'France', 'Bordeaux', 'Pauillac', ['Cabernet Sauvignon', 'Merlot'], 8, 2, 25, 110, 2, COUNTRY],
  ['Château Sociando-Mallet', 'Haut-Médoc', 'red', 'France', 'Bordeaux', 'Haut-Médoc', ['Cabernet Sauvignon', 'Merlot'], 12, -5, 1, 40, 2, RACK_B],
  ['Château Climens', 'Barsac', 'dessert', 'France', 'Bordeaux', 'Barsac', ['Sémillon'], 15, -6, 20, 70, 1, COUNTRY],
  ['Domaine Leflaive', 'Puligny-Montrachet', 'white', 'France', 'Burgundy', 'Puligny-Montrachet', ['Chardonnay'], 5, -1, 5, 95, 2, FRIDGE],
  ['Domaine Fourrier', 'Gevrey-Chambertin Vieille Vigne', 'red', 'France', 'Burgundy', 'Gevrey-Chambertin', ['Pinot Noir'], 6, 0, 10, 88, 2, RACK_A],
  ['Domaine de Montille', 'Volnay 1er Cru Taillepieds', 'red', 'France', 'Burgundy', 'Volnay', ['Pinot Noir'], 9, -3, 3, 75, 1, RACK_B],
  ['Jean-Marc Brocard', 'Chablis 1er Cru Montmains', 'white', 'France', 'Burgundy', 'Chablis', ['Chardonnay'], 4, -2, 3, 27, 3, FRIDGE],
  ['E. Guigal', 'Côte-Rôtie Brune et Blonde', 'red', 'France', 'Rhône', 'Côte-Rôtie', ['Syrah', 'Viognier'], 7, -1, 10, 62, 2, RACK_A],
  ['Domaine du Vieux Télégraphe', 'Châteauneuf-du-Pape La Crau', 'red', 'France', 'Rhône', 'Châteauneuf-du-Pape', ['Grenache', 'Syrah', 'Mourvèdre'], 9, -4, 6, 55, 2, COUNTRY],
  ['Domaine Huet', 'Vouvray Le Mont Demi-Sec', 'white', 'France', 'Loire', 'Vouvray', ['Chenin Blanc'], 10, -5, 20, 36, 1, RACK_B],
  ['Bollinger', 'Special Cuvée', 'sparkling', 'France', 'Champagne', 'Champagne', ['Pinot Noir', 'Chardonnay', 'Pinot Meunier'], null, -1, 3, 55, 2, FRIDGE],
  ['Domaine Tempier', 'Bandol Rosé', 'rose', 'France', 'Provence', 'Bandol', ['Mourvèdre', 'Grenache', 'Cinsault'], 2, -1, 1, 38, 2, FRIDGE],
  ['Bodegas Muga', 'Rioja Reserva', 'red', 'Spain', 'Rioja', 'Rioja DOCa', ['Tempranillo', 'Garnacha'], 6, -3, 7, 24, 3, RACK_B],
  ['Vega Sicilia', 'Valbuena 5°', 'red', 'Spain', 'Castilla y León', 'Ribera del Duero', ['Tempranillo'], 7, 0, 15, 150, 1, COUNTRY],
  ['Dr. Loosen', 'Riesling Wehlener Sonnenuhr Spätlese', 'white', 'Germany', 'Mosel', 'Mosel', ['Riesling'], 7, -4, 13, 32, 2, FRIDGE],
  ['Ridge', 'Monte Bello', 'red', 'USA', 'California', 'Santa Cruz Mountains', ['Cabernet Sauvignon', 'Merlot'], 8, 1, 22, 190, 1, COUNTRY],
  ['Penfolds', 'Bin 389 Cabernet Shiraz', 'red', 'Australia', 'South Australia', 'South Australia', ['Cabernet Sauvignon', 'Shiraz'], 6, -1, 12, 45, 2, RACK_B],
  ['Taylor\'s', 'Vintage Port', 'fortified', 'Portugal', 'Douro', 'Porto DOC', ['Touriga Nacional', 'Touriga Franca'], 9, 6, 40, 85, 1, COUNTRY],
  ['Radikon', 'Ribolla Gialla', 'orange', 'Italy', 'Friuli', 'Venezia Giulia IGT', ['Ribolla Gialla'], 9, -4, 8, 48, 1, RACK_B],
]

// Wines already finished (for the journal and Wine DNA): [row index, months ago, rating, buyAgain, food, occasion, note]
type Drunk = [number, number, number, 'yes' | 'maybe' | 'no', string, string, string]
const DRUNK: Drunk[] = [
  [2, 1, 4.5, 'yes', 'Braised beef', 'Dinner', 'Rose petals and tar, still firm but singing after an hour in the decanter.'],
  [12, 2, 4, 'yes', 'Risotto with asparagus', 'Dinner', 'Almond, white flowers, a salty finish. Lovely value.'],
  [29, 2, 4, 'maybe', '', 'Party', 'Brioche and green apple. Crowd-pleaser.'],
  [3, 3, 3.5, 'yes', 'Pizza', 'Casual', 'Bright cherries, easy and juicy.'],
  [8, 4, 4, 'yes', 'Bistecca alla fiorentina', 'Special occasion', 'Classic Sangiovese: sour cherry, leather, firm acidity.'],
  [22, 5, 5, 'yes', 'Roast chicken', 'Special occasion', 'Hazelnut, citrus and a mineral finish that went on and on.'],
  [31, 5, 3, 'no', 'Tapas', 'Casual', 'A bit oaky for me.'],
  [6, 6, 3.5, 'maybe', 'Pasta al ragù', 'Dinner', 'Simple and fresh.'],
  [26, 7, 4, 'yes', 'Oysters', 'Restaurant', 'Flinty, saline, perfect with oysters.'],
  [18, 8, 4.5, 'yes', 'Lamb chops', 'Dinner', 'Cassis, cedar, graphite. Starting to open up.'],
  [20, 9, 3.5, 'maybe', 'Steak', 'Dinner', 'Firm, a little dried out at the end.'],
  [13, 10, 4, 'yes', 'Grilled fish', 'Dinner', 'Smoky, lemony, volcanic.'],
  [30, 11, 4, 'yes', 'Bouillabaisse', 'Casual', 'Herbs, peach, dry and long.'],
  [0, 12, 5, 'yes', 'Tajarin with truffle', 'Special occasion', 'Wine of the year. Layers of rose, tar, orange peel.'],
  [33, 13, 4.5, 'yes', 'Thai curry', 'Dinner', 'Off-dry, petrol and lime. Great with spice.'],
  [24, 14, 3.5, 'maybe', 'Duck breast', 'Restaurant', 'Pretty red fruit but short.'],
  [26, 15, 4, 'yes', '', 'Casual', 'Reliable Chablis.'],
  [31, 16, 2.5, 'no', 'Burgers', 'Party', 'Too much vanilla.'],
  [10, 17, 3.5, 'maybe', 'Pizza', 'Casual', 'Easy-going, a bit simple.'],
  [27, 18, 4, 'yes', 'Venison', 'Dinner', 'Olive, bacon fat, violets.'],
  [16, 20, 4, 'maybe', 'Aperitivo', 'Party', 'Fine bubbles, toasty.'],
  [35, 22, 3.5, 'maybe', 'BBQ', 'Casual', 'Big and ripe.'],
  [4, 24, 4, 'yes', 'Vitello tonnato', 'Dinner', 'Plum and spice, very drinkable.'],
  [21, 26, 4.5, 'yes', 'Blue cheese', 'Dinner', 'Apricot, honey, saffron. Magic with Roquefort.'],
  [9, 28, 4.5, 'yes', '', 'Gift', 'Shared with friends, everyone asked for the name.'],
]

const WISH: [string, string, number | null, string][] = [
  ['Produttori del Barbaresco', 'Barbaresco Riserva Asili', null, 'Buy a case of the next release'],
  ['Domaine Leflaive', 'Puligny-Montrachet', null, ''],
  ['Dr. Loosen', 'Riesling Wehlener Sonnenuhr Spätlese', null, 'Great with spicy food'],
  ['Château Rayas', 'Châteauneuf-du-Pape', null, 'Try once — expensive'],
  ['Roagna', 'Barbaresco Pajè', null, 'Recommended by the wine bar'],
]

/** Tiny seeded PRNG (mulberry32) so the demo looks the same on every device. */
function rng(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
const monthsAgo = (now: Date, m: number, day = 12) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, day))

export interface DemoData {
  wines: Wine[]
  bottles: Bottle[]
  tastings: Tasting[]
  locations: Location[]
  wishlist: WishItem[]
}

export function demoData(now = new Date()): DemoData {
  const rand = rng(1988)
  const Y = now.getUTCFullYear()
  const ts = now.getTime()
  const locations: Location[] = [
    { id: 'demo-loc-a', name: RACK_A, order: 0, rows: 5, cols: 8, updatedAt: ts },
    { id: 'demo-loc-b', name: RACK_B, order: 1, rows: 4, cols: 6, updatedAt: ts },
    { id: 'demo-loc-f', name: FRIDGE, order: 2, updatedAt: ts },
    { id: 'demo-loc-c', name: COUNTRY, order: 3, rows: 3, cols: 6, cellar: 'Country house', updatedAt: ts },
  ]
  const wines: Wine[] = []
  const bottles: Bottle[] = []
  const tastings: Tasting[] = []
  // Next free slot per rack, filled row by row so a wine's bottles sit together.
  const next = new Map<string, number>()
  const grid = new Map(locations.filter((l) => l.rows && l.cols).map((l) => [l.name, l]))

  ROWS.forEach(([producer, name, type, country, region, appellation, grapes, age, from, to, price, count, location], i) => {
    const id = `demo-w${i + 1}`
    const vintage = age == null ? null : Y - age
    const bought = monthsAgo(now, 6 + Math.floor(rand() * 40), 1 + Math.floor(rand() * 27))
    wines.push({
      id,
      producer,
      name,
      vintage,
      type,
      country,
      region,
      appellation,
      grapes,
      bottleSize: 750,
      drinkFrom: Y + from,
      drinkTo: Y + to,
      external: [],
      favourite: [0, 5, 21, 33].includes(i),
      marketPrice: i % 4 === 0 ? Math.round(price * (1.1 + rand() * 0.6)) : undefined,
      marketPriceDate: i % 4 === 0 ? iso(monthsAgo(now, 1)) : undefined,
      tags: [],
      createdAt: bought.getTime(),
      updatedAt: ts,
    })
    const g = grid.get(location)
    // A couple of bottles per rack are left unplaced so "Place a wine" has something to do.
    const leaveUnplaced = i % 7 === 3
    for (let n = 0; n < count; n++) {
      let slot: string | undefined
      if (g && !(leaveUnplaced && n === count - 1)) {
        const k = next.get(location) ?? 0
        if (k < g.rows! * g.cols!) {
          slot = `${String.fromCharCode(65 + Math.floor(k / g.cols!))}${(k % g.cols!) + 1}`
          next.set(location, k + 1)
        }
      }
      bottles.push({ id: `${id}-b${n + 1}`, wineId: id, status: 'cellar', location, slot, purchasePrice: price, purchaseDate: iso(bought), seller: i % 3 ? 'Wine merchant' : 'Direct from the estate', createdAt: bought.getTime(), updatedAt: ts })
    }
  })

  DRUNK.forEach(([row, ago, rating, buyAgain, food, occasion, notes], i) => {
    const wineId = `demo-w${row + 1}`
    const date = iso(monthsAgo(now, ago, 3 + ((i * 7) % 24)))
    const bottleId = `${wineId}-d${i + 1}`
    const tastingId = `demo-t${i + 1}`
    const price = ROWS[row][10]
    bottles.push({ id: bottleId, wineId, status: 'drunk', consumedAt: date, tastingId, purchasePrice: price, purchaseDate: iso(monthsAgo(now, ago + 8)), createdAt: monthsAgo(now, ago + 8).getTime(), updatedAt: ts })
    tastings.push({ id: tastingId, wineId, bottleId, date, rating, buyAgain, food: food || undefined, occasion, notes, company: i % 3 === 0 ? 'Friends' : i % 3 === 1 ? 'Family' : undefined, createdAt: new Date(date).getTime(), updatedAt: ts })
  })

  const wishlist: WishItem[] = WISH.map(([producer, name, vintage, note], i) => ({ id: `demo-wish${i + 1}`, producer, name, vintage, note: note || undefined, done: i === 4, createdAt: ts - i * 86_400_000, updatedAt: ts }))

  return { wines, bottles, tastings, locations, wishlist }
}
