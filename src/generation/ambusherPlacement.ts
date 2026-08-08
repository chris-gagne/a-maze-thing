import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

export interface AmbusherPlacement {
  cellIndex: number
  branchIndices: number[]
}

const FIRST_AMBUSHER_STAGE = 11
const MINIMUM_BRANCH_LENGTH = 5

export function placeAmbusher(
  maze: Maze,
  stageNumber: number,
  seed: number,
  reservedIndices: Iterable<number> = [],
): AmbusherPlacement | null {
  if (!Number.isInteger(stageNumber) || stageNumber < 1) {
    throw new RangeError('Stage number must be a positive integer.')
  }

  if (stageNumber < FIRST_AMBUSHER_STAGE) {
    return null
  }

  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set([entranceIndex, exitIndex, ...reservedIndices])
  const entranceDistances = getDistances(maze, entranceIndex)
  const candidates = maze.cells.flatMap((_, index) => {
    const branchIndices = traceDeadEndBranch(maze, index)
    return entranceDistances[index] > 5
      && branchIndices.length >= MINIMUM_BRANCH_LENGTH
      && branchIndices.every((branchIndex) => !reserved.has(branchIndex))
      ? [{ cellIndex: index, branchIndices }]
      : []
  })

  if (candidates.length === 0) {
    return null
  }

  const maximumDepth = Math.max(...candidates.map((candidate) => candidate.branchIndices.length))
  const deepestCandidates = candidates.filter((candidate) => {
    return candidate.branchIndices.length === maximumDepth
  })
  const random = createSeededRandom(seed)
  return deepestCandidates[Math.floor(random() * deepestCandidates.length)]
}

export function traceDeadEndBranch(maze: Maze, leafIndex: number): number[] {
  const leafNeighbors = getOpenNeighborIndices(maze, leafIndex)
  if (leafNeighbors.length !== 1) {
    return []
  }

  const branchIndices = [leafIndex]
  let previousIndex = leafIndex
  let currentIndex = leafNeighbors[0]

  while (getOpenNeighborIndices(maze, currentIndex).length === 2) {
    branchIndices.push(currentIndex)
    const nextIndex = getOpenNeighborIndices(maze, currentIndex)
      .find((neighborIndex) => neighborIndex !== previousIndex)

    if (nextIndex === undefined) {
      break
    }

    previousIndex = currentIndex
    currentIndex = nextIndex
  }

  return getOpenNeighborIndices(maze, currentIndex).length >= 3 ? branchIndices : []
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