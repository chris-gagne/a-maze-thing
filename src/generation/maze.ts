import { createSeededRandom } from './random'

export const Wall = {
  North: 1,
  East: 2,
  South: 4,
  West: 8,
} as const

export interface GridPoint {
  x: number
  y: number
}

export interface MazeCell extends GridPoint {
  walls: number
}

export interface Maze {
  width: number
  height: number
  seed: number
  cells: MazeCell[]
  entrance: GridPoint
  exit: GridPoint
  braids: MazeBraid[]
}

export interface MazeBraid {
  fromIndex: number
  toIndex: number
  cycleLength: number
  pathIndices: number[]
}

export interface MazeGenerationOptions {
  braidCount?: number
  minimumCycleLength?: number
  maximumCycleLength?: number
  maximumSharedLoopCells?: number
  endpointProfile?: 'diameter' | 'boundary-farthest'
}

interface Direction {
  dx: number
  dy: number
  wall: number
  opposite: number
}

const ALL_WALLS = Wall.North | Wall.East | Wall.South | Wall.West

const DIRECTIONS: Direction[] = [
  { dx: 0, dy: -1, wall: Wall.North, opposite: Wall.South },
  { dx: 1, dy: 0, wall: Wall.East, opposite: Wall.West },
  { dx: 0, dy: 1, wall: Wall.South, opposite: Wall.North },
  { dx: -1, dy: 0, wall: Wall.West, opposite: Wall.East },
]

export function generatePerfectMaze(width: number, height: number, seed: number): Maze {
  validateDimensions(width, height)

  const normalizedSeed = seed >>> 0
  const random = createSeededRandom(normalizedSeed)
  const cells = Array.from({ length: width * height }, (_, index): MazeCell => ({
    x: index % width,
    y: Math.floor(index / width),
    walls: ALL_WALLS,
  }))
  const visited = new Uint8Array(cells.length)
  const startIndex = Math.floor(random() * cells.length)
  const stack = [startIndex]
  visited[startIndex] = 1

  while (stack.length > 0) {
    const currentIndex = stack[stack.length - 1]
    const current = cells[currentIndex]
    const candidates = DIRECTIONS.flatMap((direction) => {
      const x = current.x + direction.dx
      const y = current.y + direction.dy

      if (x < 0 || x >= width || y < 0 || y >= height) {
        return []
      }

      const neighborIndex = toIndex(x, y, width)
      return visited[neighborIndex] === 0 ? [{ direction, neighborIndex }] : []
    })

    if (candidates.length === 0) {
      stack.pop()
      continue
    }

    const { direction, neighborIndex } = candidates[Math.floor(random() * candidates.length)]
    cells[currentIndex].walls &= ~direction.wall
    cells[neighborIndex].walls &= ~direction.opposite
    visited[neighborIndex] = 1
    stack.push(neighborIndex)
  }

  const firstEndpoint = findFarthestCell(cells, width, 0).index
  const secondEndpoint = findFarthestCell(cells, width, firstEndpoint).index

  return {
    width,
    height,
    seed: normalizedSeed,
    cells,
    entrance: toPoint(firstEndpoint, width),
    exit: toPoint(secondEndpoint, width),
    braids: [],
  }
}

export function generateMaze(
  width: number,
  height: number,
  seed: number,
  options: MazeGenerationOptions = {},
): Maze {
  const maze = generatePerfectMaze(width, height, seed)
  const requestedBraidCount = options.braidCount ?? getBraidCountForSize(width * height)
  maze.braids = selectBraids(
    maze,
    requestedBraidCount,
    seed ^ 0xb4a1d5,
    options.minimumCycleLength ?? 6,
    options.maximumCycleLength ?? 12,
    options.maximumSharedLoopCells ?? 1,
  )

  for (const braid of maze.braids) {
    openWallBetween(maze, braid.fromIndex, braid.toIndex)
  }

  const [firstEndpoint, secondEndpoint] = selectEndpoints(
    maze,
    options.endpointProfile ?? 'diameter',
    seed ^ 0xe17d901,
  )
  maze.entrance = toPoint(firstEndpoint, width)
  maze.exit = toPoint(secondEndpoint, width)
  return maze
}

export function getBraidCountForSize(cellCount: number): number {
  if (cellCount >= 150) return 3
  if (cellCount >= 100) return 2
  return 1
}

export function getOpenNeighborIndices(maze: Pick<Maze, 'cells' | 'width' | 'height'>, index: number): number[] {
  const cell = maze.cells[index]

  return DIRECTIONS.flatMap((direction) => {
    if ((cell.walls & direction.wall) !== 0) {
      return []
    }

    const x = cell.x + direction.dx
    const y = cell.y + direction.dy
    return x >= 0 && x < maze.width && y >= 0 && y < maze.height
      ? [toIndex(x, y, maze.width)]
      : []
  })
}

export function toIndex(x: number, y: number, width: number): number {
  return y * width + x
}

function selectBraids(
  maze: Maze,
  requestedCount: number,
  seed: number,
  minimumCycleLength: number,
  maximumCycleLength: number,
  maximumSharedLoopCells: number,
): MazeBraid[] {
  if (!Number.isInteger(requestedCount) || requestedCount < 0) {
    throw new RangeError('Braid count must be a non-negative integer.')
  }

  if (
    !Number.isInteger(minimumCycleLength)
    || !Number.isInteger(maximumCycleLength)
    || minimumCycleLength < 4
    || maximumCycleLength < minimumCycleLength
  ) {
    throw new RangeError('Cycle lengths must be integers with 4 <= minimum <= maximum.')
  }

  if (!Number.isInteger(maximumSharedLoopCells) || maximumSharedLoopCells < 0) {
    throw new RangeError('Maximum shared loop cells must be a non-negative integer.')
  }

  const random = createSeededRandom(seed)
  const candidates = enumerateBraidCandidates(maze, minimumCycleLength, maximumCycleLength)
    .map((candidate) => ({ candidate, order: random() }))
    .sort((left, right) => left.order - right.order)
    .map(({ candidate }) => candidate)
  const selected: MazeBraid[] = []

  for (const candidate of candidates) {
    if (selected.length >= requestedCount) {
      break
    }

    const candidateCells = new Set(candidate.pathIndices)
    const overlapsSelectedLoop = selected.some((braid) => {
      const overlapCount = braid.pathIndices.reduce(
        (total, index) => total + Number(candidateCells.has(index)),
        0,
      )
      return overlapCount > maximumSharedLoopCells
    })

    if (!overlapsSelectedLoop) {
      selected.push(candidate)
    }
  }

  return selected
}

function enumerateBraidCandidates(
  maze: Maze,
  minimumCycleLength: number,
  maximumCycleLength: number,
): MazeBraid[] {
  const candidates: MazeBraid[] = []

  for (const cell of maze.cells) {
    if (cell.x + 1 < maze.width && (cell.walls & Wall.East) !== 0) {
      addBraidCandidate(
        maze,
        toIndex(cell.x, cell.y, maze.width),
        toIndex(cell.x + 1, cell.y, maze.width),
        minimumCycleLength,
        maximumCycleLength,
        candidates,
      )
    }

    if (cell.y + 1 < maze.height && (cell.walls & Wall.South) !== 0) {
      addBraidCandidate(
        maze,
        toIndex(cell.x, cell.y, maze.width),
        toIndex(cell.x, cell.y + 1, maze.width),
        minimumCycleLength,
        maximumCycleLength,
        candidates,
      )
    }
  }

  return candidates
}

function addBraidCandidate(
  maze: Maze,
  fromIndex: number,
  toIndexValue: number,
  minimumCycleLength: number,
  maximumCycleLength: number,
  candidates: MazeBraid[],
): void {
  const pathIndices = findShortestPath(maze, fromIndex, toIndexValue)
  const existingPathLength = pathIndices.length - 1
  const cycleLength = existingPathLength + 1

  if (cycleLength < minimumCycleLength || cycleLength > maximumCycleLength) {
    return
  }

  candidates.push({
    fromIndex,
    toIndex: toIndexValue,
    cycleLength,
    pathIndices,
  })
}

function findShortestPath(maze: Maze, startIndex: number, targetIndex: number): number[] {
  const previous = new Int32Array(maze.cells.length).fill(-1)
  const queue = new Int32Array(maze.cells.length)
  let head = 0
  let tail = 0
  queue[tail++] = startIndex
  previous[startIndex] = startIndex

  while (head < tail && previous[targetIndex] === -1) {
    const currentIndex = queue[head++]

    for (const neighborIndex of getOpenNeighborIndices(maze, currentIndex)) {
      if (previous[neighborIndex] !== -1) {
        continue
      }

      previous[neighborIndex] = currentIndex
      queue[tail++] = neighborIndex
    }
  }

  if (previous[targetIndex] === -1) {
    return []
  }

  const path = [targetIndex]
  while (path[path.length - 1] !== startIndex) {
    path.push(previous[path[path.length - 1]])
  }
  return path.reverse()
}

function openWallBetween(maze: Maze, fromIndex: number, toIndexValue: number): void {
  const from = maze.cells[fromIndex]
  const to = maze.cells[toIndexValue]
  const direction = DIRECTIONS.find(({ dx, dy }) => from.x + dx === to.x && from.y + dy === to.y)

  if (direction === undefined) {
    throw new Error('A braid can only connect orthogonally adjacent cells.')
  }

  from.walls &= ~direction.wall
  to.walls &= ~direction.opposite
}

function selectEndpoints(
  maze: Maze,
  profile: NonNullable<MazeGenerationOptions['endpointProfile']>,
  seed: number,
): [number, number] {
  if (profile === 'diameter') {
    const firstEndpoint = findFarthestCell(maze.cells, maze.width, 0).index
    return [firstEndpoint, findFarthestCell(maze.cells, maze.width, firstEndpoint).index]
  }

  const boundaryIndices = maze.cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => {
      return cell.x === 0
        || cell.y === 0
        || cell.x === maze.width - 1
        || cell.y === maze.height - 1
    })
    .map(({ index }) => index)
  const random = createSeededRandom(seed)
  const entranceIndex = boundaryIndices[Math.floor(random() * boundaryIndices.length)]
  const distances = findDistances(maze.cells, maze.width, entranceIndex)
  const maximumBoundaryDistance = Math.max(...boundaryIndices.map((index) => distances[index]))
  const qualifiedExits = boundaryIndices.filter((index) => {
    return index !== entranceIndex && distances[index] >= maximumBoundaryDistance * 0.9
  })
  const exitIndex = qualifiedExits[Math.floor(random() * qualifiedExits.length)]
  return [entranceIndex, exitIndex]
}

function findFarthestCell(cells: MazeCell[], width: number, startIndex: number) {
  const distances = findDistances(cells, width, startIndex)
  let farthestIndex = startIndex

  for (let index = 0; index < distances.length; index += 1) {
    if (distances[index] > distances[farthestIndex]) {
      farthestIndex = index
    }
  }

  return { index: farthestIndex, distance: distances[farthestIndex] }
}

function findDistances(cells: MazeCell[], width: number, startIndex: number): Int32Array {
  const distances = new Int32Array(cells.length).fill(-1)
  const queue = new Int32Array(cells.length)
  let head = 0
  let tail = 0
  queue[tail++] = startIndex
  distances[startIndex] = 0

  const maze = { cells, width, height: cells.length / width }

  while (head < tail) {
    const currentIndex = queue[head++]

    for (const neighborIndex of getOpenNeighborIndices(maze, currentIndex)) {
      if (distances[neighborIndex] !== -1) {
        continue
      }

      distances[neighborIndex] = distances[currentIndex] + 1
      queue[tail++] = neighborIndex
    }
  }

  return distances
}

function toPoint(index: number, width: number): GridPoint {
  return { x: index % width, y: Math.floor(index / width) }
}

function validateDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) {
    throw new RangeError('Maze dimensions must be integers greater than one.')
  }
}