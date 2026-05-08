<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'

const { themes, activeTheme, setTheme } = useTheme()
const { t } = useI18n()
const open = ref(false)

function pick(name: typeof themes[number]) {
  setTheme(name)
  open.value = false
}
</script>

<template>
  <div class="theme-switch">
    <button class="trigger" :title="t('nav.theme')" @click="open = !open">
      <span class="dot" />
      <span class="label">{{ t(`theme.${activeTheme}`) }}</span>
    </button>
    <div v-if="open" class="menu">
      <button
        v-for="name in themes"
        :key="name"
        class="opt"
        :class="{ selected: name === activeTheme }"
        @click="pick(name)"
      >
        <span class="swatch" :data-theme-preview="name" />
        <span>{{ t(`theme.${name}`) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.theme-switch {
  position: relative;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.32rem 0.55rem;
  font-size: 0.78rem;
  background: var(--bg-elevated);
  white-space: nowrap;
}
@media (max-width: 640px) {
  .trigger { padding: 0.3rem 0.5rem; font-size: 0.72rem; gap: 0.3rem; }
  .label { display: none; }
}
.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-glow);
}
.menu {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 0.35rem;
  min-width: 180px;
  z-index: 100;
}
html[dir='rtl'] .menu {
  right: auto;
  left: 0;
}
.opt {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border: none;
  text-align: start;
  padding: 0.45rem 0.6rem;
  border-radius: 6px;
}
.opt:hover {
  background: var(--bg-surface);
}
.opt.selected {
  color: var(--accent-primary);
}
.swatch {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  border: 1px solid var(--border);
  flex-shrink: 0;
}
.swatch[data-theme-preview='cyberpunk'] {
  background: linear-gradient(135deg, #050510 50%, #00f5ff 50%);
}
.swatch[data-theme-preview='studio-pro'] {
  background: linear-gradient(135deg, #1a1a1f 50%, #f5a623 50%);
}
.swatch[data-theme-preview='acid-rave'] {
  background: linear-gradient(135deg, #1a0033 50%, #ccff00 50%);
}
.swatch[data-theme-preview='analog-tape'] {
  background: linear-gradient(135deg, #f2e8d5 50%, #c44b2a 50%);
}
.swatch[data-theme-preview='midnight-jazz'] {
  background: linear-gradient(135deg, #0d1b2a 50%, #d4a853 50%);
}
</style>
