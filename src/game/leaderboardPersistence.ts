import {
  LEADERBOARD_DIFFICULTIES,
  LEADERBOARD_LIMIT,
  clearLeaderboard,
  compareEntries,
  createEmptyLeaderboard,
  getCandidateRank,
  isLeaderboardDifficulty,
  normalizeInitials,
  recordLeaderboardEntry,
  type LeaderboardCandidate,
  type LeaderboardDifficulty,
  type LeaderboardEntry,
  type LeaderboardRecordResult,
  type LeaderboardState,
} from './leaderboard'

export interface LeaderboardStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const LEADERBOARD_STORAGE_KEY = 'a-maze-thing:leaderboard:v1'

export function loadLeaderboard(storage: LeaderboardStorage | null): LeaderboardState {
  if (storage === null) return createEmptyLeaderboard()

  try {
    const stored = storage.getItem(LEADERBOARD_STORAGE_KEY)
    if (stored === null) return createEmptyLeaderboard()
    return normalizeLeaderboard(JSON.parse(stored) as unknown)
  } catch {
    return createEmptyLeaderboard()
  }
}

export function saveLeaderboard(storage: LeaderboardStorage | null, state: LeaderboardState): void {
  if (storage === null) return
  try {
    storage.setItem(LEADERBOARD_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The in-memory board remains available when browser storage is blocked.
  }
}

export class LeaderboardRepository {
  private state: LeaderboardState

  constructor(privateStorage: LeaderboardStorage | null) {
    this.storage = privateStorage
    this.state = loadLeaderboard(privateStorage)
  }

  private readonly storage: LeaderboardStorage | null

  getState(): LeaderboardState {
    return this.state
  }

  getBoard(difficulty: LeaderboardDifficulty): readonly LeaderboardEntry[] {
    return this.state.boards[difficulty]
  }

  getCandidateRank(candidate: LeaderboardCandidate): number | null {
    return getCandidateRank(this.state, candidate)
  }

  record(candidate: LeaderboardCandidate, initials: string): LeaderboardRecordResult {
    const result = recordLeaderboardEntry(this.state, candidate, initials)
    this.state = result.state
    if (result.rank !== null) saveLeaderboard(this.storage, this.state)
    return result
  }

  clear(difficulty: LeaderboardDifficulty): void {
    this.state = clearLeaderboard(this.state, difficulty)
    saveLeaderboard(this.storage, this.state)
  }
}

function normalizeLeaderboard(value: unknown): LeaderboardState {
  if (!isRecord(value)) return createEmptyLeaderboard()
  const initials = typeof value.lastInitials === 'string'
    ? normalizeInitials(value.lastInitials)
    : null
  const state = createEmptyLeaderboard(initials ?? undefined)
  if (!isRecord(value.boards)) return state

  for (const difficulty of LEADERBOARD_DIFFICULTIES) {
    const entries = value.boards[difficulty]
    if (!Array.isArray(entries)) continue
    state.boards[difficulty] = entries
      .map(normalizeEntry)
      .filter((entry): entry is LeaderboardEntry => entry !== null && entry.difficulty === difficulty)
      .sort(compareEntries)
      .slice(0, LEADERBOARD_LIMIT)
  }
  return state
}

function normalizeEntry(value: unknown): LeaderboardEntry | null {
  if (!isRecord(value)) return null
  const initials = typeof value.initials === 'string' ? normalizeInitials(value.initials) : null
  if (
    initials === null
    || typeof value.difficulty !== 'string'
    || !isLeaderboardDifficulty(value.difficulty)
    || !isPositiveInteger(value.score)
    || !isPositiveInteger(value.stageReached)
    || !isUint32(value.runSeed)
    || typeof value.recordedAt !== 'number'
    || !Number.isFinite(value.recordedAt)
    || value.recordedAt < 0
  ) {
    return null
  }
  return {
    initials,
    difficulty: value.difficulty,
    score: value.score,
    stageReached: value.stageReached,
    runSeed: value.runSeed,
    recordedAt: value.recordedAt,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0
}

function isUint32(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 0xffffffff
}
