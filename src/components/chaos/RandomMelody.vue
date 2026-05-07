<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChaos, type Scale } from '@/composables/useChaos'

const { generateMelody, playMelody, lastMelody, KEYS } = useChaos()
const { t } = useI18n()

const key = ref<string>('C')
const scale = ref<Scale>('major')
const length = ref(8)
const mood = ref<'calm' | 'wild'>('calm')
const stepSec = ref(0.25)

const scales: Scale[] = ['major', 'minor', 'pentatonic', 'blues', 'dorian']

function generate() {
  generateMelody(key.value, scale.value, length.value, mood.value)
}

function play() {
  if (lastMelody.value.length === 0) generate()
  void playMelody(lastMelody.value, stepSec.value)
}
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.randomMelody') }}</h4>
      <span class="hint mono" :title="lastMelody.join(' ')">
        {{ lastMelody.length > 0 ? lastMelody.length + ' notes' : '—' }}
      </span>
    </header>

    <div class="row">
      <label>
        <span class="lbl mono">{{ t('chaos.key') }}</span>
        <select v-model="key">
          <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
        </select>
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.scale') }}</span>
        <select v-model="scale">
          <option v-for="s in scales" :key="s" :value="s">{{ t(`chaos.scaleName.${s}`) }}</option>
        </select>
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.length') }}</span>
        <input v-model.number="length" type="number" min="4" max="32" />
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.mood') }}</span>
        <select v-model="mood">
          <option value="calm">{{ t('chaos.moodCalm') }}</option>
          <option value="wild">{{ t('chaos.moodWild') }}</option>
        </select>
      </label>
    </div>

    <label class="full">
      <span class="lbl mono">{{ t('chaos.stepLength') }} {{ stepSec.toFixed(2) }}s</span>
      <input v-model.number="stepSec" type="range" min="0.1" max="0.6" step="0.01" />
    </label>

    <div class="actions">
      <button class="ghost" @click="generate">{{ t('chaos.generate') }}</button>
      <button class="primary" @click="play">{{ t('chaos.playMelody') }}</button>
    </div>

    <p v-if="lastMelody.length > 0" class="notes mono">{{ lastMelody.join(' · ') }}</p>
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
  gap: 0.6rem;
}
.head { display: flex; align-items: baseline; justify-content: space-between; }
.head h4 {
  margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
}
.hint { font-size: 0.7rem; color: var(--text-muted); }
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.4rem;
}
.row label, .full { display: flex; flex-direction: column; gap: 0.2rem; }
.lbl { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.full input[type='range'] { width: 100%; padding: 0; }
.actions { display: flex; gap: 0.4rem; }
.ghost { background: transparent; font-size: 0.8rem; padding: 0.45rem 0.85rem; }
.primary {
  background: var(--accent-primary); color: var(--text-inverse); border: none;
  font-weight: 600; font-size: 0.8rem; padding: 0.45rem 0.85rem;
}
.notes {
  margin: 0;
  padding: 0.5rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.75rem;
  color: var(--accent-primary);
  word-break: break-word;
}
</style>
