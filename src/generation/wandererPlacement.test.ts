import { describe, expect, it } from 'vitest'
import { placeWanderer } from './wandererPlacement'

describe('placeWanderer', () => {
  it('does not schedule Wanderers before Stage 21', () => {
    expect(placeWanderer(20, 91)).toBeNull()
  })

  it('schedules every stage from Stage 21 onward within the first minute', () => {
    for (let stageNumber = 21; stageNumber <= 60; stageNumber += 1) {
      const placement = placeWanderer(stageNumber, stageNumber * 997)

      expect(placement).not.toBeNull()
      expect(placement!.spawnSeconds).toBeGreaterThanOrEqual(5)
      expect(placement!.spawnSeconds).toBeLessThanOrEqual(60)
    }
  })

  it('is deterministic for a stage seed', () => {
    expect(placeWanderer(21, 0x12345678)).toEqual(placeWanderer(21, 0x12345678))
  })

  it('varies schedules and route seeds across seeds', () => {
    const placements = Array.from({ length: 8 }, (_, seed) => placeWanderer(21, seed)!)

    expect(new Set(placements.map((placement) => placement.spawnSeconds)).size).toBeGreaterThan(1)
    expect(new Set(placements.map((placement) => placement.routeSeed)).size).toBeGreaterThan(1)
  })

  it.each([0, -1, 1.5])('rejects invalid stage number %s', (stageNumber) => {
    expect(() => placeWanderer(stageNumber, 1)).toThrow(RangeError)
  })
})
