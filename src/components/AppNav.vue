<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import ThemeSwitcher from './theme/ThemeSwitcher.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'

const { t } = useI18n()
const route = useRoute()
const isHome = computed(() => route.name === 'home')
</script>

<template>
  <header class="nav">
    <RouterLink to="/" class="brand">
      <span class="logo-mark">K</span>
      <span class="brand-text">{{ t('app.name') }}</span>
    </RouterLink>

    <nav class="actions">
      <RouterLink v-if="isHome" to="/app" class="cta">
        {{ t('nav.open') }}
      </RouterLink>
      <LocaleSwitcher />
      <ThemeSwitcher />
    </nav>
  </header>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1.5rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(8px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.1rem;
  letter-spacing: 0.02em;
}

.logo-mark {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-family: var(--font-display);
  font-weight: 800;
  box-shadow: 0 0 16px var(--accent-glow);
}

.actions {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.cta {
  background: var(--accent-primary);
  color: var(--text-inverse);
  padding: 0.5rem 1rem;
  border-radius: var(--radius);
  font-weight: 600;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
  opacity: 1;
}
</style>
