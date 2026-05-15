<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useRecorderStore } from '@/stores/recorder'
import { useDirection } from '@/composables/useDirection'
import { INSTRUMENTS } from '@/lib/instruments'
import BeatNotePicker from './BeatNotePicker.vue'
import type { BeatTrack } from '@/lib/types'

const props = defineProps<{ track: BeatTrack }>()
const emit = defineEmits<{
  (e: 'paint', payload: { trackId: string; stepIndex: number; active: boolean }): void
}>()

const store = useBeatMakerStore()
const recorderStore = useRecorderStore()
const { t } = useI18n()
const { isRtl } = useDirection()

// Playhead transform expressed as a CSS variable so the same template
// works LTR and RTL. The grid lays steps left-to-right in LTR and right-
// to-left in RTL (because direction: rtl on the .steps container), so
// the playhead's translateX has to flip sign in RTL to stay over the
// current step. Without this the bar marches off-screen the wrong way.
const playheadTransform = computed(() => {
  const offset = store.currentStep * 100
  return isRtl.value ? `translateX(${-offset}%)` : `translateX(${offset}%)`
})

const meta = computed(() => INSTRUMENTS[props.track.instrument])
const clip = computed(() =>
  props.track.clipId ? recorderStore.clips.find((c) => c.id === props.track.clipId) : null,
)
const label = computed(() => {
  if (clip.value) return clip.value.name
  return `${t(`audio.instrument.${props.track.instrument}`)} · ${props.track.note}`
})

const velocityEditing = ref<number | null>(null)
const notePickerOpen = ref(false)

function setNote(next: string) {
  store.updateTrack(props.track.id, { note: next })
}

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

function onCents(stepIndex: number, value: number) {
  store.setStepCents(props.track.id, stepIndex, value)
}

// Quick-pick chips for the most musically-useful microtones — half-flat
// (sika of Rast / 3rd of Bayati at -50 c) and half-sharp (4th-step of
// Hijazkar at +50 c). 0 c snaps the step back to 12-TET. Avoids
// requiring fine slider precision for the values users actually want.
const CENTS_PRESETS = [
  { label: '−50', value: -50 },
  { label: '0', value: 0 },
  { label: '+50', value: 50 },
] as const

const supportsCents = computed(() => meta.value.hasQuarterTones === true)

function toggleMute() { store.updateTrack(props.track.id, { muted: !props.track.muted }) }
function toggleSolo() { store.updateTrack(props.track.id, { soloed: !props.track.soloed }) }
function setVol(v: number) { store.updateTrack(props.track.id, { volume: v }) }
function clear() { store.clearTrack(props.track.id) }
function remove() { store.removeTrack(props.track.id) }
</script>

<template>
  <div class="row" :class="{ muted: track.muted, soloed: track.soloed }">
    <div class="head">
      <button
        v-if="!clip"
        class="icon icon-btn"
        :title="t('binding.note') + ': ' + track.note"
        @click="notePickerOpen = !notePickerOpen"
      >
        {{ meta.icon }}
      </button>
      <span v-else class="icon" :title="label">🎵</span>
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
      <div v-if="notePickerOpen && !clip" class="note-popup" @pointerdown.stop>
        <BeatNotePicker
          :model-value="track.note"
          :instrument="track.instrument"
          @update:model-value="setNote"
        />
        <button class="close-pop mono" @click="notePickerOpen = false">{{ t('common.close') }}</button>
      </div>
    </div>

    <div class="steps" :class="`count-${track.steps.length}`">
      <div
        v-if="store.playing"
        class="playhead-bar"
        :style="{
          width: 100 / track.steps.length + '%',
          transform: playheadTransform,
        }"
      />
      <div
        v-for="(step, i) in track.steps"
        :key="i"
        class="step-cell"
        :class="{
          active: step.active,
          downbeat: i % 4 === 0,
        }"
        @pointerdown="onPointerDown(i, $event)"
        @pointerenter="(e) => e.buttons === 1 && emit('paint', { trackId: track.id, stepIndex: i, active: step.active })"
        @contextmenu="onContext(i, $event)"
      >
        <span v-if="step.active" class="dot" :style="{ opacity: 0.3 + (step.velocity / 127) * 0.7 }" />
        <span
          v-if="step.active && supportsCents && (step.cents ?? 0) !== 0"
          class="cents-flag mono"
          :title="(step.cents ?? 0) + ' cents'"
        >{{ (step.cents ?? 0) > 0 ? '+' : '' }}{{ step.cents }}</span>
        <div v-if="velocityEditing === i" class="vel-popup" @pointerdown.stop>
          <div class="vel-row">
            <span class="mini-label mono">{{ t('beat.velocity') }}</span>
            <input
              type="range" min="20" max="127"
              :value="step.velocity"
              @input="onVelocity(i, Number(($event.target as HTMLInputElement).value))"
            />
            <span class="mono">{{ step.velocity }}</span>
          </div>
          <div v-if="supportsCents" class="vel-row">
            <span class="mini-label mono">{{ t('beat.cents') }}</span>
            <input
              type="range" min="-100" max="100" step="1"
              :value="step.cents ?? 0"
              @input="onCents(i, Number(($event.target as HTMLInputElement).value))"
            />
            <span class="mono">{{ (step.cents ?? 0) > 0 ? '+' : '' }}{{ step.cents ?? 0 }}</span>
          </div>
          <div v-if="supportsCents" class="cents-presets">
            <button
              v-for="p in CENTS_PRESETS"
              :key="p.value"
              type="button"
              class="cents-chip mono"
              :class="{ on: (step.cents ?? 0) === p.value }"
              @click="onCents(i, p.value)"
            >{{ p.label }}</button>
          </div>
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
  position: relative;
}
.icon { font-size: 1.1rem; text-align: center; }
.icon-btn {
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.icon-btn:hover { border-color: var(--accent-primary); }
.note-popup {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  z-index: 20;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.close-pop {
  align-self: flex-end;
  font-size: 0.7rem;
  padding: 0.3rem 0.7rem;
  background: transparent;
}
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
.playhead-bar {
  position: absolute;
  top: -2px;
  bottom: -2px;
  left: 0;
  pointer-events: none;
  border: 2px solid var(--accent-secondary);
  border-radius: 6px;
  box-shadow: 0 0 14px var(--accent-secondary);
  background: rgba(255, 0, 110, 0.12);
  z-index: 2;
  will-change: transform;
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
  flex-direction: column;
  gap: 0.35rem;
  z-index: 10;
  min-width: 200px;
  box-shadow: var(--shadow);
}
.vel-row { display: flex; align-items: center; gap: 0.45rem; }
.vel-popup input[type='range'] { flex: 1; padding: 0; }
.vel-popup .mono { font-size: 0.75rem; color: var(--accent-primary); min-width: 36px; text-align: end; }
.mini-label {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  min-width: 44px;
}
.cents-presets { display: flex; gap: 0.25rem; justify-content: flex-end; }
.cents-chip {
  font-size: 0.62rem;
  padding: 0.2rem 0.45rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.cents-chip:hover { border-color: var(--accent-primary); }
.cents-chip.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
}
.cents-flag {
  position: absolute;
  bottom: 1px;
  right: 2px;
  font-size: 0.5rem;
  color: var(--accent-secondary);
  line-height: 1;
  pointer-events: none;
}

@media (max-width: 720px) {
  .row { grid-template-columns: 1fr; }
}
</style>
