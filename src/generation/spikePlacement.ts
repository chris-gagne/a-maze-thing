import { type SpikeState, SPIKE_CYCLE_SECONDS } from '../game/spikeTiming'
import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

export function placeSpikes(
  maze: Maze,
  stageNumber: number,
  seed: number,
  reservedIndices: Iterable<number> = [],
  densityMultiplier = 1,
): SpikeState[] {
  if (!Number.isFinite(densityMultiplier) || densityMultiplier < 0.5 || densityMultiplier > 1.5) {
    throw new RangeError('Spike density multiplier must be between 0.5 and 1.5.')
  }

  if (stageNumber < 2) {
    return []
  }

  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set([entranceIndex, exitIndex, ...reservedIndices])
  const entranceDistances = getDistances(maze, entranceIndex)
  const exitDistances = getDistances(maze, exitIndex)
  const random = createSeededRandom(seed)
  const candidates = shuffle(
    maze.cells
      .map((_, index) => index)
      .filter((index) => {
        return !reserved.has(index)
          && entranceDistances[index] >= 3
          && exitDistances[index] >= 2
          && getOpenNeighborIndices(maze, index).some((neighbor) => !reserved.has(neighbor))
      }),
    random,
  )
  const baselineCount = Math.min(1 + Math.floor((stageNumber - 2) / 3), 4)
  const targetCount = Math.max(1, Math.min(6, Math.round(baselineCount * densityMultiplier)))
  const selected: number[] = []

  for (const candidate of candidates) {
    if (selected.length >= targetCount) {
      break
    }

    const candidateNeighbors = new Set(getOpenNeighborIndices(maze, candidate))
    if (selected.some((index) => candidateNeighbors.has(index))) {
      continue
    }

    selected.push(candidate)
  }

  return selected.map((cellIndex) => ({
    cellIndex,
    phaseOffsetSeconds: random() * SPIKE_CYCLE_SECONDS,
  }))
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

function shuffle<T>(values: T[], random: () => number): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const value = values[index]
    values[index] = values[swapIndex]
    values[swapIndex] = value
  }
  return values
}