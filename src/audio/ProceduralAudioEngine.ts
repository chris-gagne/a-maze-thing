import { AudioCueName, AudioMood, type AudioCue, type AudioMood as AudioMoodValue, type ReactiveAudio } from './audioTypes'

type AudioContextFactory = () => AudioContext

interface AudioGraph {
  context: AudioContext
  master: GainNode
  music: GainNode
  effects: GainNode
}

const MASTER_LEVEL = 0.58
const MUSIC_LEVEL = 0.16
const EFFECTS_LEVEL = 0.42

export class ProceduralAudioEngine implements ReactiveAudio {
  private graph: AudioGraph | null = null
  private readonly createContext: AudioContextFactory
  private mood: AudioMoodValue = AudioMood.Silent
  private muted: boolean
  private pulseTimer: number | null = null
  private pulseStep = 0
  private disposed = false

  constructor(
    muted = false,
    createContext: AudioContextFactory = () => new AudioContext(),
  ) {
    this.muted = muted
    this.createContext = createContext
  }

  async unlock(): Promise<void> {
    if (this.disposed) return
    if (this.graph === null) this.graph = createGraph(this.createContext())
    if (this.graph.context.state === 'suspended') await this.graph.context.resume()
    this.applyMasterLevel()
    this.refreshPulse()
  }

  play(cue: AudioCue): void {
    if (this.graph === null || this.muted || this.disposed) return
    const motif = getCueMotif(cue.name)
    motif.forEach((note) => {
      this.playTone(
        note.frequency,
        note.delay,
        note.duration,
        note.level * (cue.intensity ?? 1),
        note.wave,
        cue.pan ?? 0,
      )
    })
  }

  setMood(mood: AudioMoodValue): void {
    if (this.mood === mood) return
    this.mood = mood
    this.pulseStep = 0
    this.refreshPulse()
  }

  setMuted(muted: boolean): void {
    if (this.muted === muted) return
    this.muted = muted
    this.applyMasterLevel()
    this.refreshPulse()
  }

  isMuted(): boolean {
    return this.muted
  }

  dispose(): void {
    this.disposed = true
    this.stopPulse()
    if (this.graph !== null) void this.graph.context.close()
    this.graph = null
  }

  private applyMasterLevel(): void {
    if (this.graph === null) return
    const { context, master } = this.graph
    master.gain.cancelScheduledValues(context.currentTime)
    master.gain.setTargetAtTime(this.muted ? 0 : MASTER_LEVEL, context.currentTime, 0.018)
  }

  private refreshPulse(): void {
    this.stopPulse()
    if (this.graph === null || this.muted || this.mood === AudioMood.Silent || this.disposed) return
    this.schedulePulse()
  }

  private schedulePulse(): void {
    if (this.graph === null) return
    const profile = getPulseProfile(this.mood)
    const frequency = profile.notes[this.pulseStep % profile.notes.length]
    this.playTone(frequency, 0, profile.duration, profile.level, 'square', 0, true)
    this.pulseStep += 1
    this.pulseTimer = window.setTimeout(() => this.schedulePulse(), profile.intervalMilliseconds)
  }

  private stopPulse(): void {
    if (this.pulseTimer !== null) window.clearTimeout(this.pulseTimer)
    this.pulseTimer = null
  }

  private playTone(
    frequency: number,
    delay: number,
    duration: number,
    level: number,
    wave: OscillatorType,
    pan: number,
    music = false,
  ): void {
    if (this.graph === null) return
    const { context } = this.graph
    const start = context.currentTime + delay
    const oscillator = context.createOscillator()
    const envelope = context.createGain()
    const panner = context.createStereoPanner()
    oscillator.type = wave
    oscillator.frequency.setValueAtTime(frequency, start)
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start)
    envelope.gain.setValueAtTime(0.0001, start)
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, level), start + 0.008)
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration)
    oscillator.connect(envelope).connect(panner).connect(music ? this.graph.music : this.graph.effects)
    oscillator.start(start)
    oscillator.stop(start + duration + 0.015)
  }
}

function createGraph(context: AudioContext): AudioGraph {
  const master = context.createGain()
  const music = context.createGain()
  const effects = context.createGain()
  const compressor = context.createDynamicsCompressor()
  master.gain.value = 0
  music.gain.value = MUSIC_LEVEL
  effects.gain.value = EFFECTS_LEVEL
  compressor.threshold.value = -16
  compressor.knee.value = 12
  compressor.ratio.value = 4
  compressor.attack.value = 0.004
  compressor.release.value = 0.18
  music.connect(master)
  effects.connect(master)
  master.connect(compressor).connect(context.destination)
  return { context, master, music, effects }
}

interface ToneNote {
  frequency: number
  delay: number
  duration: number
  level: number
  wave: OscillatorType
}

function getCueMotif(name: AudioCue['name']): readonly ToneNote[] {
  const note = (frequency: number, delay: number, duration: number, level: number, wave: OscillatorType = 'square'): ToneNote => ({
    frequency, delay, duration, level, wave,
  })
  switch (name) {
    case AudioCueName.Coin: return [note(740, 0, 0.055, 0.24), note(988, 0.045, 0.075, 0.2)]
    case AudioCueName.Portal: return [note(196, 0, 0.18, 0.24, 'sine'), note(392, 0.07, 0.2, 0.18, 'sine')]
    case AudioCueName.ExtraLife: return [note(523, 0, 0.1, 0.2), note(659, 0.09, 0.1, 0.2), note(784, 0.18, 0.16, 0.22)]
    case AudioCueName.HunterRelease: return [note(110, 0, 0.28, 0.24, 'sawtooth')]
    case AudioCueName.AmbusherReveal: return [note(147, 0, 0.11, 0.28, 'sawtooth'), note(104, 0.1, 0.2, 0.26, 'sawtooth')]
    case AudioCueName.WandererEnter: return [note(330, 0, 0.12, 0.16, 'triangle'), note(294, 0.1, 0.16, 0.16, 'triangle')]
    case AudioCueName.WandererTrigger: return [note(220, 0, 0.09, 0.25, 'sawtooth'), note(165, 0.075, 0.22, 0.24, 'sawtooth')]
    case AudioCueName.WandererDepart: return [note(392, 0, 0.1, 0.16, 'triangle'), note(523, 0.09, 0.16, 0.14, 'triangle')]
    case AudioCueName.SpikeWarning: return [note(880, 0, 0.055, 0.15)]
    case AudioCueName.SpikeActive: return [note(120, 0, 0.13, 0.2, 'sawtooth')]
    case AudioCueName.ShutterWarning: return [note(440, 0, 0.06, 0.16), note(440, 0.1, 0.06, 0.14)]
    case AudioCueName.ShutterClose: return [note(82, 0, 0.18, 0.24, 'square')]
    case AudioCueName.ShutterOpen: return [note(165, 0, 0.11, 0.13, 'triangle')]
    case AudioCueName.StageClear: return [note(392, 0, 0.1, 0.2), note(523, 0.1, 0.1, 0.2), note(659, 0.2, 0.24, 0.22)]
    case AudioCueName.GameOver: return [note(196, 0, 0.16, 0.24, 'triangle'), note(147, 0.14, 0.2, 0.22, 'triangle'), note(98, 0.32, 0.35, 0.22, 'triangle')]
    case AudioCueName.Pause: return [note(294, 0, 0.08, 0.14, 'triangle')]
    case AudioCueName.Resume: return [note(392, 0, 0.08, 0.14, 'triangle')]
    case AudioCueName.UiMove: return [note(440, 0, 0.04, 0.1)]
    case AudioCueName.UiConfirm: return [note(587, 0, 0.07, 0.14)]
    default: return [note(92, 0, 0.24, 0.28, 'sawtooth')]
  }
}

function getPulseProfile(mood: AudioMoodValue): {
  notes: readonly number[]
  intervalMilliseconds: number
  duration: number
  level: number
} {
  switch (mood) {
    case AudioMood.Danger:
      return { notes: [110, 147, 110, 165], intervalMilliseconds: 290, duration: 0.075, level: 0.28 }
    case AudioMood.Pursuit:
      return { notes: [98, 98, 123, 98], intervalMilliseconds: 430, duration: 0.065, level: 0.22 }
    default:
      return { notes: [82, 110, 82, 123], intervalMilliseconds: 720, duration: 0.055, level: 0.14 }
  }
}
