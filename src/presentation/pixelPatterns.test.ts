import { describe, expect, it } from 'vitest'
import { LEGEND_ENTRIES, LEGEND_TEXTURE_KEYS } from './spriteLegend'
import { PIXEL_PATTERNS, TextureKey } from './pixelPatterns'

describe('pixel patterns', () => {
  it('defines valid rectangular patterns for every texture key', () => {
    const textureKeys = Object.values(TextureKey)
    expect(Object.keys(PIXEL_PATTERNS).sort()).toEqual([...textureKeys].sort())

    for (const pattern of Object.values(PIXEL_PATTERNS)) {
      expect(pattern.rows.length).toBeGreaterThan(0)
      expect(pattern.rows.every((row) => row.length === pattern.rows[0].length)).toBe(true)
      expect(Number.isInteger(pattern.pixelSize)).toBe(true)
      expect(pattern.pixelSize).toBeGreaterThan(0)

      for (const row of pattern.rows) {
        for (const paletteKey of row) {
          expect(paletteKey === '0' || pattern.palette[paletteKey] !== undefined).toBe(true)
        }
      }
    }
  })

  it('includes every gameplay texture in the sprite legend', () => {
    expect([...LEGEND_TEXTURE_KEYS].sort()).toEqual(Object.values(TextureKey).sort())
  })

  it('gives the hunter a distinct silhouette and uses it in the legend', () => {
    const silhouette = (textureKey: TextureKey): string => PIXEL_PATTERNS[textureKey].rows
      .map((row) => Array.from(row, (paletteKey) => paletteKey === '0' ? '0' : '1').join(''))
      .join('\n')
    const hunterSilhouette = silhouette(TextureKey.Hunter)

    for (const textureKey of [TextureKey.Player, TextureKey.Ambusher, TextureKey.Wanderer]) {
      expect(hunterSilhouette).not.toBe(silhouette(textureKey))
    }

    expect(LEGEND_ENTRIES.find((entry) => entry.name === 'Hunter')?.textureKey)
      .toBe(TextureKey.Hunter)
  })
})