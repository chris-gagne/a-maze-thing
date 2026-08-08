import type { LeaderboardRepository } from './leaderboardPersistence'

let leaderboardRepository: LeaderboardRepository | null = null

export function provideLeaderboardRepository(repository: LeaderboardRepository): void {
  leaderboardRepository = repository
}

export function getLeaderboardRepository(): LeaderboardRepository | null {
  return leaderboardRepository
}
