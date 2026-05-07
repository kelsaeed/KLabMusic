<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useRecorderStore } from '@/stores/recorder'
import { INSTRUMENTS } from '@/lib/instruments'
import type { BeatTrack } from '@/lib/types'

const props = defineProps<{ track: BeatTrack }>()
const emit = defineEmits<{
  (e: 'paint', payload: { trackId: string; stepIndex: number; active: boolean }): void
}>()

const store = useBeatMakerStore()
const recorderStore = useRecorderStore()
const { t } = useI18n()

const meta = computed(() => INSTRUMENTS[props.track.instrument])
const clip = computed(() =>
  props.track.clipId ? recorderStore.clips.find((c) => c.id === props.track.clipId) : null,
)
const label = computed(() => {
  if (clip.value) return clip.value.name
  return `${t(`audio.instrument.${props.track.instrument}`)} · ${props.track.note}`
})

const velocityEditing = ref<number | null>(null)

function onPointerDown(stepIndex: number, e: PointerEvent) {
  if (e.button === 2) return
  const next = !props.track.steps[stepIndex].active
  store.setStepActive(props.track.id, stepIndex, next)
  emit('paint', { trackId: props.track.id, stepIndex, active: next })
}

function onContext(stepIndex: number, e: MouseEvent) {
  e.preventDefault()
  if (!props.track.steps[stepIndex].active) return
  velocityEditing.value = velocityEditing.value === stepIndex ? null : stepIndex
}

function onVelocity(stepIndex: number, value: number) {
  store.setStepVelocity(props.track.id, stepIndex, value)
}

function toggleMute() { store.updateTrack(props.track.id, { muted: !props.track.muted }) }
function toggleSolo() { store.updateTrack(props.track.id, { soloed: !props.track.soloed }) }
function setVol(v: number) { store.updateTrack(props.track.id, { volume: v }) }
function clear() { store.clearTrack(props.track.id) }
function remove() { store.removeTrack(props.track.id) }
</script>

<template>
  <div class="row" :class="{ muted: track.muted, soloed: track.soloed }">
    <div class="head">
      <span class="icon" :title="label">{{ clip ? '🎵' : meta.icon }}</span>
      <div class="title">
        <span class="name">{{ label }}</span>
        <div class="vol-wrap">
          <input
            type="range" min="0" max="1" step="0.01"
            :value="track.volume"
            @input="setVol(Number(($event.target as HTMLInputElement).value))"
          />
        </div>
      </div>
      <div class="ctl">
        <button class="m" :class="{ on: track.muted }" :title="t('beat.mute')" @click="toggleMute">M</button>
        <button class="s" :class="{ on: track.soloed }" :title="t('beat.solo')" @click="toggleSolo">S</button>
        <button class="x" :title="t('beat.clearTrack')" @click="clear">⌫</button>
        <button class="d" :title="t('beat.removeTrack')" @click="remove">×</button>
      </div>
    </div>

    <div class="steps" :class="`count-${track.steps.length}`">
      <div
        v-for="(step, i) in track.steps"
        :key="i"
        class="step-cell"
        :class="{
          active: step.active,
          downbeat: i % 4 === 0,
          playhead: store.playing && store.currentStep === i,
        }"
        @pointerdown="onPointerDown(i, $event)"
        @pointerenter="(e) => e.buttons === 1 && emit('paint', { trackId: track.id, stepIndex: i, active: step.active })"
        @contextmenu="onContext(i, $event)"
      >
        <span v-if="step.active" class="dot" :style="{ opacity: 0.3 + (step.velocity / 127) * 0.7 }" />
        <div v-if="velocityEditing === i" class="vel-popup" @pointerdown.stop>
          <input
            type="range" min="20" max="127"
            :value="step.velocity"
            @input="onVelocity(i, Number(($event.target as HTMLInputElement).value))"
          />
          <span class="mono">{{ step.velocity }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 0.6rem;
  align-items: center;
  padding: 0.45rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.row.muted { opacity: 0.45; }
.row.soloed { border-color: var(--accent-primary); }

.head {
  display: grid;
  grid-template-columns: 28px 1fr auto;
  gap: 0.4rem;
  align-items: center;
  min-width: 0;
}
.icon { font-size: 1.1rem; text-align: center; }
.title { display: flex; flex-direction: column; gap: 0.15rem; min-width: 0; }
.name {
  font-size: 0.78rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-mono);
}
.vol-wrap { display: flex; align-items: center; }
.vol-wrap input[type='range'] {
  width: 100%;
  appearance: none;
  height: 3px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 2px;
  padding: 0;
  margin: 0;
}
.vol-wrap input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
}

.ctl { display: inline-flex; gap: 0.2rem; }
.ctl button {
  width: 24px;
  height: 24px;
  padding: 0;
  font-size: 0.7rem;
  font-family: var(--font-mono);
  background: var(--bg-surface);
}
.ctl .m.on { color: var(--accent-secondary); border-color: var(--accent-secondary); }
.ctl .s.on { color: var(--accent-primary); border-color: var(--accent-primary); }

.steps {
  display: grid;
  gap: 4px;
  position: relative;
  user-select: none;
  touch-action: none;
}
.steps.count-16 { grid-template-columns: repeat(16, minmax(0, 1fr)); }
.steps.count-32 { grid-template-columns: repeat(32, minmax(0, 1fr)); }

.step-cell {
  position: relative;
  aspect-ratio: 1;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.step-cell.downbeat { background: var(--bg-surface); }
.step-cell:hover { border-color: var(--accent-primary); }
.step-cell.active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
}
.step-cell.playhead {
  box-shadow: 0 0 0 2px var(--accent-secondary), 0 0 12px var(--accent-secondary);
  z-index: 1;
}
.dot {
  position: absolute;
  inset: 25%;
  border-radius: 50%;
  background: var(--text-inverse);
}

.vel-popup {
  position: absolute;
  top: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  padding: 0.4rem 0.6rem;
  display: flex;
  gap: 0.5rem;
  align-items: center;
  z-index: 10;
  width: 160px;
  box-shadow: var(--shadow);
}
.vel-popup input[type='range'] { flex: 1; padding: 0; }
.vel-popup .mono { font-size: 0.75rem; color: var(--accent-primary); min-width: 28px; text-align: end; }

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
