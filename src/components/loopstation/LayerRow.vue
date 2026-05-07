<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLoopStationStore } from '@/stores/loopstation'
import { useLoopStation } from '@/composables/useLoopStation'
import type { LoopLayer } from '@/stores/loopstation'

defineProps<{ layer: LoopLayer; index: number }>()

const store = useLoopStationStore()
const { setVolume, toggleMute, toggleReverse, toggleHalfSpeed } = useLoopStation()
const { t } = useI18n()
</script>

<template>
  <div class="layer" :class="{ muted: layer.muted }">
    <span class="idx mono">{{ String(index + 1).padStart(2, '0') }}</span>
    <span class="name">{{ layer.name }}</span>
    <span class="dur mono">{{ layer.buffer.duration.toFixed(2) }}s</span>

    <input
      type="range" min="0" max="1.2" step="0.01"
      :value="layer.volume"
      class="vol"
      @input="setVolume(layer.id, Number(($event.target as HTMLInputElement).value))"
    />

    <div class="ctl">
      <button class="t" :class="{ on: layer.muted }" :title="t('beat.mute')" @click="toggleMute(layer.id)">M</button>
      <button class="t" :class="{ on: layer.reversed }" :title="t('recorder.reverse')" @click="toggleReverse(layer.id)">↺</button>
      <button class="t" :class="{ on: layer.halfSpeed }" :title="t('loop.halfSpeed')" @click="toggleHalfSpeed(layer.id)">½</button>
      <button class="del" @click="store.removeLayer(layer.id)">×</button>
    </div>
  </div>
</template>

<style scoped>
.layer {
  display: grid;
  grid-template-columns: 32px 1fr auto 1fr auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.55rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.layer.muted { opacity: 0.5; }
.idx { color: var(--accent-primary); font-weight: 700; }
.name {
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dur { color: var(--text-muted); font-size: 0.75rem; }
.vol {
  appearance: none;
  width: 100%;
  height: 4px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 0;
}
.vol::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.ctl { display: inline-flex; gap: 0.2rem; }
.ctl button {
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 0.85rem;
  font-family: var(--font-mono);
}
.t.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.del { color: var(--text-muted); }
.del:hover { color: var(--accent-secondary); border-color: var(--accent-secondary); }
@media (max-width: 600px) {
  .layer { grid-template-columns: 1fr 1fr auto; }
}
</style>
