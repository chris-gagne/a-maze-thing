export const StageFeature = {
  CoreBriefing: 'core-briefing',
  Spikes: 'spikes',
  ExtraLife: 'extra-life',
} as const

export type StageFeatureId = typeof StageFeature[keyof typeof StageFeature]

export interface StageIntroduction {
  headline: string
  lines: readonly string[]
  introducedFeatureIds: readonly StageFeatureId[]
}

const FEATURE_ORDER: readonly StageFeatureId[] = [
  StageFeature.CoreBriefing,
  StageFeature.Spikes,
  StageFeature.ExtraLife,
]

const FEATURE_COPY: Readonly<Record<StageFeatureId, string>> = {
  [StageFeature.CoreBriefing]: 'Escape the maze. Hoard coins. Evade the hunter. Find the exit before it finds you.',
  [StageFeature.Spikes]: 'Spikes joined the floor show. Amber warns; coral bites you and blocks enemies.',
  [StageFeature.ExtraLife]: 'A spare life is loose in the maze. Catch it before it keeps getting away.',
}

export function selectStageIntroduction(
  stageNumber: number,
  presentFeatureIds: Iterable<StageFeatureId>,
  introducedFeatureIds: Iterable<StageFeatureId>,
): StageIntroduction | null {
  const introduced = new Set(introducedFeatureIds)
  const present = new Set(presentFeatureIds)

  if (stageNumber === 1) {
    present.add(StageFeature.CoreBriefing)
  }

  const newFeatureIds = FEATURE_ORDER.filter((featureId) => {
    return present.has(featureId) && !introduced.has(featureId)
  })

  if (newFeatureIds.length === 0) {
    return null
  }

  return {
    headline: newFeatureIds.includes(StageFeature.CoreBriefing) ? 'RUN BRIEFING' : 'MAZE MUTATION',
    lines: newFeatureIds.map((featureId) => FEATURE_COPY[featureId]),
    introducedFeatureIds: [...introduced, ...newFeatureIds],
  }
}