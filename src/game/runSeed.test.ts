import { describe, expect, it } from 'vitest'
import { parseDebugStage, parseRunSeed } from './runSeed'

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