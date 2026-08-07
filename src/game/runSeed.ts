const UINT32_MAX = 0xffffffff

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