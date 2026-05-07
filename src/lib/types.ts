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
