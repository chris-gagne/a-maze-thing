import { describe, expect, it } from 'vitest'
import { type Maze, Wall } from '../generation/maze'
import { findNextEnemyCellTowardIndex } from './enemyNavigation'

describe('findNextEnemyCellTowardIndex', () => {
  it('takes a stable shortest route around blocked cells', () => {
    const maze = createFourCellLoop()

    expect(findNextEnemyCellTowardIndex(maze, 0, 3, new Set(), getNeighbors)).toBe(1)
    expect(findNextEnemyCellTowardIndex(maze, 0, 3, new Set([1]), getNeighbors)).toBe(2)
  })

  it('returns null when the target is blocked or no route remains', () => {
    const maze = createFourCellLoop()

    expect(findNextEnemyCellTowardIndex(maze, 0, 3, new Set([3]), getNeighbors)).toBeNull()
    expect(findNextEnemyCellTowardIndex(maze, 0, 3, new Set([1, 2]), getNeighbors)).toBeNull()
  })

  it('allows an enemy to leave its blocked current cell', () => {
    const maze = createFourCellLoop()

    expect(findNextEnemyCellTowardIndex(maze, 0, 3, new Set([0]), getNeighbors)).toBe(1)
  })
})

function getNeighbors(_maze: Maze, cellIndex: number): readonly number[] {
  const neighbors = [
    [1, 2],
    [3, 0],
    [0, 3],
    [2, 1],
  ]
  return neighbors[cellIndex]
}

function createFourCellLoop(): Maze {
  return {
    width: 2,
    height: 2,
    seed: 0,
    entrance: { x: 0, y: 0 },
    exit: { x: 1, y: 1 },
    braids: [],
    cells: [
      { x: 0, y: 0, walls: Wall.North | Wall.West },
      { x: 1, y: 0, walls: Wall.North | Wall.East },
      { x: 0, y: 1, walls: Wall.South | Wall.West },
      { x: 1, y: 1, walls: Wall.East | Wall.South },
    ],
  }
}