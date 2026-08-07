import { describe, expect, it } from 'vitest'
import { generateMaze, getOpenNeighborIndices, toIndex } from './maze'
import { getPortalCountForSize, placePortals } from './portalPlacement'

describe('placePortals', () => {
  it('scales its target count with maze size', () => {
    expect(getPortalCountForSize(77)).toBe(1)
    expect(getPortalCountForSize(100)).toBe(2)
    expect(getPortalCountForSize(150)).toBe(3)
  })

  it('deterministically selects distant dead ends across supported dimensions', () => {
    const dimensions = [[11, 7], [13, 9], [15, 11]] as const

    for (const [width, height] of dimensions) {
      for (let seed = 0; seed < 100; seed += 1) {
        const maze = generateMaze(width, height, seed)
        const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
        const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
        const entranceDistances = getDistances(maze, entranceIndex)
        const exitDistances = getDistances(maze, exitIndex)
        const portals = placePortals(maze, seed ^ 0xa4dfed5)

        expect(portals).toEqual(placePortals(maze, seed ^ 0xa4dfed5))
        expect(new Set(portals).size).toBe(portals.length)
        expect(portals).toHaveLength(getPortalCountForSize(maze.cells.length))

        for (const index of portals) {
          expect(index).not.toBe(entranceIndex)
          expect(index).not.toBe(exitIndex)
          expect(getOpenNeighborIndices(maze, index)).toHaveLength(1)
          expect(entranceDistances[index]).toBeGreaterThanOrEqual(3)
          expect(exitDistances[index]).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('excludes reserved dead ends without weakening eligibility', () => {
    const maze = generateMaze(15, 11, 410)
    const initial = placePortals(maze, 82)

    expect(initial.length).toBeGreaterThan(0)
    expect(placePortals(maze, 82, initial).every((index) => !initial.includes(index))).toBe(true)
  })
})

function getDistances(maze: ReturnType<typeof generateMaze>, startIndex: number): number[] {
  const distances = Array<number>(maze.cells.length).fill(-1)
  const pending = [startIndex]
  distances[startIndex] = 0

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const currentIndex = pending[cursor]

    for (const neighborIndex of getOpenNeighborIndices(maze, currentIndex)) {
      if (distances[neighborIndex] === -1) {
        distances[neighborIndex] = distances[currentIndex] + 1
        pending.push(neighborIndex)
      }
    }
  }

  return distances
}