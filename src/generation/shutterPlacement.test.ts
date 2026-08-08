import { describe, expect, it } from 'vitest'
import { getEdgeKey, SHUTTER_CYCLE_SECONDS } from '../game/shutterTiming'
import { getStageProfile } from '../game/stageProgression'
import { generateMaze, getOpenNeighborIndices, toIndex, type Maze } from './maze'
import { placeShutters } from './shutterPlacement'

describe('placeShutters', () => {
  it('keeps stages before Stage 6 clear', () => {
    expect(placeShutters(createStageMaze(5, 12), 5, 90)).toEqual([])
  })

  it.each([
    [6, 1],
    [16, 2],
    [31, 3],
  ])('places the Stage %i band target on safe braid edges', (stageNumber, targetCount) => {
    for (let seed = 0; seed < 40; seed += 1) {
      const maze = createStageMaze(stageNumber, seed)
      const shutters = placeShutters(maze, stageNumber, seed ^ 0x5a477e)
      const braidEdges = new Set(maze.braids.map((braid) => getEdgeKey(braid.fromIndex, braid.toIndex)))
      const usedEndpoints = new Set<number>()

      expect(shutters).toHaveLength(targetCount)
      for (const shutter of shutters) {
        expect(braidEdges.has(getEdgeKey(shutter.fromCellIndex, shutter.toCellIndex))).toBe(true)
        expect(usedEndpoints.has(shutter.fromCellIndex)).toBe(false)
        expect(usedEndpoints.has(shutter.toCellIndex)).toBe(false)
        expect(shutter.phaseOffsetSeconds).toBeGreaterThanOrEqual(0)
        expect(shutter.phaseOffsetSeconds).toBeLessThan(SHUTTER_CYCLE_SECONDS)
        usedEndpoints.add(shutter.fromCellIndex)
        usedEndpoints.add(shutter.toCellIndex)
      }
      expect(canReachExitWithoutShutters(maze, shutters)).toBe(true)
    }
  })

  it('is deterministic and varies selection or timing across seeds', () => {
    const maze = createStageMaze(31, 4271)
    const first = placeShutters(maze, 31, 7)

    expect(first).toEqual(placeShutters(maze, 31, 7))
    expect(placeShutters(maze, 31, 8)).not.toEqual(first)
  })

  it.each([0, -1, 1.5, Number.NaN])('rejects invalid stage number %s', (stageNumber) => {
    expect(() => placeShutters(createStageMaze(6, 2), stageNumber, 9)).toThrow(RangeError)
  })
})

function createStageMaze(stageNumber: number, seed: number): Maze {
  const profile = getStageProfile(stageNumber)
  return generateMaze(profile.width, profile.height, seed, {
    ...profile.topology,
    endpointProfile: profile.endpointProfile,
  })
}

function canReachExitWithoutShutters(
  maze: Maze,
  shutters: readonly { fromCellIndex: number, toCellIndex: number }[],
): boolean {
  const blockedEdges = new Set(shutters.map((shutter) => {
    return getEdgeKey(shutter.fromCellIndex, shutter.toCellIndex)
  }))
  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const pending = [entranceIndex]
  const visited = new Set(pending)

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const currentIndex = pending[cursor]
    for (const neighborIndex of getOpenNeighborIndices(maze, currentIndex)) {
      if (visited.has(neighborIndex) || blockedEdges.has(getEdgeKey(currentIndex, neighborIndex))) {
        continue
      }
      visited.add(neighborIndex)
      pending.push(neighborIndex)
    }
  }

  return visited.has(exitIndex)
}
