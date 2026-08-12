import { describe, expect, it } from 'vitest'
import { getStageProfile } from '../game/stageProgression'
import { generateMaze, getOpenNeighborIndices, toIndex } from './maze'
import { placeBonusTargets } from './bonusTargetPlacement'

describe('placeBonusTargets', () => {
  it('deterministically selects 20 distinct dead ends on a stage-50 maze', () => {
    const profile = getStageProfile(50)
    const maze = generateMaze(profile.width, profile.height, 4271, profile.topology)
    const targets = placeBonusTargets(maze, 20, 99)

    expect(targets).toEqual(placeBonusTargets(maze, 20, 99))
    expect(targets).toHaveLength(20)
    expect(new Set(targets).size).toBe(20)
    expect(targets.every((index) => getOpenNeighborIndices(maze, index).length === 1)).toBe(true)
  })

  it('excludes reserved cells and changes selection with the seed', () => {
    const profile = getStageProfile(50)
    const maze = generateMaze(profile.width, profile.height, 8128, profile.topology)
    const initial = placeBonusTargets(maze, 20, 1)
    const replacement = placeBonusTargets(maze, 20, 2, initial)

    expect(replacement).not.toEqual(initial)
    expect(replacement.every((index) => !initial.includes(index))).toBe(true)
  })

  it('uses safe non-dead-end cells as fallback after every available dead end', () => {
    const maze = generateMaze(5, 5, 14)
    const entranceIndex = toIndex(maze.entrance.x, maze.entrance.y, maze.width)
    const exitIndex = toIndex(maze.exit.x, maze.exit.y, maze.width)
    const deadEnds = maze.cells
      .map((_, index) => index)
      .filter((index) => {
        return index !== entranceIndex
          && index !== exitIndex
          && getOpenNeighborIndices(maze, index).length === 1
      })
    const targets = placeBonusTargets(maze, 20, 4)

    expect(targets).toHaveLength(20)
    expect(deadEnds.every((index) => targets.includes(index))).toBe(true)
  })

  it('rejects invalid counts and insufficient safe cells', () => {
    const maze = generateMaze(3, 3, 1)
    expect(() => placeBonusTargets(maze, -1, 1)).toThrow(RangeError)
    expect(() => placeBonusTargets(maze, 8, 1)).toThrow(RangeError)
  })
})