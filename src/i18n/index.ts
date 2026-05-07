import { ref } from 'vue'
import { createI18n } from 'vue-i18n'
import en from './en.json'
import ar from './ar.json'
import type { Locale } from '@/lib/types'

const STORAGE_KEY = 'klm:locale'

export const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, ar },
})

const activeLocale = ref<Locale>('en')

function applyLocale(locale: Locale) {
  i18n.global.locale.value = locale
  document.documentElement.lang = locale
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
}

export function useLocale() {
  function setLocale(locale: Locale) {
    activeLocale.value = locale
    localStorage.setItem(STORAGE_KEY, locale)
    applyLocale(locale)
  }

  function initLocale() {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null
    const initial: Locale = saved === 'ar' || saved === 'en' ? saved : 'en'
    activeLocale.value = initial
    applyLocale(initial)
  }

  return { activeLocale, setLocale, initLocale }
}
