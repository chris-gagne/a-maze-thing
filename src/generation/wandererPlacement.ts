import { createSeededRandom } from './random'

export interface WandererPlacement {
  spawnSeconds: number
  routeSeed: number
}

const FIRST_WANDERER_STAGE = 21
const MINIMUM_SPAWN_SECONDS = 5
const MAXIMUM_SPAWN_SECONDS = 60

export function placeWanderer(stageNumber: number, seed: number): WandererPlacement | null {
  if (!Number.isInteger(stageNumber) || stageNumber < 1) {
    throw new RangeError('Stage number must be a positive integer.')
  }

  if (stageNumber < FIRST_WANDERER_STAGE) {
    return null
  }

  const random = createSeededRandom(seed)
  return {
    spawnSeconds: MINIMUM_SPAWN_SECONDS
      + random() * (MAXIMUM_SPAWN_SECONDS - MINIMUM_SPAWN_SECONDS),
    routeSeed: Math.floor(random() * 0x100000000) >>> 0,
  }
}
