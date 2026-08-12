import { describe, expect, it } from 'vitest'
import {
  BONUS_STAGE_TOTAL_TARGETS,
  BonusCountdownPhase,
  calculateBonusStageAward,
  getBonusSignalGainPercent,
  getBonusCountdownPhase,
  isBonusStage,
} from './bonusStage'

describe('bonus stage rules', () => {
  it('identifies every tenth stage', () => {
    expect(isBonusStage(9)).toBe(false)
    expect(isBonusStage(10)).toBe(true)
    expect(isBonusStage(20)).toBe(true)
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid stage number %s', (stageNumber) => {
    expect(() => isBonusStage(stageNumber)).toThrow(RangeError)
  })

  it.each([
    [60, BonusCountdownPhase.Normal],
    [15.01, BonusCountdownPhase.Normal],
    [15, BonusCountdownPhase.Warning],
    [5.01, BonusCountdownPhase.Warning],
    [5, BonusCountdownPhase.Danger],
    [0.01, BonusCountdownPhase.Danger],
    [0, BonusCountdownPhase.Complete],
  ])('maps %s seconds to the %s countdown phase', (seconds, phase) => {
    expect(getBonusCountdownPhase(seconds as number)).toBe(phase)
  })

  it('awards 50 percent plus 25 percentage points for every captured target', () => {
    expect(calculateBonusStageAward(11, 0)).toMatchObject({ multiplier: 0.5, awardedCoins: 5 })
    expect(calculateBonusStageAward(11, 1)).toMatchObject({ multiplier: 0.75, awardedCoins: 8 })
    expect(calculateBonusStageAward(11, 20)).toMatchObject({ multiplier: 5.5, awardedCoins: 60 })
  })

  it('reports Signal Gain as a percentage from 50 through 550', () => {
    expect(getBonusSignalGainPercent(0)).toBe(50)
    expect(getBonusSignalGainPercent(1)).toBe(75)
    expect(getBonusSignalGainPercent(20)).toBe(550)
  })

  it('rejects invalid coin and target counts', () => {
    expect(() => calculateBonusStageAward(-1, 0)).toThrow(RangeError)
    expect(() => calculateBonusStageAward(1.5, 0)).toThrow(RangeError)
    expect(() => calculateBonusStageAward(1, BONUS_STAGE_TOTAL_TARGETS + 1)).toThrow(RangeError)
  })
})