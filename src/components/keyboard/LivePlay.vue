<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLivePlay, type PlayMode } from '@/composables/useLivePlay'
import { useAudioStore } from '@/stores/audio'
import { useArrange } from '@/composables/useArrange'
import { useToast } from '@/composables/useToast'
import Piano from './Piano.vue'
import DrumPad from './DrumPad.vue'
import GuitarPad from './GuitarPad.vue'
import PitchBend from './PitchBend.vue'
import ModWheel from './ModWheel.vue'

const audioStore = useAudioStore()
const {
  startOctave,
  octaveCount,
  showLabels,
  playMode,
  isRecordingLive,
  liveTakeEvents,
  press,
  release,
  octaveUp,
  octaveDown,
  startLiveTake,
  stopLiveTake,
  clearLiveTake,
} = useLivePlay()
const { addLiveTakeToTimeline } = useArrange()
const { show } = useToast()
const { t } = useI18n()

// Local state for the post-stop "review" view: the user just hit Stop and
// can either drop the take onto the timeline (give it a name first) or
// throw it away and re-record. Clears when either button is pressed or
// when the user starts a new take.
const reviewing = ref<{ events: ReturnType<typeof stopLiveTake>['events']; durationSec: number } | null>(null)
const takeName = ref<string>('')

function toggleRecord() {
  if (isRecordingLive.value) {
    const result = stopLiveTake()
    if (result.events.length === 0) {
      show({ type: 'info', title: t('liveTake.empty'), duration: 1800 })
      reviewing.value = null
      return
    }
    reviewing.value = result
    takeName.value = `Live take ${new Date().toLocaleTimeString()}`
    return
  }
  reviewing.value = null
  startLiveTake()
  show({ type: 'info', title: t('liveTake.armed'), duration: 1800 })
}

function dropOntoTimeline() {
  if (!reviewing.value) return
  const result = addLiveTakeToTimeline(
    reviewing.value.events,
    reviewing.value.durationSec,
    takeName.value.trim() || `Live take`,
  )
  if (result.ok) {
    show({
      type: 'success',
      title: t('liveTake.added', { count: reviewing.value.events.length }),
      duration: 2200,
    })
    reviewing.value = null
    clearLiveTake()
  }
}

function discardTake() {
  reviewing.value = null
  clearLiveTake()
}

const layout = computed<'piano' | 'drums' | 'guitar'>(() => {
  const id = audioStore.activeInstrument
  if (id === 'drums') return 'drums'
  if (id === 'guitar') return 'guitar'
  return 'piano'
})

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
      <h3>{{ t(`live.heading.${layout}`) }}</h3>
      <span v-if="layout === 'piano'" class="hint mono">{{ octaveRange }}</span>
      <div class="take-bar">
        <button
          class="rec-take"
          :class="{ live: isRecordingLive }"
          :title="isRecordingLive ? t('liveTake.stopHint') : t('liveTake.startHint')"
          @click="toggleRecord"
        >
          <span class="rec-take-dot" />
          {{ isRecordingLive ? t('liveTake.stop', { n: liveTakeEvents.length }) : t('liveTake.record') }}
        </button>
        <Transition name="fade">
          <div v-if="reviewing" class="review-bar">
            <span class="review-count mono">
              {{ t('liveTake.captured', { n: reviewing.events.length, dur: reviewing.durationSec.toFixed(1) }) }}
            </span>
            <input
              v-model="takeName"
              class="take-name mono"
              :placeholder="t('liveTake.namePlaceholder')"
              @keydown.enter="dropOntoTimeline"
            />
            <button class="add-take" @click="dropOntoTimeline">
              🎬 {{ t('liveTake.addToTimeline') }}
            </button>
            <button class="discard-take" @click="discardTake">×</button>
          </div>
        </Transition>
      </div>
    </header>

    <div v-if="layout === 'piano'" class="toolbar">
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

      <button
        class="notation-btn mono"
        :title="t('guitar.notationHint')"
        @click="audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')"
      >
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>

      <PitchBend class="bend" />
      <ModWheel class="mod" />
    </div>

    <DrumPad v-if="layout === 'drums'" />
    <GuitarPad v-else-if="layout === 'guitar'" />
    <Piano
      v-else
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
.take-bar {
  margin-inline-start: auto;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.rec-take {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.72rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-family: var(--font-mono);
  background: transparent;
  border: 1px solid var(--accent-secondary);
  color: var(--accent-secondary);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.rec-take:hover { background: rgba(255, 0, 110, 0.12); }
.rec-take.live {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  animation: rec-pulse 1.4s ease-in-out infinite;
}
.rec-take-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
}
@keyframes rec-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 110, 0.55); }
  50% { box-shadow: 0 0 0 7px rgba(255, 0, 110, 0); }
}

.review-bar {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  flex-wrap: wrap;
  max-width: 100%;
}
.review-count {
  font-size: 0.65rem;
  color: var(--accent-primary);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.take-name {
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  padding: 0.3rem 0.55rem;
  font-size: 0.75rem;
  min-width: 140px;
  outline: none;
}
.take-name:focus { border-color: var(--accent-primary); }
.add-take {
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  padding: 0.35rem 0.7rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-family: var(--font-mono);
}
.add-take:hover { box-shadow: 0 4px 14px var(--accent-glow); }
.discard-take {
  width: 24px;
  height: 24px;
  padding: 0;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: 50%;
  cursor: pointer;
  font-size: 0.85rem;
}
.discard-take:hover {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  border-color: var(--accent-secondary);
}
.fade-enter-active, .fade-leave-active { transition: opacity var(--transition-fast); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
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
.notation-btn {
  font-size: 0.7rem;
  padding: 0.4rem 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.bend {
  flex: 1;
  min-width: 140px;
  max-width: 240px;
}
.mod {
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .live { padding: 0.7rem; }
  .toolbar { gap: 0.6rem; margin-bottom: 0.6rem; padding-bottom: 0.6rem; }
  .mode-btn { padding: 0.3rem 0.55rem; font-size: 0.65rem; }
  .notation-btn { padding: 0.32rem 0.6rem; font-size: 0.65rem; }
  .labels-toggle { font-size: 0.7rem; }
}

/* Portrait phones — drop the bend/mod expressive controls to keep the toolbar tight
   above the now-vertical keyboard. They remain available in landscape. */
@media (orientation: portrait) and (max-width: 720px) {
  .bend, .mod { display: none; }
}
</style>
