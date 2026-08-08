export const StageFeature = {
  CoreBriefing: 'core-briefing',
  Spikes: 'spikes',
  ExtraLife: 'extra-life',
  Ambusher: 'ambusher',
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
  StageFeature.Ambusher,
]

const FEATURE_COPY: Readonly<Record<StageFeatureId, string>> = {
  [StageFeature.CoreBriefing]: 'Escape the maze. Hoard coins. Evade the hunter. Find the exit before it finds you.',
  [StageFeature.Spikes]: 'Spikes joined the floor show. Amber warns; coral bites you and blocks enemies.',
  [StageFeature.ExtraLife]: 'A spare life is loose in the maze. Catch it before it keeps getting away.',
  [StageFeature.Ambusher]: 'Something waits in a deep branch. Expose it, survive the second pursuit, and escape for 25 coins.',
}

export function selectStageIntroduction(
  stageNumber: number,
  presentFeatureIds: Iterable<StageFeatureId>,
  introducedFeatureIds: Iterable<StageFeatureId>,
  casualMode = false,
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
    lines: newFeatureIds.map((featureId) => {
      return featureId === StageFeature.CoreBriefing && casualMode
        ? CASUAL_CORE_BRIEFING
        : FEATURE_COPY[featureId]
    }),
    introducedFeatureIds: [...introduced, ...newFeatureIds],
  }
}

const CASUAL_CORE_BRIEFING = 'Find the exit. The walls have agreed to be your only problem.'