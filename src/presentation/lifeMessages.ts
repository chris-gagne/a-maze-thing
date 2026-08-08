import { DamageSource, type DamageSource as DamageSourceValue } from '../game/lifeRules'

export interface LifeMessage {
  cause: string
  finalCause: string
}

const LIFE_MESSAGES: Readonly<Record<DamageSourceValue, LifeMessage>> = {
  [DamageSource.Ambusher]: {
    cause: 'THE AMBUSH CLOSED IN.',
    finalCause: 'THE AMBUSH ENDED THE RUN.',
  },
  [DamageSource.Hunter]: {
    cause: 'THE HUNTER CLOSED THE GAP.',
    finalCause: 'THE HUNTER ENDED THE RUN.',
  },
  [DamageSource.Spike]: {
    cause: 'THE FLOOR BIT BACK.',
    finalCause: 'THE MAZE CLAIMED ITS LAST LIFE.',
  },
  [DamageSource.Wanderer]: {
    cause: 'THE WANDERER FOUND YOU.',
    finalCause: 'THE WANDERER ENDED THE RUN.',
  },
}

export function getLifeMessage(source: DamageSourceValue): LifeMessage {
  return LIFE_MESSAGES[source]
}