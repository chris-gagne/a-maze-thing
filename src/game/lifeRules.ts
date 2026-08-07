export const INITIAL_LIVES = 1
export const MAX_LIVES = 2

export const DamageSource = {
  Hunter: 'hunter',
  Spike: 'spike',
} as const

export type DamageSource = typeof DamageSource[keyof typeof DamageSource]