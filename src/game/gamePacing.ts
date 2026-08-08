export interface EntityMovementSpeeds {
  player: number
  hunter: number
  ambusher: number
  lifeTarget: number
  wanderer: number
}

export const MOVEMENT_SPEED_SCALE = 0.75

const BASE_ENTITY_MOVEMENT_SPEEDS: EntityMovementSpeeds = {
  player: 5,
  hunter: 3.25,
  ambusher: 3.25,
  lifeTarget: 3,
  wanderer: 1.5,
}

export const ENTITY_MOVEMENT_SPEEDS: Readonly<EntityMovementSpeeds> = {
  player: BASE_ENTITY_MOVEMENT_SPEEDS.player * MOVEMENT_SPEED_SCALE,
  hunter: BASE_ENTITY_MOVEMENT_SPEEDS.hunter * MOVEMENT_SPEED_SCALE,
  ambusher: BASE_ENTITY_MOVEMENT_SPEEDS.ambusher * MOVEMENT_SPEED_SCALE,
  lifeTarget: BASE_ENTITY_MOVEMENT_SPEEDS.lifeTarget * MOVEMENT_SPEED_SCALE,
  wanderer: BASE_ENTITY_MOVEMENT_SPEEDS.wanderer * MOVEMENT_SPEED_SCALE,
}
