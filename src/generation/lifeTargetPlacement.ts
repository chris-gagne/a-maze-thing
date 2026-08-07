import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { INITIAL_LIVES } from '../game/lifeRules'
import { createSeededRandom } from './random'

const SPAWN_CHANCE = 0.22

export function placeLifeTarget(
  maze: Maze,
  stageNumber: number,
  lives: number,
  seed: number,
  reservedIndices: Iterable<number> = [],
): number | null {
  if (stageNumber < 2 || lives !== INITIAL_LIVES) {
    return null
  }

  const random = createSeededRandom(seed)
  if (stageNumber > 2 && random() >= SPAWN_CHANCE) {
    return null
  }

  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set(reservedIndices)
  const distances = getDistances(maze, entranceIndex)
  const maximumDistance = Math.max(...distances)
  const minimumDistance = Math.ceil(maximumDistance * 0.55)
  const candidates = maze.cells
    .map((_, index) => index)
    .filter((index) => {
      return index !== entranceIndex
        && index !== exitIndex
        && !reserved.has(index)
        && distances[index] >= minimumDistance
    })

  return candidates.length === 0
    ? null
    : candidates[Math.floor(random() * candidates.length)]
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