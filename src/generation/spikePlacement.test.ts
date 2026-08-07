import { describe, expect, it } from 'vitest'
import { createCoinPlacement } from './coinPlacement'
import { placeLifeTarget } from './lifeTargetPlacement'
import { generateMaze, getOpenNeighborIndices, toIndex } from './maze'
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
      const lifeTargetIndex = placeLifeTarget(maze, 8, 1, seed ^ 0x1fef00d)
      const spikes = placeSpikes(
        maze,
        8,
        seed ^ 0x5a1ce5,
        lifeTargetIndex === null ? [] : [lifeTargetIndex],
      )
      const occupied = new Set(spikes.map((spike) => spike.cellIndex))
      if (lifeTargetIndex !== null) {
        occupied.add(lifeTargetIndex)
      }
      const placement = createCoinPlacement(maze, seed ^ 0xc01dcafe, occupied)
      const coins = new Set(placement.indices)
      const availableCells = maze.cells.length - 2 - occupied.size

      expect(placement.indices.every((index) => !occupied.has(index))).toBe(true)
      expect(placement.indices.length).toBeGreaterThanOrEqual(Math.ceil(availableCells * 0.52))
      expect(placement.indices.length).toBeLessThanOrEqual(Math.floor(availableCells * 0.78))
      expect(placement.loopAnchors).toHaveLength(maze.braids.length)
      expect(placement.loopAnchors.every((index) => coins.has(index))).toBe(true)
    }
  })
})