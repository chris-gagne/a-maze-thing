import Phaser from 'phaser'
import {
  createStageSimulation,
  Direction,
  getAmbusherGridPosition,
  getHunterGridPosition,
  getLifeTargetGridPosition,
  getPlayerGridPosition,
  queuePlayerDirection,
  type StageSimulation,
  updateStageSimulation,
} from '../game/stageSimulation'
import { parseDebugStage, parseRunSeed } from '../game/runSeed'
import { INITIAL_LIVES } from '../game/lifeRules'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  getDifficultyPreset,
  parseDifficulty,
  type DifficultyId,
} from '../game/difficultySettings'
import { calculateStageCoinAward } from '../game/stageScoring'
import { getSpikePhase, SpikePhase } from '../game/spikeTiming'
import { getStageProfile } from '../game/stageProgression'
import {
  selectStageIntroduction,
  StageFeature,
  type StageFeatureId,
  type StageIntroduction,
} from '../game/stageIntroductions'
import { createCoinPlacement } from '../generation/coinPlacement'
import { placeAmbusher } from '../generation/ambusherPlacement'
import { placeLifeTarget } from '../generation/lifeTargetPlacement'
import { generateMaze, type Maze, Wall } from '../generation/maze'
import { placePortals } from '../generation/portalPlacement'
import { placeSpikes } from '../generation/spikePlacement'
import { createPixelTextures, TextureKey } from '../presentation/pixelTextures'
import { getLifeMessage } from '../presentation/lifeMessages'

export const GAME_WIDTH = 960
export const GAME_HEIGHT = 720

const CELL_SIZE = 48
const MAZE_TOP = 128
const FIXED_STEP_SECONDS = 1 / 120
const PLAYER_SPEED = 5
const HUNTER_SPEED = 3.25
const HUNTER_RELEASE_DELAY_SECONDS = 2.4
const LIFE_TARGET_SPEED = 3
const RESPAWN_PAUSE_MILLISECONDS = 1250
const AMBUSH_PAUSE_MILLISECONDS = 1000
const DIFFICULTY_COLORS: Readonly<Record<DifficultyId, number>> = {
  casual: 0x79f25f,
  'easy-peasy': 0x42e8df,
  normal: 0xffcf52,
  overclocked: 0xff5364,
}

interface RunSceneData {
  stageNumber: number
  carriedScore: number
  runSeed: number
  lives: number
  introducedFeatureIds: readonly StageFeatureId[]
  difficulty: DifficultyId
  selectDifficulty: boolean
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
  private stageEntryLives = 1
  private difficulty: DifficultyId = DEFAULT_DIFFICULTY
  private difficultySelectionRequired = false
  private difficultyMenu: Phaser.GameObjects.Container | null = null
  private selectedDifficultyIndex = 0
  private difficultyOptionBackgrounds: Phaser.GameObjects.Rectangle[] = []
  private accumulator = 0
  private stageResolved = false
  private runEndActive = false
  private runRestarting = false
  private introducedFeatureIds = new Set<StageFeatureId>()
  private stageIntroduction: Phaser.GameObjects.Container | null = null
  private respawnOverlay: Phaser.GameObjects.Container | null = null
  private ambushOverlay: Phaser.GameObjects.Container | null = null
  private pauseMenu: Phaser.GameObjects.Container | null = null
  private observedPortalReturnArmed = false
  private maze!: Maze
  private simulation!: StageSimulation
  private mazeOrigin = { x: 0, y: MAZE_TOP }
  private hunterSprite: Phaser.GameObjects.Image | null = null
  private ambusherSprite: Phaser.GameObjects.Image | null = null
  private lifeTargetSprite: Phaser.GameObjects.Image | null = null
  private playerSprite!: Phaser.GameObjects.Image
  private startMarker!: Phaser.GameObjects.Graphics
  private livesText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private remainingText!: Phaser.GameObjects.Text
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private movementKeys!: MovementKeys
  private introductionEnterKey!: Phaser.Input.Keyboard.Key
  private introductionSpaceKey!: Phaser.Input.Keyboard.Key
  private retryLevelKey!: Phaser.Input.Keyboard.Key
  private retrySeedKey!: Phaser.Input.Keyboard.Key
  private coinSprites = new Map<number, Phaser.GameObjects.Image>()
  private spikeSprites = new Map<number, Phaser.GameObjects.Image>()
  private loopAnchors: number[] = []
  private ambusherBranchIndices: number[] = []
  private observedLivesLost = 0
  private observedLivesGained = 0
  private observedPortalUses = 0
  private observedAmbusherReveals = 0

  constructor() {
    super('play')
  }

  init(data: Partial<RunSceneData> = {}): void {
    const searchParams = new URLSearchParams(location.search)
    const requestedSeed = parseRunSeed(searchParams.get('seed'))
    const requestedDifficulty = parseDifficulty(searchParams.get('difficulty'))
    const requestedStage = parseDebugStage(
      searchParams.get('stage'),
      searchParams.get('debug') === 'maze',
    )
    this.stageNumber = data.stageNumber ?? requestedStage ?? 1
    this.carriedScore = data.carriedScore ?? 0
    this.runSeed = data.runSeed ?? requestedSeed ?? createRandomRunSeed()
    this.lives = data.lives ?? INITIAL_LIVES
    this.stageEntryLives = this.lives
    this.difficulty = data.difficulty ?? requestedDifficulty ?? DEFAULT_DIFFICULTY
    this.difficultySelectionRequired = data.selectDifficulty
      ?? (data.difficulty === undefined && (requestedSeed === null || requestedDifficulty === null))
    this.selectedDifficultyIndex = DIFFICULTY_PRESETS.findIndex((preset) => {
      return preset.id === DEFAULT_DIFFICULTY
    })
    this.difficultyOptionBackgrounds = []
    this.introducedFeatureIds = new Set(data.introducedFeatureIds ?? [])
    this.accumulator = 0
    this.stageResolved = false
    this.runEndActive = false
    this.runRestarting = false
    this.stageIntroduction = null
    this.respawnOverlay = null
    this.ambushOverlay = null
    this.pauseMenu = null
    this.difficultyMenu = null
    this.observedPortalReturnArmed = false
    this.coinSprites.clear()
    this.spikeSprites.clear()
    this.loopAnchors = []
    this.ambusherBranchIndices = []
    this.hunterSprite = null
    this.ambusherSprite = null
    this.lifeTargetSprite = null
    this.observedLivesLost = 0
    this.observedLivesGained = 0
    this.observedPortalUses = 0
    this.observedAmbusherReveals = 0
  }

  create(): void {
    createPixelTextures(this)
    this.drawBackdrop()
    this.bindInput()

    if (this.difficultySelectionRequired) {
      this.showDifficultySelector()
      return
    }

    const stageProfile = getStageProfile(this.stageNumber)
    const stageSeed = deriveStageSeed(this.runSeed, this.stageNumber)
    const fullGame = getDifficultyPreset(this.difficulty).fullGame
    this.maze = generateMaze(stageProfile.width, stageProfile.height, stageSeed, {
      ...stageProfile.topology,
      endpointProfile: stageProfile.endpointProfile,
    })
    const portalIndices = fullGame ? placePortals(this.maze, stageSeed ^ 0xa4dfed5) : []
    const lifeTargetIndex = fullGame
      ? placeLifeTarget(
          this.maze,
          this.stageNumber,
          this.lives,
          stageSeed ^ 0x1fef00d,
          portalIndices,
        )
      : null
    const portalReservations = lifeTargetIndex === null
      ? portalIndices
      : [...portalIndices, lifeTargetIndex]
    const ambusherPlacement = fullGame
      ? placeAmbusher(
          this.maze,
          this.stageNumber,
          stageSeed ^ 0xa8b05,
          portalReservations,
        )
      : null
    this.ambusherBranchIndices = ambusherPlacement?.branchIndices ?? []
    const spikeReservations = ambusherPlacement === null
      ? portalReservations
      : [...portalReservations, ...ambusherPlacement.branchIndices]
    const spikePlacement = fullGame
      ? placeSpikes(
          this.maze,
          this.stageNumber,
          stageSeed ^ 0x5a1ce5,
          spikeReservations,
          stageProfile.hazardDensityMultiplier,
        )
      : []
    const spikeIndices = new Set(spikePlacement.map((spike) => spike.cellIndex))
    const occupiedIndices = new Set([
      ...portalReservations,
      ...spikeIndices,
      ...(ambusherPlacement === null ? [] : [ambusherPlacement.cellIndex]),
    ])
    const coinPlacement = fullGame
      ? createCoinPlacement(this.maze, stageSeed ^ 0xc01dcafe, occupiedIndices)
      : { indices: [], loopAnchors: [] }
    this.loopAnchors = coinPlacement.loopAnchors
    const entranceIndex = this.maze.entrance.y * this.maze.width + this.maze.entrance.x
    this.simulation = createStageSimulation(this.maze, {
      coinIndices: coinPlacement.indices,
      hunter: fullGame
        ? {
            startCellIndex: entranceIndex,
            releaseDelaySeconds: HUNTER_RELEASE_DELAY_SECONDS,
          }
        : undefined,
      ambusher: ambusherPlacement === null
        ? undefined
        : { startCellIndex: ambusherPlacement.cellIndex },
      lifeTarget: lifeTargetIndex === null ? undefined : { startCellIndex: lifeTargetIndex },
      spikes: spikePlacement,
      portalIndices,
      lives: this.lives,
    })
    const mazeWidth = this.maze.width * CELL_SIZE
    this.mazeOrigin.x = mazeWidth <= GAME_WIDTH
      ? Math.floor((GAME_WIDTH - mazeWidth) / 2)
      : 0

    this.drawMaze()
    this.createHud(stageSeed)
    this.configureWorldCamera()
    const presentFeatureIds: StageFeatureId[] = []
    if (spikePlacement.length > 0) {
      presentFeatureIds.push(StageFeature.Spikes)
    }
    if (lifeTargetIndex !== null) {
      presentFeatureIds.push(StageFeature.ExtraLife)
    }
    if (ambusherPlacement !== null) {
      presentFeatureIds.push(StageFeature.Ambusher)
    }

    const introduction = selectStageIntroduction(
      this.stageNumber,
      presentFeatureIds,
      this.introducedFeatureIds,
      !fullGame,
    )
    if (introduction !== null) {
      this.introducedFeatureIds = new Set(introduction.introducedFeatureIds)
      this.showStageIntroduction(introduction)
    }
    this.cameras.main.fadeIn(180, 5, 8, 10)
  }

  update(_time: number, deltaMilliseconds: number): void {
    if (this.difficultyMenu !== null) {
      this.updateDifficultySelectorInput()
      return
    }

    if (this.pauseMenu !== null) {
      if (Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)) {
        this.startNewRun()
      } else if (Phaser.Input.Keyboard.JustDown(this.retrySeedKey)) {
        this.retryCurrentSeed()
      } else if (Phaser.Input.Keyboard.JustDown(this.retryLevelKey)) {
        this.retryCurrentLevel()
      }
      return
    }

    if (this.runEndActive) {
      if (Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)) {
        this.startNewRun()
      } else if (Phaser.Input.Keyboard.JustDown(this.retrySeedKey)) {
        this.retryCurrentSeed()
      }
      return
    }

    if (this.stageResolved) {
      return
    }

    if (this.respawnOverlay !== null || this.ambushOverlay !== null) {
      return
    }

    if (this.stageIntroduction !== null) {
      if (
        Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)
        || Phaser.Input.Keyboard.JustDown(this.introductionSpaceKey)
      ) {
        this.dismissStageIntroduction()
      }
      return
    }

    this.captureDirectionInput()
    this.accumulator += Math.min(deltaMilliseconds / 1000, 0.1)

    while (this.accumulator >= FIXED_STEP_SECONDS) {
      const livesLostBeforeUpdate = this.simulation.livesLost
      const ambusherRevealsBeforeUpdate = this.simulation.ambusherReveals
      updateStageSimulation(
        this.simulation,
        FIXED_STEP_SECONDS * getDifficultyPreset(this.difficulty).simulationSpeedMultiplier,
        PLAYER_SPEED,
        HUNTER_SPEED,
        LIFE_TARGET_SPEED,
        HUNTER_SPEED,
      )
      this.accumulator -= FIXED_STEP_SECONDS

      if (
        this.simulation.livesLost > livesLostBeforeUpdate
        || this.simulation.ambusherReveals > ambusherRevealsBeforeUpdate
      ) {
        this.accumulator = 0
        break
      }
    }

    this.syncPresentation()
    this.syncAmbusherEvents()
    this.syncLifeEvents()
    this.syncPortalEvents()
    this.syncStartReturnMarker()

    if (this.simulation.complete) {
      this.resolveStage()
    } else if (this.simulation.gameOver) {
      this.resolveRun()
    }
  }

  private drawBackdrop(): void {
    const graphics = this.add.graphics().setScrollFactor(0).setDepth(-10)
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

    const header = this.add.graphics().setScrollFactor(0).setDepth(10)
    header.fillStyle(0x05080a, 1)
    header.fillRect(0, 0, GAME_WIDTH, MAZE_TOP - 16)
    header.lineStyle(1, 0x1b3b43, 0.28)
    for (let x = 0; x <= GAME_WIDTH; x += 24) {
      header.lineBetween(x, 0, x, MAZE_TOP - 16)
    }
    for (let y = 0; y < MAZE_TOP - 16; y += 24) {
      header.lineBetween(0, y, GAME_WIDTH, y)
    }
    header.fillStyle(0xffb629, 0.9)
    header.fillRect(48, 92, 72, 3)
    header.fillStyle(0xff5364, 0.8)
    header.fillRect(128, 92, 24, 3)
    header.fillStyle(0x79f25f, 0.8)
    header.fillRect(GAME_WIDTH - 112, 92, 64, 3)
  }

  private configureWorldCamera(): void {
    const mazeWidth = this.maze.width * CELL_SIZE
    const mazeHeight = this.maze.height * CELL_SIZE
    const worldWidth = Math.max(GAME_WIDTH, this.mazeOrigin.x + mazeWidth)
    const worldHeight = Math.max(GAME_HEIGHT, this.mazeOrigin.y + mazeHeight)
    const camera = this.cameras.main
    camera.setBounds(0, 0, worldWidth, worldHeight)

    if (mazeWidth > GAME_WIDTH || mazeHeight > GAME_HEIGHT - MAZE_TOP) {
      camera.setDeadzone(GAME_WIDTH * 0.36, (GAME_HEIGHT - MAZE_TOP) * 0.36)
      camera.startFollow(this.playerSprite, true, 0.14, 0.14)
      camera.centerOn(this.playerSprite.x, this.playerSprite.y)
    }
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
    this.startMarker = this.add.graphics({ x: entranceX, y: entranceY }).setDepth(1)
    this.drawStartMarker(false)

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

    if (this.simulation.hunter !== null) {
      this.hunterSprite = this.add.image(entranceX, entranceY, TextureKey.Hunter)
      this.hunterSprite.setAlpha(0.45)
      this.hunterSprite.setDepth(4)
    }

    const ambusherPosition = getAmbusherGridPosition(this.simulation)
    if (ambusherPosition !== null) {
      this.ambusherSprite = this.add.image(
        this.cellCenterX(ambusherPosition.x),
        this.cellCenterY(ambusherPosition.y),
        TextureKey.Ambusher,
      ).setDepth(4).setAlpha(0)
    }

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

    if (this.ambusherBranchIndices.length > 0) {
      graphics.lineStyle(3, 0xffb629, 0.45)
      graphics.beginPath()
      this.ambusherBranchIndices.forEach((cellIndex, position) => {
        const cell = this.maze.cells[cellIndex]
        if (position === 0) {
          graphics.moveTo(this.cellCenterX(cell.x), this.cellCenterY(cell.y))
        } else {
          graphics.lineTo(this.cellCenterX(cell.x), this.cellCenterY(cell.y))
        }
      })
      graphics.strokePath()
    }

    for (const braid of this.maze.braids) {
      graphics.lineStyle(2, 0x79f25f, 0.3)
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
      graphics.lineStyle(2, 0xff5364, 0.72)
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
      graphics.fillRect(this.cellCenterX(anchor.x) - 4, this.cellCenterY(anchor.y) - 4, 8, 8)
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
      .setScrollFactor(0).setDepth(11)
    this.add.text(48, 64, `SEED ${stageSeed.toString(16).toUpperCase().padStart(8, '0')}`, labelStyle)
      .setScrollFactor(0).setDepth(11)
    this.livesText = this.add.text(GAME_WIDTH / 2, 32, '', valueStyle)
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(11)

    this.scoreText = this.add.text(GAME_WIDTH - 48, 32, '', valueStyle)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(11)
    this.remainingText = this.add.text(GAME_WIDTH - 48, 64, '', labelStyle)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(11)
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
    this.introductionEnterKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    this.introductionSpaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    this.retryLevelKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.T)
    this.retrySeedKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R)
    window.addEventListener('keydown', this.handleWindowKeyDown)
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.handleWindowKeyDown)
    })
  }

  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || event.repeat) {
      return
    }

    event.preventDefault()
    this.handleEscapeKey()
  }

  private handleEscapeKey(): void {
    if (this.difficultyMenu !== null) {
      return
    }

    if (this.pauseMenu !== null) {
      this.resumeFromPause()
      return
    }

    if (
      this.runEndActive
      || this.stageResolved
      || this.respawnOverlay !== null
      || this.ambushOverlay !== null
      || this.stageIntroduction !== null
      || this.runRestarting
    ) {
      return
    }

    this.showPauseMenu()
  }

  private showDifficultySelector(): void {
    const scrim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05080a, 0.94)
      .setOrigin(0)
    const panel = this.add.rectangle(0, 0, 760, 650, 0x05080a, 0.99)
    panel.setStrokeStyle(4, 0x42e8df, 1)
    const eyebrow = this.add.text(0, -278, 'RUN CONFIGURATION // NEW SIGNAL', {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: '#8ba5aa',
    }).setOrigin(0.5)
    const headline = this.add.text(0, -230, 'SELECT DIFFICULTY', {
      fontFamily: '"Press Start 2P"',
      fontSize: '26px',
      color: '#ffcf52',
    }).setOrigin(0.5)

    this.difficultyMenu = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      scrim.setPosition(-GAME_WIDTH / 2, -GAME_HEIGHT / 2),
      panel,
      eyebrow,
      headline,
    ]).setDepth(50).setScrollFactor(0)

    const optionY = [-142, -38, 66, 170]
    DIFFICULTY_PRESETS.forEach((preset, index) => {
      const color = DIFFICULTY_COLORS[preset.id]
      const background = this.add.rectangle(0, optionY[index], 620, 88, 0x071318, 1)
      background.setInteractive({ useHandCursor: true })
      const label = this.add.text(-284, optionY[index] - 20, preset.label, {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: `#${color.toString(16).padStart(6, '0')}`,
      }).setOrigin(0, 0.5)
      const description = this.add.text(-284, optionY[index] + 20, preset.description, {
        fontFamily: '"Space Grotesk Variable"',
        fontSize: '16px',
        color: '#f3fffe',
        wordWrap: { width: 568 },
      }).setOrigin(0, 0.5)

      background.on('pointerover', () => {
        this.selectedDifficultyIndex = index
        this.refreshDifficultySelection()
      })
      background.on('pointerdown', () => {
        this.selectedDifficultyIndex = index
        this.confirmDifficultySelection()
      })
      this.difficultyOptionBackgrounds.push(background)
      this.difficultyMenu?.add([background, label, description])
    })

    const prompt = this.add.text(0, 270, 'UP / DOWN TO SELECT  //  ENTER TO START', {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: '#79f25f',
    }).setOrigin(0.5)
    this.difficultyMenu.add(prompt)
    this.refreshDifficultySelection()
  }

  private updateDifficultySelectorInput(): void {
    if (
      Phaser.Input.Keyboard.JustDown(this.cursors.up)
      || Phaser.Input.Keyboard.JustDown(this.movementKeys.up)
    ) {
      this.moveDifficultySelection(-1)
    } else if (
      Phaser.Input.Keyboard.JustDown(this.cursors.down)
      || Phaser.Input.Keyboard.JustDown(this.movementKeys.down)
    ) {
      this.moveDifficultySelection(1)
    } else if (
      Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)
      || Phaser.Input.Keyboard.JustDown(this.introductionSpaceKey)
    ) {
      this.confirmDifficultySelection()
    }
  }

  private moveDifficultySelection(offset: number): void {
    this.selectedDifficultyIndex = (
      this.selectedDifficultyIndex + offset + DIFFICULTY_PRESETS.length
    ) % DIFFICULTY_PRESETS.length
    this.refreshDifficultySelection()
  }

  private refreshDifficultySelection(): void {
    this.difficultyOptionBackgrounds.forEach((background, index) => {
      const preset = DIFFICULTY_PRESETS[index]
      const selected = index === this.selectedDifficultyIndex
      background.setFillStyle(selected ? DIFFICULTY_COLORS[preset.id] : 0x071318, selected ? 0.18 : 1)
      background.setStrokeStyle(selected ? 4 : 2, DIFFICULTY_COLORS[preset.id], selected ? 1 : 0.55)
    })
  }

  private confirmDifficultySelection(): void {
    if (this.runRestarting || this.difficultyMenu === null) {
      return
    }

    this.runRestarting = true
    const difficulty = DIFFICULTY_PRESETS[this.selectedDifficultyIndex].id
    updateRunConfigurationInUrl(this.runSeed, difficulty)
    this.scene.restart({
      stageNumber: 1,
      carriedScore: 0,
      runSeed: this.runSeed,
      lives: INITIAL_LIVES,
      introducedFeatureIds: [],
      difficulty,
      selectDifficulty: false,
    })
  }

  private showPauseMenu(): void {
    if (this.pauseMenu !== null || this.runRestarting) {
      return
    }

    this.accumulator = 0
    this.tweens.pauseAll()

    const scrim = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x05080a, 0.76)
      .setOrigin(0)
    const panel = this.add.rectangle(0, 0, 600, 520, 0x05080a, 0.98)
    panel.setStrokeStyle(4, 0x42e8df, 1)
    const eyebrow = this.add.text(
      0,
      -204,
      `STAGE ${String(this.stageNumber).padStart(2, '0')}  //  ${getDifficultyPreset(this.difficulty).label}  //  SEED ${this.runSeed.toString(16).toUpperCase().padStart(8, '0')}`,
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#8ba5aa',
      },
    ).setOrigin(0.5)
    const headline = this.add.text(0, -152, 'PAUSED', {
      fontFamily: '"Press Start 2P"',
      fontSize: '30px',
      color: '#ffcf52',
    }).setOrigin(0.5)

    this.pauseMenu = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      scrim.setPosition(-GAME_WIDTH / 2, -GAME_HEIGHT / 2),
      panel,
      eyebrow,
      headline,
    ]).setDepth(40).setScrollFactor(0)

    this.createPauseActionButton(0, -68, 'RETURN TO GAME [ESC]', 0x79f25f, () => {
      this.resumeFromPause()
    })
    this.createPauseActionButton(0, 8, 'RETRY LEVEL [T]', 0xffcf52, () => {
      this.retryCurrentLevel()
    })
    this.createPauseActionButton(0, 84, 'RETRY SEED [R]', 0x42e8df, () => {
      this.retryCurrentSeed()
    })
    this.createPauseActionButton(0, 160, 'NEW RUN [ENTER]', 0xff5364, () => {
      this.startNewRun()
    })
  }

  private resumeFromPause(): void {
    if (this.pauseMenu === null) {
      return
    }

    this.pauseMenu.destroy(true)
    this.pauseMenu = null
    this.tweens.resumeAll()
    this.accumulator = 0
  }

  private createPauseActionButton(
    x: number,
    y: number,
    label: string,
    color: number,
    activate: () => void,
  ): void {
    if (this.pauseMenu === null) {
      return
    }

    const background = this.add.rectangle(x, y, 380, 58, 0x071318, 1)
    background.setStrokeStyle(3, color, 1).setInteractive({ useHandCursor: true })
    const text = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#f3fffe',
    }).setOrigin(0.5)

    background.on('pointerover', () => background.setFillStyle(color, 0.22))
    background.on('pointerout', () => background.setFillStyle(0x071318, 1))
    background.on('pointerdown', activate)
    this.pauseMenu.add([background, text])
  }

  private showStageIntroduction(introduction: StageIntroduction): void {
    const panel = this.add.rectangle(0, 0, 720, 330, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0x42e8df, 1)

    const eyebrow = this.add.text(0, -122, `STAGE ${String(this.stageNumber).padStart(2, '0')}`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#8ba5aa',
    }).setOrigin(0.5)
    const headline = this.add.text(0, -78, introduction.headline, {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#ffcf52',
    }).setOrigin(0.5)
    const body = this.add.text(0, 10, introduction.lines.join('\n\n'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#f3fffe',
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: 620, useAdvancedWrap: true },
    }).setOrigin(0.5)
    const prompt = this.add.text(0, 126, 'ENTER / SPACE / CLICK TO START', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#79f25f',
    }).setOrigin(0.5)

    this.stageIntroduction = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      panel,
      eyebrow,
      headline,
      body,
      prompt,
    ]).setDepth(30).setScrollFactor(0)
    this.input.on('pointerdown', this.dismissStageIntroduction, this)
  }

  private dismissStageIntroduction(): void {
    if (this.stageIntroduction === null) {
      return
    }

    this.input.off('pointerdown', this.dismissStageIntroduction, this)
    this.stageIntroduction.destroy(true)
    this.stageIntroduction = null
    this.accumulator = 0
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
    if (hunterPosition !== null && this.hunterSprite !== null) {
      this.hunterSprite.setPosition(this.cellCenterX(hunterPosition.x), this.cellCenterY(hunterPosition.y))
      this.hunterSprite.setAlpha(this.simulation.hunter?.active ? 1 : 0.45)
    }

    const ambusherPosition = getAmbusherGridPosition(this.simulation)
    if (ambusherPosition !== null && this.ambusherSprite !== null) {
      this.ambusherSprite.setPosition(
        this.cellCenterX(ambusherPosition.x),
        this.cellCenterY(ambusherPosition.y),
      )
      this.ambusherSprite.setAlpha(this.simulation.ambusher?.revealed ? 1 : 0)
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

  private syncAmbusherEvents(): void {
    if (this.simulation.ambusherReveals <= this.observedAmbusherReveals) {
      return
    }

    this.observedAmbusherReveals = this.simulation.ambusherReveals
    this.accumulator = 0
    this.tweens.pauseAll()
    const panel = this.add.rectangle(0, 0, 520, 190, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0xffb629, 1)
    const headline = this.add.text(0, -34, 'AMBUSH!', {
      fontFamily: '"Press Start 2P"',
      fontSize: '30px',
      color: '#ffb629',
    }).setOrigin(0.5)
    const prompt = this.add.text(0, 36, 'CHOOSE YOUR ESCAPE', {
      fontFamily: '"Press Start 2P"',
      fontSize: '13px',
      color: '#f3fffe',
    }).setOrigin(0.5)
    this.ambushOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      panel,
      headline,
      prompt,
    ]).setDepth(25).setScrollFactor(0)
    this.time.delayedCall(AMBUSH_PAUSE_MILLISECONDS, () => {
      this.ambushOverlay?.destroy(true)
      this.ambushOverlay = null
      this.tweens.resumeAll()
      this.accumulator = 0
    })
  }

  private syncLifeEvents(): void {
    if (this.simulation.livesGained > this.observedLivesGained) {
      this.observedLivesGained = this.simulation.livesGained
      this.showStatusMessage('EXTRA LIFE', '#79f25f')
    }

    if (this.simulation.livesLost > this.observedLivesLost) {
      this.observedLivesLost = this.simulation.livesLost

      if (!this.simulation.gameOver) {
        this.showRespawnOverlay()
        this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y)
        this.cameras.main.flash(180, 255, 83, 100, false)
      }
    }
  }

  private showRespawnOverlay(): void {
    const source = this.simulation.lastDamageSource
    if (source === null) {
      throw new Error('A lost life must record its damage source.')
    }

    const panel = this.add.rectangle(0, 0, 560, 210, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0xff5364, 1)
    const headline = this.add.text(0, -62, 'LIFE LOST', {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#ff5364',
    }).setOrigin(0.5)
    const cause = this.add.text(0, 0, getLifeMessage(source).cause, {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#f3fffe',
    }).setOrigin(0.5)
    const remaining = this.add.text(0, 58, '1 LIFE REMAINS', {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffcf52',
    }).setOrigin(0.5)

    this.respawnOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      panel,
      headline,
      cause,
      remaining,
    ]).setDepth(25).setScrollFactor(0)
    this.time.delayedCall(RESPAWN_PAUSE_MILLISECONDS, () => {
      this.respawnOverlay?.destroy(true)
      this.respawnOverlay = null
      this.accumulator = 0
    })
  }

  private syncPortalEvents(): void {
    if (this.simulation.portalUses <= this.observedPortalUses) {
      return
    }

    this.observedPortalUses = this.simulation.portalUses
    this.playerSprite.setScale(1.45)
    this.cameras.main.centerOn(this.playerSprite.x, this.playerSprite.y)
    this.cameras.main.flash(130, 56, 247, 237, false)
    this.tweens.add({
      targets: this.playerSprite,
      scale: 1,
      duration: 180,
      ease: 'Stepped',
      easeParams: [3],
    })
  }

  private syncStartReturnMarker(): void {
    if (this.simulation.portalReturnArmed === this.observedPortalReturnArmed) {
      return
    }

    this.observedPortalReturnArmed = this.simulation.portalReturnArmed
    this.tweens.killTweensOf(this.startMarker)
    this.startMarker.setAlpha(1)
    this.drawStartMarker(this.observedPortalReturnArmed)

    if (this.observedPortalReturnArmed) {
      this.tweens.add({
        targets: this.startMarker,
        alpha: { from: 0.55, to: 1 },
        duration: 460,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
        easeParams: [3],
      })
    }
  }

  private drawStartMarker(active: boolean): void {
    this.startMarker.clear()
    this.startMarker.lineStyle(2, 0xff5364, 0.9)
    this.startMarker.strokeRect(-15, -15, 30, 30)

    if (!active) {
      return
    }

    this.startMarker.fillStyle(0xffb629, 1)
    this.startMarker.fillRect(-4, -4, 8, 8)
  }

  private showStatusMessage(message: string, color: string): void {
    const text = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, message, {
      fontFamily: '"Press Start 2P"',
      fontSize: '22px',
      color,
      backgroundColor: '#05080a',
      padding: { x: 18, y: 14 },
    }).setOrigin(0.5).setDepth(15).setScrollFactor(0)

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
    if (!getDifficultyPreset(this.difficulty).fullGame) {
      this.livesText.setText('CASUAL MODE')
      this.scoreText.setText('')
      this.remainingText.setText('')
      return
    }

    this.livesText.setText(`LIVES ${String(this.lives).padStart(2, '0')}`)
    this.scoreText.setText(`COINS ${String(score).padStart(4, '0')}`)
    this.remainingText.setText(`${String(this.simulation.coins.size).padStart(3, '0')} IN MAZE`)
  }

  private resolveStage(): void {
    this.stageResolved = true
    const casual = !getDifficultyPreset(this.difficulty).fullGame
    const award = calculateStageCoinAward(
      this.simulation.collectedCoins,
      this.simulation.coins.size,
      this.simulation.complete,
      {
        ambusherPlaced: this.simulation.ambusher !== null,
        ambusherRevealed: this.simulation.ambusherReveals > 0,
      },
    )
    const totalScore = this.carriedScore + award.awardedCoins
    const bonusRows = Number(award.coinMonger) + Number(award.survivedAmbush)
    const panelHeight = 188 + bonusRows * 46
    const panelWidth = bonusRows > 0 ? 650 : 520
    const panel = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      panelWidth,
      panelHeight,
      0x05080a,
      0.96,
    )
    panel.setStrokeStyle(4, 0x79f25f, 1)
    panel.setDepth(20).setScrollFactor(0)

    const headlineY = GAME_HEIGHT / 2 - panelHeight / 2 + 48
    this.add.text(GAME_WIDTH / 2, headlineY, casual ? 'MAZE SOLVED' : 'STAGE CLEAR', {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#79f25f',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)

    if (award.coinMonger && !casual) {
      this.add.text(GAME_WIDTH / 2, headlineY + 58, 'COIN MONGER!  2X', {
        fontFamily: '"Press Start 2P"',
        fontSize: '20px',
        color: '#ffcf52',
      }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    }

    if (award.survivedAmbush && !casual) {
      const ambushY = headlineY + 58 + (award.coinMonger ? 42 : 0)
      this.add.text(GAME_WIDTH / 2, ambushY, 'SURVIVE THE AMBUSH  +25', {
        fontFamily: '"Press Start 2P"',
        fontSize: '17px',
        color: '#ffb629',
      }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    }

    if (!casual) {
      const scoreLine = `${award.baseCoins} COINS + ${award.bonusCoins + award.ambushBonusCoins} BONUS  //  TOTAL ${totalScore}`
      this.add.text(
        GAME_WIDTH / 2,
        GAME_HEIGHT / 2 + panelHeight / 2 - 38,
        scoreLine,
        {
          fontFamily: '"Press Start 2P"',
          fontSize: award.coinMonger ? '12px' : '14px',
          color: '#ffcf52',
        },
      ).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    }

    this.time.delayedCall(1250, () => {
      this.scene.restart({
        stageNumber: this.stageNumber + 1,
        carriedScore: totalScore,
        runSeed: this.runSeed,
        lives: this.simulation.lives,
        introducedFeatureIds: [...this.introducedFeatureIds],
        difficulty: this.difficulty,
      })
    })
  }

  private resolveRun(): void {
    this.stageResolved = true
    this.runEndActive = true
    const totalScore = this.carriedScore + this.simulation.collectedCoins
    const source = this.simulation.lastDamageSource
    if (source === null) {
      throw new Error('Game over must record its damage source.')
    }
    this.playerSprite.setTint(0xff5364)

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 680, 390, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0xff5364, 1)
    panel.setDepth(20).setScrollFactor(0)

    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 142, 'SIGNAL LOST', {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#ff5364',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 82, getLifeMessage(source).finalCause, {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#f3fffe',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 24,
      `${getDifficultyPreset(this.difficulty).label}  //  STAGE ${String(this.stageNumber).padStart(2, '0')}  //  ${totalScore} COINS`,
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffcf52',
      },
    ).setOrigin(0.5).setDepth(21).setScrollFactor(0)

    this.createRunActionButton(
      GAME_WIDTH / 2 - 138,
      GAME_HEIGHT / 2 + 74,
      'NEW RUN [ENTER]',
      0x79f25f,
      () => this.startNewRun(),
    )
    this.createRunActionButton(
      GAME_WIDTH / 2 + 138,
      GAME_HEIGHT / 2 + 74,
      'RETRY SEED [R]',
      0x42e8df,
      () => this.retryCurrentSeed(),
    )
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 146, 'SCORES ARE NOT SAVED YET', {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: '#8ba5aa',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
  }

  private createRunActionButton(
    x: number,
    y: number,
    label: string,
    color: number,
    activate: () => void,
  ): void {
    const background = this.add.rectangle(x, y, 244, 58, 0x071318, 1)
    background.setStrokeStyle(3, color, 1).setDepth(21).setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
    this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#ffcf52',
    }).setOrigin(0.5).setDepth(22).setScrollFactor(0)

    background.on('pointerover', () => background.setFillStyle(color, 0.22))
    background.on('pointerout', () => background.setFillStyle(0x071318, 1))
    background.on('pointerdown', activate)
  }

  private startNewRun(): void {
    if (this.runRestarting) {
      return
    }

    this.runRestarting = true
    let nextRunSeed = createRandomRunSeed()
    while (nextRunSeed === this.runSeed) {
      nextRunSeed = createRandomRunSeed()
    }
    this.scene.restart({
      runSeed: nextRunSeed,
      selectDifficulty: true,
    })
  }

  private retryCurrentSeed(): void {
    if (this.runRestarting) {
      return
    }

    this.runRestarting = true
    updateRunConfigurationInUrl(this.runSeed, this.difficulty)
    this.restartRun(this.runSeed)
  }

  private retryCurrentLevel(): void {
    if (this.runRestarting) {
      return
    }

    this.runRestarting = true
    this.scene.restart({
      stageNumber: this.stageNumber,
      carriedScore: this.carriedScore,
      runSeed: this.runSeed,
      lives: this.stageEntryLives,
      introducedFeatureIds: [...this.introducedFeatureIds],
      difficulty: this.difficulty,
    })
  }

  private restartRun(runSeed: number): void {
    this.scene.restart({
      stageNumber: 1,
      carriedScore: 0,
      runSeed,
      lives: INITIAL_LIVES,
      introducedFeatureIds: [],
      difficulty: this.difficulty,
    })
  }

  private cellCenterX(gridX: number): number {
    return this.mazeOrigin.x + gridX * CELL_SIZE + CELL_SIZE / 2
  }

  private cellCenterY(gridY: number): number {
    return this.mazeOrigin.y + gridY * CELL_SIZE + CELL_SIZE / 2
  }
}

function deriveStageSeed(runSeed: number, stageNumber: number): number {
  return Math.imul(runSeed ^ stageNumber, 0x9e3779b1) >>> 0
}

function createRandomRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]
}

function updateRunConfigurationInUrl(runSeed: number, difficulty: DifficultyId): void {
  const url = new URL(location.href)
  url.searchParams.set('seed', runSeed.toString(16).toUpperCase().padStart(8, '0'))
  url.searchParams.set('difficulty', difficulty)
  history.replaceState(null, '', url)
}

function isMazeDebugEnabled(): boolean {
  return new URLSearchParams(location.search).get('debug') === 'maze'
}