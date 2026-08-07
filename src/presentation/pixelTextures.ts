import Phaser from 'phaser'

export const TextureKey = {
  Coin: 'coin',
  Exit: 'exit',
  Hunter: 'hunter',
  LifeTarget: 'life-target',
  Player: 'player',
  Spike: 'spike',
} as const

interface PixelPattern {
  rows: string[]
  palette: Record<string, number>
  pixelSize: number
}

const PATTERNS: Record<(typeof TextureKey)[keyof typeof TextureKey], PixelPattern> = {
  [TextureKey.Player]: {
    rows: [
      '00011000',
      '00111100',
      '01122110',
      '11222211',
      '11111111',
      '00111100',
      '00100100',
      '01000010',
    ],
    palette: { '1': 0x38f7ed, '2': 0xf3fffe },
    pixelSize: 3,
  },
  [TextureKey.Coin]: {
    rows: [
      '001100',
      '012210',
      '122221',
      '122221',
      '012210',
      '001100',
    ],
    palette: { '1': 0xffb629, '2': 0xffef9b },
    pixelSize: 2,
  },
  [TextureKey.Hunter]: {
    rows: [
      '00111100',
      '01122110',
      '11211211',
      '12222221',
      '11111111',
      '10100101',
      '01011010',
      '10000001',
    ],
    palette: { '1': 0xff5364, '2': 0xffc1c8 },
    pixelSize: 3,
  },
  [TextureKey.LifeTarget]: {
    rows: [
      '00011000',
      '00133100',
      '01333310',
      '13322331',
      '13322331',
      '01333310',
      '00133100',
      '00011000',
    ],
    palette: { '1': 0x79f25f, '2': 0xf3fffe, '3': 0x1d733c },
    pixelSize: 3,
  },
  [TextureKey.Exit]: {
    rows: [
      '11111111',
      '12222221',
      '12000021',
      '12033021',
      '12033021',
      '12000021',
      '12222221',
      '11111111',
    ],
    palette: { '1': 0x79f25f, '2': 0x164f3e, '3': 0xe8ff8a },
    pixelSize: 3,
  },
  [TextureKey.Spike]: {
    rows: [
      '10000001',
      '01011010',
      '00111100',
      '01111110',
      '01111110',
      '00111100',
      '01011010',
      '10000001',
    ],
    palette: { '1': 0xf3fffe },
    pixelSize: 4,
  },
}

export function createPixelTextures(scene: Phaser.Scene): void {
  for (const [key, pattern] of Object.entries(PATTERNS)) {
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