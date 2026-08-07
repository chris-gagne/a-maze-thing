import { describe, expect, it } from 'vitest'
import { Wall, type Maze } from './maze'
import { measureMaze } from './mazeMetrics'

describe('measureMaze', () => {
  it('measures a three-cell corridor', () => {
    const maze: Maze = {
      width: 3,
      height: 1,
      seed: 1,
      entrance: { x: 0, y: 0 },
      exit: { x: 2, y: 0 },
      braids: [],
      cells: [
        { x: 0, y: 0, walls: Wall.North | Wall.South | Wall.West },
        { x: 1, y: 0, walls: Wall.North | Wall.South },
        { x: 2, y: 0, walls: Wall.North | Wall.East | Wall.South },
      ],
    }

    expect(measureMaze(maze)).toEqual({
      cellCount: 3,
      edgeCount: 2,
      cycleCount: 0,
      reachableCellCount: 3,
      entranceToExitDistance: 2,
      junctionCount: 0,
      junctionRatio: 0,
      deadEndCount: 2,
      deadEndRatio: 2 / 3,
      loopCellCount: 0,
      loopCoverage: 0,
    })
  })

  it('measures a four-cell cycle and its recorded loop coverage', () => {
    const maze: Maze = {
      width: 2,
      height: 2,
      seed: 2,
      entrance: { x: 0, y: 0 },
      exit: { x: 1, y: 1 },
      braids: [{ fromIndex: 0, toIndex: 1, cycleLength: 4, pathIndices: [0, 2, 3, 1] }],
      cells: [
        { x: 0, y: 0, walls: Wall.North | Wall.West },
        { x: 1, y: 0, walls: Wall.North | Wall.East },
        { x: 0, y: 1, walls: Wall.South | Wall.West },
        { x: 1, y: 1, walls: Wall.East | Wall.South },
      ],
    }

    const metrics = measureMaze(maze)
    expect(metrics.edgeCount).toBe(4)
    expect(metrics.cycleCount).toBe(1)
    expect(metrics.reachableCellCount).toBe(4)
    expect(metrics.entranceToExitDistance).toBe(2)
    expect(metrics.deadEndCount).toBe(0)
    expect(metrics.junctionCount).toBe(0)
    expect(metrics.loopCellCount).toBe(4)
    expect(metrics.loopCoverage).toBe(1)
  })
})