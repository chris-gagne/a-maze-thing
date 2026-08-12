export const AudioMood = {
  Silent: 'silent',
  Calm: 'calm',
  Pursuit: 'pursuit',
  Danger: 'danger',
  Bonus: 'bonus',
} as const

export type AudioMood = typeof AudioMood[keyof typeof AudioMood]

export const AudioCueName = {
  Coin: 'coin',
  Portal: 'portal',
  ExtraLife: 'extra-life',
  HunterRelease: 'hunter-release',
  AmbusherReveal: 'ambusher-reveal',
  WandererEnter: 'wanderer-enter',
  WandererTrigger: 'wanderer-trigger',
  WandererDepart: 'wanderer-depart',
  SpikeWarning: 'spike-warning',
  SpikeActive: 'spike-active',
  ShutterWarning: 'shutter-warning',
  ShutterClose: 'shutter-close',
  ShutterOpen: 'shutter-open',
  DamageHunter: 'damage-hunter',
  DamageSpike: 'damage-spike',
  DamageAmbusher: 'damage-ambusher',
  DamageWanderer: 'damage-wanderer',
  StageClear: 'stage-clear',
  BonusTick: 'bonus-tick',
  BonusFinalTick: 'bonus-final-tick',
  BonusComplete: 'bonus-complete',
  LocalRecord: 'local-record',
  GameOver: 'game-over',
  UiMove: 'ui-move',
  UiConfirm: 'ui-confirm',
  Pause: 'pause',
  Resume: 'resume',
} as const

export type AudioCueName = typeof AudioCueName[keyof typeof AudioCueName]

export interface AudioCue {
  name: AudioCueName
  intensity?: number
  pan?: number
}

export interface ReactiveAudio {
  unlock(): Promise<void>
  play(cue: AudioCue): void
  setMood(mood: AudioMood): void
  setMuted(muted: boolean): void
  isMuted(): boolean
  dispose(): void
}
