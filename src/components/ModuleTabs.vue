<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { ModuleTab } from '@/lib/types'

defineProps<{ active: ModuleTab }>()
const emit = defineEmits<{ (e: 'change', tab: ModuleTab): void }>()

const { t } = useI18n()

const tabs: { key: ModuleTab; icon: string }[] = [
  { key: 'live', icon: '🎹' },
  { key: 'beat', icon: '🥁' },
  { key: 'loop', icon: '🔁' },
  { key: 'chaos', icon: '🌀' },
]
</script>

<template>
  <nav class="tabs" role="tablist">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      role="tab"
      :aria-selected="active === tab.key"
      :class="['tab', { active: active === tab.key }]"
      @click="emit('change', tab.key)"
    >
      <span class="icon" aria-hidden="true">{{ tab.icon }}</span>
      <span class="label">{{ t(`modules.${tab.key}`) }}</span>
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 0.4rem;
  padding: 0.5rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--radius);
  background: transparent;
  color: var(--text-muted);
  white-space: nowrap;
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
}
.tab:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}
.tab.active {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
  box-shadow: 0 0 12px var(--accent-glow);
}
.icon {
  font-size: 1.1rem;
}
</style>
