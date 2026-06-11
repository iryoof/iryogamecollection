import { describe, it, expect } from 'vitest'
import { createCareer, simulateNextMatchday, getCareer } from '../src/football/CareerManager'

describe('CareerManager', () => {
  it('creates a career and simulates next matchday', () => {
    const career = createCareer('manu')
    expect(career).toHaveProperty('id')
    const before = career.currentMatchday
    const result = simulateNextMatchday(career.id)
    expect(result).toHaveProperty('matchdayIndex')
    const updated = getCareer(career.id)
    expect(updated.currentMatchday).toBe(before + 1)
    expect(Array.isArray(updated.standings)).toBe(true)
  })
})
