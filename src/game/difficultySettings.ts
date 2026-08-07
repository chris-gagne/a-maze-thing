export const Difficulty = {
  Casual: 'casual',
  EasyPeasy: 'easy-peasy',
  Normal: 'normal',
  Overclocked: 'overclocked',
} as const

export type DifficultyId = typeof Difficulty[keyof typeof Difficulty]

export interface DifficultyPreset {
  id: DifficultyId
  label: string
  description: string
  simulationSpeedMultiplier: number
  fullGame: boolean
}

export const DIFFICULTY_PRESETS: readonly DifficultyPreset[] = [
  {
    id: Difficulty.Casual,
    label: 'CASUAL MODE',
    description: 'All maze, no menace. The walls are the only thing judging you.',
    simulationSpeedMultiplier: 1,
    fullGame: false,
  },
  {
    id: Difficulty.EasyPeasy,
    label: 'EASY PEASY',
    description: 'Full systems, half speed. Danger has been asked to walk.',
    simulationSpeedMultiplier: 0.5,
    fullGame: true,
  },
  {
    id: Difficulty.Normal,
    label: 'NORMAL',
    description: 'Factory settings. The maze cheats only the approved amount.',
    simulationSpeedMultiplier: 1,
    fullGame: true,
  },
  {
    id: Difficulty.Overclocked,
    label: 'OVERCLOCKED',
    description: 'Everything at 150%. Warranty status: extremely void.',
    simulationSpeedMultiplier: 1.5,
    fullGame: true,
  },
]

export const DEFAULT_DIFFICULTY = Difficulty.Normal

export function parseDifficulty(value: string | null): DifficultyId | null {
  return DIFFICULTY_PRESETS.find((preset) => preset.id === value)?.id ?? null
}

export function getDifficultyPreset(difficulty: DifficultyId): DifficultyPreset {
  const preset = DIFFICULTY_PRESETS.find((candidate) => candidate.id === difficulty)

  if (preset === undefined) {
    throw new RangeError(`Unknown difficulty: ${difficulty}`)
  }

  return preset
}
