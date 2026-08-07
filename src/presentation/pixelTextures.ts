import Phaser from 'phaser'
import { PIXEL_PATTERNS, type PixelPattern } from './pixelPatterns'

export { TextureKey } from './pixelPatterns'

export function createPixelTextures(scene: Phaser.Scene): void {
  for (const [key, pattern] of Object.entries(PIXEL_PATTERNS)) {
    if (scene.textures.exists(key)) {
      continue
    }

    const graphics = scene.add.graphics()
    drawPattern(graphics, pattern)
    graphics.generateTexture(
      key,
      pattern.rows[0].length * pattern.pixelSize,
      pattern.rows.length * pattern.pixelSize,
    )
    graphics.destroy()
  }
}

function drawPattern(graphics: Phaser.GameObjects.Graphics, pattern: PixelPattern): void {
  pattern.rows.forEach((row, y) => {
    Array.from(row).forEach((paletteKey, x) => {
      const color = pattern.palette[paletteKey]

      if (color === undefined) {
        return
      }

      graphics.fillStyle(color, 1)
      graphics.fillRect(
        x * pattern.pixelSize,
        y * pattern.pixelSize,
        pattern.pixelSize,
        pattern.pixelSize,
      )
    })
  })
}