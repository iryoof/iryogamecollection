import { describe, it, expect } from 'vitest'
import { getTeams, simulateMatch } from '../src/football/dataLoader'

describe('dataLoader', () => {
  it('loads teams and returns an array', () => {
    const teams = getTeams()
    expect(Array.isArray(teams)).toBe(true)
    expect(teams.length).toBeGreaterThanOrEqual(2)
  })

  it('simulateMatch returns result shape', () => {
    const teams = getTeams()
    const home = teams[0].id
    const away = teams[1].id
    const res = simulateMatch(home, away)
    expect(res).toHaveProperty('home')
    expect(res).toHaveProperty('away')
    expect(typeof res.home.goals).toBe('number')
    expect(typeof res.away.goals).toBe('number')
    expect(Array.isArray(res.events)).toBe(true)
  })
})
