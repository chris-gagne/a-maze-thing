import { describe, expect, it } from 'vitest'
import { Difficulty } from './difficultySettings'
import { createEmptyLeaderboard, type LeaderboardCandidate } from './leaderboard'
import {
  LeaderboardRepository,
  loadLeaderboard,
  saveLeaderboard,
  type LeaderboardStorage,
} from './leaderboardPersistence'

class MemoryStorage implements LeaderboardStorage {
  value: string | null = null

  getItem(): string | null {
    return this.value
  }

  setItem(_key: string, value: string): void {
    this.value = value
  }
}

describe('leaderboard persistence', () => {
  it('defaults safely without storage or stored data', () => {
    expect(loadLeaderboard(null)).toEqual(createEmptyLeaderboard())
    expect(loadLeaderboard(new MemoryStorage())).toEqual(createEmptyLeaderboard())
  })

  it('round trips entries and remembered initials', () => {
    const storage = new MemoryStorage()
    const repository = new LeaderboardRepository(storage)
    repository.record(candidate(100), 'xyz')

    const restored = new LeaderboardRepository(storage).getState()
    expect(restored.lastInitials).toBe('XYZ')
    expect(restored.boards.normal[0]).toMatchObject({ initials: 'XYZ', score: 100 })
  })

  it('recovers valid entries from partially corrupt data', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify({
      lastInitials: 'tag',
      boards: {
        normal: [
          { ...candidate(20), initials: 'abc' },
          { ...candidate(0), initials: 'ZER' },
          { ...candidate(99), initials: 'NO' },
          { ...candidate(50), initials: 'BAD', difficulty: 'casual' },
          { ...candidate(40), initials: 'OKY', runSeed: -1 },
        ],
        'easy-peasy': 'broken',
      },
    })

    const state = loadLeaderboard(storage)
    expect(state.lastInitials).toBe('TAG')
    expect(state.boards.normal).toHaveLength(1)
    expect(state.boards.normal[0].initials).toBe('ABC')
    expect(state.boards['easy-peasy']).toEqual([])
  })

  it('accepts uint32 seed boundaries and rejects overflow', () => {
    const storage = new MemoryStorage()
    storage.value = JSON.stringify({
      lastInitials: 'AAA',
      boards: {
        normal: [
          { ...candidate(3), initials: 'MAX', runSeed: 0xffffffff },
          { ...candidate(2), initials: 'ZER', runSeed: 0 },
          { ...candidate(1), initials: 'BAD', runSeed: 0x100000000 },
        ],
      },
    })
    expect(loadLeaderboard(storage).boards.normal.map((entry) => entry.initials)).toEqual(['MAX', 'ZER'])
  })

  it('survives corrupt and blocked storage', () => {
    const corrupt = new MemoryStorage()
    corrupt.value = '{nope'
    expect(loadLeaderboard(corrupt)).toEqual(createEmptyLeaderboard())

    const blocked: LeaderboardStorage = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    const repository = new LeaderboardRepository(blocked)
    expect(() => repository.record(candidate(10), 'MEM')).not.toThrow()
    expect(repository.getBoard(Difficulty.Normal)[0].initials).toBe('MEM')
    expect(() => repository.clear(Difficulty.Normal)).not.toThrow()
  })

  it('clears one board and persists the result', () => {
    const storage = new MemoryStorage()
    const repository = new LeaderboardRepository(storage)
    repository.record(candidate(10), 'NRM')
    repository.record({ ...candidate(20), difficulty: Difficulty.Overclocked }, 'SPD')
    repository.clear(Difficulty.Normal)

    const restored = new LeaderboardRepository(storage)
    expect(restored.getBoard(Difficulty.Normal)).toEqual([])
    expect(restored.getBoard(Difficulty.Overclocked)).toHaveLength(1)
    expect(restored.getState().lastInitials).toBe('SPD')
  })

  it('ignores save failures in the standalone helper', () => {
    expect(() => saveLeaderboard({
      getItem: () => null,
      setItem: () => { throw new Error('full') },
    }, createEmptyLeaderboard())).not.toThrow()
  })
})

function candidate(score: number): LeaderboardCandidate {
  return {
    difficulty: Difficulty.Normal,
    score,
    stageReached: 4,
    runSeed: 0xdeadbeef,
    recordedAt: score,
  }
}
