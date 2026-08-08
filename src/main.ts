import '@fontsource/press-start-2p/400.css'
import '@fontsource-variable/space-grotesk'
import Phaser from 'phaser'
import './style.css'
import { ProceduralAudioEngine } from './audio/ProceduralAudioEngine'
import { provideReactiveAudio } from './audio/audioRuntime'
import { loadAudioSettings, saveAudioSettings, type StorageAdapter } from './audio/audioSettings'
import { initializeSpriteLegend } from './presentation/spriteLegend'
import { GAME_HEIGHT, GAME_WIDTH, PlayScene } from './scenes/PlayScene'

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="masthead">
    <div class="brand-lockup">
      <img class="brand-mark" src="/a-maze-mark.svg" alt="" width="36" height="36" />
      <div>
        <p class="eyebrow">ENDLESS DIGITAL LABYRINTH</p>
        <h1>A-MAZE-THING</h1>
      </div>
    </div>
    <div class="masthead-actions">
      <div class="signal" aria-label="Game status">
        <span class="signal-light" aria-hidden="true"></span>
        SYSTEM READY
      </div>
      <button class="audio-toggle" type="button" aria-label="Mute audio" aria-pressed="false" title="Mute audio (M)">
        <span class="audio-toggle-icon" aria-hidden="true">
          <span class="audio-toggle-speaker"></span>
          <span class="audio-toggle-wave audio-toggle-wave--near"></span>
          <span class="audio-toggle-wave audio-toggle-wave--far"></span>
          <span class="audio-toggle-muted-mark"></span>
        </span>
      </button>
    </div>
  </header>
  <div class="play-layout">
    <main class="game-frame" aria-label="A-Maze-Thing game">
      <div id="game-root"></div>
    </main>
    <aside class="legend" aria-label="Game legend">
      <details class="legend-disclosure">
        <summary>
          <span>Sprite legend</span>
          <span class="legend-summary-hint" aria-hidden="true"></span>
        </summary>
        <div class="legend-body">
          <div class="legend-heading">
            <p>Maze signals</p>
            <h2>Sprite legend</h2>
          </div>
          <ul class="legend-list" data-legend-list></ul>
        </div>
      </details>
    </aside>
  </div>
  <footer class="system-footer">
    <span>LOCAL ARCADE // BUILD 001</span>
    <span>PROCEDURAL SIGNAL ACTIVE</span>
  </footer>
`

const storage = getStorage()
const audio = new ProceduralAudioEngine(loadAudioSettings(storage).muted)
provideReactiveAudio(audio)
const audioButton = document.querySelector<HTMLButtonElement>('.audio-toggle')!

const updateAudioButton = (): void => {
  const muted = audio.isMuted()
  audioButton.classList.toggle('audio-toggle--muted', muted)
  audioButton.setAttribute('aria-pressed', String(muted))
  audioButton.setAttribute('aria-label', muted ? 'Unmute audio' : 'Mute audio')
  audioButton.title = `${muted ? 'Unmute' : 'Mute'} audio (M)`
}
const unlockAudio = (): void => {
  void audio.unlock().catch(() => undefined)
}
const toggleAudio = (): void => {
  audio.setMuted(!audio.isMuted())
  saveAudioSettings(storage, { muted: audio.isMuted() })
  updateAudioButton()
}
const handleAudioButton = (): void => {
  unlockAudio()
  toggleAudio()
}
const handleAudioKey = (event: KeyboardEvent): void => {
  if (event.key.toLowerCase() !== 'm' || event.repeat) return
  event.preventDefault()
  toggleAudio()
}

updateAudioButton()
audioButton.addEventListener('click', handleAudioButton)
window.addEventListener('pointerdown', unlockAudio, { once: true, capture: true })
window.addEventListener('keydown', unlockAudio, { once: true, capture: true })
window.addEventListener('keydown', handleAudioKey)

const legendDetails = document.querySelector<HTMLDetailsElement>('.legend-disclosure')!
const disposeLegend = initializeSpriteLegend(legendDetails)

await document.fonts.ready

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game-root',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#05080a',
  render: {
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
  },
  scene: [PlayScene],
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    audioButton.removeEventListener('click', handleAudioButton)
    window.removeEventListener('pointerdown', unlockAudio, { capture: true })
    window.removeEventListener('keydown', unlockAudio, { capture: true })
    window.removeEventListener('keydown', handleAudioKey)
    audio.dispose()
    disposeLegend()
    game.destroy(true)
  })
}

function getStorage(): StorageAdapter | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}