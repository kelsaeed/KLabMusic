<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChaos, type ArpMode } from '@/composables/useChaos'

const { startArp, stopArp, arpRunning } = useChaos()
const { t } = useI18n()

const chordText = ref('C4 E4 G4 B4')
const mode = ref<ArpMode>('up')
const speed = ref(0.18)
const gate = ref(0.7)

const modes: ArpMode[] = ['up', 'down', 'random', 'chord']

async function toggle() {
  if (arpRunning.value) {
    stopArp()
    return
  }
  const chord = chordText.value.split(/\s+/).filter(Boolean)
  await startArp(chord, mode.value, speed.value, gate.value)
}
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.autoArp') }}</h4>
      <button class="play" :class="{ on: arpRunning }" @click="toggle">
        {{ arpRunning ? '◼' : '▶' }}
      </button>
    </header>

    <label class="field">
      <span class="lbl mono">{{ t('chaos.chordNotes') }}</span>
      <input v-model="chordText" placeholder="C4 E4 G4 B4" />
    </label>

    <div class="modes">
      <button
        v-for="m in modes"
        :key="m"
        class="mode mono"
        :class="{ on: mode === m }"
        @click="mode = m"
      >
        {{ t(`chaos.arpMode.${m}`) }}
      </button>
    </div>

    <label class="field">
      <span class="lbl mono">{{ t('chaos.arpSpeed') }} {{ speed.toFixed(2) }}s</span>
      <input v-model.number="speed" type="range" min="0.05" max="0.6" step="0.01" />
    </label>

    <label class="field">
      <span class="lbl mono">{{ t('chaos.arpGate') }} {{ Math.round(gate * 100) }}%</span>
      <input v-model.number="gate" type="range" min="0.1" max="1" step="0.05" />
    </label>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.head { display: flex; align-items: center; justify-content: space-between; }
.head h4 {
  margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
}
.play {
  width: 36px; height: 36px; padding: 0;
  background: var(--accent-primary); color: var(--text-inverse); border: none;
  font-size: 0.95rem;
}
.play.on { background: var(--accent-secondary); }
.field { display: flex; flex-direction: column; gap: 0.25rem; }
.lbl { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.modes { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.mode {
  font-size: 0.7rem;
  padding: 0.35rem 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mode.on { color: var(--accent-primary); border-color: var(--accent-primary); }
input[type='range'] { width: 100%; padding: 0; }
</style>
