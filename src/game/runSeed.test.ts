import { describe, expect, it } from 'vitest'
import { deriveBonusStageSeed, parseDebugStage, parseRunSeed } from './runSeed'

describe('deriveBonusStageSeed', () => {
  it('is reproducible and differs across bonus rounds and runs', () => {
    expect(deriveBonusStageSeed(4271, 10)).toBe(deriveBonusStageSeed(4271, 10))
    expect(deriveBonusStageSeed(4271, 10)).not.toBe(deriveBonusStageSeed(4271, 20))
    expect(deriveBonusStageSeed(4271, 10)).not.toBe(deriveBonusStageSeed(4272, 10))
  })

  it('rejects invalid run seeds and stage numbers', () => {
    expect(() => deriveBonusStageSeed(-1, 10)).toThrow(RangeError)
    expect(() => deriveBonusStageSeed(0x100000000, 10)).toThrow(RangeError)
    expect(() => deriveBonusStageSeed(1, 0)).toThrow(RangeError)
  })
})

describe('parseRunSeed', () => {
  it('accepts decimal and hexadecimal 32-bit seeds', () => {
    expect(parseRunSeed('4271')).toBe(4271)
    expect(parseRunSeed('0xDEADBEEF')).toBe(0xdeadbeef)
    expect(parseRunSeed('CAFEBABE')).toBe(0xcafebabe)
  })

  it('rejects empty, malformed, negative, and overflowing seeds', () => {
    expect(parseRunSeed(null)).toBeNull()
    expect(parseRunSeed('')).toBeNull()
    expect(parseRunSeed('-1')).toBeNull()
    expect(parseRunSeed('maze')).toBeNull()
    expect(parseRunSeed('4294967296')).toBeNull()
  })
})

describe('parseDebugStage', () => {
  it('accepts positive integer stages only in maze debug mode', () => {
    expect(parseDebugStage('50', true)).toBe(50)
    expect(parseDebugStage(' 51 ', true)).toBe(51)
    expect(parseDebugStage('50', false)).toBeNull()
  })

  it.each([null, '', '0', '-1', '1.5', 'maze'])(
    'rejects invalid debug stage %s',
    (stage) => expect(parseDebugStage(stage, true)).toBeNull(),
  )
})