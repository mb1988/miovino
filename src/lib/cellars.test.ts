import { describe, expect, it } from 'vitest'
import { cellarNames, cellarOf, inCellar, validCellar } from './cellars'
import type { Bottle, WineWithBottles } from './types'

const locations = [
  { name: 'Rack A' },
  { name: 'Fridge', cellar: '' },
  { name: 'Barn rack', cellar: 'Country house' },
]
const b = (id: string, location: string | undefined, status: Bottle['status'] = 'cellar'): Bottle => ({ id, wineId: 'w', status, location, createdAt: 0 })
const wine = (id: string, bottles: Bottle[]) => ({ id, producer: 'P', name: id, bottles, inCellar: bottles.filter((x) => x.status === 'cellar').length }) as unknown as WineWithBottles

describe('several cellars', () => {
  it('puts locations without a cellar, and bottles without a location, in the main cellar', () => {
    expect(cellarNames(locations, 'Home')).toEqual(['Home', 'Country house'])
    expect(cellarOf('Fridge', locations, 'Home')).toBe('Home')
    expect(cellarOf('Barn rack', locations, 'Home')).toBe('Country house')
    expect(cellarOf(undefined, locations, 'Home')).toBe('Home')
    expect(cellarOf('Somewhere typed by hand', locations, 'Home')).toBe('Home')
  })

  it('shows one cellar: only its bottles count, wines with none there drop out', () => {
    const split = wine('split', [b('1', 'Rack A'), b('2', 'Barn rack'), b('3', 'Barn rack'), b('4', 'Barn rack', 'drunk')])
    const homeOnly = wine('home', [b('5', undefined)])
    const all = [split, homeOnly]
    expect(inCellar(all, locations, '', 'Home')).toBe(all)
    const country = inCellar(all, locations, 'Country house', 'Home')
    expect(country.map((w) => [w.id, w.inCellar])).toEqual([['split', 2]])
    expect(country[0].bottles.map((x) => x.id)).toEqual(['2', '3', '4']) // history stays
    expect(inCellar(all, locations, 'Home', 'Home').map((w) => [w.id, w.inCellar])).toEqual([['split', 1], ['home', 1]])
  })

  it('forgets a chosen cellar that no longer exists', () => {
    expect(validCellar('Country house', ['Home', 'Country house'])).toBe('Country house')
    expect(validCellar('Gone', ['Home', 'Country house'])).toBe('')
    expect(validCellar('Home', ['Home'])).toBe('')
  })
})
