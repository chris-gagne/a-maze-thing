import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

export function placeBonusTargets(
  maze: Maze,
  count: number,
  seed: number,
  reservedIndices: Iterable<number> = [],
): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError('Bonus target count must be a nonnegative integer.')
  }

  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set([entranceIndex, exitIndex, ...reservedIndices])
  const available = maze.cells
    .map((_, index) => index)
    .filter((index) => !reserved.has(index))

  if (available.length < count) {
    throw new RangeError(`Maze has only ${available.length} safe cells for ${count} bonus targets.`)
  }

  const random = createSeededRandom(seed)
  const deadEnds = shuffle(
    available.filter((index) => getOpenNeighborIndices(maze, index).length === 1),
    random,
  )
  const otherCells = shuffle(
    available.filter((index) => getOpenNeighborIndices(maze, index).length !== 1),
    random,
  )

  return [...deadEnds, ...otherCells].slice(0, count).sort((left, right) => left - right)
}

function shuffle(values: number[], random: () => number): number[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = values[index]
    values[index] = values[swapIndex]
    values[swapIndex] = value
  }
  return values
}