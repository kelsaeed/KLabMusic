export type ThemeName =
  | 'cyberpunk'
  | 'studio-pro'
  | 'acid-rave'
  | 'analog-tape'
  | 'midnight-jazz'
  | 'custom'

export type Locale = 'en' | 'ar'

export type ModuleTab = 'live' | 'beat' | 'loop' | 'chaos'

export interface CustomTheme {
  bgBase: string
  bgSurface: string
  accentPrimary: string
  accentSecondary: string
  textPrimary: string
  border: string
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

export type InstrumentId =
  | 'piano'
  | 'electricPiano'
  | 'guitar'
  | 'bass'
  | 'pad'
  | 'lead'
  | 'organ'
  | 'drums'
  | 'glitch'
  | 'meme'

export type InstrumentCategory = 'sampled' | 'synth' | 'percussion' | 'fx'
export type InstrumentPlayMode = 'note' | 'sample'

export interface InstrumentMeta {
  id: InstrumentId
  category: InstrumentCategory
  playMode: InstrumentPlayMode
  icon: string
  available: boolean
  samples?: readonly string[]
}

export type EffectId =
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'chorus'
  | 'filter'
  | 'bitcrusher'
  | 'compressor'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'
