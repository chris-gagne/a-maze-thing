import { Difficulty, type DifficultyId } from './difficultySettings'

export const LEADERBOARD_LIMIT = 10
export const DEFAULT_INITIALS = 'AAA'

export const LEADERBOARD_DIFFICULTIES = [
  Difficulty.EasyPeasy,
  Difficulty.Normal,
  Difficulty.Overclocked,
] as const

export type LeaderboardDifficulty = typeof LEADERBOARD_DIFFICULTIES[number]

export interface LeaderboardCandidate {
  difficulty: LeaderboardDifficulty
  score: number
  stageReached: number
  runSeed: number
  recordedAt: number
}

export interface LeaderboardEntry extends LeaderboardCandidate {
  initials: string
}

export interface LeaderboardState {
  boards: Record<LeaderboardDifficulty, readonly LeaderboardEntry[]>
  lastInitials: string
}

export interface LeaderboardRecordResult {
  state: LeaderboardState
  rank: number | null
}

export function createEmptyLeaderboard(lastInitials = DEFAULT_INITIALS): LeaderboardState {
  return {
    boards: {
      [Difficulty.EasyPeasy]: [],
      [Difficulty.Normal]: [],
      [Difficulty.Overclocked]: [],
    },
    lastInitials: normalizeInitials(lastInitials) ?? DEFAULT_INITIALS,
  }
}

export function isLeaderboardDifficulty(value: DifficultyId | string): value is LeaderboardDifficulty {
  return LEADERBOARD_DIFFICULTIES.some((difficulty) => difficulty === value)
}

export function normalizeInitials(value: string): string | null {
  const normalized = value.toUpperCase()
  return /^[A-Z]{3}$/.test(normalized) ? normalized : null
}

export function getCandidateRank(
  state: LeaderboardState,
  candidate: LeaderboardCandidate,
): number | null {
  if (candidate.score <= 0) return null
  const marker: LeaderboardEntry = { ...candidate, initials: DEFAULT_INITIALS }
  const ranked = [...state.boards[candidate.difficulty], marker].sort(compareEntries)
  const rank = ranked.indexOf(marker) + 1
  return rank <= LEADERBOARD_LIMIT ? rank : null
}

export function beatsLocalRecord(
  state: LeaderboardState,
  candidate: LeaderboardCandidate,
): boolean {
  return state.boards[candidate.difficulty].length > 0
    && getCandidateRank(state, candidate) === 1
}

export function recordLeaderboardEntry(
  state: LeaderboardState,
  candidate: LeaderboardCandidate,
  initials: string,
): LeaderboardRecordResult {
  if (candidate.score <= 0) {
    return { state, rank: null }
  }
  const normalizedInitials = normalizeInitials(initials)
  if (normalizedInitials === null) {
    throw new RangeError('Leaderboard initials must contain exactly three letters.')
  }

  const entry: LeaderboardEntry = { ...candidate, initials: normalizedInitials }
  const ranked = [...state.boards[candidate.difficulty], entry].sort(compareEntries)
  const rank = ranked.indexOf(entry) + 1
  if (rank > LEADERBOARD_LIMIT) {
    return { state, rank: null }
  }

  return {
    state: {
      boards: {
        ...state.boards,
        [candidate.difficulty]: ranked.slice(0, LEADERBOARD_LIMIT),
      },
      lastInitials: normalizedInitials,
    },
    rank,
  }
}

export function clearLeaderboard(
  state: LeaderboardState,
  difficulty: LeaderboardDifficulty,
): LeaderboardState {
  return {
    ...state,
    boards: {
      ...state.boards,
      [difficulty]: [],
    },
  }
}

export function compareEntries(left: LeaderboardEntry, right: LeaderboardEntry): number {
  return right.score - left.score
    || right.stageReached - left.stageReached
    || left.recordedAt - right.recordedAt
}
