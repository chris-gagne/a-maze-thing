import Phaser from 'phaser'
import {
  createStageSimulation,
  Direction,
  getHunterGridPosition,
  getLifeTargetGridPosition,
  getPlayerGridPosition,
  queuePlayerDirection,
  type StageSimulation,
  updateStageSimulation,
} from '../game/stageSimulation'
import { parseRunSeed } from '../game/runSeed'
import { getSpikePhase, SpikePhase } from '../game/spikeTiming'
import { createCoinPlacement } from '../generation/coinPlacement'
import { placeLifeTarget } from '../generation/lifeTargetPlacement'
import { generateMaze, type Maze, Wall } from '../generation/maze'
import { placePortals } from '../generation/portalPlacement'
import { placeSpikes } from '../generation/spikePlacement'
import { createPixelTextures, TextureKey } from '../presentation/pixelTextures'

export const GAME_WIDTH = 960
export const GAME_HEIGHT = 720

const CELL_SIZE = 48
const MAZE_TOP = 128
const FIXED_STEP_SECONDS = 1 / 120
const PLAYER_SPEED = 5
const HUNTER_SPEED = 3.25
const HUNTER_RELEASE_DELAY_SECONDS = 2.4
const LIFE_TARGET_SPEED = 3.8

interface RunSceneData {
  stageNumber: number
  carriedScore: number
  runSeed: number
  lives: number
}

interface MovementKeys {
  up: Phaser.Input.Keyboard.Key
  right: Phaser.Input.Keyboard.Key
  down: Phaser.Input.Keyboard.Key
  left: Phaser.Input.Keyboard.Key
}

export class PlayScene extends Phaser.Scene {
  private stageNumber = 1
  private carriedScore = 0
  private runSeed = 0
  private lives = 1
  private accumulator = 0
  private stageResolved = false
  private maze!: Maze
  private simulation!: StageSimulation
  private mazeOrigin = { x: 0, y: MAZE_TOP }
  private hunterSprite!: Phaser.GameObjects.Image
  private lifeTargetSprite: Phaser.GameObjects.Image | null = null
  private playerSprite!: Phaser.GameObjects.Image
  private livesText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private remainingText!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private movementKeys!: MovementKeys
  private coinSprites = new Map<number, Phaser.GameObjects.Image>()
  private spikeSprites = new Map<number, Phaser.GameObjects.Image>()
  private loopAnchors: number[] = []
  private observedLivesLost = 0
  private observedLivesGained = 0
  private observedPortalUses = 0

  constructor() {
    super('play')
  }

  init(data: Partial<RunSceneData> = {}): void {
    this.stageNumber = data.stageNumber ?? 1
    this.carriedScore = data.carriedScore ?? 0
    this.runSeed = data.runSeed ?? createRunSeed()
    this.lives = data.lives ?? 1
    this.accumulator = 0
    this.stageResolved = false
    this.coinSprites.clear()
    this.spikeSprites.clear()
    this.loopAnchors = []
    this.lifeTargetSprite = null
    this.observedLivesLost = 0
    this.observedLivesGained = 0
    this.observedPortalUses = 0
  }

  create(): void {
    createPixelTextures(this)
    this.drawBackdrop()

    const dimensions = getStageDimensions(this.stageNumber)
    const stageSeed = deriveStageSeed(this.runSeed, this.stageNumber)
    this.maze = generateMaze(dimensions.width, dimensions.height, stageSeed)
    const portalIndices = placePortals(this.maze, stageSeed ^ 0xa4dfed5)
    const lifeTargetIndex = placeLifeTarget(
      this.maze,
      this.stageNumber,
      this.lives,
      stageSeed ^ 0x1fef00d,
      portalIndices,
    )
    const portalReservations = lifeTargetIndex === null
      ? portalIndices
      : [...portalIndices, lifeTargetIndex]
    const spikePlacement = placeSpikes(
      this.maze,
      this.stageNumber,
      stageSeed ^ 0x5a1ce5,
      portalReservations,
    )
    const spikeIndices = new Set(spikePlacement.map((spike) => spike.cellIndex))
    const occupiedIndices = new Set([...portalReservations, ...spikeIndices])
    const coinPlacement = createCoinPlacement(
      this.maze,
      stageSeed ^ 0xc01dcafe,
      occupiedIndices,
    )
    this.loopAnchors = coinPlacement.loopAnchors
    const entranceIndex = this.maze.entrance.y * this.maze.width + this.maze.entrance.x
    this.simulation = createStageSimulation(this.maze, {
      coinIndices: coinPlacement.indices,
      hunter: {
        startCellIndex: entranceIndex,
        releaseDelaySeconds: HUNTER_RELEASE_DELAY_SECONDS,
      },
      lifeTarget: lifeTargetIndex === null ? undefined : { startCellIndex: lifeTargetIndex },
      spikes: spikePlacement,
      portalIndices,
      lives: this.lives,
    })
    this.mazeOrigin.x = Math.floor((GAME_WIDTH - this.maze.width * CELL_SIZE) / 2)

    this.drawMaze()
    this.createHud(stageSeed)
    this.bindInput()
    this.cameras.main.fadeIn(180, 5, 8, 10)
  }

  update(_time: number, deltaMilliseconds: number): void {
    if (this.stageResolved) {
      return
    }

    this.captureDirectionInput()
    this.accumulator += Math.min(deltaMilliseconds / 1000, 0.1)

    while (this.accumulator >= FIXED_STEP_SECONDS) {
      updateStageSimulation(
        this.simulation,
        FIXED_STEP_SECONDS,
        PLAYER_SPEED,
        HUNTER_SPEED,
        LIFE_TARGET_SPEED,
      )
      this.accumulator -= FIXED_STEP_SECONDS
    }

    this.syncPresentation()
    this.syncLifeEvents()
    this.syncPortalEvents()

    if (this.simulation.complete) {
      this.resolveStage()
    } else if (this.simulation.gameOver) {
      this.resolveRun()
    }
  }

  private drawBackdrop(): void {
    const graphics = this.add.graphics()
    graphics.fillStyle(0x05080a, 1)
    graphics.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT)
    graphics.lineStyle(1, 0x1b3b43, 0.28)

    for (let x = 0; x <= GAME_WIDTH; x += 24) {
      graphics.lineBetween(x, 0, x, GAME_HEIGHT)
    }

    for (let y = 0; y <= GAME_HEIGHT; y += 24) {
      graphics.lineBetween(0, y, GAME_WIDTH, y)
    }

    graphics.fillStyle(0xffb629, 0.9)
    graphics.fillRect(48, 92, 72, 3)
    graphics.fillStyle(0xff5364, 0.8)
    graphics.fillRect(128, 92, 24, 3)
    graphics.fillStyle(0x79f25f, 0.8)
    graphics.fillRect(GAME_WIDTH - 112, 92, 64, 3)
  }

  private drawMaze(): void {
    const mazeWidth = this.maze.width * CELL_SIZE
    const mazeHeight = this.maze.height * CELL_SIZE
    const floor = this.add.graphics()
    floor.fillStyle(0x071318, 1)
    floor.fillRect(this.mazeOrigin.x, this.mazeOrigin.y, mazeWidth, mazeHeight)

    for (const cell of this.maze.cells) {
      if ((cell.x + cell.y) % 2 === 0) {
        floor.fillStyle(0x0a1a20, 0.7)
        floor.fillRect(
          this.mazeOrigin.x + cell.x * CELL_SIZE + 4,
          this.mazeOrigin.y + cell.y * CELL_SIZE + 4,
          CELL_SIZE - 8,
          CELL_SIZE - 8,
        )
      }
    }

    const entranceX = this.cellCenterX(this.maze.entrance.x)
    const entranceY = this.cellCenterY(this.maze.entrance.y)
    floor.lineStyle(2, 0xff5364, 0.9)
    floor.strokeRect(entranceX - 15, entranceY - 15, 30, 30)

    const walls = this.add.graphics()
    this.strokeMazeWalls(walls, 10, 0x0c4b55, 0.55)
    this.strokeMazeWalls(walls, 4, 0x42e8df, 1)

    if (isMazeDebugEnabled()) {
      this.drawMazeDebug()
    }

    const portalSprites = [...this.simulation.portals].map((portalIndex) => {
      const cell = this.maze.cells[portalIndex]
      return this.add.image(
        this.cellCenterX(cell.x),
        this.cellCenterY(cell.y),
        TextureKey.Portal,
      ).setDepth(1)
    })
    this.tweens.add({
      targets: portalSprites,
      alpha: { from: 0.55, to: 1 },
      duration: 460,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      easeParams: [3],
    })

    for (const spike of this.simulation.spikes) {
      const cell = this.maze.cells[spike.cellIndex]
      const sprite = this.add.image(
        this.cellCenterX(cell.x),
        this.cellCenterY(cell.y),
        TextureKey.Spike,
      )
      sprite.setDepth(1)
      this.spikeSprites.set(spike.cellIndex, sprite)
    }

    for (const coinIndex of this.simulation.coins) {
      const cell = this.maze.cells[coinIndex]
      const sprite = this.add.image(this.cellCenterX(cell.x), this.cellCenterY(cell.y), TextureKey.Coin)
      sprite.setDepth(2)
      this.coinSprites.set(coinIndex, sprite)
    }

    const exit = this.add.image(
      this.cellCenterX(this.maze.exit.x),
      this.cellCenterY(this.maze.exit.y),
      TextureKey.Exit,
    )
    exit.setDepth(3)
    this.tweens.add({
      targets: exit,
      alpha: { from: 0.65, to: 1 },
      duration: 520,
      yoyo: true,
      repeat: -1,
      ease: 'Stepped',
      easeParams: [3],
    })

    this.hunterSprite = this.add.image(entranceX, entranceY, TextureKey.Hunter)
    this.hunterSprite.setAlpha(0.45)
    this.hunterSprite.setDepth(4)

    const lifeTargetPosition = getLifeTargetGridPosition(this.simulation)
    if (lifeTargetPosition !== null) {
      this.lifeTargetSprite = this.add.image(
        this.cellCenterX(lifeTargetPosition.x),
        this.cellCenterY(lifeTargetPosition.y),
        TextureKey.LifeTarget,
      )
      this.lifeTargetSprite.setDepth(4)
      this.tweens.add({
        targets: this.lifeTargetSprite,
        alpha: { from: 0.65, to: 1 },
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
        easeParams: [2],
      })
    }

    this.playerSprite = this.add.image(entranceX, entranceY, TextureKey.Player)
    this.playerSprite.setDepth(5)
  }

  private drawMazeDebug(): void {
    const graphics = this.add.graphics()
    graphics.setDepth(1)

    for (const braid of this.maze.braids) {
      graphics.lineStyle(5, 0x79f25f, 0.48)
      graphics.beginPath()

      braid.pathIndices.forEach((cellIndex, position) => {
        const cell = this.maze.cells[cellIndex]
        const x = this.cellCenterX(cell.x)
        const y = this.cellCenterY(cell.y)

        if (position === 0) {
          graphics.moveTo(x, y)
        } else {
          graphics.lineTo(x, y)
        }
      })
      graphics.strokePath()

      const from = this.maze.cells[braid.fromIndex]
      const to = this.maze.cells[braid.toIndex]
      graphics.lineStyle(8, 0xff5364, 0.9)
      graphics.lineBetween(
        this.cellCenterX(from.x),
        this.cellCenterY(from.y),
        this.cellCenterX(to.x),
        this.cellCenterY(to.y),
      )
    }

    graphics.fillStyle(0xffb629, 1)
    for (const anchorIndex of this.loopAnchors) {
      const anchor = this.maze.cells[anchorIndex]
      graphics.fillRect(this.cellCenterX(anchor.x) - 7, this.cellCenterY(anchor.y) - 7, 14, 14)
    }
  }

  private strokeMazeWalls(
    graphics: Phaser.GameObjects.Graphics,
    width: number,
    color: number,
    alpha: number,
  ): void {
    graphics.lineStyle(width, color, alpha)
    graphics.beginPath()

    for (const cell of this.maze.cells) {
      const left = this.mazeOrigin.x + cell.x * CELL_SIZE
      const top = this.mazeOrigin.y + cell.y * CELL_SIZE
      const right = left + CELL_SIZE
      const bottom = top + CELL_SIZE

      if ((cell.walls & Wall.North) !== 0) {
        graphics.moveTo(left, top)
        graphics.lineTo(right, top)
      }
      if ((cell.walls & Wall.West) !== 0) {
        graphics.moveTo(left, top)
        graphics.lineTo(left, bottom)
      }
      if (cell.x === this.maze.width - 1 && (cell.walls & Wall.East) !== 0) {
        graphics.moveTo(right, top)
        graphics.lineTo(right, bottom)
      }
      if (cell.y === this.maze.height - 1 && (cell.walls & Wall.South) !== 0) {
        graphics.moveTo(left, bottom)
        graphics.lineTo(right, bottom)
      }
    }

    graphics.strokePath()
  }

  private createHud(stageSeed: number): void {
    const labelStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '16px',
      color: '#8ba5aa',
    }
    const valueStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '20px',
      color: '#f3fffe',
    }

    this.add.text(48, 32, `STAGE ${String(this.stageNumber).padStart(2, '0')}`, valueStyle)
    this.add.text(48, 64, `SEED ${stageSeed.toString(16).toUpperCase().padStart(8, '0')}`, labelStyle)
    this.livesText = this.add.text(GAME_WIDTH / 2, 32, '', valueStyle).setOrigin(0.5, 0)

    this.scoreText = this.add.text(GAME_WIDTH - 48, 32, '', valueStyle).setOrigin(1, 0)
    this.remainingText = this.add.text(GAME_WIDTH - 48, 64, '', labelStyle).setOrigin(1, 0)
    this.updateHud()
  }

  private bindInput(): void {
    const keyboard = this.input.keyboard

    if (keyboard === null) {
      throw new Error('Keyboard input is unavailable.')
    }

    this.cursors = keyboard.createCursorKeys()
    this.movementKeys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
    }) as MovementKeys
  }

  private captureDirectionInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.movementKeys.up)) {
      queuePlayerDirection(this.simulation, Direction.North)
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.movementKeys.right)) {
      queuePlayerDirection(this.simulation, Direction.East)
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.movementKeys.down)) {
      queuePlayerDirection(this.simulation, Direction.South)
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.movementKeys.left)) {
      queuePlayerDirection(this.simulation, Direction.West)
    }
  }

  private syncPresentation(): void {
    const position = getPlayerGridPosition(this.simulation)
    this.playerSprite.setPosition(this.cellCenterX(position.x), this.cellCenterY(position.y))

    const hunterPosition = getHunterGridPosition(this.simulation)
    if (hunterPosition !== null) {
      this.hunterSprite.setPosition(this.cellCenterX(hunterPosition.x), this.cellCenterY(hunterPosition.y))
      this.hunterSprite.setAlpha(this.simulation.hunter?.active ? 1 : 0.45)
    }

    const lifeTargetPosition = getLifeTargetGridPosition(this.simulation)
    if (lifeTargetPosition === null) {
      this.lifeTargetSprite?.destroy()
      this.lifeTargetSprite = null
    } else {
      this.lifeTargetSprite?.setPosition(
        this.cellCenterX(lifeTargetPosition.x),
        this.cellCenterY(lifeTargetPosition.y),
      )
    }

    const rotationByDirection: Partial<Record<Direction, number>> = {
      [Direction.North]: 0,
      [Direction.East]: 90,
      [Direction.South]: 180,
      [Direction.West]: 270,
    }
    this.playerSprite.setAngle(
      this.simulation.player.direction === null
        ? 0
        : rotationByDirection[this.simulation.player.direction] ?? 0,
    )

    for (const [cellIndex, sprite] of this.coinSprites) {
      if (!this.simulation.coins.has(cellIndex)) {
        sprite.destroy()
        this.coinSprites.delete(cellIndex)
      }
    }

    for (const spike of this.simulation.spikes) {
      const sprite = this.spikeSprites.get(spike.cellIndex)
      const phase = getSpikePhase(spike, this.simulation.elapsedSeconds)

      if (phase === SpikePhase.Inactive) {
        sprite?.setTint(0x1b6970).setAlpha(0.45)
      } else if (phase === SpikePhase.Warning) {
        sprite?.setTint(0xffb629).setAlpha(0.8)
      } else if (phase === SpikePhase.Active) {
        sprite?.setTint(0xff5364).setAlpha(1)
      } else {
        sprite?.setTint(0x8b454f).setAlpha(0.55)
      }
    }

    this.updateHud()
  }

  private syncLifeEvents(): void {
    if (this.simulation.livesGained > this.observedLivesGained) {
      this.observedLivesGained = this.simulation.livesGained
      this.showStatusMessage('EXTRA LIFE', '#79f25f')
    }

    if (this.simulation.livesLost > this.observedLivesLost && !this.simulation.gameOver) {
      this.observedLivesLost = this.simulation.livesLost
      this.showStatusMessage('LIFE LOST', '#ff5364')
      this.cameras.main.flash(180, 255, 83, 100, false)
    }
  }

  private syncPortalEvents(): void {
    if (this.simulation.portalUses <= this.observedPortalUses) {
      return
    }

    this.observedPortalUses = this.simulation.portalUses
    this.playerSprite.setScale(1.45)
    this.cameras.main.flash(130, 56, 247, 237, false)
    this.tweens.add({
      targets: this.playerSprite,
      scale: 1,
      duration: 180,
      ease: 'Stepped',
      easeParams: [3],
    })
  }

  private showStatusMessage(message: string, color: string): void {
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontFamily: '"Press Start 2P"',
      fontSize: '22px',
      color,
      backgroundColor: '#05080a',
      padding: { x: 18, y: 14 },
    }).setOrigin(0.5).setDepth(15)

    this.tweens.add({
      targets: text,
      alpha: 0,
      y: text.y - 28,
      delay: 350,
      duration: 450,
      onComplete: () => text.destroy(),
    })
  }

  private updateHud(): void {
    const score = this.carriedScore + this.simulation.collectedCoins
    this.lives = this.simulation.lives
    this.livesText.setText(`LIVES ${String(this.lives).padStart(2, '0')}`)
    this.scoreText.setText(`COINS ${String(score).padStart(4, '0')}`)
    this.remainingText.setText(`${String(this.simulation.coins.size).padStart(3, '0')} IN MAZE`)
  }

  private resolveStage(): void {
    this.stageResolved = true
    const totalScore = this.carriedScore + this.simulation.collectedCoins
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 188, 0x05080a, 0.96)
    panel.setStrokeStyle(4, 0x79f25f, 1)
    panel.setDepth(20)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 52, 'STAGE CLEAR', {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#79f25f',
    }).setOrigin(0.5).setDepth(21)
    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 16,
      `+${this.simulation.collectedCoins} COINS  //  TOTAL ${totalScore}`,
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffcf52',
      },
    ).setOrigin(0.5).setDepth(21)

    this.time.delayedCall(1250, () => {
      this.scene.restart({
        stageNumber: this.stageNumber + 1,
        carriedScore: totalScore,
        runSeed: this.runSeed,
        lives: this.simulation.lives,
      })
    })
  }

  private resolveRun(): void {
    this.stageResolved = true
    const totalScore = this.carriedScore + this.simulation.collectedCoins
    this.playerSprite.setTint(0xff5364)

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 520, 188, 0x05080a, 0.96)
    panel.setStrokeStyle(4, 0xff5364, 1)
    panel.setDepth(20)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 52, 'SIGNAL LOST', {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#ff5364',
    }).setOrigin(0.5).setDepth(21)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 16, `${totalScore} COINS RECOVERED`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffcf52',
    }).setOrigin(0.5).setDepth(21)

    this.time.delayedCall(1800, () => this.scene.restart())
  }

  private cellCenterX(gridX: number): number {
    return this.mazeOrigin.x + gridX * CELL_SIZE + CELL_SIZE / 2
  }

  private cellCenterY(gridY: number): number {
    return this.mazeOrigin.y + gridY * CELL_SIZE + CELL_SIZE / 2
  }
}

function getStageDimensions(stageNumber: number): { width: number; height: number } {
  return {
    width: Math.min(11 + Math.floor((stageNumber - 1) / 3) * 2, 15),
    height: Math.min(7 + Math.floor((stageNumber - 1) / 4) * 2, 11),
  }
}

function deriveStageSeed(runSeed: number, stageNumber: number): number {
  return Math.imul(runSeed ^ stageNumber, 0x9e3779b1) >>> 0
}

function createRunSeed(): number {
  const requestedSeed = parseRunSeed(new URLSearchParams(location.search).get('seed'))
  return requestedSeed ?? crypto.getRandomValues(new Uint32Array(1))[0]
}

function isMazeDebugEnabled(): boolean {
  return new URLSearchParams(location.search).get('debug') === 'maze'
}