import { describe, expect, it } from 'vitest'
import { getStageDimensions, getStageProfile } from './stageProgression'

describe('getStageDimensions', () => {
  it.each([
    [1, 11, 7],
    [3, 11, 7],
    [4, 13, 9],
    [10, 17, 13],
    [11, 17, 13],
    [20, 23, 19],
    [21, 23, 19],
    [30, 29, 25],
    [31, 29, 25],
    [40, 35, 31],
    [41, 35, 31],
    [49, 39, 35],
    [50, 41, 37],
    [500, 41, 37],
  ])('returns the configured dimensions at Stage %i', (stage, width, height) => {
    expect(getStageDimensions(stage)).toEqual({ width, height })
  })

  it('grows monotonically through Stage 50 and remains capped afterward', () => {
    let previous = getStageDimensions(1)

    for (let stage = 2; stage <= 100; stage += 1) {
      const current = getStageDimensions(stage)
      expect(current.width).toBeGreaterThanOrEqual(previous.width)
      expect(current.height).toBeGreaterThanOrEqual(previous.height)
      previous = current
    }

    expect(getStageDimensions(50)).toEqual(getStageDimensions(100))
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid stage number %s',
    (stage) => {
      expect(() => getStageDimensions(stage)).toThrow(RangeError)
    },
  )
})

describe('getStageProfile', () => {
  it.each([
    [1, 1, 2, 6, 12, 1],
    [10, 1, 4, 6, 12, 1],
    [20, 2, 11, 8, 18, 2],
    [30, 3, 22, 10, 24, 2],
    [40, 4, 38, 12, 32, 3],
    [50, 5, 61, 14, 40, 3],
  ])(
    'returns the Band %i topology at Stage %i',
    (stage, band, braidCount, minimumCycleLength, maximumCycleLength, maximumSharedLoopCells) => {
      expect(getStageProfile(stage)).toMatchObject({
        band,
        topology: {
          braidCount,
          minimumCycleLength,
          maximumCycleLength,
          maximumSharedLoopCells,
        },
      })
    },
  )

  it('increases topology targets across band caps', () => {
    const profiles = [10, 20, 30, 40, 50].map(getStageProfile)

    for (let index = 1; index < profiles.length; index += 1) {
      expect(profiles[index].topology.braidCount)
        .toBeGreaterThan(profiles[index - 1].topology.braidCount)
      expect(profiles[index].topology.maximumCycleLength)
        .toBeGreaterThan(profiles[index - 1].topology.maximumCycleLength)
    }
  })

  it('rotates deterministic post-cap profiles without changing dimensions', () => {
    expect(getStageProfile(50)).toMatchObject({
      width: 41,
      height: 37,
      variant: 'baseline',
      endpointProfile: 'diameter',
      hazardDensityMultiplier: 1,
    })
    expect(getStageProfile(51)).toMatchObject({
      width: 41,
      height: 37,
      variant: 'compact-loops',
      endpointProfile: 'boundary-farthest',
      hazardDensityMultiplier: 0.75,
    })
    expect(getStageProfile(52)).toMatchObject({
      width: 41,
      height: 37,
      variant: 'long-loops',
      endpointProfile: 'diameter',
      hazardDensityMultiplier: 1,
    })
    expect(getStageProfile(53)).toMatchObject({
      width: 41,
      height: 37,
      variant: 'baseline',
      endpointProfile: 'boundary-farthest',
      hazardDensityMultiplier: 1.25,
    })
    expect(getStageProfile(54)).toMatchObject({
      variant: 'compact-loops',
      endpointProfile: 'diameter',
      hazardDensityMultiplier: 0.75,
    })
  })
})