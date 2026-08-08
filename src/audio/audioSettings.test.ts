import { describe, expect, it } from 'vitest'
import { loadAudioSettings, saveAudioSettings, type StorageAdapter } from './audioSettings'

class MemoryStorage implements StorageAdapter {
  value: string | null = null

  getItem(): string | null {
    return this.value
  }

  setItem(_key: string, value: string): void {
    this.value = value
  }
}

describe('audio settings', () => {
  it('defaults to unmuted without stored settings', () => {
    expect(loadAudioSettings(null)).toEqual({ muted: false })
    expect(loadAudioSettings(new MemoryStorage())).toEqual({ muted: false })
  })

  it('persists mute state', () => {
    const storage = new MemoryStorage()
    saveAudioSettings(storage, { muted: true })
    expect(loadAudioSettings(storage)).toEqual({ muted: true })
  })

  it('ignores corrupt or invalid values', () => {
    const storage = new MemoryStorage()
    storage.value = '{broken'
    expect(loadAudioSettings(storage)).toEqual({ muted: false })
    storage.value = JSON.stringify({ muted: 'yes' })
    expect(loadAudioSettings(storage)).toEqual({ muted: false })
  })

  it('survives storage failures', () => {
    const storage: StorageAdapter = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
    }
    expect(loadAudioSettings(storage)).toEqual({ muted: false })
    expect(() => saveAudioSettings(storage, { muted: true })).not.toThrow()
  })
})
