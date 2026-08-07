import { type GridPoint, type Maze, toIndex, Wall } from '../generation/maze'
import { getSpikePhase, type SpikeState, SpikePhase } from './spikeTiming'

export { getSpikePhase, SpikePhase } from './spikeTiming'
export type { SpikeState } from './spikeTiming'

export const Direction = {
  North: 'north',
  East: 'east',
  South: 'south',
  West: 'west',
} as const

export type Direction = (typeof Direction)[keyof typeof Direction]

export interface PlayerState {
  cellIndex: number
  targetCellIndex: number | null
  progress: number
  direction: Direction | null
  queuedDirection: Direction | null
}

export interface HunterState {
  spawnCellIndex: number
  cellIndex: number
  targetCellIndex: number | null
  progress: number
  releaseDelaySeconds: number
  releaseSecondsRemaining: number
  releaseStarted: boolean
  active: boolean
}

export interface LifeTargetState {
  cellIndex: number
  previousCellIndex: number | null
  targetCellIndex: number | null
  explorationTargetCellIndex: number | null
  visitCounts: Uint16Array
  progress: number
  collected: boolean
}

export interface StageSimulation {
  maze: Maze
  player: PlayerState
  hunter: HunterState | null
  lifeTarget: LifeTargetState | null
  spikes: SpikeState[]
  elapsedSeconds: number
  coins: Set<number>
  collectedCoins: number
  lives: number
  livesLost: number
  livesGained: number
  complete: boolean
  gameOver: boolean
}

export interface StageSimulationOptions {
  coinIndices?: Iterable<number>
  hunter?: {
    startCellIndex: number
    releaseDelaySeconds: number
  }
  lifeTarget?: {
    startCellIndex: number
  }
  spikes?: Iterable<SpikeState>
  lives?: number
}

interface DirectionDefinition {
  dx: number
  dy: number
  wall: number
}

const DIRECTION_DEFINITIONS: Record<Direction, DirectionDefinition> = {
  [Direction.North]: { dx: 0, dy: -1, wall: Wall.North },
  [Direction.East]: { dx: 1, dy: 0, wall: Wall.East },
  [Direction.South]: { dx: 0, dy: 1, wall: Wall.South },
  [Direction.West]: { dx: -1, dy: 0, wall: Wall.West },
}

export const HUNTER_DIRECTION_PRIORITY: readonly Direction[] = [
  Direction.North,
  Direction.East,
  Direction.South,
  Direction.West,
]

const ARRIVAL_EPSILON = 1e-9

export function createStageSimulation(
  maze: Maze,
  options: StageSimulationOptions = {},
): StageSimulation {
  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const coins = new Set(
    options.coinIndices
      ?? maze.cells.map((_, index) => index).filter((index) => index !== entranceIndex && index !== exitIndex),
  )

  coins.delete(entranceIndex)
  coins.delete(exitIndex)
  const lives = options.lives ?? 1

  if (!Number.isInteger(lives) || lives < 1) {
    throw new RangeError('Lives must be a positive integer.')
  }

  return {
    maze,
    player: {
      cellIndex: entranceIndex,
      targetCellIndex: null,
      progress: 0,
      direction: null,
      queuedDirection: null,
    },
    hunter: options.hunter === undefined
      ? null
      : {
          spawnCellIndex: options.hunter.startCellIndex,
          cellIndex: options.hunter.startCellIndex,
          targetCellIndex: null,
          progress: 0,
          releaseDelaySeconds: options.hunter.releaseDelaySeconds,
          releaseSecondsRemaining: options.hunter.releaseDelaySeconds,
          releaseStarted: false,
          active: false,
        },
    lifeTarget: options.lifeTarget === undefined
      ? null
      : {
          cellIndex: options.lifeTarget.startCellIndex,
          previousCellIndex: null,
          targetCellIndex: null,
          explorationTargetCellIndex: null,
          visitCounts: createInitialVisitCounts(maze.cells.length, options.lifeTarget.startCellIndex),
          progress: 0,
          collected: false,
        },
    spikes: [...(options.spikes ?? [])],
    elapsedSeconds: 0,
    coins,
    collectedCoins: 0,
    lives,
    livesLost: 0,
    livesGained: 0,
    complete: false,
    gameOver: false,
  }
}

export function queuePlayerDirection(simulation: StageSimulation, direction: Direction): void {
  simulation.player.queuedDirection = direction
}

export function updateStageSimulation(
  simulation: StageSimulation,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
  hunterSpeedInCellsPerSecond = 0,
  lifeTargetSpeedInCellsPerSecond = 0,
): void {
  if (simulation.complete || simulation.gameOver || deltaSeconds <= 0) {
    return
  }

  simulation.elapsedSeconds += deltaSeconds

  updatePlayer(simulation, deltaSeconds, speedInCellsPerSecond)

  collectLifeTargetIfCaught(simulation)

  if (simulation.complete) {
    return
  }

  updateHunter(simulation, deltaSeconds, hunterSpeedInCellsPerSecond)
  updateLifeTarget(simulation, deltaSeconds, lifeTargetSpeedInCellsPerSecond)
  collectLifeTargetIfCaught(simulation)

  if (simulation.hunter?.active && entitiesOverlap(simulation)) {
    loseLife(simulation)
  } else if (isPlayerOnActiveSpike(simulation)) {
    loseLife(simulation)
  }
}

export function getHunterGridPosition(simulation: StageSimulation): GridPoint | null {
  const hunter = simulation.hunter

  if (hunter === null) {
    return null
  }

  return getMovingEntityPosition(simulation.maze, hunter)
}

export function getLifeTargetGridPosition(simulation: StageSimulation): GridPoint | null {
  const lifeTarget = simulation.lifeTarget

  if (lifeTarget === null || lifeTarget.collected) {
    return null
  }

  return getMovingEntityPosition(simulation.maze, lifeTarget)
}

function updatePlayer(
  simulation: StageSimulation,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
): void {
  let remainingDistance = deltaSeconds * Math.max(0, speedInCellsPerSecond)

  while (remainingDistance > ARRIVAL_EPSILON && !simulation.complete) {
    if (simulation.player.targetCellIndex === null && !beginNextSegment(simulation)) {
      return
    }

    const distanceToTarget = 1 - simulation.player.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    simulation.player.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (simulation.player.progress >= 1 - ARRIVAL_EPSILON) {
      arriveAtTarget(simulation)
    }
  }
}

function updateHunter(
  simulation: StageSimulation,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
): void {
  const hunter = simulation.hunter

  if (hunter === null || speedInCellsPerSecond <= 0) {
    return
  }

  let activeSeconds = deltaSeconds

  if (!hunter.active) {
    if (!hunter.releaseStarted) {
      const playerHasMoved = simulation.player.cellIndex !== hunter.cellIndex
        || simulation.player.targetCellIndex !== null

      if (!playerHasMoved) {
        return
      }

      hunter.releaseStarted = true
    }

    hunter.releaseSecondsRemaining -= deltaSeconds

    if (hunter.releaseSecondsRemaining > 0) {
      return
    }

    activeSeconds = -hunter.releaseSecondsRemaining
    hunter.active = true
  }

  let remainingDistance = activeSeconds * speedInCellsPerSecond

  while (remainingDistance > ARRIVAL_EPSILON) {
    if (hunter.targetCellIndex === null) {
      hunter.targetCellIndex = findNextCellTowardPlayer(simulation)

      if (hunter.targetCellIndex === null) {
        return
      }
    }

    const distanceToTarget = 1 - hunter.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    hunter.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (hunter.progress >= 1 - ARRIVAL_EPSILON) {
      hunter.cellIndex = hunter.targetCellIndex
      hunter.targetCellIndex = null
      hunter.progress = 0
    }
  }
}

function updateLifeTarget(
  simulation: StageSimulation,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
): void {
  const lifeTarget = simulation.lifeTarget

  if (lifeTarget === null || lifeTarget.collected || speedInCellsPerSecond <= 0) {
    return
  }

  let remainingDistance = deltaSeconds * speedInCellsPerSecond

  while (remainingDistance > ARRIVAL_EPSILON) {
    if (lifeTarget.targetCellIndex === null) {
      lifeTarget.targetCellIndex = findNextCellAwayFromPlayer(simulation)

      if (lifeTarget.targetCellIndex === null) {
        return
      }
    }

    const distanceToTarget = 1 - lifeTarget.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    lifeTarget.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (lifeTarget.progress >= 1 - ARRIVAL_EPSILON) {
      lifeTarget.previousCellIndex = lifeTarget.cellIndex
      lifeTarget.cellIndex = lifeTarget.targetCellIndex
      lifeTarget.targetCellIndex = null
      lifeTarget.progress = 0
      lifeTarget.visitCounts[lifeTarget.cellIndex] = Math.min(
        lifeTarget.visitCounts[lifeTarget.cellIndex] + 1,
        0xffff,
      )

      if (lifeTarget.cellIndex === lifeTarget.explorationTargetCellIndex) {
        lifeTarget.explorationTargetCellIndex = null
      }
    }
  }
}

export function getPlayerGridPosition(simulation: StageSimulation): GridPoint {
  return getMovingEntityPosition(simulation.maze, simulation.player)
}

function getMovingEntityPosition(
  maze: Maze,
  entity: Pick<PlayerState, 'cellIndex' | 'targetCellIndex' | 'progress'>,
): GridPoint {
  const from = maze.cells[entity.cellIndex]
  const targetIndex = entity.targetCellIndex

  if (targetIndex === null) {
    return { x: from.x, y: from.y }
  }

  const to = maze.cells[targetIndex]
  return {
    x: from.x + (to.x - from.x) * entity.progress,
    y: from.y + (to.y - from.y) * entity.progress,
  }
}

export function getNeighborInDirection(maze: Maze, cellIndex: number, direction: Direction): number | null {
  const cell = maze.cells[cellIndex]
  const definition = DIRECTION_DEFINITIONS[direction]

  if ((cell.walls & definition.wall) !== 0) {
    return null
  }

  return toIndex(cell.x + definition.dx, cell.y + definition.dy, maze.width)
}

function beginNextSegment(simulation: StageSimulation): boolean {
  const { player } = simulation
  const queuedTarget = player.queuedDirection === null
    ? null
    : getNeighborInDirection(simulation.maze, player.cellIndex, player.queuedDirection)

  if (player.queuedDirection !== null && queuedTarget !== null) {
    player.direction = player.queuedDirection
    player.queuedDirection = null
    player.targetCellIndex = queuedTarget
    return true
  }

  if (player.direction === null) {
    return false
  }

  player.targetCellIndex = getNeighborInDirection(simulation.maze, player.cellIndex, player.direction)
  return player.targetCellIndex !== null
}

function arriveAtTarget(simulation: StageSimulation): void {
  const targetCellIndex = simulation.player.targetCellIndex

  if (targetCellIndex === null) {
    return
  }

  simulation.player.cellIndex = targetCellIndex
  simulation.player.targetCellIndex = null
  simulation.player.progress = 0

  if (simulation.coins.delete(targetCellIndex)) {
    simulation.collectedCoins += 1
  }

  const exitIndex = toIndex(simulation.maze.exit.x, simulation.maze.exit.y, simulation.maze.width)
  simulation.complete = targetCellIndex === exitIndex
}

function findNextCellTowardPlayer(simulation: StageSimulation): number | null {
  const hunter = simulation.hunter

  if (hunter === null) {
    return null
  }

  const targetIndex = simulation.player.targetCellIndex ?? simulation.player.cellIndex
  const distances = new Int32Array(simulation.maze.cells.length).fill(-1)
  const queue = new Int32Array(simulation.maze.cells.length)
  let head = 0
  let tail = 0
  queue[tail++] = targetIndex
  distances[targetIndex] = 0

  while (head < tail) {
    const currentIndex = queue[head++]

    for (const direction of HUNTER_DIRECTION_PRIORITY) {
      const neighborIndex = getNeighborInDirection(simulation.maze, currentIndex, direction)

      if (neighborIndex !== null && distances[neighborIndex] === -1) {
        distances[neighborIndex] = distances[currentIndex] + 1
        queue[tail++] = neighborIndex
      }
    }
  }

  let bestNeighbor: number | null = null

  for (const direction of HUNTER_DIRECTION_PRIORITY) {
    const neighborIndex = getNeighborInDirection(simulation.maze, hunter.cellIndex, direction)

    if (
      neighborIndex !== null
      && (bestNeighbor === null || distances[neighborIndex] < distances[bestNeighbor])
    ) {
      bestNeighbor = neighborIndex
    }
  }

  return bestNeighbor
}

function entitiesOverlap(simulation: StageSimulation): boolean {
  const player = getPlayerGridPosition(simulation)
  const hunter = getHunterGridPosition(simulation)

  if (hunter === null) {
    return false
  }

  return Math.hypot(player.x - hunter.x, player.y - hunter.y) <= 0.32
}

function isPlayerOnActiveSpike(simulation: StageSimulation): boolean {
  const playerPosition = getPlayerGridPosition(simulation)

  return simulation.spikes.some((spike) => {
    if (getSpikePhase(spike, simulation.elapsedSeconds) !== SpikePhase.Active) {
      return false
    }

    const spikeCell = simulation.maze.cells[spike.cellIndex]
    return Math.hypot(playerPosition.x - spikeCell.x, playerPosition.y - spikeCell.y) <= 0.32
  })
}

function findNextCellAwayFromPlayer(simulation: StageSimulation): number | null {
  const lifeTarget = simulation.lifeTarget

  if (lifeTarget === null) {
    return null
  }

  const playerTargetIndex = simulation.player.targetCellIndex ?? simulation.player.cellIndex
  const distances = getDistancesFrom(simulation.maze, playerTargetIndex)

  if (lifeTarget.explorationTargetCellIndex !== null) {
    return findNextCellTowardIndex(
      simulation.maze,
      lifeTarget.cellIndex,
      lifeTarget.explorationTargetCellIndex,
    )
  }

  const neighbors = HUNTER_DIRECTION_PRIORITY.flatMap((direction) => {
    const neighborIndex = getNeighborInDirection(simulation.maze, lifeTarget.cellIndex, direction)
    return neighborIndex === null ? [] : [neighborIndex]
  })
  const fartherNeighbors = neighbors.filter(
    (index) => distances[index] > distances[lifeTarget.cellIndex],
  )

  if (fartherNeighbors.length > 0) {
    return fartherNeighbors.reduce((bestIndex, candidateIndex) => {
      if (distances[candidateIndex] !== distances[bestIndex]) {
        return distances[candidateIndex] > distances[bestIndex] ? candidateIndex : bestIndex
      }

      return lifeTarget.visitCounts[candidateIndex] < lifeTarget.visitCounts[bestIndex]
        ? candidateIndex
        : bestIndex
    })
  }

  lifeTarget.explorationTargetCellIndex = selectExplorationTarget(simulation, distances)
  return lifeTarget.explorationTargetCellIndex === null
    ? null
    : findNextCellTowardIndex(
        simulation.maze,
        lifeTarget.cellIndex,
        lifeTarget.explorationTargetCellIndex,
      )
}

function selectExplorationTarget(
  simulation: StageSimulation,
  playerDistances: Int32Array,
): number | null {
  const lifeTarget = simulation.lifeTarget

  if (lifeTarget === null) {
    return null
  }

  let bestIndex: number | null = null

  for (let index = 0; index < simulation.maze.cells.length; index += 1) {
    if (index === lifeTarget.cellIndex) {
      continue
    }

    if (
      bestIndex === null
      || lifeTarget.visitCounts[index] < lifeTarget.visitCounts[bestIndex]
      || (
        lifeTarget.visitCounts[index] === lifeTarget.visitCounts[bestIndex]
        && playerDistances[index] > playerDistances[bestIndex]
      )
    ) {
      bestIndex = index
    }
  }

  return bestIndex
}

function findNextCellTowardIndex(
  maze: Maze,
  startIndex: number,
  targetIndex: number,
): number | null {
  if (startIndex === targetIndex) {
    return null
  }

  const previous = new Int32Array(maze.cells.length).fill(-1)
  const queue = new Int32Array(maze.cells.length)
  let head = 0
  let tail = 0
  queue[tail++] = startIndex
  previous[startIndex] = startIndex

  while (head < tail && previous[targetIndex] === -1) {
    const currentIndex = queue[head++]

    for (const direction of HUNTER_DIRECTION_PRIORITY) {
      const neighborIndex = getNeighborInDirection(maze, currentIndex, direction)

      if (neighborIndex !== null && previous[neighborIndex] === -1) {
        previous[neighborIndex] = currentIndex
        queue[tail++] = neighborIndex
      }
    }
  }

  if (previous[targetIndex] === -1) {
    return null
  }

  let nextIndex = targetIndex
  while (previous[nextIndex] !== startIndex) {
    nextIndex = previous[nextIndex]
  }
  return nextIndex
}

function createInitialVisitCounts(cellCount: number, startCellIndex: number): Uint16Array {
  const visitCounts = new Uint16Array(cellCount)
  visitCounts[startCellIndex] = 1
  return visitCounts
}

function getDistancesFrom(maze: Maze, startIndex: number): Int32Array {
  const distances = new Int32Array(maze.cells.length).fill(-1)
  const queue = new Int32Array(maze.cells.length)
  let head = 0
  let tail = 0
  queue[tail++] = startIndex
  distances[startIndex] = 0

  while (head < tail) {
    const currentIndex = queue[head++]

    for (const direction of HUNTER_DIRECTION_PRIORITY) {
      const neighborIndex = getNeighborInDirection(maze, currentIndex, direction)

      if (neighborIndex !== null && distances[neighborIndex] === -1) {
        distances[neighborIndex] = distances[currentIndex] + 1
        queue[tail++] = neighborIndex
      }
    }
  }

  return distances
}

function collectLifeTargetIfCaught(simulation: StageSimulation): void {
  const lifeTargetPosition = getLifeTargetGridPosition(simulation)

  if (lifeTargetPosition === null) {
    return
  }

  const playerPosition = getPlayerGridPosition(simulation)
  if (Math.hypot(playerPosition.x - lifeTargetPosition.x, playerPosition.y - lifeTargetPosition.y) <= 0.32) {
    simulation.lifeTarget!.collected = true
    simulation.lives += 1
    simulation.livesGained += 1
  }
}

function loseLife(simulation: StageSimulation): void {
  simulation.lives -= 1
  simulation.livesLost += 1

  if (simulation.lives === 0) {
    simulation.gameOver = true
    return
  }

  const entranceIndex = toIndex(simulation.maze.entrance.x, simulation.maze.entrance.y, simulation.maze.width)
  resetMovingEntity(simulation.player, entranceIndex)
  simulation.player.direction = null
  simulation.player.queuedDirection = null

  if (simulation.hunter !== null) {
    resetMovingEntity(simulation.hunter, simulation.hunter.spawnCellIndex)
    simulation.hunter.releaseSecondsRemaining = simulation.hunter.releaseDelaySeconds
    simulation.hunter.releaseStarted = false
    simulation.hunter.active = false
  }
}

function resetMovingEntity(
  entity: Pick<PlayerState, 'cellIndex' | 'targetCellIndex' | 'progress'>,
  cellIndex: number,
): void {
  entity.cellIndex = cellIndex
  entity.targetCellIndex = null
  entity.progress = 0
}

