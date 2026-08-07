import { describe, expect, it } from 'vitest'
import { createCoinPlacement } from './coinPlacement'
import { placeLifeTarget } from './lifeTargetPlacement'
import { generateMaze, getOpenNeighborIndices, toIndex } from './maze'
import { placePortals } from './portalPlacement'
import { placeSpikes } from './spikePlacement'

describe('placeSpikes', () => {
  it('keeps the first stage free of spikes', () => {
    const maze = generateMaze(11, 7, 20)
    expect(placeSpikes(maze, 1, 400)).toEqual([])
  })

  it('is deterministic and provides a safe waiting neighbor for every spike', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(11, 7, seed)
      const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
      const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
      const reservedIndex = Math.floor(maze.cells.length / 2)
      const spikes = placeSpikes(maze, 8, seed ^ 0x5afe, [reservedIndex])

      expect(spikes).toEqual(placeSpikes(maze, 8, seed ^ 0x5afe, [reservedIndex]))
      expect(spikes).toHaveLength(3)

      const spikeIndices = new Set(spikes.map((spike) => spike.cellIndex))
      expect(spikeIndices.has(entranceIndex)).toBe(false)
      expect(spikeIndices.has(exitIndex)).toBe(false)
      expect(spikeIndices.has(reservedIndex)).toBe(false)

      for (const spike of spikes) {
        const neighbors = getOpenNeighborIndices(maze, spike.cellIndex)
        expect(neighbors.some((index) => !spikeIndices.has(index))).toBe(true)
        expect(neighbors.every((index) => !spikeIndices.has(index))).toBe(true)
      }
    }
  })

  it('composes hazards and coins without overlaps or weakened placement guarantees', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(15, 11, seed)
      const portals = placePortals(maze, seed ^ 0xa4dfed5)
      const lifeTargetIndex = placeLifeTarget(maze, 8, 1, seed ^ 0x1fef00d, portals)
      const portalReservations = lifeTargetIndex === null
        ? portals
        : [...portals, lifeTargetIndex]
      const spikes = placeSpikes(
        maze,
        8,
        seed ^ 0x5a1ce5,
        portalReservations,
      )
      const occupied = new Set([
        ...portalReservations,
        ...spikes.map((spike) => spike.cellIndex),
      ])
      const placement = createCoinPlacement(maze, seed ^ 0xc01dcafe, occupied)
      const coins = new Set(placement.indices)
      const availableCells = maze.cells.length - 2 - occupied.size

      expect(placement.indices.every((index) => !occupied.has(index))).toBe(true)
      expect(portals.every((index) => index !== lifeTargetIndex)).toBe(true)
      expect(spikes.every((spike) => !portals.includes(spike.cellIndex))).toBe(true)
      expect(placement.indices.length).toBeGreaterThanOrEqual(Math.ceil(availableCells * 0.52))
      expect(placement.indices.length).toBeLessThanOrEqual(Math.floor(availableCells * 0.78))
      expect(placement.loopAnchors).toHaveLength(maze.braids.length)
      expect(placement.loopAnchors.every((index) => coins.has(index))).toBe(true)
    }
  })

  it('applies bounded post-cap density profiles deterministically', () => {
    const maze = generateMaze(41, 37, 4271)

    expect(placeSpikes(maze, 51, 9, [], 0.75)).toHaveLength(3)
    expect(placeSpikes(maze, 52, 9, [], 1)).toHaveLength(4)
    expect(placeSpikes(maze, 53, 9, [], 1.25)).toHaveLength(5)
    expect(placeSpikes(maze, 53, 9, [], 1.25))
      .toEqual(placeSpikes(maze, 53, 9, [], 1.25))
  })

  it.each([0.49, 1.51, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid density multiplier %s',
    (multiplier) => {
      const maze = generateMaze(11, 7, 20)
      expect(() => placeSpikes(maze, 8, 400, [], multiplier)).toThrow(RangeError)
    },
  )
})