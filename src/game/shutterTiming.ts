export const ShutterPhase = {
  Open: 'open',
  Warning: 'warning',
  Closed: 'closed',
} as const

export type ShutterPhase = typeof ShutterPhase[keyof typeof ShutterPhase]

export interface ShutterState {
  fromCellIndex: number
  toCellIndex: number
  phaseOffsetSeconds: number
}

export const SHUTTER_OPEN_SECONDS = 4
export const SHUTTER_WARNING_SECONDS = 1
export const SHUTTER_CLOSED_SECONDS = 3
export const SHUTTER_CYCLE_SECONDS = SHUTTER_OPEN_SECONDS
  + SHUTTER_WARNING_SECONDS
  + SHUTTER_CLOSED_SECONDS

export function getShutterPhase(shutter: ShutterState, elapsedSeconds: number): ShutterPhase {
  const cycleTime = positiveModulo(
    elapsedSeconds + shutter.phaseOffsetSeconds,
    SHUTTER_CYCLE_SECONDS,
  )

  if (cycleTime < SHUTTER_OPEN_SECONDS) {
    return ShutterPhase.Open
  }
  if (cycleTime < SHUTTER_OPEN_SECONDS + SHUTTER_WARNING_SECONDS) {
    return ShutterPhase.Warning
  }
  return ShutterPhase.Closed
}

export function getEdgeKey(firstCellIndex: number, secondCellIndex: number): string {
  return firstCellIndex < secondCellIndex
    ? `${firstCellIndex}:${secondCellIndex}`
    : `${secondCellIndex}:${firstCellIndex}`
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
