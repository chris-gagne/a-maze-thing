export const INITIAL_LIVES = 1
export const MAX_LIVES = 2

export const DamageSource = {
  Ambusher: 'ambusher',
  Hunter: 'hunter',
  Spike: 'spike',
  Wanderer: 'wanderer',
} as const

export type DamageSource = typeof DamageSource[keyof typeof DamageSource]