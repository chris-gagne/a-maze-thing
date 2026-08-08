import { SHUTTER_CYCLE_SECONDS, type ShutterState } from '../game/shutterTiming'
import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

const FIRST_SHUTTER_STAGE = 6

export function placeShutters(maze: Maze, stageNumber: number, seed: number): ShutterState[] {
  if (!Number.isInteger(stageNumber) || stageNumber < 1) {
    throw new RangeError('Stage number must be a positive integer.')
  }
  if (stageNumber < FIRST_SHUTTER_STAGE) {
    return []
  }

  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const entranceDistances = getDistances(maze, entranceIndex)
  const exitDistances = getDistances(maze, exitIndex)
  const random = createSeededRandom(seed)
  const candidates = maze.braids
    .filter((braid) => {
      return entranceDistances[braid.fromIndex] >= 3
        && entranceDistances[braid.toIndex] >= 3
        && exitDistances[braid.fromIndex] >= 2
        && exitDistances[braid.toIndex] >= 2
    })
    .map((braid) => ({ braid, order: random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ braid }) => braid)
  const selected = []
  const usedEndpoints = new Set<number>()
  const targetCount = stageNumber < 16 ? 1 : stageNumber < 31 ? 2 : 3

  for (const candidate of candidates) {
    if (selected.length >= targetCount) {
      break
    }
    if (usedEndpoints.has(candidate.fromIndex) || usedEndpoints.has(candidate.toIndex)) {
      continue
    }

    selected.push(candidate)
    usedEndpoints.add(candidate.fromIndex)
    usedEndpoints.add(candidate.toIndex)
  }

  const baseOffset = random() * SHUTTER_CYCLE_SECONDS
  return selected.map((braid, index) => ({
    fromCellIndex: braid.fromIndex,
    toCellIndex: braid.toIndex,
    phaseOffsetSeconds: (baseOffset + index * SHUTTER_CYCLE_SECONDS / selected.length)
      % SHUTTER_CYCLE_SECONDS,
  }))
}

function getDistances(maze: Maze, startIndex: number): number[] {
  const distances = Array<number>(maze.cells.length).fill(-1)
  const pending = [startIndex]
  distances[startIndex] = 0

  for (let cursor = 0; cursor < pending.length; cursor += 1) {
    const currentIndex = pending[cursor]
    for (const neighborIndex of getOpenNeighborIndices(maze, currentIndex)) {
      if (distances[neighborIndex] !== -1) {
        continue
      }
      distances[neighborIndex] = distances[currentIndex] + 1
      pending.push(neighborIndex)
    }
  }

  return distances
}
