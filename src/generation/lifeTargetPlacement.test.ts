import { describe, expect, it } from 'vitest'
import { generateMaze, toIndex } from './maze'
import { placeLifeTarget } from './lifeTargetPlacement'

describe('placeLifeTarget', () => {
  it('spawns only after the first stage and with exactly one life', () => {
    const maze = generateMaze(11, 7, 41)
    expect(placeLifeTarget(maze, 1, 1, 7)).toBeNull()
    expect(placeLifeTarget(maze, 8, 2, 7)).toBeNull()
    expect(placeLifeTarget(maze, 8, 0, 7)).toBeNull()
  })

  it('guarantees a target on stage two while one life remains', () => {
    const maze = generateMaze(11, 7, 42)

    for (let seed = 0; seed < 100; seed += 1) {
      expect(placeLifeTarget(maze, 2, 1, seed)).not.toBeNull()
    }
  })

  it('is deterministic, scarce after stage two, and keeps spawns away from the entrance', () => {
    const maze = generateMaze(11, 7, 812)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    let spawnCount = 0

    for (let seed = 0; seed < 200; seed += 1) {
      const spawn = placeLifeTarget(maze, 4, 1, seed)
      expect(spawn).toBe(placeLifeTarget(maze, 4, 1, seed))

      if (spawn !== null) {
        spawnCount += 1
        expect(spawn).toBeGreaterThanOrEqual(0)
        expect(spawn).toBeLessThan(maze.cells.length)
        expect(spawn).not.toBe(entranceIndex)
      }
    }

    expect(spawnCount).toBeGreaterThanOrEqual(25)
    expect(spawnCount).toBeLessThanOrEqual(65)
  })

  it('never spawns on a reserved cell', () => {
    const maze = generateMaze(15, 11, 813)

    for (let seed = 0; seed < 200; seed += 1) {
      const initial = placeLifeTarget(maze, 4, 1, seed)
      if (initial !== null) {
        expect(placeLifeTarget(maze, 4, 1, seed, [initial])).not.toBe(initial)
      }
    }
  })
})