import Phaser from 'phaser'
import { StageAudioObserver } from '../audio/StageAudioObserver'
import { getReactiveAudio } from '../audio/audioRuntime'
import { AudioCueName, AudioMood } from '../audio/audioTypes'
import {
  createStageSimulation,
  Direction,
  getAmbusherGridPosition,
  getHunterGridPosition,
  getLifeTargetGridPositions,
  getPlayerGridPosition,
  getWandererGridPosition,
  LifeTargetEffect,
  queuePlayerDirection,
  type StageSimulation,
  updateStageSimulation,
} from '../game/stageSimulation'
import { deriveBonusStageSeed, parseDebugStage, parseRunSeed } from '../game/runSeed'
import {
  BONUS_STAGE_DURATION_SECONDS,
  BONUS_STAGE_GENERATION_STAGE,
  BONUS_STAGE_PLAYER_SPEED_MULTIPLIER,
  BONUS_STAGE_TOTAL_TARGETS,
  calculateBonusStageAward,
  getBonusCountdownPhase,
  getBonusSignalGainPercent,
  isBonusStage,
} from '../game/bonusStage'
import { INITIAL_LIVES } from '../game/lifeRules'
import {
  DEFAULT_DIFFICULTY,
  DIFFICULTY_PRESETS,
  getDifficultyPreset,
  parseDifficulty,
  resolveDifficulty,
  type DifficultyId,
} from '../game/difficultySettings'
import { calculateStageCoinAward } from '../game/stageScoring'
import {
  DEFAULT_INITIALS,
  LEADERBOARD_DIFFICULTIES,
  beatsLocalRecord,
  isLeaderboardDifficulty,
  type LeaderboardCandidate,
  type LeaderboardDifficulty,
} from '../game/leaderboard'
import { getLeaderboardRepository } from '../game/leaderboardRuntime'
import { ENTITY_MOVEMENT_SPEEDS } from '../game/gamePacing'
import { getSpikePhase, SpikePhase } from '../game/spikeTiming'
import { getShutterPhase, ShutterPhase } from '../game/shutterTiming'
import { getStageProfile } from '../game/stageProgression'
import {
  selectStageIntroduction,
  StageFeature,
  type StageFeatureId,
  type StageIntroduction,
} from '../game/stageIntroductions'
import { createCoinPlacement } from '../generation/coinPlacement'
import { placeAmbusher } from '../generation/ambusherPlacement'
import { placeBonusTargets } from '../generation/bonusTargetPlacement'
import { placeLifeTarget } from '../generation/lifeTargetPlacement'
import { generateMaze, type Maze, Wall } from '../generation/maze'
import { placePortals } from '../generation/portalPlacement'
import { placeSpikes } from '../generation/spikePlacement'
import { placeShutters } from '../generation/shutterPlacement'
import { placeWanderer } from '../generation/wandererPlacement'
import { createPixelTextures, TextureKey } from '../presentation/pixelTextures'
import { getLifeMessage } from '../presentation/lifeMessages'

export const GAME_WIDTH = 960
export const GAME_HEIGHT = 720

const CELL_SIZE = 48
const MAZE_TOP = 128
const FIXED_STEP_SECONDS = 1 / 120
const HUNTER_RELEASE_DELAY_SECONDS = 2.4
const RESPAWN_PAUSE_MILLISECONDS = 1250
const AMBUSH_PAUSE_MILLISECONDS = 1000
const WANDERER_PAUSE_MILLISECONDS = 1000
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
  private bonusStage = false
  private bonusSecondsRemaining = BONUS_STAGE_DURATION_SECONDS
  private lastBonusTickSecond = BONUS_STAGE_DURATION_SECONDS
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
  private wandererOverlay: Phaser.GameObjects.Container | null = null
  private pauseMenu: Phaser.GameObjects.Container | null = null
  private initialsOverlay: Phaser.GameObjects.Container | null = null
  private leaderboardOverlay: Phaser.GameObjects.Container | null = null
  private runActions: Phaser.GameObjects.Container | null = null
  private leaderboardCandidate: LeaderboardCandidate | null = null
  private leaderboardRank: number | null = null
  private leaderboardRecordBeaten = false
  private initials = DEFAULT_INITIALS.split('')
  private initialsSlot = 0
  private leaderboardDifficulty: LeaderboardDifficulty = DEFAULT_DIFFICULTY
  private leaderboardSelection = 0
  private leaderboardClearPending = false
  private observedPortalReturnArmed = false
  private maze!: Maze
  private simulation!: StageSimulation
  private stageAudioObserver: StageAudioObserver | null = null
  private readonly audio = getReactiveAudio()
  private readonly leaderboard = getLeaderboardRepository()
  private mazeOrigin = { x: 0, y: MAZE_TOP }
  private hunterSprite: Phaser.GameObjects.Image | null = null
  private ambusherSprite: Phaser.GameObjects.Image | null = null
  private wandererSprite: Phaser.GameObjects.Image | null = null
  private lifeTargetSprites = new Map<number, Phaser.GameObjects.Image>()
  private playerSprite!: Phaser.GameObjects.Image
  private startMarker!: Phaser.GameObjects.Graphics
  private livesText!: Phaser.GameObjects.Text
  private scoreText!: Phaser.GameObjects.Text
  private remainingText!: Phaser.GameObjects.Text
  private timerText: Phaser.GameObjects.Text | null = null
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private movementKeys!: MovementKeys
  private introductionEnterKey!: Phaser.Input.Keyboard.Key
  private introductionSpaceKey!: Phaser.Input.Keyboard.Key
  private retryLevelKey!: Phaser.Input.Keyboard.Key
  private retrySeedKey!: Phaser.Input.Keyboard.Key
  private leaderboardKey!: Phaser.Input.Keyboard.Key
  private clearLeaderboardKey!: Phaser.Input.Keyboard.Key
  private coinSprites = new Map<number, Phaser.GameObjects.Image>()
  private spikeSprites = new Map<number, Phaser.GameObjects.Image>()
  private shutterSprites: Phaser.GameObjects.Image[] = []
  private loopAnchors: number[] = []
  private ambusherBranchIndices: number[] = []
  private observedLivesLost = 0
  private observedLivesGained = 0
  private observedBonusTargetsCaptured = 0
  private observedPortalUses = 0
  private observedAmbusherReveals = 0
  private observedWandererSpawns = 0
  private observedWandererTriggers = 0

  constructor() {
    super('play')
  }

  init(data: Partial<RunSceneData> = {}): void {
    const searchParams = new URLSearchParams(location.search)
    const debugMode = searchParams.get('debug') === 'maze'
    const requestedSeed = parseRunSeed(searchParams.get('seed'))
    const requestedDifficulty = parseDifficulty(searchParams.get('difficulty'))
    const requestedStage = parseDebugStage(
      searchParams.get('stage'),
      debugMode,
    )
    this.stageNumber = data.stageNumber ?? requestedStage ?? 1
    this.carriedScore = data.carriedScore ?? 0
    this.runSeed = data.runSeed ?? requestedSeed ?? createRandomRunSeed()
    this.lives = data.lives ?? INITIAL_LIVES
    this.stageEntryLives = this.lives
    this.difficulty = resolveDifficulty(data.difficulty, requestedDifficulty, debugMode)
    this.bonusStage = getDifficultyPreset(this.difficulty).fullGame && isBonusStage(this.stageNumber)
    this.bonusSecondsRemaining = BONUS_STAGE_DURATION_SECONDS
    this.lastBonusTickSecond = BONUS_STAGE_DURATION_SECONDS
    this.difficultySelectionRequired = data.selectDifficulty
      ?? (!debugMode && data.difficulty === undefined && (requestedSeed === null || requestedDifficulty === null))
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
    this.wandererOverlay = null
    this.pauseMenu = null
    this.initialsOverlay = null
    this.leaderboardOverlay = null
    this.runActions = null
    this.leaderboardCandidate = null
    this.leaderboardRank = null
    this.leaderboardRecordBeaten = false
    this.initials = (this.leaderboard?.getState().lastInitials ?? DEFAULT_INITIALS).split('')
    this.initialsSlot = 0
    this.leaderboardDifficulty = DEFAULT_DIFFICULTY
    this.leaderboardSelection = 0
    this.leaderboardClearPending = false
    this.difficultyMenu = null
    this.stageAudioObserver = null
    this.observedPortalReturnArmed = false
    this.coinSprites.clear()
    this.spikeSprites.clear()
    this.shutterSprites = []
    this.loopAnchors = []
    this.ambusherBranchIndices = []
    this.hunterSprite = null
    this.ambusherSprite = null
    this.wandererSprite = null
    this.lifeTargetSprites.clear()
    this.timerText = null
    this.observedLivesLost = 0
    this.observedLivesGained = 0
    this.observedBonusTargetsCaptured = 0
    this.observedPortalUses = 0
    this.observedAmbusherReveals = 0
    this.observedWandererSpawns = 0
    this.observedWandererTriggers = 0
  }

  create(): void {
    createPixelTextures(this)
    this.drawBackdrop()
    this.bindInput()

    if (this.difficultySelectionRequired) {
      this.audio?.setMood(AudioMood.Silent)
      this.showDifficultySelector()
      return
    }

    const generationStage = this.bonusStage ? BONUS_STAGE_GENERATION_STAGE : this.stageNumber
    const stageProfile = getStageProfile(generationStage)
    const stageSeed = this.bonusStage
      ? deriveBonusStageSeed(this.runSeed, this.stageNumber)
      : deriveStageSeed(this.runSeed, this.stageNumber)
    const fullGame = getDifficultyPreset(this.difficulty).fullGame
    const threatsEnabled = fullGame && !this.bonusStage
    this.maze = generateMaze(stageProfile.width, stageProfile.height, stageSeed, {
      ...stageProfile.topology,
      endpointProfile: stageProfile.endpointProfile,
    })
    const portalIndices = fullGame ? placePortals(this.maze, stageSeed ^ 0xa4dfed5) : []
    const lifeTargetIndex = fullGame && !this.bonusStage
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
    const ambusherPlacement = threatsEnabled
      ? placeAmbusher(
          this.maze,
          this.stageNumber,
          stageSeed ^ 0xa8b05,
          portalReservations,
        )
      : null
    const wandererPlacement = threatsEnabled
      ? placeWanderer(this.stageNumber, stageSeed ^ 0x7a11de)
      : null
    this.ambusherBranchIndices = ambusherPlacement?.branchIndices ?? []
    const spikeReservations = ambusherPlacement === null
      ? portalReservations
      : [...portalReservations, ...ambusherPlacement.branchIndices]
    const spikePlacement = threatsEnabled
      ? placeSpikes(
          this.maze,
          this.stageNumber,
          stageSeed ^ 0x5a1ce5,
          spikeReservations,
          stageProfile.hazardDensityMultiplier,
        )
      : []
    const shutterPlacement = fullGame
      ? placeShutters(this.maze, generationStage, stageSeed ^ 0x5a477e)
      : []
    const spikeIndices = new Set(spikePlacement.map((spike) => spike.cellIndex))
    const bonusTargetIndices = this.bonusStage
      ? placeBonusTargets(
          this.maze,
          BONUS_STAGE_TOTAL_TARGETS,
          stageSeed ^ 0xb07a6e7,
          portalIndices,
        )
      : []
    const occupiedIndices = new Set([
      ...portalReservations,
      ...spikeIndices,
      ...bonusTargetIndices,
      ...(ambusherPlacement === null ? [] : [ambusherPlacement.cellIndex]),
    ])
    const coinPlacement = fullGame
      ? createCoinPlacement(this.maze, stageSeed ^ 0xc01dcafe, occupiedIndices)
      : { indices: [], loopAnchors: [] }
    this.loopAnchors = coinPlacement.loopAnchors
    const entranceIndex = this.maze.entrance.y * this.maze.width + this.maze.entrance.x
    const exitIndex = this.maze.exit.y * this.maze.width + this.maze.exit.x
    this.simulation = createStageSimulation(this.maze, {
      coinIndices: coinPlacement.indices,
      hunter: threatsEnabled
        ? {
            startCellIndex: entranceIndex,
            releaseDelaySeconds: HUNTER_RELEASE_DELAY_SECONDS,
          }
        : undefined,
      ambusher: ambusherPlacement === null
        ? undefined
        : { startCellIndex: ambusherPlacement.cellIndex },
      wanderer: wandererPlacement === null
        ? undefined
        : {
            startCellIndex: exitIndex,
            departureCellIndex: entranceIndex,
            spawnSeconds: wandererPlacement.spawnSeconds,
            routeSeed: wandererPlacement.routeSeed,
          },
      lifeTarget: lifeTargetIndex === null ? undefined : { startCellIndex: lifeTargetIndex },
      lifeTargets: this.bonusStage
        ? bonusTargetIndices.map((startCellIndex) => ({
            startCellIndex,
            effect: LifeTargetEffect.BonusMultiplier,
          }))
        : undefined,
      spikes: spikePlacement,
      shutters: shutterPlacement,
      portalIndices,
      lives: this.lives,
      exitCompletesStage: !this.bonusStage,
    })
    this.stageAudioObserver = new StageAudioObserver(this.simulation)
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
    if (shutterPlacement.length > 0) {
      presentFeatureIds.push(StageFeature.Shutters)
    }
    if (lifeTargetIndex !== null) {
      presentFeatureIds.push(StageFeature.ExtraLife)
    }
    if (ambusherPlacement !== null) {
      presentFeatureIds.push(StageFeature.Ambusher)
    }
    if (wandererPlacement !== null) {
      presentFeatureIds.push(StageFeature.Wanderer)
    }

    const introduction: StageIntroduction | null = this.bonusStage
      ? {
          headline: 'BONUS STAGE',
          lines: [
            'Grab coins for 60 seconds. Twenty Signal targets are loose throughout the maze.',
            'No threats. No early exit. Move fast.',
          ],
          introducedFeatureIds: [...this.introducedFeatureIds],
        }
      : selectStageIntroduction(
          this.stageNumber,
          presentFeatureIds,
          this.introducedFeatureIds,
          !fullGame,
        )
    if (introduction !== null) {
      this.introducedFeatureIds = new Set(introduction.introducedFeatureIds)
      this.showStageIntroduction(introduction)
    } else {
      this.refreshAudioMood()
    }
    this.cameras.main.fadeIn(180, 5, 8, 10)
  }

  update(_time: number, deltaMilliseconds: number): void {
    if (this.initialsOverlay !== null) {
      this.updateInitialsInput()
      return
    }

    if (this.leaderboardOverlay !== null) {
      this.updateLeaderboardInput()
      return
    }

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
      if (Phaser.Input.Keyboard.JustDown(this.leaderboardKey)) {
        this.showLeaderboard()
      } else if (Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)) {
        this.startNewRun()
      } else if (Phaser.Input.Keyboard.JustDown(this.retrySeedKey)) {
        this.retryCurrentSeed()
      }
      return
    }

    if (this.stageResolved) {
      return
    }

    if (this.respawnOverlay !== null || this.ambushOverlay !== null || this.wandererOverlay !== null) {
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
      const wandererSpawnsBeforeUpdate = this.simulation.wandererSpawns
      const wandererTriggersBeforeUpdate = this.simulation.wandererTriggers
      updateStageSimulation(
        this.simulation,
        FIXED_STEP_SECONDS * getDifficultyPreset(this.difficulty).simulationSpeedMultiplier,
        this.bonusStage
          ? {
              ...ENTITY_MOVEMENT_SPEEDS,
              player: ENTITY_MOVEMENT_SPEEDS.player * BONUS_STAGE_PLAYER_SPEED_MULTIPLIER,
            }
          : ENTITY_MOVEMENT_SPEEDS,
      )
      if (this.bonusStage) {
        this.updateBonusTimer(FIXED_STEP_SECONDS)
      }
      this.syncAudioEvents()
      this.accumulator -= FIXED_STEP_SECONDS

      if (
        this.simulation.livesLost > livesLostBeforeUpdate
        || this.simulation.ambusherReveals > ambusherRevealsBeforeUpdate
        || this.simulation.wandererSpawns > wandererSpawnsBeforeUpdate
        || this.simulation.wandererTriggers > wandererTriggersBeforeUpdate
      ) {
        this.accumulator = 0
        break
      }
    }

    this.syncPresentation()
    this.syncAmbusherEvents()
    this.syncWandererEvents()
    this.syncLifeEvents()
    this.syncPortalEvents()
    this.syncStartReturnMarker()

    if (this.bonusStage && this.bonusSecondsRemaining <= 0) {
      this.resolveBonusStage()
    } else if (this.simulation.complete) {
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

    if (isMazeDebugOverlayEnabled()) {
      this.drawMazeDebug()
    }

    this.shutterSprites = this.simulation.shutters.map((shutter) => {
      const from = this.maze.cells[shutter.fromCellIndex]
      const to = this.maze.cells[shutter.toCellIndex]
      return this.add.image(
        (this.cellCenterX(from.x) + this.cellCenterX(to.x)) / 2,
        (this.cellCenterY(from.y) + this.cellCenterY(to.y)) / 2,
        TextureKey.Shutter,
      ).setDepth(3).setAngle(from.x === to.x ? 90 : 0)
    })

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

    if (this.simulation.wanderer !== null) {
      const wandererCell = this.maze.cells[this.simulation.wanderer.spawnCellIndex]
      this.wandererSprite = this.add.image(
        this.cellCenterX(wandererCell.x),
        this.cellCenterY(wandererCell.y),
        TextureKey.Wanderer,
      ).setDepth(4).setVisible(false)
    }

    for (const [targetId, lifeTargetPosition] of getLifeTargetGridPositions(this.simulation)) {
      const lifeTargetSprite = this.add.image(
        this.cellCenterX(lifeTargetPosition.x),
        this.cellCenterY(lifeTargetPosition.y),
        TextureKey.LifeTarget,
      ).setDepth(4)
      this.lifeTargetSprites.set(targetId, lifeTargetSprite)
      this.tweens.add({
        targets: lifeTargetSprite,
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

    this.add.text(
      48,
      32,
      this.bonusStage ? 'BONUS STAGE' : `STAGE ${String(this.stageNumber).padStart(2, '0')}`,
      valueStyle,
    )
      .setScrollFactor(0).setDepth(11)
    this.add.text(48, 64, `SEED ${stageSeed.toString(16).toUpperCase().padStart(8, '0')}`, labelStyle)
      .setScrollFactor(0).setDepth(11)
    this.livesText = this.add.text(GAME_WIDTH / 2, 32, '', valueStyle)
      .setOrigin(0.5, 0).setScrollFactor(0).setDepth(11)

    this.scoreText = this.add.text(GAME_WIDTH - 48, 32, '', valueStyle)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(11)
    this.remainingText = this.add.text(GAME_WIDTH - 48, 64, '', labelStyle)
      .setOrigin(1, 0).setScrollFactor(0).setDepth(11)
    if (this.bonusStage) {
      this.timerText = this.add.text(GAME_WIDTH / 2, 64, '', valueStyle)
        .setOrigin(0.5, 0).setScrollFactor(0).setDepth(11)
    }
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
    this.leaderboardKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.L)
    this.clearLeaderboardKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.C)
    window.addEventListener('keydown', this.handleWindowKeyDown, { capture: true })
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.handleWindowKeyDown, { capture: true })
      this.audio?.setMood(AudioMood.Silent)
    })
  }

  private readonly handleWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      return
    }

    if (this.initialsOverlay !== null) {
      if (/^[a-z]$/i.test(event.key)) {
        event.preventDefault()
        this.setInitialLetter(event.key.toUpperCase())
      } else if (event.key === 'Backspace') {
        event.preventDefault()
        this.moveInitialsSlot(-1)
      } else if (event.key === 'Escape') {
        event.preventDefault()
      }
      return
    }

    if (this.leaderboardOverlay !== null && event.key === 'Escape') {
      event.preventDefault()
      this.closeLeaderboard()
      return
    }

    if (event.key.toLowerCase() === 'l' && (this.difficultyMenu !== null || this.runEndActive)) {
      event.preventDefault()
      this.showLeaderboard()
      return
    }

    if (event.key !== 'Escape') return

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
      || this.wandererOverlay !== null
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
    const panel = this.add.rectangle(0, 0, 760, 680, 0x05080a, 0.99)
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

    const prompt = this.add.text(0, 240, 'UP / DOWN TO SELECT  //  ENTER TO START', {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: '#79f25f',
    }).setOrigin(0.5)
    this.difficultyMenu.add(prompt)
    this.createOverlayButton(this.difficultyMenu, 0, 296, 260, 'LOCAL SCORES [L]', 0xffcf52, () => {
      this.showLeaderboard()
    })
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
    this.audio?.play({ name: AudioCueName.UiMove })
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
    this.audio?.play({ name: AudioCueName.UiConfirm })
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
    this.audio?.play({ name: AudioCueName.Pause })
    this.audio?.setMood(AudioMood.Silent)

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
    this.audio?.play({ name: AudioCueName.Resume })
    this.refreshAudioMood()
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
    this.audio?.setMood(AudioMood.Silent)
    const eyebrow = this.add.text(0, 0, `STAGE ${String(this.stageNumber).padStart(2, '0')}`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#8ba5aa',
    }).setOrigin(0.5, 0)
    const headline = this.add.text(0, 0, introduction.headline, {
      fontFamily: '"Press Start 2P"',
      fontSize: '28px',
      color: '#ffcf52',
    }).setOrigin(0.5, 0)
    const body = this.add.text(0, 0, introduction.lines.join('\n\n'), {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#f3fffe',
      align: 'center',
      lineSpacing: 10,
      wordWrap: { width: 620, useAdvancedWrap: true },
    }).setOrigin(0.5, 0)
    const prompt = this.add.text(0, 0, 'ENTER / SPACE / CLICK TO START', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#79f25f',
    }).setOrigin(0.5, 0)

    const panelPaddingY = 32
    eyebrow.y = 0
    headline.y = eyebrow.y + eyebrow.height + 24
    body.y = headline.y + headline.height + 30
    prompt.y = body.y + body.height + 28

    const panelHeight = prompt.y + prompt.height + panelPaddingY * 2
    const contentOffsetY = -panelHeight / 2 + panelPaddingY
    for (const text of [eyebrow, headline, body, prompt]) {
      text.y += contentOffsetY
    }

    const panel = this.add.rectangle(0, 0, 720, panelHeight, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0x42e8df, 1)

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
    this.audio?.play({ name: AudioCueName.UiConfirm })
    this.refreshAudioMood()
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

    const wandererPosition = getWandererGridPosition(this.simulation)
    if (wandererPosition === null) {
      this.wandererSprite?.setVisible(false)
    } else {
      this.wandererSprite?.setVisible(true).setPosition(
        this.cellCenterX(wandererPosition.x),
        this.cellCenterY(wandererPosition.y),
      ).setAlpha(this.simulation.wanderer?.triggered ? 1 : 0.72)
    }

    const lifeTargetPositions = getLifeTargetGridPositions(this.simulation)
    for (const [targetId, sprite] of this.lifeTargetSprites) {
      const position = lifeTargetPositions.get(targetId)
      if (position === undefined) {
        sprite.destroy()
        this.lifeTargetSprites.delete(targetId)
      } else {
        sprite.setPosition(this.cellCenterX(position.x), this.cellCenterY(position.y))
      }
    }
    for (const [targetId, position] of lifeTargetPositions) {
      if (this.lifeTargetSprites.has(targetId)) continue
      const sprite = this.add.image(
        this.cellCenterX(position.x),
        this.cellCenterY(position.y),
        TextureKey.LifeTarget,
      ).setDepth(4)
      this.lifeTargetSprites.set(targetId, sprite)
      this.tweens.add({
        targets: sprite,
        alpha: { from: 0.65, to: 1 },
        duration: 360,
        yoyo: true,
        repeat: -1,
        ease: 'Stepped',
        easeParams: [2],
      })
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

    this.simulation.shutters.forEach((shutter, index) => {
      const sprite = this.shutterSprites[index]
      const phase = getShutterPhase(shutter, this.simulation.elapsedSeconds)

      if (phase === ShutterPhase.Open) {
        sprite?.setTint(0x1b6970).setAlpha(0.4)
      } else if (phase === ShutterPhase.Warning) {
        const pulse = 0.72 + Math.abs(Math.sin(this.simulation.elapsedSeconds * Math.PI * 4)) * 0.28
        sprite?.setTint(0xffb629).setAlpha(pulse)
      } else {
        sprite?.setTint(0xff5364).setAlpha(1)
      }
    })

    this.updateHud()
  }

  private syncAudioEvents(): void {
    if (this.stageAudioObserver === null || this.audio === null) {
      return
    }

    const update = this.stageAudioObserver.observe(this.simulation)
    for (const cue of update.cues) {
      this.audio.play(cue)
    }
    this.audio.setMood(this.bonusStage ? AudioMood.Bonus : update.mood)
  }

  private refreshAudioMood(): void {
    if (this.stageAudioObserver === null || this.audio === null) {
      return
    }
    const observedMood = this.stageAudioObserver.observe(this.simulation).mood
    this.audio.setMood(this.bonusStage ? AudioMood.Bonus : observedMood)
  }

  private syncAmbusherEvents(): void {
    if (this.simulation.ambusherReveals <= this.observedAmbusherReveals) {
      return
    }

    this.observedAmbusherReveals = this.simulation.ambusherReveals
    this.accumulator = 0
    this.tweens.pauseAll()
    this.audio?.setMood(AudioMood.Silent)
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
      this.refreshAudioMood()
    })
  }

  private syncWandererEvents(): void {
    const spawned = this.simulation.wandererSpawns > this.observedWandererSpawns
    const triggered = this.simulation.wandererTriggers > this.observedWandererTriggers
    if (!spawned && !triggered) {
      return
    }

    this.observedWandererSpawns = this.simulation.wandererSpawns
    this.observedWandererTriggers = this.simulation.wandererTriggers
    this.accumulator = 0
    this.tweens.pauseAll()
    this.audio?.setMood(AudioMood.Silent)

    const panel = this.add.rectangle(0, 0, 620, 190, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0x9d7bff, 1)
    const headline = this.add.text(0, -34, triggered ? 'WANDERER TRIGGERED!' : 'WANDERER ENTERS', {
      fontFamily: '"Press Start 2P"',
      fontSize: triggered ? '22px' : '25px',
      color: '#c8b7ff',
    }).setOrigin(0.5)
    const prompt = this.add.text(0, 36, spawned && triggered ? 'IT FOUND YOU AT THE EXIT' : triggered
      ? 'MOVE! IT IS HUNTING YOU'
      : 'IT SEEKS THE START', {
      fontFamily: '"Press Start 2P"',
      fontSize: '12px',
      color: '#f3fffe',
    }).setOrigin(0.5)
    this.wandererOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      panel,
      headline,
      prompt,
    ]).setDepth(25).setScrollFactor(0)

    this.time.delayedCall(WANDERER_PAUSE_MILLISECONDS, () => {
      this.wandererOverlay?.destroy(true)
      this.wandererOverlay = null
      this.tweens.resumeAll()
      this.accumulator = 0
      this.refreshAudioMood()
    })
  }

  private syncLifeEvents(): void {
    if (this.simulation.livesGained > this.observedLivesGained) {
      this.observedLivesGained = this.simulation.livesGained
      this.showStatusMessage('EXTRA LIFE', '#79f25f')
    }

    if (this.simulation.bonusTargetsCaptured > this.observedBonusTargetsCaptured) {
      this.observedBonusTargetsCaptured = this.simulation.bonusTargetsCaptured
      this.audio?.play({ name: AudioCueName.ExtraLife })
      this.showStatusMessage('SIGNAL GAIN +25%', '#ffcf52')
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
    this.audio?.setMood(AudioMood.Silent)

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
      this.refreshAudioMood()
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
    if (this.bonusStage) {
      const displaySeconds = Math.ceil(this.bonusSecondsRemaining)
      const minutes = Math.floor(displaySeconds / 60)
      const seconds = String(displaySeconds % 60).padStart(2, '0')
      this.scoreText.setText(`COINS ${String(this.simulation.collectedCoins).padStart(3, '0')}`)
      this.remainingText.setText(
        `SIGNAL GAIN ${getBonusSignalGainPercent(this.simulation.bonusTargetsCaptured)}%`,
      )
      this.timerText?.setText(`${String(minutes).padStart(2, '0')}:${seconds}`)
      const phase = getBonusCountdownPhase(this.bonusSecondsRemaining)
      this.timerText?.setColor(phase === 'danger' ? '#ff5364' : phase === 'warning' ? '#ffb629' : '#f3fffe')
      return
    }
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
        wandererSpawned: this.simulation.wanderer?.spawned ?? false,
        wandererDeparted: this.simulation.wanderer?.departed ?? false,
      },
    )
    const totalScore = this.carriedScore + award.awardedCoins
    const bonusRows = Number(award.coinMonger) + Number(award.survivedAmbush) + Number(award.evadedWanderer)
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

    if (award.evadedWanderer && !casual) {
      const wandererY = headlineY + 58
        + (award.coinMonger ? 42 : 0)
        + (award.survivedAmbush ? 42 : 0)
      this.add.text(GAME_WIDTH / 2, wandererY, 'EVADING THE WANDERER  +25', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#c8b7ff',
      }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    }

    if (!casual) {
      const bonusCoins = award.bonusCoins + award.ambushBonusCoins + award.wandererBonusCoins
      const scoreLine = `${award.baseCoins} COINS + ${bonusCoins} BONUS  //  TOTAL ${totalScore}`
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

  private updateBonusTimer(deltaSeconds: number): void {
    const previousSeconds = this.bonusSecondsRemaining
    this.bonusSecondsRemaining = Math.max(0, previousSeconds - deltaSeconds)
    const displaySecond = Math.ceil(this.bonusSecondsRemaining)
    if (displaySecond !== this.lastBonusTickSecond) {
      this.lastBonusTickSecond = displaySecond
      if (displaySecond >= 1 && displaySecond <= 15) {
        const finalCountdown = displaySecond <= 5
        this.audio?.play({
          name: finalCountdown ? AudioCueName.BonusFinalTick : AudioCueName.BonusTick,
        })
        if (this.timerText !== null) {
          this.tweens.killTweensOf(this.timerText)
          this.timerText.setScale(1)
          this.tweens.add({
            targets: this.timerText,
            scale: finalCountdown ? 1.32 : 1.08 + (15 - displaySecond) * 0.012,
            duration: finalCountdown ? 110 : 160,
            yoyo: true,
            ease: 'Stepped',
            easeParams: [2],
          })
        }
      }
    }
  }

  private resolveBonusStage(): void {
    this.stageResolved = true
    this.audio?.setMood(AudioMood.Silent)
    this.audio?.play({ name: AudioCueName.BonusComplete })
    const award = calculateBonusStageAward(
      this.simulation.collectedCoins,
      this.simulation.bonusTargetsCaptured,
    )
    const signalGainPercent = getBonusSignalGainPercent(award.capturedTargets)
    const totalScore = this.carriedScore + award.awardedCoins
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 680, 300, 0x05080a, 0.97)
    panel.setStrokeStyle(4, 0xffcf52, 1).setDepth(20).setScrollFactor(0)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 96, 'BONUS COMPLETE', {
      fontFamily: '"Press Start 2P"',
      fontSize: '27px',
      color: '#ffcf52',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 - 28,
      `COINS  ${award.collectedCoins}`,
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#f3fffe',
      },
    ).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    this.add.text(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 30,
      `SIGNAL GAIN  ${signalGainPercent}%`,
      {
        fontFamily: '"Press Start 2P"',
        fontSize: '17px',
        color: '#79f25f',
      },
    ).setOrigin(0.5).setDepth(21).setScrollFactor(0)
    this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 88, `TOTAL PAYOUT  ${award.awardedCoins}`, {
      fontFamily: '"Press Start 2P"',
      fontSize: '15px',
      color: '#42e8df',
    }).setOrigin(0.5).setDepth(21).setScrollFactor(0)

    this.time.delayedCall(1600, () => {
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

    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 720, 440, 0x05080a, 0.97)
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

    if (this.leaderboard !== null && isLeaderboardDifficulty(this.difficulty)) {
      this.leaderboardCandidate = {
        difficulty: this.difficulty,
        score: totalScore,
        stageReached: this.stageNumber,
        runSeed: this.runSeed,
        recordedAt: Date.now(),
      }
      const candidateRank = this.leaderboard.getCandidateRank(this.leaderboardCandidate)
      this.leaderboardRecordBeaten = beatsLocalRecord(
        this.leaderboard.getState(),
        this.leaderboardCandidate,
      )
      if (candidateRank !== null) {
        this.leaderboardRank = candidateRank
        this.showInitialsEntry()
        return
      }
    }
    this.showRunActions()
  }

  private showRunActions(): void {
    if (this.runActions !== null) return
    const status = this.leaderboardCandidate?.score === 0
      ? 'NO SCORE RECORDED'
      : this.leaderboardRank === null
      ? 'OUTSIDE LOCAL TOP 10'
      : this.leaderboardRecordBeaten
      ? `TAG ${this.initials.join('')}  //  LOCAL RECORD #01`
      : `TAG ${this.initials.join('')}  //  LOCAL RANK #${String(this.leaderboardRank).padStart(2, '0')}`
    this.runActions = this.add.container(0, 0).setDepth(21).setScrollFactor(0)
    this.createRunActionButton(
      this.runActions,
      GAME_WIDTH / 2 - 220,
      GAME_HEIGHT / 2 + 82,
      'NEW RUN [ENTER]',
      0x79f25f,
      () => this.startNewRun(),
    )
    this.createRunActionButton(
      this.runActions,
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2 + 82,
      'LOCAL SCORES [L]',
      0xffcf52,
      () => this.showLeaderboard(),
    )
    this.createRunActionButton(
      this.runActions,
      GAME_WIDTH / 2 + 220,
      GAME_HEIGHT / 2 + 82,
      'RETRY SEED [R]',
      0x42e8df,
      () => this.retryCurrentSeed(),
    )
    this.runActions.add(this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 158, status, {
      fontFamily: '"Press Start 2P"',
      fontSize: '11px',
      color: this.leaderboardRank === null ? '#8ba5aa' : '#79f25f',
    }).setOrigin(0.5))
  }

  private showInitialsEntry(): void {
    if (this.initialsOverlay !== null) return
    this.initials = (this.leaderboard?.getState().lastInitials ?? DEFAULT_INITIALS).split('')
    this.initialsSlot = 0
    if (this.leaderboardRecordBeaten) {
      this.audio?.play({ name: AudioCueName.LocalRecord })
      this.cameras.main.flash(280, 121, 242, 95, false)
    }
    this.renderInitialsEntry()
  }

  private renderInitialsEntry(): void {
    this.initialsOverlay?.destroy(true)
    const accent = this.leaderboardRecordBeaten ? 0x79f25f : 0xffcf52
    const accentCss = this.leaderboardRecordBeaten ? '#79f25f' : '#ffcf52'
    const panel = this.add.rectangle(0, 0, 560, 370, 0x05080a, 1).setStrokeStyle(4, accent, 1)
    const headline = this.add.text(0, -140, this.leaderboardRecordBeaten ? 'NEW LOCAL RECORD!' : 'NEW LOCAL SCORE', {
      fontFamily: '"Press Start 2P"', fontSize: '22px', color: accentCss,
    }).setOrigin(0.5)
    const prompt = this.add.text(0, -90, this.leaderboardRecordBeaten
      ? 'YOU TOPPED THE BOARD // ENTER YOUR TAG'
      : 'ENTER YOUR TAG', {
      fontFamily: '"Press Start 2P"', fontSize: '11px', color: '#8ba5aa',
    }).setOrigin(0.5)
    this.initialsOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [panel, headline, prompt])
      .setDepth(80).setScrollFactor(0)

    this.initials.forEach((letter, index) => {
      const x = (index - 1) * 100
      const selectorY = 12
      const selected = index === this.initialsSlot
      const slot = this.add.rectangle(x, selectorY, 74, 88, selected ? accent : 0x071318, selected ? 0.18 : 1)
        .setStrokeStyle(selected ? 4 : 2, selected ? accent : 0x28545c, 1)
        .setInteractive({ useHandCursor: true })
      const text = this.add.text(x, selectorY, letter, {
        fontFamily: '"Press Start 2P"', fontSize: '38px', color: '#f3fffe',
      }).setOrigin(0.5)
      const up = this.add.text(x, selectorY - 62, '+', {
        fontFamily: '"Press Start 2P"', fontSize: '18px', color: '#42e8df',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      const down = this.add.text(x, selectorY + 62, '-', {
        fontFamily: '"Press Start 2P"', fontSize: '18px', color: '#42e8df',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true })
      slot.on('pointerdown', () => { this.initialsSlot = index; this.renderInitialsEntry() })
      up.on('pointerdown', () => { this.initialsSlot = index; this.cycleInitialLetter(1) })
      down.on('pointerdown', () => { this.initialsSlot = index; this.cycleInitialLetter(-1) })
      this.initialsOverlay?.add([slot, text, up, down])
    })
    this.createOverlayButton(this.initialsOverlay, 0, 140, 220, 'CONFIRM', 0x79f25f, () => this.confirmInitials())
  }

  private updateInitialsInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.moveInitialsSlot(-1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.moveInitialsSlot(1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) this.cycleInitialLetter(1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) this.cycleInitialLetter(-1)
    else if (
      Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)
      || Phaser.Input.Keyboard.JustDown(this.introductionSpaceKey)
    ) this.confirmInitials()
  }

  private setInitialLetter(letter: string): void {
    this.initials[this.initialsSlot] = letter
    this.initialsSlot = Math.min(2, this.initialsSlot + 1)
    this.audio?.play({ name: AudioCueName.UiMove })
    this.renderInitialsEntry()
  }

  private moveInitialsSlot(offset: number): void {
    this.initialsSlot = (this.initialsSlot + offset + 3) % 3
    this.audio?.play({ name: AudioCueName.UiMove })
    this.renderInitialsEntry()
  }

  private cycleInitialLetter(offset: number): void {
    const code = this.initials[this.initialsSlot].charCodeAt(0) - 65
    this.initials[this.initialsSlot] = String.fromCharCode(65 + (code + offset + 26) % 26)
    this.audio?.play({ name: AudioCueName.UiMove })
    this.renderInitialsEntry()
  }

  private confirmInitials(): void {
    if (this.leaderboard === null || this.leaderboardCandidate === null) return
    const result = this.leaderboard.record(this.leaderboardCandidate, this.initials.join(''))
    this.leaderboardRank = result.rank
    this.initialsOverlay?.destroy(true)
    this.initialsOverlay = null
    this.audio?.play({ name: AudioCueName.UiConfirm })
    this.showRunActions()
  }

  private showLeaderboard(): void {
    if (this.leaderboard === null || this.initialsOverlay !== null || this.leaderboardOverlay !== null) return
    const selected = this.difficultyMenu === null
      ? this.difficulty
      : DIFFICULTY_PRESETS[this.selectedDifficultyIndex].id
    this.leaderboardDifficulty = isLeaderboardDifficulty(selected) ? selected : DEFAULT_DIFFICULTY
    this.leaderboardSelection = 0
    this.leaderboardClearPending = false
    this.audio?.play({ name: AudioCueName.UiConfirm })
    this.renderLeaderboard()
  }

  private renderLeaderboard(): void {
    if (this.leaderboard === null) return
    this.leaderboardOverlay?.destroy(true)
    const panel = this.add.rectangle(0, 0, 860, 660, 0x05080a, 1).setStrokeStyle(4, 0x42e8df, 1)
    const title = this.add.text(0, -294, 'LOCAL SCORES', {
      fontFamily: '"Press Start 2P"', fontSize: '24px', color: '#ffcf52',
    }).setOrigin(0.5)
    this.leaderboardOverlay = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [panel, title])
      .setDepth(90).setScrollFactor(0)

    LEADERBOARD_DIFFICULTIES.forEach((difficulty, index) => {
      const x = (index - 1) * 250
      const active = difficulty === this.leaderboardDifficulty
      const preset = getDifficultyPreset(difficulty)
      const tab = this.add.rectangle(x, -242, 224, 48, active ? DIFFICULTY_COLORS[difficulty] : 0x071318, active ? 0.2 : 1)
        .setStrokeStyle(active ? 4 : 2, DIFFICULTY_COLORS[difficulty], 1)
        .setInteractive({ useHandCursor: true })
      const label = this.add.text(x, -242, preset.label, {
        fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f3fffe',
      }).setOrigin(0.5)
      tab.on('pointerdown', () => this.selectLeaderboardDifficulty(index))
      this.leaderboardOverlay?.add([tab, label])
    })

    const headerStyle = { fontFamily: '"Press Start 2P"', fontSize: '9px', color: '#8ba5aa' }
    this.leaderboardOverlay.add([
      this.add.text(-370, -196, 'RANK', headerStyle),
      this.add.text(-268, -196, 'TAG', headerStyle),
      this.add.text(-148, -196, 'COINS', headerStyle),
      this.add.text(18, -196, 'STAGE', headerStyle),
      this.add.text(170, -196, 'SEED', headerStyle),
    ])
    const entries = this.leaderboard.getBoard(this.leaderboardDifficulty)
    this.leaderboardSelection = Math.max(0, Math.min(this.leaderboardSelection, entries.length - 1))
    if (entries.length === 0) {
      this.leaderboardOverlay.add(this.add.text(0, -20, 'NO SIGNALS RECORDED', {
        fontFamily: '"Press Start 2P"', fontSize: '13px', color: '#8ba5aa',
      }).setOrigin(0.5))
    }
    entries.forEach((entry, index) => {
      const y = -158 + index * 36
      const selected = index === this.leaderboardSelection
      const row = this.add.rectangle(0, y, 760, 32, selected ? 0x42e8df : 0x071318, selected ? 0.14 : 0.72)
        .setStrokeStyle(selected ? 2 : 1, selected ? 0x42e8df : 0x17333a, 1)
        .setInteractive({ useHandCursor: true })
      const rowStyle = { fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f3fffe' }
      const seed = entry.runSeed.toString(16).toUpperCase().padStart(8, '0')
      row.on('pointerover', () => {
        if (this.leaderboardSelection !== index) {
          this.leaderboardSelection = index
          this.renderLeaderboard()
        }
      })
      row.on('pointerdown', () => this.replayLeaderboardSelection())
      this.leaderboardOverlay?.add([
        row,
        this.add.text(-352, y, String(index + 1).padStart(2, '0'), rowStyle).setOrigin(0, 0.5),
        this.add.text(-250, y, entry.initials, rowStyle).setOrigin(0, 0.5),
        this.add.text(-130, y, String(entry.score).padStart(5, '0'), rowStyle).setOrigin(0, 0.5),
        this.add.text(38, y, String(entry.stageReached).padStart(3, '0'), rowStyle).setOrigin(0, 0.5),
        this.add.text(170, y, seed, rowStyle).setOrigin(0, 0.5),
      ])
    })

    const clearLabel = this.leaderboardClearPending ? 'CONFIRM CLEAR [C]?' : 'CLEAR BOARD [C]'
    this.createOverlayButton(this.leaderboardOverlay, -250, 278, 220, 'BACK [ESC]', 0x42e8df, () => this.closeLeaderboard())
    this.createOverlayButton(this.leaderboardOverlay, 0, 278, 220, clearLabel, 0xff5364, () => this.requestClearLeaderboard())
    this.createOverlayButton(
      this.leaderboardOverlay,
      250,
      278,
      220,
      entries.length === 0 ? 'NO SEED' : 'REPLAY SEED [R]',
      entries.length === 0 ? 0x28545c : 0x79f25f,
      () => this.replayLeaderboardSelection(),
    )
  }

  private updateLeaderboardInput(): void {
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) this.moveLeaderboardDifficulty(-1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) this.moveLeaderboardDifficulty(1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) this.moveLeaderboardSelection(-1)
    else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) this.moveLeaderboardSelection(1)
    else if (Phaser.Input.Keyboard.JustDown(this.clearLeaderboardKey)) this.requestClearLeaderboard()
    else if (Phaser.Input.Keyboard.JustDown(this.retrySeedKey)) this.replayLeaderboardSelection()
    else if (
      Phaser.Input.Keyboard.JustDown(this.introductionEnterKey)
      || Phaser.Input.Keyboard.JustDown(this.introductionSpaceKey)
    ) this.replayLeaderboardSelection()
  }

  private selectLeaderboardDifficulty(index: number): void {
    this.leaderboardDifficulty = LEADERBOARD_DIFFICULTIES[index]
    this.leaderboardSelection = 0
    this.leaderboardClearPending = false
    this.audio?.play({ name: AudioCueName.UiMove })
    this.renderLeaderboard()
  }

  private moveLeaderboardDifficulty(offset: number): void {
    const current = LEADERBOARD_DIFFICULTIES.indexOf(this.leaderboardDifficulty)
    this.selectLeaderboardDifficulty((current + offset + LEADERBOARD_DIFFICULTIES.length) % LEADERBOARD_DIFFICULTIES.length)
  }

  private moveLeaderboardSelection(offset: number): void {
    const count = this.leaderboard?.getBoard(this.leaderboardDifficulty).length ?? 0
    if (count === 0) return
    this.leaderboardSelection = (this.leaderboardSelection + offset + count) % count
    this.leaderboardClearPending = false
    this.audio?.play({ name: AudioCueName.UiMove })
    this.renderLeaderboard()
  }

  private replayLeaderboardSelection(): void {
    const entry = this.leaderboard?.getBoard(this.leaderboardDifficulty)[this.leaderboardSelection]
    if (entry === undefined || this.runRestarting) return
    this.runRestarting = true
    this.audio?.play({ name: AudioCueName.UiConfirm })
    updateRunConfigurationInUrl(entry.runSeed, entry.difficulty)
    this.difficulty = entry.difficulty
    this.restartRun(entry.runSeed)
  }

  private requestClearLeaderboard(): void {
    if (this.leaderboard === null) return
    if (!this.leaderboardClearPending) {
      this.leaderboardClearPending = true
      this.audio?.play({ name: AudioCueName.UiMove })
      this.renderLeaderboard()
      return
    }
    this.leaderboard.clear(this.leaderboardDifficulty)
    this.leaderboardSelection = 0
    this.leaderboardClearPending = false
    this.audio?.play({ name: AudioCueName.UiConfirm })
    this.renderLeaderboard()
  }

  private closeLeaderboard(): void {
    this.leaderboardOverlay?.destroy(true)
    this.leaderboardOverlay = null
    this.leaderboardClearPending = false
    this.audio?.play({ name: AudioCueName.UiConfirm })
  }

  private createRunActionButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    label: string,
    color: number,
    activate: () => void,
  ): void {
    const background = this.add.rectangle(x, y, 196, 58, 0x071318, 1)
    background.setStrokeStyle(3, color, 1)
      .setInteractive({ useHandCursor: true })
    const text = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"',
      fontSize: '10px',
      color: '#ffcf52',
    }).setOrigin(0.5)

    background.on('pointerover', () => background.setFillStyle(color, 0.22))
    background.on('pointerout', () => background.setFillStyle(0x071318, 1))
    background.on('pointerdown', activate)
    container.add([background, text])
  }

  private createOverlayButton(
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    width: number,
    label: string,
    color: number,
    activate: () => void,
  ): void {
    const background = this.add.rectangle(x, y, width, 46, 0x071318, 1)
      .setStrokeStyle(2, color, 1).setInteractive({ useHandCursor: true })
    const text = this.add.text(x, y, label, {
      fontFamily: '"Press Start 2P"', fontSize: '10px', color: '#f3fffe',
    }).setOrigin(0.5)
    background.on('pointerover', () => background.setFillStyle(color, 0.2))
    background.on('pointerout', () => background.setFillStyle(0x071318, 1))
    background.on('pointerdown', activate)
    container.add([background, text])
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

function isMazeDebugOverlayEnabled(): boolean {
  const searchParams = new URLSearchParams(location.search)
  return searchParams.get('debug') === 'maze' && searchParams.get('routes') === '1'
}