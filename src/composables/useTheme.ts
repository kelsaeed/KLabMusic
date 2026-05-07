import { ref, watch } from 'vue'
import type { ThemeName, CustomTheme } from '@/lib/types'

const THEMES: ThemeName[] = [
  'cyberpunk',
  'studio-pro',
  'acid-rave',
  'analog-tape',
  'midnight-jazz',
]

const STORAGE_KEY = 'klm:theme'
const STORAGE_CUSTOM = 'klm:theme-custom'

const activeTheme = ref<ThemeName>('cyberpunk')
const customTheme = ref<CustomTheme | null>(null)

function applyTheme(name: ThemeName) {
  document.documentElement.setAttribute('data-theme', name)
  if (name === 'custom' && customTheme.value) {
    applyCustomVars(customTheme.value)
  } else {
    clearCustomVars()
  }
}

function applyCustomVars(c: CustomTheme) {
  const r = document.documentElement.style
  r.setProperty('--bg-base', c.bgBase)
  r.setProperty('--bg-surface', c.bgSurface)
  r.setProperty('--accent-primary', c.accentPrimary)
  r.setProperty('--accent-secondary', c.accentSecondary)
  r.setProperty('--text-primary', c.textPrimary)
  r.setProperty('--border', c.border)
}

function clearCustomVars() {
  const r = document.documentElement.style
  for (const prop of [
    '--bg-base',
    '--bg-surface',
    '--accent-primary',
    '--accent-secondary',
    '--text-primary',
    '--border',
  ]) {
    r.removeProperty(prop)
  }
}

export function useTheme() {
  function setTheme(name: ThemeName) {
    activeTheme.value = name
    localStorage.setItem(STORAGE_KEY, name)
    applyTheme(name)
  }

  function setCustomTheme(c: CustomTheme) {
    customTheme.value = c
    localStorage.setItem(STORAGE_CUSTOM, JSON.stringify(c))
    setTheme('custom')
  }

  function initTheme() {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeName | null
    const savedCustom = localStorage.getItem(STORAGE_CUSTOM)
    if (savedCustom) {
      try {
        customTheme.value = JSON.parse(savedCustom) as CustomTheme
      } catch {
        customTheme.value = null
      }
    }
    if (saved && (THEMES.includes(saved) || saved === 'custom')) {
      activeTheme.value = saved
    }
    applyTheme(activeTheme.value)
  }

  watch(activeTheme, applyTheme)

  return {
    themes: THEMES,
    activeTheme,
    customTheme,
    setTheme,
    setCustomTheme,
    initTheme,
  }
}
