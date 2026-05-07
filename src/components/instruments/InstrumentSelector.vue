<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import { INSTRUMENTS, INSTRUMENT_ORDER } from '@/lib/instruments'
import type { InstrumentId } from '@/lib/types'

const store = useAudioStore()
const { setInstrument } = useAudio()
const { t } = useI18n()

async function pick(id: InstrumentId) {
  if (!INSTRUMENTS[id].available) return
  await setInstrument(id)
}
</script>

<template>
  <section class="selector">
    <header class="head">
      <h3>{{ t('audio.instruments') }}</h3>
      <span class="hint mono">{{ t('audio.activeNotes', { n: store.activeNotes.size }) }}</span>
    </header>

    <div class="grid">
      <button
        v-for="id in INSTRUMENT_ORDER"
        :key="id"
        class="card"
        :class="{
          active: store.activeInstrument === id,
          loading: store.getLoadState(id) === 'loading',
          unavailable: !INSTRUMENTS[id].available,
        }"
        :disabled="!INSTRUMENTS[id].available"
        :title="!INSTRUMENTS[id].available ? t('audio.notAvailable') : ''"
        @click="pick(id)"
      >
        <span class="icon" aria-hidden="true">{{ INSTRUMENTS[id].icon }}</span>
        <span class="name">{{ t(`audio.instrument.${id}`) }}</span>
        <span v-if="store.getLoadState(id) === 'loading'" class="dot loading-dot" />
        <span v-else-if="store.getLoadState(id) === 'ready'" class="dot ready-dot" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.selector {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.head h3 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.85rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast),
    background var(--transition-fast);
}
.card:hover:not(:disabled) {
  border-color: var(--accent-primary);
  transform: translateY(-1px);
}
.card.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 16px var(--accent-glow);
}
.card.loading {
  opacity: 0.75;
}
.card.unavailable {
  opacity: 0.45;
  cursor: not-allowed;
}
.icon {
  font-size: 1.5rem;
}
.name {
  font-size: 0.78rem;
  font-family: var(--font-mono);
}
.dot {
  position: absolute;
  top: 0.5rem;
  inset-inline-end: 0.5rem;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.ready-dot {
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.loading-dot {
  background: var(--text-muted);
  animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}
</style>
