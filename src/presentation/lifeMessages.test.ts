import { describe, expect, it } from 'vitest'
import { DamageSource } from '../game/lifeRules'
import { getLifeMessage } from './lifeMessages'

describe('getLifeMessage', () => {
  it('provides themed Ambusher copy for a lost and final life', () => {
    expect(getLifeMessage(DamageSource.Ambusher)).toEqual({
      cause: 'THE AMBUSH CLOSED IN.',
      finalCause: 'THE AMBUSH ENDED THE RUN.',
    })
  })

  it('provides themed hunter copy for a lost and final life', () => {
    expect(getLifeMessage(DamageSource.Hunter)).toEqual({
      cause: 'THE HUNTER CLOSED THE GAP.',
      finalCause: 'THE HUNTER ENDED THE RUN.',
    })
  })

  it('provides themed spike copy for a lost and final life', () => {
    expect(getLifeMessage(DamageSource.Spike)).toEqual({
      cause: 'THE FLOOR BIT BACK.',
      finalCause: 'THE MAZE CLAIMED ITS LAST LIFE.',
    })
  })
})