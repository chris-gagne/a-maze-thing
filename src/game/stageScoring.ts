export interface StageCoinAward {
  baseCoins: number
  bonusCoins: number
  awardedCoins: number
  coinMonger: boolean
}

export function calculateStageCoinAward(
  collectedCoins: number,
  remainingCoins: number,
  stageComplete: boolean,
): StageCoinAward {
  assertNonnegativeInteger(collectedCoins, 'Collected coins')
  assertNonnegativeInteger(remainingCoins, 'Remaining coins')

  const coinMonger = stageComplete && collectedCoins > 0 && remainingCoins === 0
  const bonusCoins = coinMonger ? collectedCoins : 0

  return {
    baseCoins: collectedCoins,
    bonusCoins,
    awardedCoins: collectedCoins + bonusCoins,
    coinMonger,
  }
}

function assertNonnegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`)
  }
}