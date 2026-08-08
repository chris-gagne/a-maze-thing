export interface StageCoinAward {
  baseCoins: number
  bonusCoins: number
  ambushBonusCoins: number
  wandererBonusCoins: number
  awardedCoins: number
  coinMonger: boolean
  survivedAmbush: boolean
  evadedWanderer: boolean
}

export interface StageChallengeState {
  ambusherPlaced: boolean
  ambusherRevealed: boolean
  wandererSpawned?: boolean
  wandererDeparted?: boolean
}

export function calculateStageCoinAward(
  collectedCoins: number,
  remainingCoins: number,
  stageComplete: boolean,
  challenge: StageChallengeState = { ambusherPlaced: false, ambusherRevealed: false },
): StageCoinAward {
  assertNonnegativeInteger(collectedCoins, 'Collected coins')
  assertNonnegativeInteger(remainingCoins, 'Remaining coins')

  const coinMonger = stageComplete && collectedCoins > 0 && remainingCoins === 0
  const bonusCoins = coinMonger ? collectedCoins : 0
  const survivedAmbush = stageComplete && challenge.ambusherPlaced && challenge.ambusherRevealed
  const ambushBonusCoins = survivedAmbush ? 25 : 0
  const evadedWanderer = stageComplete
    && challenge.wandererSpawned === true
    && challenge.wandererDeparted !== true
  const wandererBonusCoins = evadedWanderer ? 25 : 0

  return {
    baseCoins: collectedCoins,
    bonusCoins,
    ambushBonusCoins,
    wandererBonusCoins,
    awardedCoins: collectedCoins + bonusCoins + ambushBonusCoins + wandererBonusCoins,
    coinMonger,
    survivedAmbush,
    evadedWanderer,
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`)
  }
}