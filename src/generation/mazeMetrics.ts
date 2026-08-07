import { getOpenNeighborIndices, toIndex, type Maze } from './maze'

export interface MazeMetrics {
  cellCount: number
  edgeCount: number
  cycleCount: number
  reachableCellCount: number
  entranceToExitDistance: number
  junctionCount: number
  junctionRatio: number
  deadEndCount: number
  deadEndRatio: number
  loopCellCount: number
  loopCoverage: number
}

export function measureMaze(maze: Maze): MazeMetrics {
  const cellCount = maze.cells.length
  const neighborCounts = maze.cells.map((_, index) => getOpenNeighborIndices(maze, index).length)
  const edgeCount = neighborCounts.reduce((total, count) => total + count, 0) / 2
  const junctionCount = neighborCounts.filter((count) => count >= 3).length
  const deadEndCount = neighborCounts.filter((count) => count === 1).length
  const loopCells = new Set(maze.braids.flatMap((braid) => braid.pathIndices))
  const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
  const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
  const distances = findDistances(maze, entranceIndex)
  const reachableCellCount = distances.filter((distance) => distance >= 0).length

  return {
    cellCount,
    edgeCount,
    cycleCount: edgeCount - cellCount + 1,
    reachableCellCount,
    entranceToExitDistance: distances[exitIndex],
    junctionCount,
    junctionRatio: junctionCount / cellCount,
    deadEndCount,
    deadEndRatio: deadEndCount / cellCount,
    loopCellCount: loopCells.size,
    loopCoverage: loopCells.size / cellCount,
  }
}

function findDistances(maze: Maze, startIndex: number): number[] {
  const distances = Array<number>(maze.cells.length).fill(-1)
  const pending = [startIndex]
  distances[startIndex] = 0

  for (let index = 0; index < pending.length; index += 1) {
    const current = pending[index]

    for (const neighbor of getOpenNeighborIndices(maze, current)) {
      if (distances[neighbor] !== -1) {
        continue
      }

      distances[neighbor] = distances[current] + 1
      pending.push(neighbor)
    }
  }

  return distances
}