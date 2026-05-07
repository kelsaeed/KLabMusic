<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useBeatMaker } from '@/composables/useBeatMaker'
import type { StepCount } from '@/lib/types'

const store = useBeatMakerStore()
const { toggle, tapTempo } = useBeatMaker()
const { t } = useI18n()

function setSteps(count: StepCount) {
  store.setStepCount(count)
}
</script>

<template>
  <header class="bar">
    <button class="play" :class="{ on: store.playing }" @click="toggle">
      {{ store.playing ? '◼' : '▶' }}
      <span class="lbl mono">{{ store.playing ? t('beat.stop') : t('beat.play') }}</span>
    </button>

    <div class="bpm">
      <span class="lbl mono">BPM</span>
      <input v-model.number="store.bpm" type="number" min="40" max="220" />
      <button class="tap mono" :title="t('beat.tapTempo')" @click="tapTempo">{{ t('beat.tap') }}</button>
    </div>

    <div class="swing">
      <span class="lbl mono">{{ t('beat.swing') }} {{ store.swing }}%</span>
      <input v-model.number="store.swing" type="range" min="0" max="80" step="1" />
    </div>

    <div class="steps-toggle">
      <button :class="{ on: store.stepCount === 16 }" class="mono" @click="setSteps(16)">16</button>
      <button :class="{ on: store.stepCount === 32 }" class="mono" @click="setSteps(32)">32</button>
    </div>

    <button class="action mono" :title="t('beat.humanize')" @click="store.humanize()">{{ t('beat.humanize') }}</button>

    <label class="song-toggle mono">
      <input v-model="store.songMode" type="checkbox" />
      {{ t('beat.songMode') }}
    </label>
  </header>
</template>

<style scoped>
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
  padding: 0.75rem 1rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.play {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 1rem;
  font-size: 1rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  min-width: 100px;
}
.play.on { background: var(--accent-secondary); }
.play .lbl { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; }

.bpm, .swing { display: flex; align-items: center; gap: 0.5rem; }
.bpm input[type='number'] {
  width: 70px;
  text-align: center;
  font-family: var(--font-mono);
}
.bpm .tap { font-size: 0.75rem; padding: 0.4rem 0.7rem; }
.swing { flex: 1; min-width: 200px; }
.swing .lbl { white-space: nowrap; font-size: 0.75rem; color: var(--text-muted); }
.swing input[type='range'] { flex: 1; padding: 0; }

.lbl { font-size: 0.7rem; color: var(--text-muted); letter-spacing: 0.05em; }

.steps-toggle { display: inline-flex; gap: 0.2rem; }
.steps-toggle button {
  padding: 0.4rem 0.7rem;
  font-size: 0.75rem;
}
.steps-toggle button.on { color: var(--accent-primary); border-color: var(--accent-primary); }

.action {
  font-size: 0.75rem;
  padding: 0.45rem 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.song-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
</style>
