import type { ReactiveAudio } from './audioTypes'

let reactiveAudio: ReactiveAudio | null = null

export function provideReactiveAudio(audio: ReactiveAudio): void {
  reactiveAudio = audio
}

export function getReactiveAudio(): ReactiveAudio | null {
  return reactiveAudio
}
