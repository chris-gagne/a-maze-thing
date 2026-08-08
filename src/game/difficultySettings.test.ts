import { describe, expect, it } from 'vitest'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  Difficulty,
  getDifficultyPreset,
  parseDifficulty,
  resolveDifficulty,
} from './difficultySettings'

describe('difficulty settings', () => {
  it('keeps Normal as the explicit selector default', () => {
    expect(DEFAULT_DIFFICULTY).toBe(Difficulty.Normal)
  })

  it('parses only canonical difficulty ids', () => {
    for (const preset of DIFFICULTY_PRESETS) {
      expect(parseDifficulty(preset.id)).toBe(preset.id)
    }

    expect(parseDifficulty(null)).toBeNull()
    expect(parseDifficulty('')).toBeNull()
    expect(parseDifficulty('NORMAL')).toBeNull()
    expect(parseDifficulty('regular')).toBeNull()
  })

  it('uses Easy Peasy as a debug default without overriding explicit difficulty', () => {
    expect(resolveDifficulty(undefined, null, true)).toBe(Difficulty.EasyPeasy)
    expect(resolveDifficulty(undefined, Difficulty.Normal, true)).toBe(Difficulty.Normal)
    expect(resolveDifficulty(Difficulty.Overclocked, Difficulty.Normal, true))
      .toBe(Difficulty.Overclocked)
    expect(resolveDifficulty(undefined, null, false)).toBe(DEFAULT_DIFFICULTY)
  })

  it('defines the four modes in selector order with approved copy', () => {
    expect(DIFFICULTY_PRESETS).toEqual([
      expect.objectContaining({
        id: Difficulty.Casual,
        label: 'CASUAL MODE',
        description: 'All maze, no menace. The walls are the only thing judging you.',
        simulationSpeedMultiplier: 1,
        fullGame: false,
      }),
      expect.objectContaining({
        id: Difficulty.EasyPeasy,
        label: 'EASY PEASY',
        description: 'Full systems, half speed. Danger has been asked to walk.',
        simulationSpeedMultiplier: 0.5,
        fullGame: true,
      }),
      expect.objectContaining({
        id: Difficulty.Normal,
        label: 'NORMAL',
        description: 'Factory settings. The maze cheats only the approved amount.',
        simulationSpeedMultiplier: 1,
        fullGame: true,
      }),
      expect.objectContaining({
        id: Difficulty.Overclocked,
        label: 'OVERCLOCKED',
        description: 'Everything at 150%. Warranty status: extremely void.',
        simulationSpeedMultiplier: 1.5,
        fullGame: true,
      }),
    ])
  })

  it('retrieves each preset by id', () => {
    for (const preset of DIFFICULTY_PRESETS) {
      expect(getDifficultyPreset(preset.id)).toBe(preset)
    }
  })
})
