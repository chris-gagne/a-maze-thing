export interface StageCoinAward {
  baseCoins: number
  bonusCoins: number
  ambushBonusCoins: number
  awardedCoins: number
  coinMonger: boolean
  survivedAmbush: boolean
}

export interface StageChallengeState {
  ambusherPlaced: boolean
  ambusherRevealed: boolean
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

  return {
    baseCoins: collectedCoins,
    bonusCoins,
    ambushBonusCoins,
    awardedCoins: collectedCoins + bonusCoins + ambushBonusCoins,
    coinMonger,
    survivedAmbush,
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`)
  }
}