<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'

const store = useAudioStore()
const { t } = useI18n()
</script>

<template>
  <section class="master">
    <h3>{{ t('audio.master') }}</h3>
    <div class="row">
      <label class="vol">
        <span class="mono">{{ Math.round(store.masterVolumeDb) }} dB</span>
        <input
          v-model.number="store.masterVolumeDb"
          type="range"
          min="-40"
          max="6"
          step="0.5"
        />
      </label>
      <button
        class="mute mono"
        :class="{ on: store.masterMuted }"
        @click="store.masterMuted = !store.masterMuted"
      >
        {{ store.masterMuted ? t('audio.muted') : t('audio.live') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.master {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.master h3 {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.row {
  display: flex;
  gap: 1rem;
  align-items: center;
}
.vol {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.vol input[type='range'] {
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  cursor: pointer;
  padding: 0;
}
.vol input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--accent-primary);
  border: 2px solid var(--bg-base);
  box-shadow: 0 0 8px var(--accent-glow);
}
.mute {
  padding: 0.5rem 1rem;
  border: 1px solid var(--border);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 0.75rem;
}
.mute.on {
  color: var(--accent-secondary);
  border-color: var(--accent-secondary);
}
</style>
