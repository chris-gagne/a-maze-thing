import { describe, expect, it } from 'vitest'
import { parseRunSeed } from './runSeed'

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