import { describe, expect, it } from 'vitest'
import {
  generateMaze,
  generatePerfectMaze,
  getOpenNeighborIndices,
  type Maze,
  toIndex,
  Wall,
} from '../generation/maze'
import {
  createStageSimulation,
  Direction,
  getAmbusherGridPosition,
  getHunterGridPosition,
  getLifeTargetGridPosition,
  getLifeTargetGridPositions,
  getPlayerGridPosition,
  getWandererGridPosition,
  getSpikePhase,
  HUNTER_DIRECTION_PRIORITY,
  LifeTargetEffect,
  queuePlayerDirection,
  spawnLifeTargets,
  SpikePhase,
  updateStageSimulation,
} from './stageSimulation'
import { DamageSource, INITIAL_LIVES, MAX_LIVES } from './lifeRules'
import { ENTITY_MOVEMENT_SPEEDS } from './gamePacing'

describe('stage simulation', () => {
  it('starts with one life and rejects values outside the one-to-two range', () => {
    const maze = generatePerfectMaze(5, 5, 10)

    expect(createStageSimulation(maze).lives).toBe(INITIAL_LIVES)
    expect(createStageSimulation(maze, { lives: MAX_LIVES }).lives).toBe(MAX_LIVES)
    expect(() => createStageSimulation(maze, { lives: 0 })).toThrow(RangeError)
    expect(() => createStageSimulation(maze, { lives: 3 })).toThrow(RangeError)
  })

  it('does not move through a wall', () => {
    const maze = generatePerfectMaze(5, 5, 12)
    const simulation = createStageSimulation(maze)
    const entrance = maze.cells[simulation.player.cellIndex]
    const blockedDirection = [Direction.North, Direction.East, Direction.South, Direction.West]
      .find((direction) => {
        const before = simulation.player.cellIndex
        queuePlayerDirection(simulation, direction)
        updateStageSimulation(simulation, 0.1, { player: 1 })
        const blocked = simulation.player.cellIndex === before && simulation.player.targetCellIndex === null
        simulation.player.queuedDirection = null
        return blocked
      })

    expect(entrance).toBeDefined()
    expect(blockedDirection).toBeDefined()
    expect(getPlayerGridPosition(simulation)).toEqual({ x: entrance.x, y: entrance.y })
  })

  it('buffers a turn until the requested direction opens', () => {
    const maze = generatePerfectMaze(8, 8, 61)
    const route = routeBetween(maze, toIndex(maze.entrance.x, maze.entrance.y, maze.width), 6)
    const simulation = createStageSimulation(maze)
    const firstDirection = directionBetween(maze, route[0], route[1])
    const secondDirection = directionBetween(maze, route[1], route[2])

    queuePlayerDirection(simulation, firstDirection)
    updateStageSimulation(simulation, 0.25, { player: 2 })
    queuePlayerDirection(simulation, secondDirection)
    updateStageSimulation(simulation, 0.75, { player: 2 })

    expect(simulation.player.cellIndex).toBe(route[2])
    expect(simulation.player.direction).toBe(secondDirection)
  })

  it('collects coins on arrival and completes only at the exit', () => {
    const maze = generatePerfectMaze(6, 6, 84)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
    const route = routeTo(maze, entranceIndex, exitIndex)
    const simulation = createStageSimulation(maze, { coinIndices: route.slice(1, -1) })

    for (let index = 1; index < route.length; index += 1) {
      queuePlayerDirection(simulation, directionBetween(maze, route[index - 1], route[index]))
      updateStageSimulation(simulation, 1, { player: 1 })
    }

    expect(simulation.complete).toBe(true)
    expect(simulation.collectedCoins).toBe(route.length - 2)
    expect(simulation.coins.size).toBe(0)
  })

  it('completes a maze with an explicit empty coin set', () => {
    const maze = generatePerfectMaze(6, 6, 85)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
    const route = routeTo(maze, entranceIndex, exitIndex)
    const simulation = createStageSimulation(maze, { coinIndices: [] })

    for (let index = 1; index < route.length; index += 1) {
      queuePlayerDirection(simulation, directionBetween(maze, route[index - 1], route[index]))
      updateStageSimulation(simulation, 1, { player: 1 })
    }

    expect(simulation.coins.size).toBe(0)
    expect(simulation.collectedCoins).toBe(0)
    expect(simulation.complete).toBe(true)
  })

  it.each([
    ['Easy Peasy', 0.5],
    ['Normal', 1],
    ['Overclocked', 1.5],
  ])('advances %s gameplay time at %sx', (_label, multiplier) => {
    const maze = generatePerfectMaze(5, 5, 86)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
    const route = routeTo(maze, entranceIndex, exitIndex)
    const simulation = createStageSimulation(maze, {
      coinIndices: [],
      hunter: { startCellIndex: entranceIndex, releaseDelaySeconds: 2 },
    })
    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))

    updateStageSimulation(simulation, 0.4 * multiplier, { player: 1, hunter: 0.1 })

    expect(simulation.elapsedSeconds).toBeCloseTo(0.4 * multiplier)
    expect(simulation.player.progress).toBeCloseTo(0.4 * multiplier)
    expect(simulation.hunter?.releaseSecondsRemaining).toBeCloseTo(2 - 0.4 * multiplier)
  })

  it('releases the hunter only after the player moves and ends the run on contact', () => {
    const maze = generatePerfectMaze(6, 6, 108)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 4)
    const simulation = createStageSimulation(maze, {
      hunter: { startCellIndex: entranceIndex, releaseDelaySeconds: 0.5 },
    })

    updateStageSimulation(simulation, 0.5, { player: 0, hunter: 2 })
    expect(simulation.hunter?.active).toBe(false)

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5, hunter: 2 })
    expect(simulation.player.cellIndex).toBe(route[1])
    expect(simulation.hunter?.active).toBe(false)

    updateStageSimulation(simulation, 0.8, { player: 0, hunter: 2 })
    expect(simulation.hunter?.active).toBe(true)
    expect(getHunterGridPosition(simulation)).toEqual(getPlayerGridPosition(simulation))
    expect(simulation.gameOver).toBe(true)
  })

  it('reveals the Ambusher at five walkable tiles and stops the player on arrival', () => {
    const maze = generatePerfectMaze(8, 8, 109)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 7)
    const simulation = createStageSimulation(maze, {
      ambusher: { startCellIndex: route[6] },
    })

    updateStageSimulation(simulation, 0.1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 1 })
    expect(simulation.ambusher?.revealed).toBe(false)

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 1, { player: 1, hunter: 0, lifeTarget: 0, ambusher: 1 })

    expect(simulation.player.cellIndex).toBe(route[1])
    expect(simulation.player.targetCellIndex).toBeNull()
    expect(simulation.player.direction).toBeNull()
    expect(simulation.player.queuedDirection).toBeNull()
    expect(simulation.ambusher?.revealed).toBe(true)
    expect(simulation.ambusherReveals).toBe(1)
    expect(simulation.ambusher?.cellIndex).toBe(route[6])
  })

  it('pursues like a second hunter after the reveal tick', () => {
    const maze = generatePerfectMaze(8, 8, 110)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 7)
    const simulation = createStageSimulation(maze, {
      ambusher: { startCellIndex: route[6] },
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 1, { player: 1, hunter: 0, lifeTarget: 0, ambusher: 1 })
    updateStageSimulation(simulation, 1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 1 })

    expect(simulation.ambusher?.cellIndex).toBe(route[5])
    expect(getAmbusherGridPosition(simulation)).toEqual({
      x: maze.cells[route[5]].x,
      y: maze.cells[route[5]].y,
    })
    expect(simulation.ambusherReveals).toBe(1)
  })

  it('identifies Ambusher damage and keeps it revealed after a reserve-life reset', () => {
    const maze = generatePerfectMaze(8, 8, 111)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 7)
    const simulation = createStageSimulation(maze, {
      ambusher: { startCellIndex: route[6] },
      lives: MAX_LIVES,
    })
    simulation.ambusher!.revealed = true
    simulation.ambusher!.active = true
    simulation.ambusher!.cellIndex = entranceIndex

    updateStageSimulation(simulation, 0.1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0 })

    expect(simulation.lives).toBe(1)
    expect(simulation.lastDamageSource).toBe(DamageSource.Ambusher)
    expect(simulation.ambusher).toMatchObject({
      cellIndex: route[6],
      targetCellIndex: null,
      progress: 0,
      revealed: true,
      active: true,
    })
  })

  it('spawns the Wanderer on schedule and triggers at five walkable tiles', () => {
    const maze = generatePerfectMaze(8, 8, 112)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 7)
    const simulation = createStageSimulation(maze, {
      wanderer: {
        startCellIndex: route[6],
        departureCellIndex: entranceIndex,
        spawnSeconds: 1,
        routeSeed: 9,
      },
    })

    updateStageSimulation(simulation, 0.9, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 0 })
    expect(getWandererGridPosition(simulation)).toBeNull()

    updateStageSimulation(simulation, 0.1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 0 })
    expect(simulation.wandererSpawns).toBe(1)
    expect(simulation.wandererTriggers).toBe(0)

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 1, { player: 1, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 0 })

    expect(simulation.wanderer?.triggered).toBe(true)
    expect(simulation.wandererTriggers).toBe(1)
    expect(simulation.player.cellIndex).toBe(route[1])
    expect(simulation.player.direction).toBeNull()
    expect(simulation.player.queuedDirection).toBeNull()
  })

  it('combines an immediate spawn and proximity trigger into one simulation interruption', () => {
    const maze = generatePerfectMaze(6, 6, 113)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      wanderer: {
        startCellIndex: route[2],
        departureCellIndex: entranceIndex,
        spawnSeconds: 0.5,
        routeSeed: 10,
      },
    })

    updateStageSimulation(simulation, 0.5, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 1.5 })

    expect(simulation.wandererSpawns).toBe(1)
    expect(simulation.wandererTriggers).toBe(1)
    expect(simulation.wanderer).toMatchObject({ spawned: true, triggered: true, progress: 0 })
  })

  it('departs at Start while untriggered', () => {
    const maze = generatePerfectMaze(10, 10, 114)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 9)
    const simulation = createStageSimulation(maze, {
      wanderer: {
        startCellIndex: route[1],
        departureCellIndex: entranceIndex,
        spawnSeconds: 0,
        routeSeed: 11,
      },
    })
    simulation.player.cellIndex = route[8]

    updateStageSimulation(simulation, 1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 1 })

    expect(simulation.wanderer?.departed).toBe(true)
    expect(getWandererGridPosition(simulation)).toBeNull()
  })

  it('deals Wanderer damage and preserves exact state after reserve-life loss', () => {
    const maze = generatePerfectMaze(8, 8, 115)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const simulation = createStageSimulation(maze, {
      wanderer: {
        startCellIndex: entranceIndex,
        departureCellIndex: entranceIndex,
        spawnSeconds: 0,
        routeSeed: 12,
      },
      lives: MAX_LIVES,
    })
    Object.assign(simulation.wanderer!, {
      spawned: true,
      triggered: true,
      previousCellIndex: 3,
      routeDecisionCount: 4,
    })

    updateStageSimulation(simulation, 0.1, { player: 0, hunter: 0, lifeTarget: 0, ambusher: 0, wanderer: 0 })

    expect(simulation.lives).toBe(1)
    expect(simulation.lastDamageSource).toBe(DamageSource.Wanderer)
    expect(simulation.wanderer).toMatchObject({
      cellIndex: entranceIndex,
      previousCellIndex: 3,
      spawned: true,
      triggered: true,
      departed: false,
      routeDecisionCount: 4,
    })
  })

  it('does not pause a started release countdown when the player returns to the entrance', () => {
    const maze = generatePerfectMaze(6, 6, 205)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      hunter: { startCellIndex: entranceIndex, releaseDelaySeconds: 0.5 },
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5, hunter: 2 })
    queuePlayerDirection(simulation, directionBetween(maze, route[1], route[0]))
    updateStageSimulation(simulation, 0.2, { player: 5, hunter: 2 })

    expect(simulation.player.cellIndex).toBe(entranceIndex)
    expect(simulation.hunter?.releaseStarted).toBe(true)

    updateStageSimulation(simulation, 0.2, { player: 0, hunter: 2 })
    expect(simulation.hunter?.active).toBe(true)
    expect(simulation.gameOver).toBe(true)
  })

  it('uses a stable direction priority when a loop offers equal hunter routes', () => {
    const simulation = createStageSimulation(createFourCellLoop(), {
      hunter: { startCellIndex: 3, releaseDelaySeconds: 0 },
    })
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 1, { player: 0, hunter: 1 })

    expect(HUNTER_DIRECTION_PRIORITY).toEqual([
      Direction.North,
      Direction.East,
      Direction.South,
      Direction.West,
    ])
    expect(simulation.hunter?.cellIndex).toBe(1)
    expect(simulation.gameOver).toBe(false)
  })

  it('stops at a closed shutter and resumes automatically when it opens', () => {
    const simulation = createStageSimulation(createFourCellLoop(), {
      coinIndices: [],
      shutters: [{ fromCellIndex: 0, toCellIndex: 1, phaseOffsetSeconds: 5 }],
    })

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 0.5, { player: 1 })

    expect(simulation.player.cellIndex).toBe(0)
    expect(simulation.player.targetCellIndex).toBeNull()
    expect(simulation.player.queuedDirection).toBe(Direction.East)

    updateStageSimulation(simulation, 2.5, { player: 0.4 })

    expect(simulation.player.cellIndex).toBe(1)
    expect(simulation.player.targetCellIndex).toBeNull()
  })

  it('allows a committed crossing to finish after its shutter closes', () => {
    const simulation = createStageSimulation(createFourCellLoop(), {
      coinIndices: [],
      shutters: [{ fromCellIndex: 0, toCellIndex: 1, phaseOffsetSeconds: 0 }],
    })

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 0.5, { player: 1 })
    expect(simulation.player.progress).toBe(0.5)

    updateStageSimulation(simulation, 4.5, { player: 1 / 9 })

    expect(simulation.player.cellIndex).toBe(1)
    expect(simulation.player.targetCellIndex).toBeNull()
    expect(simulation.livesLost).toBe(0)
  })

  it('routes the hunter around active spikes', () => {
    const simulation = createStageSimulation(createFourCellLoop(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds: 2 }],
    })
    simulation.player.cellIndex = 3
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.2, { player: 0, hunter: 5 })

    expect(getSpikePhase(simulation.spikes[0], simulation.elapsedSeconds)).toBe(SpikePhase.Active)
    expect(simulation.hunter?.cellIndex).toBe(2)
    expect(simulation.livesLost).toBe(0)
  })

  it('routes the hunter around a closed shutter', () => {
    const simulation = createStageSimulation(createFourCellLoop(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      shutters: [{ fromCellIndex: 0, toCellIndex: 1, phaseOffsetSeconds: 5 }],
    })
    simulation.player.cellIndex = 3
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.2, { hunter: 5 })

    expect(simulation.hunter?.cellIndex).toBe(2)
    expect(simulation.livesLost).toBe(0)
  })

  it.each([
    ['inactive', 2],
    ['warning', 0.5],
    ['recovery', 1.6],
  ])('allows the hunter through a %s spike', (_phase, phaseOffsetSeconds) => {
    const simulation = createStageSimulation(createThreeCellLine(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds }],
    })
    simulation.player.cellIndex = 2
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 1, { player: 0, hunter: 1 })

    expect(simulation.hunter?.cellIndex).toBe(1)
    expect(simulation.livesLost).toBe(0)
  })

  it('finishes a committed crossing when its spike becomes active', () => {
    const simulation = createStageSimulation(createThreeCellLine(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds: 1.55 }],
    })
    simulation.player.cellIndex = 2
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.2, { player: 0, hunter: 1 })
    expect(simulation.hunter?.targetCellIndex).toBe(1)
    expect(simulation.hunter?.progress).toBeCloseTo(0.2)

    updateStageSimulation(simulation, 0.8, { player: 0, hunter: 1 })

    expect(getSpikePhase(simulation.spikes[0], simulation.elapsedSeconds)).toBe(SpikePhase.Active)
    expect(simulation.hunter?.cellIndex).toBe(1)
    expect(simulation.livesLost).toBe(0)
  })

  it('waits behind active spikes, then resumes when the route reopens', () => {
    const simulation = createStageSimulation(createThreeCellLine(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds: 2 }],
    })
    simulation.player.cellIndex = 2
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.2, { player: 0, hunter: 1 })
    expect(simulation.hunter?.cellIndex).toBe(0)
    expect(simulation.hunter?.targetCellIndex).toBeNull()

    updateStageSimulation(simulation, 0.6, { player: 0, hunter: 1 })

    expect(getSpikePhase(simulation.spikes[0], simulation.elapsedSeconds)).toBe(SpikePhase.Recovery)
    expect(simulation.hunter?.targetCellIndex).toBe(1)
    expect(simulation.hunter?.progress).toBeCloseTo(0.6)
  })

  it('lets the hunter leave an active spike without taking damage', () => {
    const simulation = createStageSimulation(createThreeCellLine(), {
      hunter: { startCellIndex: 1, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds: 2 }],
    })
    simulation.player.cellIndex = 2
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.2, { player: 0, hunter: 1 })

    expect(simulation.hunter?.cellIndex).toBe(1)
    expect(simulation.hunter?.targetCellIndex).toBe(2)
    expect(simulation.hunter?.progress).toBeCloseTo(0.2)
    expect(simulation.livesLost).toBe(0)
  })

  it('keeps the direct exit route winnable across braided seeds', () => {
    for (let seed = 0; seed < 100; seed += 1) {
      const maze = generateMaze(11, 7, seed)
      const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
      const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
      const route = routeTo(maze, entranceIndex, exitIndex)
      const simulation = createStageSimulation(maze, {
        hunter: { startCellIndex: entranceIndex, releaseDelaySeconds: 2.4 },
      })

      for (let index = 1; index < route.length && !simulation.gameOver; index += 1) {
        queuePlayerDirection(simulation, directionBetween(maze, route[index - 1], route[index]))
        updateStageSimulation(simulation, 1 / ENTITY_MOVEMENT_SPEEDS.player, ENTITY_MOVEMENT_SPEEDS)
      }

      expect(simulation.gameOver, `seed ${seed}`).toBe(false)
      expect(simulation.complete, `seed ${seed}`).toBe(true)
    }
  })

  it('spends a retained life and resets entities without restoring collected coins', () => {
    const maze = generatePerfectMaze(6, 6, 312)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 4)
    const simulation = createStageSimulation(maze, {
      coinIndices: [route[1]],
      hunter: { startCellIndex: entranceIndex, releaseDelaySeconds: 0 },
      lives: 2,
    })
    simulation.hunter!.releaseStarted = true

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5, hunter: 0 })
    expect(simulation.collectedCoins).toBe(1)

    updateStageSimulation(simulation, 0.5, { player: 0, hunter: 2 })

    expect(simulation.lives).toBe(1)
    expect(simulation.livesLost).toBe(1)
    expect(simulation.gameOver).toBe(false)
    expect(simulation.player.cellIndex).toBe(entranceIndex)
    expect(simulation.hunter?.cellIndex).toBe(entranceIndex)
    expect(simulation.hunter?.active).toBe(false)
    expect(simulation.coins.size).toBe(0)
    expect(simulation.collectedCoins).toBe(1)
  })

  it('collects an extra-life target exactly once', () => {
    const maze = generatePerfectMaze(6, 6, 711)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      lifeTarget: { startCellIndex: route[1] },
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5 })
    updateStageSimulation(simulation, 1, { player: 0 })

    expect(simulation.lives).toBe(2)
    expect(simulation.livesGained).toBe(1)
    expect(simulation.lifeTarget?.collected).toBe(true)
    expect(getLifeTargetGridPosition(simulation)).toBeNull()
  })

  it('never grants more than two lives', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      lifeTarget: { startCellIndex: 1 },
      lives: MAX_LIVES,
    })

    simulation.player.cellIndex = 1
    updateStageSimulation(simulation, 0.1, { player: 0 })

    expect(simulation.lives).toBe(MAX_LIVES)
    expect(simulation.livesGained).toBe(0)
    expect(simulation.lifeTarget?.collected).toBe(true)
  })

  it('captures multiple bonus targets without granting lives', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      lifeTargets: [
        { startCellIndex: 1, effect: LifeTargetEffect.BonusMultiplier },
      ],
    })
    spawnLifeTargets(simulation, [1], LifeTargetEffect.BonusMultiplier)

    simulation.player.cellIndex = 1
    updateStageSimulation(simulation, 0.1, { player: 0, lifeTarget: 0 })

    expect(simulation.bonusTargetsCaptured).toBe(2)
    expect(simulation.lives).toBe(INITIAL_LIVES)
    expect(simulation.livesGained).toBe(0)
    expect(getLifeTargetGridPositions(simulation).size).toBe(0)
  })

  it('can cross the exit without completing the stage', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, { exitCompletesStage: false })

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 2, { player: 1 })

    expect(simulation.player.cellIndex).toBe(2)
    expect(simulation.complete).toBe(false)
  })

  it('moves the extra-life target down the route that increases player distance', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      lifeTarget: { startCellIndex: 1 },
    })

    updateStageSimulation(simulation, 1, { player: 0, hunter: 0, lifeTarget: 1 })

    expect(simulation.lifeTarget?.cellIndex).toBe(2)
    expect(getLifeTargetGridPosition(simulation)).toEqual({ x: 2, y: 0 })
    expect(simulation.lives).toBe(1)
  })

  it('leaves a local maximum to explore a less-visited branch', () => {
    const maze = createBranchedCorridor()
    const simulation = createStageSimulation(maze, {
      lifeTarget: { startCellIndex: 2 },
    })
    const visitedCells: number[] = []

    for (let update = 0; update < 3; update += 1) {
      updateStageSimulation(simulation, 1, { player: 0, hunter: 0, lifeTarget: 1 })
      visitedCells.push(simulation.lifeTarget!.cellIndex)
    }

    expect(visitedCells).toEqual([1, 4, 5])
    expect(simulation.lifeTarget?.cellIndex).toBe(5)
    expect(simulation.lifeTarget?.explorationTargetCellIndex).toBeNull()
    expect(simulation.lifeTarget?.targetCellIndex).toBeNull()
    expect(simulation.lifeTarget?.visitCounts[2]).toBe(1)
    expect(simulation.lifeTarget?.visitCounts[5]).toBe(1)
  })

  it('cycles spikes through readable telegraph phases', () => {
    const spike = { cellIndex: 0, phaseOffsetSeconds: 0 }

    expect(getSpikePhase(spike, 0)).toBe(SpikePhase.Inactive)
    expect(getSpikePhase(spike, 1.5)).toBe(SpikePhase.Warning)
    expect(getSpikePhase(spike, 2.1)).toBe(SpikePhase.Active)
    expect(getSpikePhase(spike, 2.7)).toBe(SpikePhase.Recovery)
    expect(getSpikePhase(spike, 3)).toBe(SpikePhase.Inactive)
  })

  it('does not damage the player during a spike warning', () => {
    const maze = generatePerfectMaze(6, 6, 902)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      spikes: [{ cellIndex: route[1], phaseOffsetSeconds: 1.3 }],
      lives: 2,
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5 })

    expect(getSpikePhase(simulation.spikes[0], simulation.elapsedSeconds)).toBe(SpikePhase.Warning)
    expect(simulation.lives).toBe(2)
    expect(simulation.livesLost).toBe(0)
    expect(simulation.player.cellIndex).toBe(route[1])
  })

  it('spends a life on an active spike without resetting coins or the hazard clock', () => {
    const maze = generatePerfectMaze(6, 6, 903)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      coinIndices: [route[1]],
      spikes: [{ cellIndex: route[1], phaseOffsetSeconds: 2 }],
      lives: 2,
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5 })

    expect(getSpikePhase(simulation.spikes[0], simulation.elapsedSeconds)).toBe(SpikePhase.Active)
    expect(simulation.lives).toBe(1)
    expect(simulation.livesLost).toBe(1)
    expect(simulation.gameOver).toBe(false)
    expect(simulation.player.cellIndex).toBe(entranceIndex)
    expect(simulation.collectedCoins).toBe(1)
    expect(simulation.coins.size).toBe(0)
    expect(simulation.elapsedSeconds).toBeCloseTo(0.2)
  })

  it('ends the run when an active spike takes the final life', () => {
    const maze = generatePerfectMaze(6, 6, 904)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const route = routeBetween(maze, entranceIndex, 3)
    const simulation = createStageSimulation(maze, {
      spikes: [{ cellIndex: route[1], phaseOffsetSeconds: 2 }],
    })

    queuePlayerDirection(simulation, directionBetween(maze, route[0], route[1]))
    updateStageSimulation(simulation, 0.2, { player: 5 })

    expect(simulation.lives).toBe(0)
    expect(simulation.livesLost).toBe(1)
    expect(simulation.lastDamageSource).toBe(DamageSource.Spike)
    expect(simulation.gameOver).toBe(true)
  })

  it('records hunter damage once when hunter and spike overlap', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      hunter: { startCellIndex: 1, releaseDelaySeconds: 0 },
      spikes: [{ cellIndex: 1, phaseOffsetSeconds: 2 }],
      lives: MAX_LIVES,
    })
    simulation.player.cellIndex = 1
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    updateStageSimulation(simulation, 0.1, { player: 0, hunter: 0 })

    expect(simulation.lives).toBe(1)
    expect(simulation.livesLost).toBe(1)
    expect(simulation.lastDamageSource).toBe(DamageSource.Hunter)
  })

  it('reuses a portal to return only the player to the entrance', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      coinIndices: [1],
      hunter: { startCellIndex: 2, releaseDelaySeconds: 0 },
      lifeTarget: { startCellIndex: 2 },
      portalIndices: [1],
      lives: 2,
    })
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true
    const hunterBefore = { ...simulation.hunter! }
    const elapsedBefore = simulation.elapsedSeconds

    for (let use = 1; use <= 2; use += 1) {
      queuePlayerDirection(simulation, Direction.East)
      updateStageSimulation(simulation, 2, { player: 1 })

      expect(simulation.player.cellIndex).toBe(0)
      expect(simulation.player.targetCellIndex).toBeNull()
      expect(simulation.player.progress).toBe(0)
      expect(simulation.player.direction).toBeNull()
      expect(simulation.player.queuedDirection).toBeNull()
      expect(simulation.portalUses).toBe(use)
    }

    expect(simulation.hunter).toEqual(hunterBefore)
    expect(simulation.lifeTarget?.cellIndex).toBe(2)
    expect(simulation.lives).toBe(2)
    expect(simulation.livesLost).toBe(0)
    expect(simulation.collectedCoins).toBe(1)
    expect(simulation.coins.size).toBe(0)
    expect(simulation.elapsedSeconds).toBe(elapsedBefore + 4)
    expect(simulation.complete).toBe(false)
  })

  it('does not teleport non-player entities or players at ordinary dead ends', () => {
    const maze = createThreeCellLine()
    const simulation = createStageSimulation(maze, {
      hunter: { startCellIndex: 2, releaseDelaySeconds: 0 },
      lifeTarget: { startCellIndex: 2 },
      portalIndices: [1],
    })

    updateStageSimulation(simulation, 1, { player: 0, hunter: 0, lifeTarget: 1 })
    expect(simulation.lifeTarget?.cellIndex).toBe(1)
    expect(simulation.portalUses).toBe(0)

    const ordinarySimulation = createStageSimulation(maze)
    queuePlayerDirection(ordinarySimulation, Direction.East)
    updateStageSimulation(ordinarySimulation, 1, { player: 1 })
    expect(ordinarySimulation.player.cellIndex).toBe(1)
    expect(ordinarySimulation.portalUses).toBe(0)
  })

  it('returns from Start to the last portal only after leaving Start', () => {
    const maze = createBranchedCorridor()
    const simulation = createStageSimulation(maze, { portalIndices: [2] })

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 2, { player: 1 })

    expect(simulation.player.cellIndex).toBe(0)
    expect(simulation.lastUsedPortalCellIndex).toBe(2)
    expect(simulation.portalReturnArmed).toBe(false)
    expect(simulation.portalUses).toBe(1)

    queuePlayerDirection(simulation, Direction.North)
    updateStageSimulation(simulation, 0.5, { player: 1 })
    expect(simulation.player.cellIndex).toBe(0)
    expect(simulation.portalReturnArmed).toBe(false)

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 0.5, { player: 1 })
    expect(simulation.portalReturnArmed).toBe(true)
    expect(getPlayerGridPosition(simulation)).toEqual({ x: 0.5, y: 0 })

    queuePlayerDirection(simulation, Direction.West)
    updateStageSimulation(simulation, 1.5, { player: 1 })

    expect(simulation.player.cellIndex).toBe(2)
    expect(simulation.player.targetCellIndex).toBeNull()
    expect(simulation.player.progress).toBe(0)
    expect(simulation.player.direction).toBeNull()
    expect(simulation.player.queuedDirection).toBeNull()
    expect(simulation.lastUsedPortalCellIndex).toBe(2)
    expect(simulation.portalReturnArmed).toBe(true)
    expect(simulation.portalUses).toBe(2)

    queuePlayerDirection(simulation, Direction.West)
    updateStageSimulation(simulation, 2, { player: 1 })
    expect(simulation.player.cellIndex).toBe(2)
    expect(simulation.portalUses).toBe(3)
  })

  it('replaces the Start return destination with the latest portal used', () => {
    const maze = createBranchedCorridor()
    const simulation = createStageSimulation(maze, { portalIndices: [2, 3] })

    queuePlayerDirection(simulation, Direction.East)
    updateStageSimulation(simulation, 2, { player: 1 })
    expect(simulation.lastUsedPortalCellIndex).toBe(2)

    queuePlayerDirection(simulation, Direction.South)
    updateStageSimulation(simulation, 1, { player: 1 })

    expect(simulation.player.cellIndex).toBe(0)
    expect(simulation.lastUsedPortalCellIndex).toBe(3)
    expect(simulation.portalReturnArmed).toBe(false)
    expect(simulation.portalUses).toBe(2)
  })

  it('applies normal collision risk at the return portal and clears the link on life loss', () => {
    const maze = createBranchedCorridor()
    const simulation = createStageSimulation(maze, {
      hunter: { startCellIndex: 2, releaseDelaySeconds: 0 },
      portalIndices: [2],
      lives: 2,
    })
    simulation.player.cellIndex = 1
    simulation.lastUsedPortalCellIndex = 2
    simulation.portalReturnArmed = true
    simulation.hunter!.active = true
    simulation.hunter!.releaseStarted = true

    queuePlayerDirection(simulation, Direction.West)
    updateStageSimulation(simulation, 1, { player: 1 })

    expect(simulation.portalUses).toBe(1)
    expect(simulation.lives).toBe(1)
    expect(simulation.livesLost).toBe(1)
    expect(simulation.player.cellIndex).toBe(0)
    expect(simulation.lastUsedPortalCellIndex).toBeNull()
    expect(simulation.portalReturnArmed).toBe(false)
  })
})

function createFourCellLoop(): Maze {
  return {
    width: 2,
    height: 2,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: 1, y: 1 },
    braids: [{ fromIndex: 2, toIndex: 3, cycleLength: 4, pathIndices: [2, 0, 1, 3] }],
    cells: [
      { x: 0, y: 0, walls: Wall.North | Wall.West },
      { x: 1, y: 0, walls: Wall.North | Wall.East },
      { x: 0, y: 1, walls: Wall.South | Wall.West },
      { x: 1, y: 1, walls: Wall.East | Wall.South },
    ],
  }
}

function routeBetween(maze: ReturnType<typeof generatePerfectMaze>, startIndex: number, length: number): number[] {
  const route = [startIndex]
  let previous = -1

  while (route.length < length) {
    const current = route[route.length - 1]
    const next = getOpenNeighborIndices(maze, current).find((index) => index !== previous)

    if (next === undefined) {
      break
    }

    previous = current
    route.push(next)
  }

  if (route.length < 3) {
    throw new Error('Expected a route with at least three cells.')
  }

  return route
}

function routeTo(maze: ReturnType<typeof generatePerfectMaze>, startIndex: number, targetIndex: number): number[] {
  const previous = new Int32Array(maze.cells.length).fill(-1)
  const pending = [startIndex]
  previous[startIndex] = startIndex

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]

    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (previous[neighbor] === -1) {
        previous[neighbor] = current
        pending.push(neighbor)
      }
    }
  }

  const route = [targetIndex]
  while (route[route.length - 1] !== startIndex) {
    route.push(previous[route[route.length - 1]])
  }

  return route.reverse()
}

function directionBetween(
  maze: ReturnType<typeof generatePerfectMaze>,
  fromIndex: number,
  toIndexValue: number,
) {
  const from = maze.cells[fromIndex]
  const to = maze.cells[toIndexValue]

  if (to.x > from.x) return Direction.East
  if (to.x < from.x) return Direction.West
  if (to.y > from.y) return Direction.South
  return Direction.North
}

function createThreeCellLine(): Maze {
  return {
    width: 3,
    height: 1,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: 2, y: 0 },
    braids: [],
    cells: [
      { x: 0, y: 0, walls: Wall.North | Wall.South | Wall.West },
      { x: 1, y: 0, walls: Wall.North | Wall.South },
      { x: 2, y: 0, walls: Wall.North | Wall.East | Wall.South },
    ],
  }
}

function createBranchedCorridor(): Maze {
  return {
    width: 3,
    height: 2,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: 2, y: 1 },
    braids: [],
    cells: [
      { x: 0, y: 0, walls: Wall.North | Wall.West },
      { x: 1, y: 0, walls: Wall.North },
      { x: 2, y: 0, walls: Wall.North | Wall.East | Wall.South },
      { x: 0, y: 1, walls: Wall.East | Wall.South | Wall.West },
      { x: 1, y: 1, walls: Wall.South },
      { x: 2, y: 1, walls: Wall.North | Wall.East | Wall.South },
    ],
  }
}
