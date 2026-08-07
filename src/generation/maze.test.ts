import { describe, expect, it } from 'vitest'
import {
  generateMaze,
  generatePerfectMaze,
  getBraidCountForSize,
  getOpenNeighborIndices,
  toIndex,
  Wall,
} from './maze'

describe('generatePerfectMaze', () => {
  it('is deterministic for a given size and seed', () => {
    expect(generatePerfectMaze(12, 9, 4271)).toEqual(generatePerfectMaze(12, 9, 4271))
    expect(generatePerfectMaze(12, 9, 4271)).not.toEqual(generatePerfectMaze(12, 9, 4272))
  })

  it('produces connected trees with reciprocal walls across many seeds', () => {
    for (let seed = 0; seed < 250; seed += 1) {
      const width = 4 + (seed % 13)
      const height = 4 + ((seed * 7) % 11)
      const maze = generatePerfectMaze(width, height, seed)
      const visited = traverse(maze, 0)
      const edgeCount = maze.cells.reduce(
        (total, _, index) => total + getOpenNeighborIndices(maze, index).length,
        0,
      ) / 2

      expect(visited.size).toBe(width * height)
      expect(edgeCount).toBe(width * height - 1)

      for (const cell of maze.cells) {
        if (cell.x + 1 < width) {
          const east = maze.cells[toIndex(cell.x + 1, cell.y, width)]
          expect(Boolean(cell.walls & Wall.East)).toBe(Boolean(east.walls & Wall.West))
        }

        if (cell.y + 1 < height) {
          const south = maze.cells[toIndex(cell.x, cell.y + 1, width)]
          expect(Boolean(cell.walls & Wall.South)).toBe(Boolean(south.walls & Wall.North))
        }
      }
    }
  })

  it('places the entrance and exit at diameter endpoints', () => {
    for (let seed = 0; seed < 50; seed += 1) {
      const maze = generatePerfectMaze(10, 8, seed)
      const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
      const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
      const fromEntrance = distancesFrom(maze, entranceIndex)
      const diameter = fromEntrance[exitIndex]

      expect(Math.max(...fromEntrance)).toBe(diameter)
      expect(Math.max(...distancesFrom(maze, exitIndex))).toBe(diameter)
    }
  })
})

describe('generateMaze', () => {
  it('adds sparse deterministic braids according to maze size', () => {
    expect(getBraidCountForSize(77)).toBe(1)
    expect(getBraidCountForSize(100)).toBe(2)
    expect(getBraidCountForSize(150)).toBe(3)

    const maze = generateMaze(15, 11, 4271)
    expect(maze).toEqual(generateMaze(15, 11, 4271))
    expect(maze).not.toEqual(generateMaze(15, 11, 4272))
  })

  it('produces connected sparse graphs with valid recorded loops', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const width = 7 + (seed % 9)
      const height = 7 + ((seed * 5) % 5)
      const requestedBraids = getBraidCountForSize(width * height)
      const maze = generateMaze(width, height, seed)
      const edgeCount = maze.cells.reduce(
        (total, _, index) => total + getOpenNeighborIndices(maze, index).length,
        0,
      ) / 2

      expect(traverse(maze, 0).size).toBe(width * height)
      expect(maze.braids.length).toBeGreaterThan(0)
      expect(maze.braids.length).toBeLessThanOrEqual(requestedBraids)
      expect(edgeCount).toBe(width * height - 1 + maze.braids.length)
      expect(new Set(maze.braids.map((braid) => edgeKey(braid.fromIndex, braid.toIndex))).size)
        .toBe(maze.braids.length)

      for (const braid of maze.braids) {
        expect(braid.cycleLength).toBeGreaterThanOrEqual(6)
        expect(braid.cycleLength).toBeLessThanOrEqual(12)
        expect(braid.pathIndices.length).toBe(braid.cycleLength)
        expect(braid.pathIndices[0]).toBe(braid.fromIndex)
        expect(braid.pathIndices.at(-1)).toBe(braid.toIndex)
        expect(getOpenNeighborIndices(maze, braid.fromIndex)).toContain(braid.toIndex)
      }

      for (let left = 0; left < maze.braids.length; left += 1) {
        for (let right = left + 1; right < maze.braids.length; right += 1) {
          const rightCells = new Set(maze.braids[right].pathIndices)
          const overlap = maze.braids[left].pathIndices.filter((index) => rightCells.has(index))
          expect(overlap.length).toBeLessThanOrEqual(1)
        }
      }

      const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, width)
      const exitIndex = toIndex(maze.exit.x, maze.exit.y, width)
      expect(entranceIndex).not.toBe(exitIndex)
      expect(distancesFrom(maze, entranceIndex)[exitIndex]).toBeGreaterThan(0)
    }
  })

  it('can explicitly disable or cap braiding', () => {
    expect(generateMaze(15, 11, 91, { braidCount: 0 }).braids).toEqual([])
    expect(generateMaze(15, 11, 91, { braidCount: 1 }).braids.length).toBeLessThanOrEqual(1)
  })
})

function traverse(maze: ReturnType<typeof generatePerfectMaze>, startIndex: number): Set<number> {
  const visited = new Set([startIndex])
  const pending = [startIndex]

  while (pending.length > 0) {
    const current = pending.pop()!

    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        pending.push(neighbor)
      }
    }
  }

  return visited
}

function distancesFrom(maze: ReturnType<typeof generatePerfectMaze>, startIndex: number): number[] {
  const distances = Array<number>(maze.cells.length).fill(-1)
  const pending = [startIndex]
  distances[startIndex] = 0

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]

    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (distances[neighbor] === -1) {
        distances[neighbor] = distances[current] + 1
        pending.push(neighbor)
      }
    }
  }

  return distances
}

function edgeKey(left: number, right: number): string {
  return left < right ? `${left}:${right}` : `${right}:${left}`
}