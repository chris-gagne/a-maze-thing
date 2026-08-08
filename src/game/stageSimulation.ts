import { type GridPoint, type Maze, toIndex, Wall } from '../generation/maze'
import { findNextEnemyCellTowardIndex } from './enemyNavigation'
import { DamageSource, INITIAL_LIVES, MAX_LIVES, type DamageSource as DamageSourceValue } from './lifeRules'
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

export interface AmbusherState {
  spawnCellIndex: number
  cellIndex: number
  targetCellIndex: number | null
  progress: number
  revealed: boolean
  active: boolean
}

export interface WandererState {
  spawnCellIndex: number
  departureCellIndex: number
  cellIndex: number
  previousCellIndex: number | null
  targetCellIndex: number | null
  progress: number
  spawnSeconds: number
  spawned: boolean
  triggered: boolean
  departed: boolean
  routeSeed: number
  routeDecisionCount: number
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
  ambusher: AmbusherState | null
  ambusherReveals: number
  wanderer: WandererState | null
  wandererSpawns: number
  wandererTriggers: number
  lifeTarget: LifeTargetState | null
  spikes: SpikeState[]
  portals: Set<number>
  portalUses: number
  lastUsedPortalCellIndex: number | null
  portalReturnArmed: boolean
  elapsedSeconds: number
  coins: Set<number>
  collectedCoins: number
  lives: number
  livesLost: number
  livesGained: number
  lastDamageSource: DamageSourceValue | null
  complete: boolean
  gameOver: boolean
}

export interface StageSimulationOptions {
  coinIndices?: Iterable<number>
  hunter?: {
    startCellIndex: number
    releaseDelaySeconds: number
  }
  ambusher?: {
    startCellIndex: number
  }
  wanderer?: {
    startCellIndex: number
    departureCellIndex: number
    spawnSeconds: number
    routeSeed: number
  }
  lifeTarget?: {
    startCellIndex: number
  }
  spikes?: Iterable<SpikeState>
  portalIndices?: Iterable<number>
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
  const portals = new Set(options.portalIndices ?? [])
  portals.delete(entranceIndex)
  portals.delete(exitIndex)
  const lives = options.lives ?? INITIAL_LIVES

  if (!Number.isInteger(lives) || lives < INITIAL_LIVES || lives > MAX_LIVES) {
    throw new RangeError(`Lives must be an integer from ${INITIAL_LIVES} to ${MAX_LIVES}.`)
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
    ambusher: options.ambusher === undefined
      ? null
      : {
          spawnCellIndex: options.ambusher.startCellIndex,
          cellIndex: options.ambusher.startCellIndex,
          targetCellIndex: null,
          progress: 0,
          revealed: false,
          active: false,
        },
    ambusherReveals: 0,
    wanderer: options.wanderer === undefined
      ? null
      : {
          spawnCellIndex: options.wanderer.startCellIndex,
          departureCellIndex: options.wanderer.departureCellIndex,
          cellIndex: options.wanderer.startCellIndex,
          previousCellIndex: null,
          targetCellIndex: null,
          progress: 0,
          spawnSeconds: options.wanderer.spawnSeconds,
          spawned: false,
          triggered: false,
          departed: false,
          routeSeed: options.wanderer.routeSeed,
          routeDecisionCount: 0,
        },
    wandererSpawns: 0,
    wandererTriggers: 0,
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
    portals,
    portalUses: 0,
    lastUsedPortalCellIndex: null,
    portalReturnArmed: false,
    elapsedSeconds: 0,
    coins,
    collectedCoins: 0,
    lives,
    livesLost: 0,
    livesGained: 0,
    lastDamageSource: null,
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
  ambusherSpeedInCellsPerSecond = hunterSpeedInCellsPerSecond,
  wandererSpeedInCellsPerSecond = 0,
): void {
  if (simulation.complete || simulation.gameOver || deltaSeconds <= 0) {
    return
  }

  simulation.elapsedSeconds += deltaSeconds

  spawnWandererIfDue(simulation)

  if (triggerWandererIfClose(simulation)) {
    return
  }

  if (revealAmbusherIfClose(simulation)) {
    return
  }

  if (updatePlayer(simulation, deltaSeconds, speedInCellsPerSecond)) {
    return
  }

  collectLifeTargetIfCaught(simulation)

  if (simulation.complete) {
    return
  }

  if (triggerWandererIfClose(simulation)) {
    return
  }

  updateHunter(simulation, deltaSeconds, hunterSpeedInCellsPerSecond)
  updateAmbusher(simulation, deltaSeconds, ambusherSpeedInCellsPerSecond)
  if (updateWanderer(simulation, deltaSeconds, wandererSpeedInCellsPerSecond, hunterSpeedInCellsPerSecond)) {
    return
  }
  updateLifeTarget(simulation, deltaSeconds, lifeTargetSpeedInCellsPerSecond)
  collectLifeTargetIfCaught(simulation)

  if (simulation.hunter?.active && entitiesOverlap(simulation)) {
    loseLife(simulation, DamageSource.Hunter)
  } else if (simulation.ambusher?.active && entitiesOverlap(simulation, simulation.ambusher)) {
    loseLife(simulation, DamageSource.Ambusher)
  } else if (simulation.wanderer?.triggered && entitiesOverlap(simulation, simulation.wanderer)) {
    loseLife(simulation, DamageSource.Wanderer)
  } else if (isPlayerOnActiveSpike(simulation)) {
    loseLife(simulation, DamageSource.Spike)
  }
}

export function getHunterGridPosition(simulation: StageSimulation): GridPoint | null {
  const hunter = simulation.hunter

  if (hunter === null) {
    return null
  }

  return getMovingEntityPosition(simulation.maze, hunter)
}

export function getAmbusherGridPosition(simulation: StageSimulation): GridPoint | null {
  return simulation.ambusher === null
    ? null
    : getMovingEntityPosition(simulation.maze, simulation.ambusher)
}

export function getWandererGridPosition(simulation: StageSimulation): GridPoint | null {
  const wanderer = simulation.wanderer
  return wanderer === null || !wanderer.spawned || wanderer.departed
    ? null
    : getMovingEntityPosition(simulation.maze, wanderer)
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
): boolean {
  let remainingDistance = deltaSeconds * Math.max(0, speedInCellsPerSecond)

  while (remainingDistance > ARRIVAL_EPSILON && !simulation.complete) {
    if (simulation.player.targetCellIndex === null && !beginNextSegment(simulation)) {
      return false
    }

    const distanceToTarget = 1 - simulation.player.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    simulation.player.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (simulation.player.progress >= 1 - ARRIVAL_EPSILON) {
      if (arriveAtTarget(simulation)) {
        return false
      }

      if (revealAmbusherIfClose(simulation)) {
        return true
      }
    }
  }

  return false
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

  updatePursuer(simulation, hunter, activeSeconds, speedInCellsPerSecond)
}

function updateAmbusher(
  simulation: StageSimulation,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
): void {
  const ambusher = simulation.ambusher
  if (ambusher === null || !ambusher.active) {
    return
  }

  updatePursuer(simulation, ambusher, deltaSeconds, speedInCellsPerSecond)
}

function spawnWandererIfDue(simulation: StageSimulation): void {
  const wanderer = simulation.wanderer
  if (
    wanderer === null
    || wanderer.spawned
    || wanderer.departed
    || simulation.elapsedSeconds < wanderer.spawnSeconds
  ) {
    return
  }

  wanderer.spawned = true
  simulation.wandererSpawns += 1
}

function updateWanderer(
  simulation: StageSimulation,
  deltaSeconds: number,
  wanderingSpeedInCellsPerSecond: number,
  pursuitSpeedInCellsPerSecond: number,
): boolean {
  const wanderer = simulation.wanderer
  if (wanderer === null || !wanderer.spawned || wanderer.departed) {
    return false
  }

  if (wanderer.triggered) {
    updatePursuer(simulation, wanderer, deltaSeconds, pursuitSpeedInCellsPerSecond)
    return false
  }

  let remainingDistance = deltaSeconds * Math.max(0, wanderingSpeedInCellsPerSecond)
  while (remainingDistance > ARRIVAL_EPSILON && !wanderer.departed) {
    if (wanderer.targetCellIndex === null) {
      wanderer.targetCellIndex = selectWandererNeighbor(simulation)
      if (wanderer.targetCellIndex === null) {
        return false
      }
    }

    const distanceToTarget = 1 - wanderer.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    wanderer.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (wanderer.progress >= 1 - ARRIVAL_EPSILON) {
      wanderer.previousCellIndex = wanderer.cellIndex
      wanderer.cellIndex = wanderer.targetCellIndex
      wanderer.targetCellIndex = null
      wanderer.progress = 0

      if (wanderer.cellIndex === wanderer.departureCellIndex) {
        wanderer.departed = true
        return false
      }

      if (triggerWandererIfClose(simulation)) {
        return true
      }
    }
  }

  return false
}

function selectWandererNeighbor(simulation: StageSimulation): number | null {
  const wanderer = simulation.wanderer
  if (wanderer === null) {
    return null
  }

  const blocked = getActiveSpikeCellIndices(simulation)
  let candidates = getEnemyNeighborIndices(simulation.maze, wanderer.cellIndex)
    .filter((cellIndex) => !blocked.has(cellIndex))
  const forwardCandidates = candidates.filter((cellIndex) => cellIndex !== wanderer.previousCellIndex)
  if (forwardCandidates.length > 0) {
    candidates = forwardCandidates
  }
  if (candidates.length === 0) {
    return null
  }

  const distances = getDistancesFrom(simulation.maze, wanderer.departureCellIndex)
  const currentDistance = distances[wanderer.cellIndex]
  const weights = candidates.map((cellIndex) => {
    return distances[cellIndex] < currentDistance ? 4 : distances[cellIndex] === currentDistance ? 2 : 1
  })
  const totalWeight = weights.reduce((total, weight) => total + weight, 0)
  let sample = getWandererRandom(wanderer.routeSeed, wanderer.routeDecisionCount) * totalWeight
  wanderer.routeDecisionCount += 1

  for (let index = 0; index < candidates.length; index += 1) {
    sample -= weights[index]
    if (sample < 0) {
      return candidates[index]
    }
  }

  return candidates[candidates.length - 1]
}

function getWandererRandom(seed: number, decisionCount: number): number {
  let value = (seed + Math.imul(decisionCount + 1, 0x6d2b79f5)) | 0
  value = Math.imul(value ^ (value >>> 15), 1 | value)
  value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
  return ((value ^ (value >>> 14)) >>> 0) / 4294967296
}

function updatePursuer(
  simulation: StageSimulation,
  pursuer: Pick<AmbusherState, 'cellIndex' | 'targetCellIndex' | 'progress'>,
  deltaSeconds: number,
  speedInCellsPerSecond: number,
): void {
  let remainingDistance = deltaSeconds * Math.max(0, speedInCellsPerSecond)

  while (remainingDistance > ARRIVAL_EPSILON) {
    if (pursuer.targetCellIndex === null) {
      pursuer.targetCellIndex = findNextCellTowardPlayer(simulation, pursuer.cellIndex)

      if (pursuer.targetCellIndex === null) {
        return
      }
    }

    const distanceToTarget = 1 - pursuer.progress
    const distanceTraveled = Math.min(distanceToTarget, remainingDistance)
    pursuer.progress += distanceTraveled
    remainingDistance -= distanceTraveled

    if (pursuer.progress >= 1 - ARRIVAL_EPSILON) {
      pursuer.cellIndex = pursuer.targetCellIndex
      pursuer.targetCellIndex = null
      pursuer.progress = 0
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
    armPortalReturnAfterLeavingEntrance(simulation)
    return true
  }

  if (player.direction === null) {
    return false
  }

  player.targetCellIndex = getNeighborInDirection(simulation.maze, player.cellIndex, player.direction)
  if (player.targetCellIndex !== null) {
    armPortalReturnAfterLeavingEntrance(simulation)
  }
  return player.targetCellIndex !== null
}

function armPortalReturnAfterLeavingEntrance(simulation: StageSimulation): void {
  const entranceIndex = toIndex(
    simulation.maze.entrance.x,
    simulation.maze.entrance.y,
    simulation.maze.width,
  )

  if (
    simulation.player.cellIndex === entranceIndex
    && simulation.player.targetCellIndex !== entranceIndex
    && simulation.lastUsedPortalCellIndex !== null
  ) {
    simulation.portalReturnArmed = true
  }
}

function arriveAtTarget(simulation: StageSimulation): boolean {
  const targetCellIndex = simulation.player.targetCellIndex

  if (targetCellIndex === null) {
    return false
  }

  simulation.player.cellIndex = targetCellIndex
  simulation.player.targetCellIndex = null
  simulation.player.progress = 0

  if (simulation.coins.delete(targetCellIndex)) {
    simulation.collectedCoins += 1
  }

  const entranceIndex = toIndex(
    simulation.maze.entrance.x,
    simulation.maze.entrance.y,
    simulation.maze.width,
  )

  if (simulation.portals.has(targetCellIndex)) {
    simulation.lastUsedPortalCellIndex = targetCellIndex
    simulation.portalReturnArmed = false
    resetMovingEntity(simulation.player, entranceIndex)
    simulation.player.direction = null
    simulation.player.queuedDirection = null
    simulation.portalUses += 1
    return true
  }

  if (
    targetCellIndex === entranceIndex
    && simulation.portalReturnArmed
    && simulation.lastUsedPortalCellIndex !== null
  ) {
    resetMovingEntity(simulation.player, simulation.lastUsedPortalCellIndex)
    simulation.player.direction = null
    simulation.player.queuedDirection = null
    simulation.portalUses += 1
    return true
  }

  const exitIndex = toIndex(simulation.maze.exit.x, simulation.maze.exit.y, simulation.maze.width)
  simulation.complete = targetCellIndex === exitIndex
  return false
}

function findNextCellTowardPlayer(simulation: StageSimulation, pursuerCellIndex: number): number | null {
  const targetIndex = simulation.player.targetCellIndex ?? simulation.player.cellIndex
  return findNextEnemyCellTowardIndex(
    simulation.maze,
    pursuerCellIndex,
    targetIndex,
    getActiveSpikeCellIndices(simulation),
    getEnemyNeighborIndices,
  )
}

function getEnemyNeighborIndices(maze: Maze, cellIndex: number): readonly number[] {
  return HUNTER_DIRECTION_PRIORITY.flatMap((direction) => {
    const neighborIndex = getNeighborInDirection(maze, cellIndex, direction)
    return neighborIndex === null ? [] : [neighborIndex]
  })
}

function getActiveSpikeCellIndices(simulation: StageSimulation): Set<number> {
  return new Set(
    simulation.spikes
      .filter((spike) => getSpikePhase(spike, simulation.elapsedSeconds) === SpikePhase.Active)
      .map((spike) => spike.cellIndex),
  )
}

function entitiesOverlap(
  simulation: StageSimulation,
  entity: Pick<AmbusherState, 'cellIndex' | 'targetCellIndex' | 'progress'> | null = simulation.hunter,
): boolean {
  const player = getPlayerGridPosition(simulation)
  if (entity === null) {
    return false
  }
  const enemy = getMovingEntityPosition(simulation.maze, entity)

  return Math.hypot(player.x - enemy.x, player.y - enemy.y) <= 0.32
}

function revealAmbusherIfClose(simulation: StageSimulation): boolean {
  const ambusher = simulation.ambusher
  if (
    ambusher === null
    || ambusher.revealed
    || simulation.player.targetCellIndex !== null
    || simulation.complete
  ) {
    return false
  }

  const distances = getDistancesFrom(simulation.maze, simulation.player.cellIndex)
  if (distances[ambusher.cellIndex] > 5) {
    return false
  }

  ambusher.revealed = true
  ambusher.active = true
  simulation.ambusherReveals += 1
  simulation.player.direction = null
  simulation.player.queuedDirection = null
  return true
}

function triggerWandererIfClose(simulation: StageSimulation): boolean {
  const wanderer = simulation.wanderer
  if (
    wanderer === null
    || !wanderer.spawned
    || wanderer.triggered
    || wanderer.departed
    || simulation.player.targetCellIndex !== null
    || simulation.complete
  ) {
    return false
  }

  const distances = getDistancesFrom(simulation.maze, simulation.player.cellIndex)
  if (distances[wanderer.cellIndex] > 5) {
    return false
  }

  wanderer.triggered = true
  simulation.wandererTriggers += 1
  simulation.player.direction = null
  simulation.player.queuedDirection = null
  return true
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
    if (simulation.lives < MAX_LIVES) {
      simulation.lives += 1
      simulation.livesGained += 1
    }
  }
}

function loseLife(simulation: StageSimulation, source: DamageSourceValue): void {
  simulation.lives -= 1
  simulation.livesLost += 1
  simulation.lastDamageSource = source
  simulation.lastUsedPortalCellIndex = null
  simulation.portalReturnArmed = false

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

  if (simulation.ambusher !== null) {
    resetMovingEntity(simulation.ambusher, simulation.ambusher.spawnCellIndex)
    simulation.ambusher.active = simulation.ambusher.revealed
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

