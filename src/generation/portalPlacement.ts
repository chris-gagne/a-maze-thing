import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

export function placePortals(
  maze: Maze,
  seed: number,
  reservedIndices: Iterable<number> = [],
): number[] {
  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set([entranceIndex, exitIndex, ...reservedIndices])
  const entranceDistances = getDistances(maze, entranceIndex)
  const exitDistances = getDistances(maze, exitIndex)
  const random = createSeededRandom(seed)
  const candidates = maze.cells
    .map((_, index) => index)
    .filter((index) => {
      return !reserved.has(index)
        && entranceDistances[index] >= 3
        && exitDistances[index] >= 2
        && getOpenNeighborIndices(maze, index).length === 1
    })

  shuffle(candidates, random)
  return candidates.slice(0, getPortalCountForSize(maze.cells.length)).sort((left, right) => left - right)
}

export function getPortalCountForSize(cellCount: number): number {
  if (cellCount >= 150) return 3
  if (cellCount >= 100) return 2
  return 1
}

function getDistances(maze: Maze, startIndex: number): number[] {
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

function shuffle<T>(values: T[], random: () => number): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = values[index]
    values[index] = values[swapIndex]
    values[swapIndex] = value
  }
}