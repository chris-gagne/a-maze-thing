const UINT32_MAX = 0xffffffff
const BONUS_STAGE_SEED_SALT = 0xb04e57a9

export function deriveBonusStageSeed(runSeed: number, stageNumber: number): number {
  assertUint32(runSeed, 'Run seed')

  if (!Number.isInteger(stageNumber) || stageNumber < 1) {
    throw new RangeError('Stage number must be a positive integer.')
  }

  let mixed = (runSeed ^ BONUS_STAGE_SEED_SALT ^ Math.imul(stageNumber, 0x9e3779b1)) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad) >>> 0
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97) >>> 0
  return (mixed ^ (mixed >>> 15)) >>> 0
}

export function parseRunSeed(value: string | null): number | null {
  const normalized = value?.trim()

  if (!normalized) {
    return null
  }

  const isPrefixedHex = /^0x[0-9a-f]+$/i.test(normalized)
  const isPlainHex = /^[0-9a-f]+$/i.test(normalized) && /[a-f]/i.test(normalized)
  const isDecimal = /^\d+$/.test(normalized)

  if (!isPrefixedHex && !isPlainHex && !isDecimal) {
    return null
  }

  const radix = isPrefixedHex || isPlainHex ? 16 : 10
  const parsed = Number.parseInt(normalized, radix)
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= UINT32_MAX
    ? parsed >>> 0
    : null
}

export function parseDebugStage(value: string | null, mazeDebugEnabled: boolean): number | null {
  const normalized = value?.trim()

  if (!mazeDebugEnabled || normalized === undefined || !/^\d+$/.test(normalized)) {
    return null
  }

  const parsed = Number.parseInt(normalized, 10)
  return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null
}

function assertUint32(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer.`)
  }
}