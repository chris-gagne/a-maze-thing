import { describe, expect, it } from 'vitest'
import {
  selectStageIntroduction,
  StageFeature,
  type StageFeatureId,
} from './stageIntroductions'

describe('selectStageIntroduction', () => {
  it('opens a fresh run with the core briefing', () => {
    const introduction = selectStageIntroduction(1, [], [])

    expect(introduction?.headline).toBe('RUN BRIEFING')
    expect(introduction?.lines[0]).toContain('Escape the maze')
    expect(introduction?.introducedFeatureIds).toEqual([StageFeature.CoreBriefing])
  })

  it('does not repeat features already introduced in the run', () => {
    expect(selectStageIntroduction(2, [StageFeature.Spikes], [
      StageFeature.CoreBriefing,
      StageFeature.Spikes,
    ])).toBeNull()
  })

  it('uses maze-only copy for the Casual core briefing', () => {
    const introduction = selectStageIntroduction(1, [], [], true)

    expect(introduction?.lines[0]).toContain('walls')
    expect(introduction?.lines[0]).not.toMatch(/coin|hunter/i)
  })

  it('does not announce eligible features that are absent from the stage', () => {
    expect(selectStageIntroduction(2, [], [StageFeature.CoreBriefing])).toBeNull()
  })

  it('introduces the extra life only when the stage inventory includes it', () => {
    const previous: StageFeatureId[] = [StageFeature.CoreBriefing, StageFeature.Spikes]

    expect(selectStageIntroduction(4, [], previous)).toBeNull()
    expect(selectStageIntroduction(4, [StageFeature.ExtraLife], previous)?.lines[0]).toContain('spare life')
  })

  it('combines multiple unseen features in stable registry order', () => {
    const introduction = selectStageIntroduction(
      2,
      [StageFeature.ExtraLife, StageFeature.Spikes],
      [StageFeature.CoreBriefing],
    )

    expect(introduction?.lines).toEqual([
      expect.stringContaining('Spikes'),
      expect.stringContaining('spare life'),
    ])
    expect(introduction?.introducedFeatureIds).toEqual([
      StageFeature.CoreBriefing,
      StageFeature.Spikes,
      StageFeature.ExtraLife,
    ])
  })

  it('introduces the Ambusher only when the stage contains one', () => {
    const previous: StageFeatureId[] = [StageFeature.CoreBriefing]
    expect(selectStageIntroduction(11, [], previous)).toBeNull()
    expect(selectStageIntroduction(11, [StageFeature.Ambusher], previous)?.lines[0])
      .toContain('25 coins')
  })
})