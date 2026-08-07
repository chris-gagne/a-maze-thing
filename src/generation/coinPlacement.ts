import { getOpenNeighborIndices, type Maze, toIndex } from './maze'
import { createSeededRandom } from './random'

const MINIMUM_DENSITY = 0.52
const MAXIMUM_DENSITY = 0.78
const LOOP_COIN_SHARE = 0.4

export interface CoinPlacement {
  indices: number[]
  loopAnchors: number[]
}

export function placeCoins(
  maze: Maze,
  seed: number,
  reservedIndices: Iterable<number> = [],
): number[] {
  return createCoinPlacement(maze, seed, reservedIndices).indices
}

export function createCoinPlacement(
  maze: Maze,
  seed: number,
  reservedIndices: Iterable<number> = [],
): CoinPlacement {
  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const reserved = new Set([entranceIndex, exitIndex, ...reservedIndices])
  const candidates = maze.cells
    .map((_, index) => index)
    .filter((index) => !reserved.has(index))
  const minimumCoins = Math.ceil(candidates.length * MINIMUM_DENSITY)
  const maximumCoins = Math.max(minimumCoins, Math.floor(candidates.length * MAXIMUM_DENSITY))
  const random = createSeededRandom(seed)
  const coins = new Set<number>()
  const loopAnchors = selectLoopAnchors(maze, random, reserved)
  const loopCoinTarget = Math.min(
    maximumCoins,
    Math.ceil(minimumCoins * LOOP_COIN_SHARE),
  )

  placeLoopCoins(
    maze,
    loopAnchors,
    coins,
    loopCoinTarget,
    random,
    reserved,
  )

  const clusterCount = Math.max(2, Math.ceil(candidates.length / 22))

  for (let cluster = 0; cluster < clusterCount && coins.size < maximumCoins; cluster += 1) {
    let currentIndex = candidates[Math.floor(random() * candidates.length)]
    let previousIndex = -1
    const trailLength = 7 + Math.floor(random() * 9)

    for (let step = 0; step < trailLength && coins.size < maximumCoins; step += 1) {
      if (!reserved.has(currentIndex)) {
        coins.add(currentIndex)
      }
      const openNeighbors = getOpenNeighborIndices(maze, currentIndex)
      const forwardNeighbors = openNeighbors.filter((index) => index !== previousIndex)
      const choices = forwardNeighbors.length > 0 ? forwardNeighbors : openNeighbors
      previousIndex = currentIndex
      currentIndex = choices[Math.floor(random() * choices.length)]
    }
  }

  for (const candidate of candidates) {
    if (coins.size >= maximumCoins) {
      break
    }

    const isDeadEnd = getOpenNeighborIndices(maze, candidate).length === 1
    const placementChance = isDeadEnd ? 0.55 : 0.1

    if (random() < placementChance) {
      coins.add(candidate)
    }
  }

  const shuffledCandidates = shuffle([...candidates], random)
  for (const candidate of shuffledCandidates) {
    if (coins.size >= minimumCoins) {
      break
    }
    coins.add(candidate)
  }

  return {
    indices: [...coins].sort((left, right) => left - right),
    loopAnchors,
  }
}

function selectLoopAnchors(
  maze: Maze,
  random: () => number,
  reserved: ReadonlySet<number>,
): number[] {
  return maze.braids.flatMap((braid) => {
    const minimumPosition = Math.floor(braid.pathIndices.length / 3)
    const maximumPosition = Math.max(minimumPosition, Math.ceil(braid.pathIndices.length * 2 / 3) - 1)
    const middlePositions = Array.from(
      { length: maximumPosition - minimumPosition + 1 },
      (_, offset) => minimumPosition + offset,
    ).filter((position) => !reserved.has(braid.pathIndices[position]))
    const positions = middlePositions.length > 0
      ? middlePositions
      : braid.pathIndices
          .map((_, position) => position)
          .filter((position) => !reserved.has(braid.pathIndices[position]))

    if (positions.length === 0) {
      return []
    }

    const position = positions[Math.floor(random() * positions.length)]
    return [braid.pathIndices[position]]
  })
}

function placeLoopCoins(
  maze: Maze,
  anchors: number[],
  coins: Set<number>,
  targetCount: number,
  random: () => number,
  reserved: ReadonlySet<number>,
): void {
  if (anchors.length === 0 || targetCount === 0) {
    return
  }

  const pending = shuffle([...anchors], random)
  const visited = new Set(pending)

  for (let cursor = 0; cursor < pending.length && coins.size < targetCount; cursor += 1) {
    const currentIndex = pending[cursor]

    if (!reserved.has(currentIndex)) {
      coins.add(currentIndex)
    }

    for (const neighborIndex of shuffle(getOpenNeighborIndices(maze, currentIndex), random)) {
      if (!visited.has(neighborIndex)) {
        visited.add(neighborIndex)
        pending.push(neighborIndex)
      }
    }
  }
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