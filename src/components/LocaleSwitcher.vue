<script setup lang="ts">
import { useLocale } from '@/i18n'
import type { Locale } from '@/lib/types'

const { activeLocale, setLocale } = useLocale()

function toggle() {
  const next: Locale = activeLocale.value === 'en' ? 'ar' : 'en'
  setLocale(next)
}
</script>

<template>
  <button class="locale-btn mono" :title="$t('nav.language')" @click="toggle">
    <span :class="{ active: activeLocale === 'en' }">EN</span>
    <span class="sep">|</span>
    <span :class="{ active: activeLocale === 'ar' }">ع</span>
  </button>
</template>

<style scoped>
.locale-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.32rem 0.55rem;
  font-size: 0.78rem;
  background: var(--bg-elevated);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .locale-btn { padding: 0.3rem 0.45rem; font-size: 0.72rem; gap: 0.2rem; }
}
.locale-btn .active {
  color: var(--accent-primary);
  font-weight: 700;
}
.locale-btn .sep {
  color: var(--text-muted);
}
</style>
