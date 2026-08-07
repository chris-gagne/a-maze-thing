import '@fontsource/press-start-2p/400.css'
import '@fontsource-variable/space-grotesk'
import Phaser from 'phaser'
import './style.css'
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
  <main class="game-frame" aria-label="A-Maze-Thing game">
    <div id="game-root"></div>
  </main>
  <footer class="system-footer">
    <span>LOCAL ARCADE // BUILD 001</span>
    <span>PROCEDURAL SIGNAL ACTIVE</span>
  </footer>
`

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
  import.meta.hot.dispose(() => game.destroy(true))
}