<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import { INSTRUMENTS, DEFAULT_TEST_NOTES } from '@/lib/instruments'

const store = useAudioStore()
const { playNote, stopNote } = useAudio()
const { t } = useI18n()

const meta = computed(() => INSTRUMENTS[store.activeInstrument])
const triggers = computed<readonly string[]>(() => {
  if (meta.value.playMode === 'sample' && meta.value.samples) return meta.value.samples
  return DEFAULT_TEST_NOTES
})

function press(name: string) {
  playNote(name)
}
function release(name: string) {
  if (meta.value.playMode === 'note') stopNote(name)
}
</script>

<template>
  <section class="pad">
    <header class="head">
      <h3>{{ t('audio.testPad') }}</h3>
      <span class="hint mono">{{ t('audio.testPadHint') }}</span>
    </header>

    <div class="grid" :class="{ samples: meta.playMode === 'sample' }">
      <button
        v-for="name in triggers"
        :key="name"
        class="trigger"
        :class="{ active: store.activeNotes.has(name) }"
        @pointerdown.prevent="press(name)"
        @pointerup="release(name)"
        @pointerleave="release(name)"
      >
        <span class="label mono">{{ name }}</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.pad {
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
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.4rem;
}
.grid.samples {
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
}
.trigger {
  display: grid;
  place-items: center;
  height: 80px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.85rem;
  color: var(--text-primary);
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}
.trigger:hover {
  border-color: var(--accent-primary);
}
.trigger.active,
.trigger:active {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
  transform: scale(0.96);
  box-shadow: 0 0 16px var(--accent-glow);
}
.label {
  font-size: 0.85rem;
  letter-spacing: 0.04em;
}
</style>
