import { type Maze } from '../generation/maze'

export function findNextEnemyCellTowardIndex(
  maze: Maze,
  startIndex: number,
  targetIndex: number,
  blockedCellIndices: ReadonlySet<number>,
  getNeighborIndices: (maze: Maze, cellIndex: number) => readonly number[],
  isEdgeBlocked: (fromIndex: number, toIndex: number) => boolean = () => false,
): number | null {
  if (startIndex === targetIndex || blockedCellIndices.has(targetIndex)) {
    return null
  }

  const previous = new Int32Array(maze.cells.length).fill(-1)
  const pending = new Int32Array(maze.cells.length)
  let head = 0
  let tail = 0
  pending[tail++] = startIndex
  previous[startIndex] = startIndex

  while (head < tail && previous[targetIndex] === -1) {
    const currentIndex = pending[head++]

    for (const neighborIndex of getNeighborIndices(maze, currentIndex)) {
      if (
        previous[neighborIndex] !== -1
        || (neighborIndex !== startIndex && blockedCellIndices.has(neighborIndex))
        || isEdgeBlocked(currentIndex, neighborIndex)
      ) {
        continue
      }

      previous[neighborIndex] = currentIndex
      pending[tail++] = neighborIndex
    }
  }

  if (previous[targetIndex] === -1) {
    return null
  }

  let nextIndex = targetIndex
  while (previous[nextIndex] !== startIndex) {
    nextIndex = previous[nextIndex]
  }
  return nextIndex
}