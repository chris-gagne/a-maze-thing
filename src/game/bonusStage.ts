export const BONUS_STAGE_INTERVAL = 10
export const BONUS_STAGE_DURATION_SECONDS = 60
export const BONUS_STAGE_GENERATION_STAGE = 50
export const BONUS_STAGE_PLAYER_SPEED_MULTIPLIER = 1.5
export const BONUS_STAGE_TOTAL_TARGETS = 20
export const BONUS_STAGE_BASE_GAIN_PERCENT = 50
export const BONUS_STAGE_CAPTURE_GAIN_PERCENT = 25

export const BonusCountdownPhase = {
  Normal: 'normal',
  Warning: 'warning',
  Danger: 'danger',
  Complete: 'complete',
} as const

export type BonusCountdownPhase = typeof BonusCountdownPhase[keyof typeof BonusCountdownPhase]

export interface BonusStageAward {
  collectedCoins: number
  capturedTargets: number
  multiplier: number
  awardedCoins: number
}

export function isBonusStage(stageNumber: number): boolean {
  assertPositiveInteger(stageNumber, 'Stage number')
  return stageNumber % BONUS_STAGE_INTERVAL === 0
}

export function getBonusCountdownPhase(secondsRemaining: number): BonusCountdownPhase {
  assertNonnegativeNumber(secondsRemaining, 'Seconds remaining')

  if (secondsRemaining <= 0) return BonusCountdownPhase.Complete
  if (secondsRemaining <= 5) return BonusCountdownPhase.Danger
  if (secondsRemaining <= 15) return BonusCountdownPhase.Warning
  return BonusCountdownPhase.Normal
}

export function calculateBonusStageAward(
  collectedCoins: number,
  capturedTargets: number,
): BonusStageAward {
  assertNonnegativeInteger(collectedCoins, 'Collected coins')
  assertNonnegativeInteger(capturedTargets, 'Captured targets')

  if (capturedTargets > BONUS_STAGE_TOTAL_TARGETS) {
    throw new RangeError(`Captured targets cannot exceed ${BONUS_STAGE_TOTAL_TARGETS}.`)
  }

  const multiplier = getBonusSignalGainPercent(capturedTargets) / 100
  return {
    collectedCoins,
    capturedTargets,
    multiplier,
    awardedCoins: Math.floor(collectedCoins * multiplier),
  }
}

export function getBonusSignalGainPercent(capturedTargets: number): number {
  assertNonnegativeInteger(capturedTargets, 'Captured targets')
  if (capturedTargets > BONUS_STAGE_TOTAL_TARGETS) {
    throw new RangeError(`Captured targets cannot exceed ${BONUS_STAGE_TOTAL_TARGETS}.`)
  }
  return BONUS_STAGE_BASE_GAIN_PERCENT + capturedTargets * BONUS_STAGE_CAPTURE_GAIN_PERCENT
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer.`)
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`)
  }
}

function assertNonnegativeNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative finite number.`)
  }
}