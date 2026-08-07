import { describe, expect, it } from 'vitest'
import { calculateStageCoinAward } from './stageScoring'

describe('calculateStageCoinAward', () => {
  it('doubles a completed stage when every positive coin is collected', () => {
    expect(calculateStageCoinAward(40, 0, true)).toEqual({
      baseCoins: 40,
      bonusCoins: 40,
      awardedCoins: 80,
      coinMonger: true,
    })
  })

  it('awards only raw coins for a partial clear', () => {
    expect(calculateStageCoinAward(30, 10, true)).toEqual({
      baseCoins: 30,
      bonusCoins: 0,
      awardedCoins: 30,
      coinMonger: false,
    })
  })

  it('does not award the bonus before the exit is reached', () => {
    expect(calculateStageCoinAward(40, 0, false).awardedCoins).toBe(40)
    expect(calculateStageCoinAward(40, 0, false).coinMonger).toBe(false)
  })

  it('does not award a vacuous bonus for a zero-coin stage', () => {
    expect(calculateStageCoinAward(0, 0, true)).toEqual({
      baseCoins: 0,
      bonusCoins: 0,
      awardedCoins: 0,
      coinMonger: false,
    })
  })

  it('calculates only the stage award and cannot multiply carried score', () => {
    const carriedScore = 125
    const award = calculateStageCoinAward(20, 0, true)

    expect(carriedScore + award.awardedCoins).toBe(165)
  })

  it.each([
    [-1, 0],
    [1.5, 0],
    [0, -1],
    [0, 1.5],
  ])('rejects invalid coin counts (%s, %s)', (collectedCoins, remainingCoins) => {
    expect(() => calculateStageCoinAward(collectedCoins, remainingCoins, true)).toThrow(RangeError)
  })
})