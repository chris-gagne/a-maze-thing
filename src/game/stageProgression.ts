export interface StageDimensions {
  width: number
  height: number
}

export type StageBand = 1 | 2 | 3 | 4 | 5
export type StageVariant = 'baseline' | 'compact-loops' | 'long-loops'
export type EndpointProfile = 'diameter' | 'boundary-farthest'

export interface StageTopologyProfile {
  braidCount: number
  minimumCycleLength: number
  maximumCycleLength: number
  maximumSharedLoopCells: number
}

export interface StageProfile extends StageDimensions {
  band: StageBand
  topology: StageTopologyProfile
  variant: StageVariant
  endpointProfile: EndpointProfile
  hazardDensityMultiplier: number
}

interface DimensionTier extends StageDimensions {
  firstStage: number
}

const DIMENSION_TIERS: readonly DimensionTier[] = [
  { firstStage: 1, width: 11, height: 7 },
  { firstStage: 4, width: 13, height: 9 },
  { firstStage: 7, width: 15, height: 11 },
  { firstStage: 10, width: 17, height: 13 },
  { firstStage: 14, width: 19, height: 15 },
  { firstStage: 17, width: 21, height: 17 },
  { firstStage: 20, width: 23, height: 19 },
  { firstStage: 24, width: 25, height: 21 },
  { firstStage: 27, width: 27, height: 23 },
  { firstStage: 30, width: 29, height: 25 },
  { firstStage: 34, width: 31, height: 27 },
  { firstStage: 37, width: 33, height: 29 },
  { firstStage: 40, width: 35, height: 31 },
  { firstStage: 44, width: 37, height: 33 },
  { firstStage: 47, width: 39, height: 35 },
  { firstStage: 50, width: 41, height: 37 },
]

const BAND_TOPOLOGY: Readonly<Record<StageBand, Omit<StageTopologyProfile, 'braidCount'>>> = {
  1: { minimumCycleLength: 6, maximumCycleLength: 12, maximumSharedLoopCells: 1 },
  2: { minimumCycleLength: 8, maximumCycleLength: 18, maximumSharedLoopCells: 2 },
  3: { minimumCycleLength: 10, maximumCycleLength: 24, maximumSharedLoopCells: 2 },
  4: { minimumCycleLength: 12, maximumCycleLength: 32, maximumSharedLoopCells: 3 },
  5: { minimumCycleLength: 14, maximumCycleLength: 40, maximumSharedLoopCells: 3 },
}

const BRAID_DENSITY_BY_BAND: Readonly<Record<StageBand, number>> = {
  1: 0.02,
  2: 0.025,
  3: 0.03,
  4: 0.035,
  5: 0.04,
}

export function getStageDimensions(stageNumber: number): StageDimensions {
  if (!Number.isInteger(stageNumber) || stageNumber < 1) {
    throw new RangeError('Stage number must be a positive integer.')
  }

  for (let index = DIMENSION_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = DIMENSION_TIERS[index]
    if (stageNumber >= tier.firstStage) {
      return { width: tier.width, height: tier.height }
    }
  }

  throw new Error('Stage progression has no initial tier.')
}

export function getStageProfile(stageNumber: number): StageProfile {
  const dimensions = getStageDimensions(stageNumber)
  const band = getStageBand(stageNumber)
  const variant = getStageVariant(stageNumber)
  const topology = getTopologyProfile(dimensions, band, variant)

  return {
    ...dimensions,
    band,
    topology,
    variant,
    endpointProfile: stageNumber > 50 && stageNumber % 2 === 1
      ? 'boundary-farthest'
      : 'diameter',
    hazardDensityMultiplier: stageNumber <= 50
      ? 1
      : [0.75, 1, 1.25][(stageNumber - 51) % 3],
  }
}

function getTopologyProfile(
  dimensions: StageDimensions,
  band: StageBand,
  variant: StageVariant,
): StageTopologyProfile {
  const baselineCount = Math.max(
    1,
    Math.round(dimensions.width * dimensions.height * BRAID_DENSITY_BY_BAND[band]),
  )
  const baseline = BAND_TOPOLOGY[band]

  if (variant === 'compact-loops') {
    return {
      braidCount: Math.round(baselineCount * 1.15),
      minimumCycleLength: 8,
      maximumCycleLength: 22,
      maximumSharedLoopCells: 4,
    }
  }

  if (variant === 'long-loops') {
    return {
      braidCount: Math.round(baselineCount * 0.9),
      minimumCycleLength: 20,
      maximumCycleLength: 48,
      maximumSharedLoopCells: 3,
    }
  }

  return { braidCount: baselineCount, ...baseline }
}

function getStageVariant(stageNumber: number): StageVariant {
  if (stageNumber <= 50) {
    return 'baseline'
  }

  return (['compact-loops', 'long-loops', 'baseline'] as const)[(stageNumber - 51) % 3]
}

function getStageBand(stageNumber: number): StageBand {
  return Math.min(5, Math.ceil(stageNumber / 10)) as StageBand
}