export const SpikePhase = {
  Inactive: 'inactive',
  Warning: 'warning',
  Active: 'active',
  Recovery: 'recovery',
} as const

export type SpikePhase = (typeof SpikePhase)[keyof typeof SpikePhase]

export interface SpikeState {
  cellIndex: number
  phaseOffsetSeconds: number
}

const SPIKE_INACTIVE_SECONDS = 1.4
const SPIKE_WARNING_SECONDS = 0.65
const SPIKE_ACTIVE_SECONDS = 0.55
const SPIKE_RECOVERY_SECONDS = 0.4

export const SPIKE_CYCLE_SECONDS = SPIKE_INACTIVE_SECONDS
  + SPIKE_WARNING_SECONDS
  + SPIKE_ACTIVE_SECONDS
  + SPIKE_RECOVERY_SECONDS

export function getSpikePhase(spike: SpikeState, elapsedSeconds: number): SpikePhase {
  const cycleTime = positiveModulo(
    elapsedSeconds + spike.phaseOffsetSeconds,
    SPIKE_CYCLE_SECONDS,
  )

  if (cycleTime < SPIKE_INACTIVE_SECONDS) {
    return SpikePhase.Inactive
  }
  if (cycleTime < SPIKE_INACTIVE_SECONDS + SPIKE_WARNING_SECONDS) {
    return SpikePhase.Warning
  }
  if (cycleTime < SPIKE_INACTIVE_SECONDS + SPIKE_WARNING_SECONDS + SPIKE_ACTIVE_SECONDS) {
    return SpikePhase.Active
  }
  return SpikePhase.Recovery
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}