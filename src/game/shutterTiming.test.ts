import { describe, expect, it } from 'vitest'
import {
  getEdgeKey,
  getShutterPhase,
  SHUTTER_CYCLE_SECONDS,
  ShutterPhase,
  type ShutterState,
} from './shutterTiming'

const shutter: ShutterState = {
  fromCellIndex: 3,
  toCellIndex: 4,
  phaseOffsetSeconds: 0,
}

describe('shutter timing', () => {
  it('uses exact open, warning, and closed boundaries', () => {
    expect(getShutterPhase(shutter, 0)).toBe(ShutterPhase.Open)
    expect(getShutterPhase(shutter, 3.999)).toBe(ShutterPhase.Open)
    expect(getShutterPhase(shutter, 4)).toBe(ShutterPhase.Warning)
    expect(getShutterPhase(shutter, 4.999)).toBe(ShutterPhase.Warning)
    expect(getShutterPhase(shutter, 5)).toBe(ShutterPhase.Closed)
    expect(getShutterPhase(shutter, 7.999)).toBe(ShutterPhase.Closed)
    expect(getShutterPhase(shutter, SHUTTER_CYCLE_SECONDS)).toBe(ShutterPhase.Open)
  })

  it('wraps positive and negative phase offsets', () => {
    expect(getShutterPhase({ ...shutter, phaseOffsetSeconds: 4 }, 0)).toBe(ShutterPhase.Warning)
    expect(getShutterPhase({ ...shutter, phaseOffsetSeconds: -3 }, 0)).toBe(ShutterPhase.Closed)
  })

  it('uses one canonical key for both edge directions', () => {
    expect(getEdgeKey(3, 9)).toBe('3:9')
    expect(getEdgeKey(9, 3)).toBe('3:9')
  })
})
