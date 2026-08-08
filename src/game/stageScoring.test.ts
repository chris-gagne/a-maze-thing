import { describe, expect, it } from 'vitest'
import { calculateStageCoinAward } from './stageScoring'

describe('calculateStageCoinAward', () => {
  it('doubles a completed stage when every positive coin is collected', () => {
    expect(calculateStageCoinAward(40, 0, true)).toEqual({
      baseCoins: 40,
      bonusCoins: 40,
      ambushBonusCoins: 0,
      wandererBonusCoins: 0,
      awardedCoins: 80,
      coinMonger: true,
      survivedAmbush: false,
      evadedWanderer: false,
    })
  })

  it('awards only raw coins for a partial clear', () => {
    expect(calculateStageCoinAward(30, 10, true)).toEqual({
      baseCoins: 30,
      bonusCoins: 0,
      ambushBonusCoins: 0,
      wandererBonusCoins: 0,
      awardedCoins: 30,
      coinMonger: false,
      survivedAmbush: false,
      evadedWanderer: false,
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
      ambushBonusCoins: 0,
      wandererBonusCoins: 0,
      awardedCoins: 0,
      coinMonger: false,
      survivedAmbush: false,
      evadedWanderer: false,
    })
  })

  it('calculates only the stage award and cannot multiply carried score', () => {
    const carriedScore = 125
    const award = calculateStageCoinAward(20, 0, true)

    expect(carriedScore + award.awardedCoins).toBe(165)
  })

  it('adds a flat 25 coins after exposing the Ambusher and escaping', () => {
    expect(calculateStageCoinAward(20, 0, true, {
      ambusherPlaced: true,
      ambusherRevealed: true,
    })).toEqual({
      baseCoins: 20,
      bonusCoins: 20,
      ambushBonusCoins: 25,
      wandererBonusCoins: 0,
      awardedCoins: 65,
      coinMonger: true,
      survivedAmbush: true,
      evadedWanderer: false,
    })
  })

  it('adds a flat 25 coins when a spawned Wanderer remains in the maze', () => {
    expect(calculateStageCoinAward(20, 0, true, {
      ambusherPlaced: true,
      ambusherRevealed: true,
      wandererSpawned: true,
      wandererDeparted: false,
    })).toEqual({
      baseCoins: 20,
      bonusCoins: 20,
      ambushBonusCoins: 25,
      wandererBonusCoins: 25,
      awardedCoins: 90,
      coinMonger: true,
      survivedAmbush: true,
      evadedWanderer: true,
    })
  })

  it('does not award Wanderer evasion before spawn, after departure, or before escape', () => {
    expect(calculateStageCoinAward(20, 5, true, {
      ambusherPlaced: false,
      ambusherRevealed: false,
      wandererSpawned: false,
      wandererDeparted: false,
    }).wandererBonusCoins).toBe(0)
    expect(calculateStageCoinAward(20, 5, true, {
      ambusherPlaced: false,
      ambusherRevealed: false,
      wandererSpawned: true,
      wandererDeparted: true,
    }).wandererBonusCoins).toBe(0)
    expect(calculateStageCoinAward(20, 5, false, {
      ambusherPlaced: false,
      ambusherRevealed: false,
      wandererSpawned: true,
      wandererDeparted: false,
    }).wandererBonusCoins).toBe(0)
  })

  it('does not award the Ambusher bonus while hidden or before escape', () => {
    expect(calculateStageCoinAward(20, 5, true, {
      ambusherPlaced: true,
      ambusherRevealed: false,
    }).ambushBonusCoins).toBe(0)
    expect(calculateStageCoinAward(20, 5, false, {
      ambusherPlaced: true,
      ambusherRevealed: true,
    }).ambushBonusCoins).toBe(0)
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