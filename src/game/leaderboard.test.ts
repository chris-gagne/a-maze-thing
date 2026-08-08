import { describe, expect, it } from 'vitest'
import { Difficulty } from './difficultySettings'
import {
  beatsLocalRecord,
  clearLeaderboard,
  createEmptyLeaderboard,
  getCandidateRank,
  isLeaderboardDifficulty,
  normalizeInitials,
  recordLeaderboardEntry,
  type LeaderboardCandidate,
  type LeaderboardState,
} from './leaderboard'

describe('leaderboard', () => {
  it('creates separate empty scored-mode boards with default initials', () => {
    expect(createEmptyLeaderboard()).toEqual({
      boards: {
        'easy-peasy': [],
        normal: [],
        overclocked: [],
      },
      lastInitials: 'AAA',
    })
    expect(isLeaderboardDifficulty(Difficulty.Casual)).toBe(false)
    expect(isLeaderboardDifficulty(Difficulty.Normal)).toBe(true)
  })

  it('normalizes exactly three ASCII letters', () => {
    expect(normalizeInitials('xyz')).toBe('XYZ')
    expect(normalizeInitials('AB')).toBeNull()
    expect(normalizeInitials('A1C')).toBeNull()
    expect(normalizeInitials('ÄBC')).toBeNull()
  })

  it('ranks by score, stage, then earliest achievement', () => {
    let state = createEmptyLeaderboard()
    state = recordLeaderboardEntry(state, candidate(100, 4, 30), 'NEW').state
    state = recordLeaderboardEntry(state, candidate(100, 5, 40), 'TOP').state
    state = recordLeaderboardEntry(state, candidate(100, 4, 20), 'OLD').state
    state = recordLeaderboardEntry(state, candidate(120, 2, 50), 'MAX').state

    expect(state.boards.normal.map((entry) => entry.initials)).toEqual(['MAX', 'TOP', 'OLD', 'NEW'])
  })

  it('keeps exact ties stable behind existing entries', () => {
    let state = createEmptyLeaderboard()
    const tied = candidate(100, 4, 30)
    state = recordLeaderboardEntry(state, tied, 'ONE').state
    expect(getCandidateRank(state, tied)).toBe(2)
    state = recordLeaderboardEntry(state, tied, 'TWO').state
    expect(state.boards.normal.map((entry) => entry.initials)).toEqual(['ONE', 'TWO'])
  })

  it('celebrates only when a candidate beats an existing first place', () => {
    const empty = createEmptyLeaderboard()
    expect(beatsLocalRecord(empty, candidate(100, 4, 10))).toBe(false)

    const state = recordLeaderboardEntry(empty, candidate(100, 4, 10), 'OLD').state
    expect(beatsLocalRecord(state, candidate(101, 1, 20))).toBe(true)
    expect(beatsLocalRecord(state, candidate(100, 4, 20))).toBe(false)
    expect(beatsLocalRecord(state, candidate(90, 20, 20))).toBe(false)
  })

  it('allows duplicate seed attempts and keeps modes separate', () => {
    const first = candidate(100, 4, 30)
    let state = recordLeaderboardEntry(createEmptyLeaderboard(), first, 'ONE').state
    state = recordLeaderboardEntry(state, { ...first, recordedAt: 40 }, 'TWO').state
    state = recordLeaderboardEntry(state, {
      ...first,
      difficulty: Difficulty.EasyPeasy,
    }, 'EZY').state

    expect(state.boards.normal).toHaveLength(2)
    expect(state.boards['easy-peasy']).toHaveLength(1)
  })

  it('trims to ten and rejects a candidate below the board', () => {
    let state = createEmptyLeaderboard()
    for (let score = 20; score >= 11; score -= 1) {
      state = recordLeaderboardEntry(state, candidate(score, 1, score), 'AAA').state
    }

    expect(getCandidateRank(state, candidate(10, 20, 50))).toBeNull()
    const missed = recordLeaderboardEntry(state, candidate(10, 20, 50), 'LOW')
    expect(missed.rank).toBeNull()
    expect(missed.state).toBe(state)

    const inserted = recordLeaderboardEntry(state, candidate(15, 1, 60), 'MID')
    expect(inserted.rank).toBe(7)
    expect(inserted.state.boards.normal).toHaveLength(10)
    expect(inserted.state.boards.normal.at(-1)?.score).toBe(12)
  })

  it('never qualifies or records a zero-point game', () => {
    const state = createEmptyLeaderboard('TAG')
    const zero = candidate(0, 20, 50)

    expect(getCandidateRank(state, zero)).toBeNull()
    expect(recordLeaderboardEntry(state, zero, 'ZER')).toEqual({ state, rank: null })
    expect(state.lastInitials).toBe('TAG')
  })

  it('clears only one board and preserves remembered initials', () => {
    const normal = recordLeaderboardEntry(createEmptyLeaderboard(), candidate(20, 1, 1), 'TAG').state
    const state: LeaderboardState = recordLeaderboardEntry(normal, {
      ...candidate(30, 1, 2),
      difficulty: Difficulty.Overclocked,
    }, 'SPD').state

    const cleared = clearLeaderboard(state, Difficulty.Normal)
    expect(cleared.boards.normal).toEqual([])
    expect(cleared.boards.overclocked).toHaveLength(1)
    expect(cleared.lastInitials).toBe('SPD')
  })

  it('rejects malformed initials when recording', () => {
    expect(() => recordLeaderboardEntry(createEmptyLeaderboard(), candidate(1, 1, 1), 'NO')).toThrow(RangeError)
  })
})

function candidate(score: number, stageReached: number, recordedAt: number): LeaderboardCandidate {
  return {
    difficulty: Difficulty.Normal,
    score,
    stageReached,
    runSeed: 0xdeadbeef,
    recordedAt,
  }
}
