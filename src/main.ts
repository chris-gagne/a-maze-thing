import '@fontsource/press-start-2p/400.css'
import '@fontsource-variable/space-grotesk'
import Phaser from 'phaser'
import './style.css'
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
    <div class="signal" aria-label="Game status">
      <span class="signal-light" aria-hidden="true"></span>
      SYSTEM READY
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
    disposeLegend()
    game.destroy(true)
  })
}