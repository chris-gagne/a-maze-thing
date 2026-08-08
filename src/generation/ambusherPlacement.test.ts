import { describe, expect, it } from 'vitest'
import { generateMaze, getOpenNeighborIndices, toIndex } from './maze'
import { placeAmbusher, traceDeadEndBranch } from './ambusherPlacement'

describe('placeAmbusher', () => {
  it('does not place Ambushers before Stage 11', () => {
    const maze = generateMaze(23, 19, 4271)
    expect(placeAmbusher(maze, 10, 99)).toBeNull()
  })

  it('is deterministic and selects only strict five-tile dead-end branches', () => {
    let placementCount = 0

    for (let seed = 0; seed < 50; seed += 1) {
      const maze = generateMaze(23, 19, seed)
      const placement = placeAmbusher(maze, 11, seed ^ 0xa8b05)
      expect(placement).toEqual(placeAmbusher(maze, 11, seed ^ 0xa8b05))

      if (placement === null) {
        continue
      }

      placementCount += 1
      expect(getOpenNeighborIndices(maze, placement.cellIndex)).toHaveLength(1)
      expect(distanceBetween(maze, toIndex(maze.entrance.x, maze.entrance.y, maze.width), placement.cellIndex))
        .toBeGreaterThan(5)
      expect(placement.branchIndices).toEqual(traceDeadEndBranch(maze, placement.cellIndex))
      expect(placement.branchIndices.length).toBeGreaterThanOrEqual(5)
    }

    expect(placementCount).toBeGreaterThan(0)
  })

  it('rejects branches containing reserved cells', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(23, 19, seed)
      const placement = placeAmbusher(maze, 11, seed)
      if (placement === null) continue

      expect(placeAmbusher(maze, 11, seed, placement.branchIndices)).not.toEqual(placement)
      return
    }

    throw new Error('Expected at least one qualifying placement fixture.')
  })

  it('never uses the entrance or exit', () => {
    const maze = generateMaze(23, 19, 4271)
    const placement = placeAmbusher(maze, 11, 99)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)

    expect(placement?.cellIndex).not.toBe(entranceIndex)
    expect(placement?.cellIndex).not.toBe(exitIndex)
  })

  it.each([0, -1, 1.5])('rejects invalid stage number %s', (stageNumber) => {
    expect(() => placeAmbusher(generateMaze(11, 7, 1), stageNumber, 1)).toThrow(RangeError)
  })
})

function distanceBetween(maze: ReturnType<typeof generateMaze>, startIndex: number, targetIndex: number): number {
  const distances = Array<number>(maze.cells.length).fill(-1)
  const pending = [startIndex]
  distances[startIndex] = 0
  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const current = pending[cursor]
    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (distances[neighbor] === -1) {
        distances[neighbor] = distances[current] + 1
        pending.push(neighbor)
      }
    }
  }
  return distances[targetIndex]
}