<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useArrangeStore } from '@/stores/arrange'
import type { ArrangeTrack, ArrangeTrackFx } from '@/lib/types'

// Per-track FX panel — appears as a popover anchored to the track header's
// FX button. Pattern tracks share the global per-instrument FX chain and
// are shown a hint instead of editable knobs. Audio tracks get real per-
// track effects routed through their own chain by useArrange.

const props = defineProps<{ track: ArrangeTrack }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useArrangeStore()
const { t } = useI18n()

type FxKey = keyof ArrangeTrackFx
const FX_KEYS: FxKey[] = ['reverb', 'delay', 'filter']

function toggle(key: FxKey) {
  store.updateTrackFx(props.track.id, key, { enabled: !props.track.fx[key].enabled })
}
function setAmount(key: FxKey, value: number) {
  store.updateTrackFx(props.track.id, key, { amount: value })
}
</script>

<template>
  <div class="popover" @click.stop>
    <header class="head">
      <span class="title mono">{{ t('arrange.trackFxTitle') }}</span>
      <button class="close" @click="emit('close')">×</button>
    </header>

    <p v-if="track.kind === 'pattern'" class="pattern-hint mono">
      {{ t('arrange.trackFxPatternHint') }}
    </p>

    <div v-else class="rows">
      <div v-for="k in FX_KEYS" :key="k" class="row" :class="{ on: track.fx[k].enabled }">
        <button class="led-btn mono" @click="toggle(k)">
          <span class="led" />
          {{ t(`audio.effect.${k}`) }}
        </button>
        <input
          type="range" min="0" max="1" step="0.01"
          :disabled="!track.fx[k].enabled"
          :value="track.fx[k].amount"
          @input="setAmount(k, Number(($event.target as HTMLInputElement).value))"
        />
        <span class="amt mono">{{ Math.round(track.fx[k].amount * 100) }}%</span>
      </div>
    </div>

    <p class="footer-note mono">{{ t('arrange.trackFxFooter') }}</p>
  </div>
</template>

<style scoped>
.popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 8px;
  right: 8px;
  z-index: 30;
  padding: 0.7rem 0.85rem 0.85rem;
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.title {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-primary);
  font-weight: 700;
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
}
.pattern-hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.4;
  padding: 0.4rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
.rows { display: flex; flex-direction: column; gap: 0.4rem; }
.row {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr) 36px;
  gap: 0.4rem;
  align-items: center;
}
.row.on { color: var(--accent-primary); }
.led-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.3rem 0.5rem;
  font-size: 0.62rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}
.row.on .led-btn {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.led {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.row.on .led {
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.row input[type='range'] {
  width: 100%;
  appearance: none;
  height: 3px;
  background: var(--bg-elevated);
  border-radius: 2px;
  border: 1px solid var(--border);
  padding: 0;
  margin: 0;
}
.row input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.row input[type='range']:disabled { opacity: 0.4; }
.amt {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-align: end;
}
.row.on .amt { color: var(--accent-primary); }
.footer-note {
  margin: 0;
  font-size: 0.6rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  line-height: 1.4;
}
</style>
