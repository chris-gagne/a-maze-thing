import { describe, expect, it } from 'vitest'
import { type Maze, Wall } from '../generation/maze'
import { DamageSource } from '../game/lifeRules'
import { createStageSimulation } from '../game/stageSimulation'
import { AudioCueName, AudioMood } from './audioTypes'
import { StageAudioObserver } from './StageAudioObserver'

describe('StageAudioObserver', () => {
  it('is silent on initialization and emits counter edges once', () => {
    const simulation = createStageSimulation(createLoop(), { coinIndices: [1], portalIndices: [2] })
    const observer = new StageAudioObserver(simulation)

    expect(observer.observe(simulation)).toEqual({ cues: [], mood: AudioMood.Calm })
    simulation.collectedCoins += 1
    simulation.portalUses += 1
    expect(observer.observe(simulation).cues.map((cue) => cue.name)).toEqual([
      AudioCueName.Coin,
      AudioCueName.Portal,
    ])
    expect(observer.observe(simulation).cues).toEqual([])
  })

  it('emits pursuit moods and combines immediate Wanderer arrival with trigger', () => {
    const simulation = createStageSimulation(createLoop(), {
      hunter: { startCellIndex: 0, releaseDelaySeconds: 0 },
      wanderer: { startCellIndex: 3, departureCellIndex: 0, spawnSeconds: 0, routeSeed: 1 },
    })
    const observer = new StageAudioObserver(simulation)

    simulation.hunter!.active = true
    expect(observer.observe(simulation).mood).toBe(AudioMood.Pursuit)
    simulation.wanderer!.spawned = true
    simulation.wanderer!.triggered = true
    simulation.wandererSpawns = 1
    simulation.wandererTriggers = 1
    const update = observer.observe(simulation)
    expect(update.mood).toBe(AudioMood.Danger)
    expect(update.cues.map((cue) => cue.name)).toEqual([AudioCueName.WandererTrigger])
  })

  it('emits only game over rather than a reserve-life damage cue on final loss', () => {
    const simulation = createStageSimulation(createLoop())
    const observer = new StageAudioObserver(simulation)
    simulation.livesLost = 1
    simulation.gameOver = true
    simulation.lastDamageSource = DamageSource.Spike

    expect(observer.observe(simulation)).toEqual({
      cues: [{ name: AudioCueName.GameOver }],
      mood: AudioMood.Silent,
    })
  })

  it('emits nearby hazard transitions with pan and ignores distant hazards', () => {
    const maze = createCorridor(8)
    const simulation = createStageSimulation(maze, {
      spikes: [
        { cellIndex: 2, phaseOffsetSeconds: 0.4 },
        { cellIndex: 7, phaseOffsetSeconds: 0.4 },
      ],
      shutters: [{ fromCellIndex: 3, toCellIndex: 4, phaseOffsetSeconds: 0 }],
    })
    const observer = new StageAudioObserver(simulation)
    simulation.elapsedSeconds = 4

    const cues = observer.observe(simulation).cues
    expect(cues.map((cue) => cue.name)).toEqual([
      AudioCueName.SpikeWarning,
      AudioCueName.ShutterWarning,
    ])
    expect(cues.every((cue) => (cue.pan ?? 0) > 0)).toBe(true)
  })

  it('coalesces simultaneous matching hazards to the nearest cue', () => {
    const simulation = createStageSimulation(createCorridor(5), {
      spikes: [
        { cellIndex: 1, phaseOffsetSeconds: 0 },
        { cellIndex: 3, phaseOffsetSeconds: 0 },
      ],
    })
    const observer = new StageAudioObserver(simulation)
    simulation.elapsedSeconds = 1.4

    const cues = observer.observe(simulation).cues
    expect(cues).toHaveLength(1)
    expect(cues[0].name).toBe(AudioCueName.SpikeWarning)
  })
})

function createLoop(): Maze {
  return {
    width: 2,
    height: 2,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: 1, y: 1 },
    braids: [],
    cells: [
      { x: 0, y: 0, walls: Wall.North | Wall.West },
      { x: 1, y: 0, walls: Wall.North | Wall.East },
      { x: 0, y: 1, walls: Wall.South | Wall.West },
      { x: 1, y: 1, walls: Wall.East | Wall.South },
    ],
  }
}

function createCorridor(length: number): Maze {
  return {
    width: length,
    height: 1,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: length - 1, y: 0 },
    braids: [],
    cells: Array.from({ length }, (_, x) => ({
      x,
      y: 0,
      walls: Wall.North | Wall.South | (x === 0 ? Wall.West : 0) | (x === length - 1 ? Wall.East : 0),
    })),
  }
}
