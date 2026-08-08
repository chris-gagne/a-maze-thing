import { describe, expect, it } from 'vitest'
import { DIFFICULTY_PRESETS, Difficulty } from './difficultySettings'
import { ENTITY_MOVEMENT_SPEEDS, MOVEMENT_SPEED_SCALE } from './gamePacing'

describe('game pacing', () => {
  it('reduces every intended movement baseline by 25 percent', () => {
    expect(MOVEMENT_SPEED_SCALE).toBe(0.75)
    expect(ENTITY_MOVEMENT_SPEEDS).toEqual({
      player: 3.75,
      hunter: 2.4375,
      ambusher: 2.4375,
      lifeTarget: 2.25,
      wanderer: 1.125,
    })
  })

  it('preserves the intended movement roles', () => {
    expect(ENTITY_MOVEMENT_SPEEDS.player).toBeGreaterThan(ENTITY_MOVEMENT_SPEEDS.hunter)
    expect(ENTITY_MOVEMENT_SPEEDS.hunter).toBe(ENTITY_MOVEMENT_SPEEDS.ambusher)
    expect(ENTITY_MOVEMENT_SPEEDS.hunter).toBeGreaterThan(ENTITY_MOVEMENT_SPEEDS.lifeTarget)
    expect(ENTITY_MOVEMENT_SPEEDS.lifeTarget).toBeGreaterThan(ENTITY_MOVEMENT_SPEEDS.wanderer)
  })

  it.each([
    [Difficulty.EasyPeasy, 0.5, [1.875, 1.21875, 1.21875, 1.125, 0.5625]],
    [Difficulty.Normal, 1, [3.75, 2.4375, 2.4375, 2.25, 1.125]],
    [Difficulty.Overclocked, 1.5, [5.625, 3.65625, 3.65625, 3.375, 1.6875]],
  ])('applies the unchanged %s multiplier to every movement rate', (difficulty, multiplier, expected) => {
    const preset = DIFFICULTY_PRESETS.find((candidate) => candidate.id === difficulty)
    expect(preset?.simulationSpeedMultiplier).toBe(multiplier)

    expect(Object.values(ENTITY_MOVEMENT_SPEEDS).map((speed) => speed * multiplier)).toEqual(expected)
  })
})
