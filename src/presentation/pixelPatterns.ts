export const TextureKey = {
  Ambusher: 'ambusher',
  Coin: 'coin',
  Exit: 'exit',
  Hunter: 'hunter',
  LifeTarget: 'life-target',
  Player: 'player',
  Portal: 'portal',
  Spike: 'spike',
} as const

export type TextureKey = (typeof TextureKey)[keyof typeof TextureKey]

export interface PixelPattern {
  rows: string[]
  palette: Record<string, number>
  pixelSize: number
}

export const PIXEL_PATTERNS: Record<TextureKey, PixelPattern> = {
  [TextureKey.Ambusher]: {
    rows: [
      '00111100',
      '01133110',
      '11311311',
      '13333331',
      '11111111',
      '10100101',
      '01011010',
      '10000001',
    ],
    palette: { '1': 0xffb629, '3': 0xffef9b },
    pixelSize: 3,
  },
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
  [TextureKey.Portal]: {
    rows: [
      '00111100',
      '01222210',
      '12000021',
      '12033021',
      '12033021',
      '12000021',
      '01222210',
      '00111100',
    ],
    palette: { '1': 0x38f7ed, '2': 0x0c6972, '3': 0xffb629 },
    pixelSize: 4,
  },
}