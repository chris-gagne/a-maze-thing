import { describe, expect, it } from 'vitest'
import { createCoinPlacement, placeCoins } from './coinPlacement'
import { generateMaze, generatePerfectMaze, toIndex } from './maze'

describe('placeCoins', () => {
  it('is deterministic and varies with its seed', () => {
    const maze = generatePerfectMaze(11, 9, 704)
    expect(placeCoins(maze, 91)).toEqual(placeCoins(maze, 91))
    expect(placeCoins(maze, 91)).not.toEqual(placeCoins(maze, 92))
  })

  it('places a bounded mix of coins only on valid, non-reserved cells', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generatePerfectMaze(11, 9, seed)
      const coins = placeCoins(maze, seed ^ 0xc01dcafe)
      const uniqueCoins = new Set(coins)
      const availableCells = maze.cells.length - 2
      const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
      const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)

      expect(uniqueCoins.size).toBe(coins.length)
      expect(coins.every((index) => index >= 0 && index < maze.cells.length)).toBe(true)
      expect(uniqueCoins.has(entranceIndex)).toBe(false)
      expect(uniqueCoins.has(exitIndex)).toBe(false)
      expect(coins.length).toBeGreaterThanOrEqual(Math.ceil(availableCells * 0.52))
      expect(coins.length).toBeLessThanOrEqual(Math.floor(availableCells * 0.78))
    }
  })

  it('creates deterministic high-value clusters around braided loops', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(15, 11, seed)
      const placement = createCoinPlacement(maze, seed ^ 0xc01dcafe)
      const repeated = createCoinPlacement(maze, seed ^ 0xc01dcafe)
      const coins = new Set(placement.indices)
      const loopRegion = getLoopRegion(maze)
      const availableCells = maze.cells.length - 2
      const minimumCoinCount = Math.ceil(availableCells * 0.52)

      expect(placement).toEqual(repeated)
      expect(placement.loopAnchors.length).toBe(maze.braids.length)
      expect(placement.loopAnchors.every((index) => coins.has(index))).toBe(true)
      expect(placement.loopAnchors.every((index) => loopRegion.has(index))).toBe(true)

      const coinsNearLoops = placement.indices.filter((index) => loopRegion.has(index)).length
      expect(coinsNearLoops).toBeGreaterThanOrEqual(Math.min(loopRegion.size, Math.ceil(minimumCoinCount * 0.35)))
    }
  })

  it('preserves density and loop anchors after reserving occupied cells', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(15, 11, seed)
      const initial = createCoinPlacement(maze, seed ^ 0xc01dcafe)
      const reserved = initial.indices.slice(0, 4)
      const placement = createCoinPlacement(maze, seed ^ 0xc01dcafe, reserved)
      const repeated = createCoinPlacement(maze, seed ^ 0xc01dcafe, reserved)
      const coins = new Set(placement.indices)
      const availableCells = maze.cells.length - 2 - new Set(reserved).size

      expect(placement).toEqual(repeated)
      expect(placement.indices.every((index) => !reserved.includes(index))).toBe(true)
      expect(placement.indices.length).toBeGreaterThanOrEqual(Math.ceil(availableCells * 0.52))
      expect(placement.indices.length).toBeLessThanOrEqual(Math.floor(availableCells * 0.78))
      expect(placement.loopAnchors.length).toBe(maze.braids.length)
      expect(placement.loopAnchors.every((index) => coins.has(index))).toBe(true)
    }
  })
})

function getLoopRegion(maze: ReturnType<typeof generateMaze>): Set<number> {
  const region = new Set(maze.braids.flatMap((braid) => braid.pathIndices))

  for (const index of [...region]) {
    const cell = maze.cells[index]
    const neighbors = [
      [cell.x + 1, cell.y],
      [cell.x - 1, cell.y],
      [cell.x, cell.y + 1],
      [cell.x, cell.y - 1],
    ]

    for (const [x, y] of neighbors) {
      if (x >= 0 && x < maze.width && y >= 0 && y < maze.height) {
        region.add(toIndex(x, y, maze.width))
      }
    }
  }

  return region
}