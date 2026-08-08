import { PIXEL_PATTERNS, TextureKey, type TextureKey as TextureKeyValue } from './pixelPatterns'

interface TextureLegendEntry {
  name: string
  rule: string
  textureKey: TextureKeyValue
  spikePhases?: boolean
}

interface StartLegendEntry {
  name: string
  rule: string
  textureKey: null
}

export type LegendEntry = TextureLegendEntry | StartLegendEntry

export const LEGEND_ENTRIES: readonly LegendEntry[] = [
  { name: 'Player', rule: 'You. Run accordingly.', textureKey: TextureKey.Player },
  { name: 'Hunter', rule: 'It follows. You flee.', textureKey: TextureKey.Hunter },
  {
    name: 'Ambusher',
    rule: 'Wake it. Escape it. +25.',
    textureKey: TextureKey.Ambusher,
  },
  {
    name: 'Wanderer',
    rule: 'Keep clear. Escape first. +25.',
    textureKey: TextureKey.Wanderer,
  },
  { name: 'Coin', rule: 'Clean sweep earns 2X.', textureKey: TextureKey.Coin },
  { name: 'Exit', rule: 'Your way out. Allegedly.', textureKey: TextureKey.Exit },
  { name: 'Extra Life', rule: 'Catch it. Pocket a life.', textureKey: TextureKey.LifeTarget },
  {
    name: 'Spikes',
    rule: 'Amber warns. Coral bites and blocks.',
    textureKey: TextureKey.Spike,
    spikePhases: true,
  },
  { name: 'Shutters', rule: 'Routes close. Amber gives notice.', textureKey: TextureKey.Shutter },
  { name: 'Portal', rule: 'Back to Start. Reusable.', textureKey: TextureKey.Portal },
  { name: 'Start', rule: 'Return trip to your last portal.', textureKey: null },
]

export const LEGEND_TEXTURE_KEYS: readonly TextureKeyValue[] = LEGEND_ENTRIES.flatMap(
  (entry) => entry.textureKey === null ? [] : [entry.textureKey],
)

export function initializeSpriteLegend(details: HTMLDetailsElement): () => void {
  const list = details.querySelector<HTMLUListElement>('[data-legend-list]')
  if (list === null) {
    throw new Error('Sprite legend list is unavailable.')
  }

  for (const entry of LEGEND_ENTRIES) {
    list.append(createLegendItem(entry))
  }

  const wideLayout = matchMedia('(min-width: 1120px)')
  const syncDisclosure = (event: MediaQueryListEvent | MediaQueryList): void => {
    details.open = event.matches
  }
  syncDisclosure(wideLayout)
  wideLayout.addEventListener('change', syncDisclosure)

  return () => wideLayout.removeEventListener('change', syncDisclosure)
}

function createLegendItem(entry: LegendEntry): HTMLLIElement {
  const item = document.createElement('li')
  item.className = 'legend-item'

  const icon = document.createElement('span')
  icon.className = 'legend-icon'
  icon.setAttribute('aria-hidden', 'true')

  if (entry.textureKey === null) {
    icon.classList.add('legend-icon--start')
  } else {
    icon.append(createPatternCanvas(entry.textureKey))
  }

  const copy = document.createElement('div')
  const name = document.createElement('strong')
  name.textContent = entry.name
  const rule = document.createElement('span')
  rule.textContent = entry.rule
  copy.append(name, rule)

  item.append(icon, copy)

  if ('spikePhases' in entry && entry.spikePhases) {
    const phases = document.createElement('span')
    phases.className = 'spike-phases'
    phases.setAttribute('aria-hidden', 'true')
    phases.innerHTML = '<i class="spike-phase spike-phase--warning"></i><i class="spike-phase spike-phase--active"></i>'
    item.append(phases)
  }

  return item
}

function createPatternCanvas(textureKey: TextureKeyValue): HTMLCanvasElement {
  const pattern = PIXEL_PATTERNS[textureKey]
  const canvas = document.createElement('canvas')
  canvas.width = pattern.rows[0].length * pattern.pixelSize
  canvas.height = pattern.rows.length * pattern.pixelSize
  canvas.setAttribute('aria-hidden', 'true')
  const context = canvas.getContext('2d')

  if (context === null) {
    return canvas
  }

  pattern.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const color = pattern.palette[row[x]]
      if (color !== undefined) {
        context.fillStyle = `#${color.toString(16).padStart(6, '0')}`
        context.fillRect(
          x * pattern.pixelSize,
          y * pattern.pixelSize,
          pattern.pixelSize,
          pattern.pixelSize,
        )
      }
    }
  })

  return canvas
}