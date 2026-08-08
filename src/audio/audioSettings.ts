export interface AudioSettings {
  muted: boolean
}

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

const AUDIO_SETTINGS_KEY = 'a-maze-thing:audio:v1'
const DEFAULT_SETTINGS: AudioSettings = { muted: false }

export function loadAudioSettings(storage: StorageAdapter | null): AudioSettings {
  if (storage === null) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const stored = storage.getItem(AUDIO_SETTINGS_KEY)
    if (stored === null) {
      return { ...DEFAULT_SETTINGS }
    }
    const parsed: unknown = JSON.parse(stored)
    return typeof parsed === 'object'
      && parsed !== null
      && 'muted' in parsed
      && typeof parsed.muted === 'boolean'
      ? { muted: parsed.muted }
      : { ...DEFAULT_SETTINGS }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveAudioSettings(storage: StorageAdapter | null, settings: AudioSettings): void {
  if (storage === null) {
    return
  }

  try {
    storage.setItem(AUDIO_SETTINGS_KEY, JSON.stringify(settings))
  } catch {
    // Storage can be unavailable in privacy modes; audio still works for the session.
  }
}
