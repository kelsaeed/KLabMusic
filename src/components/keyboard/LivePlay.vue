<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLivePlay, type PlayMode } from '@/composables/useLivePlay'
import Piano from './Piano.vue'
import PitchBend from './PitchBend.vue'
import ModWheel from './ModWheel.vue'

const {
  startOctave,
  octaveCount,
  showLabels,
  playMode,
  press,
  release,
  octaveUp,
  octaveDown,
} = useLivePlay()
const { t } = useI18n()

const octaveRange = computed(
  () => `C${startOctave.value} – B${startOctave.value + octaveCount.value - 1}`,
)

const modes: PlayMode[] = ['normal', 'chord', 'strum']

function setMode(m: PlayMode) {
  playMode.value = m
}

function onPianoPress(p: { note: string; velocity: number }) {
  void press(p.note, p.velocity)
}
function onPianoRelease(note: string) {
  release(note)
}
</script>

<template>
  <section class="live">
    <header class="head">
      <h3>{{ t('live.title') }}</h3>
      <span class="hint mono">{{ octaveRange }}</span>
    </header>

    <div class="toolbar">
      <div class="oct">
        <button class="oct-btn" :title="t('live.octaveDown')" @click="octaveDown">−</button>
        <span class="oct-label mono">{{ startOctave }}</span>
        <button class="oct-btn" :title="t('live.octaveUp')" @click="octaveUp">+</button>
      </div>

      <div class="modes">
        <button
          v-for="m in modes"
          :key="m"
          class="mode-btn mono"
          :class="{ on: playMode === m }"
          @click="setMode(m)"
        >
          {{ t(`live.mode.${m}`) }}
        </button>
      </div>

      <label class="labels-toggle mono">
        <input v-model="showLabels" type="checkbox" />
        {{ t('live.showLabels') }}
      </label>

      <PitchBend class="bend" />
      <ModWheel class="mod" />
    </div>

    <Piano
      :start-octave="startOctave"
      :octave-count="octaveCount"
      :show-labels="showLabels"
      @press="onPianoPress"
      @release="onPianoRelease"
    />
  </section>
</template>

<style scoped>
.live {
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
  color: var(--accent-primary);
}
.toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid var(--border);
}
.oct {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}
.oct-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-weight: 700;
  font-size: 1rem;
  line-height: 1;
}
.oct-label {
  min-width: 18px;
  text-align: center;
  color: var(--accent-primary);
  font-weight: 700;
}
.modes {
  display: inline-flex;
  gap: 0.3rem;
}
.mode-btn {
  font-size: 0.7rem;
  padding: 0.35rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mode-btn.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.labels-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.bend {
  flex: 1;
  min-width: 140px;
  max-width: 240px;
}
.mod {
  flex-shrink: 0;
}
</style>
