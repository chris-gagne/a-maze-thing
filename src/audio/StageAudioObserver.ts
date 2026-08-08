import { getOpenNeighborIndices, type Maze } from '../generation/maze'
import { DamageSource } from '../game/lifeRules'
import { getShutterPhase, ShutterPhase } from '../game/shutterTiming'
import { getSpikePhase, SpikePhase } from '../game/spikeTiming'
import type { StageSimulation } from '../game/stageSimulation'
import { AudioCueName, AudioMood, type AudioCue, type AudioMood as AudioMoodValue } from './audioTypes'

export interface StageAudioUpdate {
  cues: AudioCue[]
  mood: AudioMoodValue
}

interface ObserverSnapshot {
  collectedCoins: number
  portalUses: number
  livesGained: number
  livesLost: number
  hunterActive: boolean
  ambusherReveals: number
  wandererSpawns: number
  wandererTriggers: number
  wandererDeparted: boolean
  complete: boolean
  gameOver: boolean
  spikePhases: string[]
  shutterPhases: string[]
}

const HAZARD_AUDIBLE_DISTANCE = 5

export class StageAudioObserver {
  private snapshot: ObserverSnapshot

  constructor(simulation: StageSimulation) {
    this.snapshot = takeSnapshot(simulation)
  }

  observe(simulation: StageSimulation): StageAudioUpdate {
    const previous = this.snapshot
    const current = takeSnapshot(simulation)
    const cues: AudioCue[] = []

    if (current.collectedCoins > previous.collectedCoins) {
      cues.push({
        name: AudioCueName.Coin,
        intensity: Math.min(1, 0.55 + (current.collectedCoins - previous.collectedCoins) * 0.15),
      })
    }
    if (current.portalUses > previous.portalUses) cues.push({ name: AudioCueName.Portal })
    if (current.livesGained > previous.livesGained) cues.push({ name: AudioCueName.ExtraLife })
    if (!previous.hunterActive && current.hunterActive) cues.push({ name: AudioCueName.HunterRelease })
    if (current.ambusherReveals > previous.ambusherReveals) cues.push({ name: AudioCueName.AmbusherReveal })

    const wandererSpawned = current.wandererSpawns > previous.wandererSpawns
    const wandererTriggered = current.wandererTriggers > previous.wandererTriggers
    if (wandererTriggered) {
      cues.push({ name: AudioCueName.WandererTrigger })
    } else if (wandererSpawned) {
      cues.push({ name: AudioCueName.WandererEnter })
    }
    if (!previous.wandererDeparted && current.wandererDeparted) {
      cues.push({ name: AudioCueName.WandererDepart })
    }

    appendHazardCues(cues, simulation, previous, current)

    if (current.livesLost > previous.livesLost) {
      if (current.gameOver) {
        cues.push({ name: AudioCueName.GameOver })
      } else {
        cues.push({ name: damageCueName(simulation) })
      }
    } else if (!previous.complete && current.complete) {
      cues.push({ name: AudioCueName.StageClear })
    }

    this.snapshot = current
    return { cues, mood: getMood(simulation) }
  }
}

function takeSnapshot(simulation: StageSimulation): ObserverSnapshot {
  return {
    collectedCoins: simulation.collectedCoins,
    portalUses: simulation.portalUses,
    livesGained: simulation.livesGained,
    livesLost: simulation.livesLost,
    hunterActive: simulation.hunter?.active ?? false,
    ambusherReveals: simulation.ambusherReveals,
    wandererSpawns: simulation.wandererSpawns,
    wandererTriggers: simulation.wandererTriggers,
    wandererDeparted: simulation.wanderer?.departed ?? false,
    complete: simulation.complete,
    gameOver: simulation.gameOver,
    spikePhases: simulation.spikes.map((spike) => getSpikePhase(spike, simulation.elapsedSeconds)),
    shutterPhases: simulation.shutters.map((shutter) => getShutterPhase(shutter, simulation.elapsedSeconds)),
  }
}

function appendHazardCues(
  cues: AudioCue[],
  simulation: StageSimulation,
  previous: ObserverSnapshot,
  current: ObserverSnapshot,
): void {
  const playerIndex = simulation.player.targetCellIndex ?? simulation.player.cellIndex
  const distances = getDistances(simulation.maze, playerIndex)
  const candidates = new Map<string, { distance: number, pan: number }>()

  simulation.spikes.forEach((spike, index) => {
    const phase = current.spikePhases[index]
    if (phase === previous.spikePhases[index]) return
    const name = phase === SpikePhase.Warning
      ? AudioCueName.SpikeWarning
      : phase === SpikePhase.Active ? AudioCueName.SpikeActive : null
    if (name !== null) addHazardCandidate(candidates, name, spike.cellIndex, distances, simulation.maze, playerIndex)
  })

  simulation.shutters.forEach((shutter, index) => {
    const phase = current.shutterPhases[index]
    if (phase === previous.shutterPhases[index]) return
    const name = phase === ShutterPhase.Warning
      ? AudioCueName.ShutterWarning
      : phase === ShutterPhase.Closed
        ? AudioCueName.ShutterClose
        : AudioCueName.ShutterOpen
    const endpoint = distances[shutter.fromCellIndex] <= distances[shutter.toCellIndex]
      ? shutter.fromCellIndex
      : shutter.toCellIndex
    addHazardCandidate(candidates, name, endpoint, distances, simulation.maze, playerIndex)
  })

  for (const [name, candidate] of candidates) {
    cues.push({
      name: name as AudioCue['name'],
      intensity: 1 - candidate.distance / (HAZARD_AUDIBLE_DISTANCE + 1) * 0.35,
      pan: candidate.pan,
    })
  }
}

function addHazardCandidate(
  candidates: Map<string, { distance: number, pan: number }>,
  name: string,
  cellIndex: number,
  distances: Int32Array,
  maze: Maze,
  playerIndex: number,
): void {
  const distance = distances[cellIndex]
  if (distance < 0 || distance > HAZARD_AUDIBLE_DISTANCE) return
  const existing = candidates.get(name)
  if (existing !== undefined && existing.distance <= distance) return
  const horizontalDistance = maze.cells[cellIndex].x - maze.cells[playerIndex].x
  candidates.set(name, {
    distance,
    pan: Math.max(-1, Math.min(1, horizontalDistance / HAZARD_AUDIBLE_DISTANCE)),
  })
}

function getDistances(maze: Maze, startIndex: number): Int32Array {
  const distances = new Int32Array(maze.cells.length).fill(-1)
  const pending = new Int32Array(maze.cells.length)
  let head = 0
  let tail = 0
  pending[tail++] = startIndex
  distances[startIndex] = 0
  while (head < tail) {
    const current = pending[head++]
    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (distances[neighbor] !== -1) continue
      distances[neighbor] = distances[current] + 1
      pending[tail++] = neighbor
    }
  }
  return distances
}

function damageCueName(simulation: StageSimulation): AudioCue['name'] {
  switch (simulation.lastDamageSource) {
    case DamageSource.Hunter: return AudioCueName.DamageHunter
    case DamageSource.Spike: return AudioCueName.DamageSpike
    case DamageSource.Ambusher: return AudioCueName.DamageAmbusher
    case DamageSource.Wanderer: return AudioCueName.DamageWanderer
    default: return AudioCueName.DamageHunter
  }
}

function getMood(simulation: StageSimulation): AudioMoodValue {
  if (simulation.complete || simulation.gameOver) return AudioMood.Silent
  if (simulation.ambusher?.active || simulation.wanderer?.triggered) return AudioMood.Danger
  if (simulation.hunter?.active) return AudioMood.Pursuit
  return AudioMood.Calm
}
