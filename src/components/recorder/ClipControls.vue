<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecorderStore } from '@/stores/recorder'
import { useRecorder } from '@/composables/useRecorder'
import { useMultiplayer } from '@/composables/useMultiplayer'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useToast } from '@/composables/useToast'
import { KEY_NAMES, type Scale, type Key, type PitchResult } from '@/lib/pitch'
import type { Clip } from '@/lib/types'

const props = defineProps<{ clip: Clip }>()
const store = useRecorderStore()
const mpStore = useMultiplayerStore()
const {
  normalize,
  detectClipBpm,
  detectClipPitch,
  tuneClipToKeyNow,
  exportClipWav,
  saveToCloud,
  playClip,
  stopPlayback,
} = useRecorder()
const { shareClip } = useMultiplayer()
const { show, update } = useToast()
const { t } = useI18n()
const saveStatus = ref('')

async function onShareToRoom(clipId: string) {
  await shareClip(clipId)
}

// Vocal Tuning UI state. detectedPitch is the live readout shown next to
// the Tune button so the user can see "we hear D♯4 ± 12¢" before they
// commit. We re-detect lazily on demand (clicking the Detect button) rather
// than on every clip change because YIN is ~10 ms on a 4 k window and we
// don't want to run it during scrubbing.
const SCALES: Scale[] = ['major', 'minor', 'pentatonic', 'minor-pent', 'blues', 'dorian', 'chromatic']
const detectedPitch = ref<PitchResult | null>(null)
const tuneStatus = ref('')

const centsLabel = computed(() => {
  if (!detectedPitch.value) return ''
  const c = detectedPitch.value.cents
  return c >= 0 ? `+${c}¢` : `${c}¢`
})

function onDetectPitch() {
  detectedPitch.value = detectClipPitch(props.clip.id)
  if (!detectedPitch.value) {
    tuneStatus.value = t('recorder.tune.noPitch')
    setTimeout(() => (tuneStatus.value = ''), 2500)
  }
}

function onTune() {
  const result = tuneClipToKeyNow(props.clip.id, store.songKey as Key, store.songScale as Scale)
  if (!result) {
    tuneStatus.value = t('recorder.tune.noPitch')
    setTimeout(() => (tuneStatus.value = ''), 2500)
    return
  }
  detectedPitch.value = result.detected
  tuneStatus.value = t('recorder.tune.applied', {
    from: result.detected.noteName,
    to: result.target.noteName,
    semitones: result.semitones >= 0 ? `+${result.semitones}` : `${result.semitones}`,
  })
  setTimeout(() => (tuneStatus.value = ''), 4000)
}

async function onSave(clipId: string) {
  const toastId = show({
    type: 'loading',
    title: t('recorder.cloudUploading'),
  })
  const result = await saveToCloud(clipId)
  saveStatus.value = result.message
  update(toastId, {
    type: result.ok ? 'success' : 'error',
    title: result.message,
    duration: result.ok ? 1800 : 3500,
  })
  setTimeout(() => (saveStatus.value = ''), 3000)
}

function patch(clipId: string, key: keyof Clip, value: Clip[keyof Clip]) {
  store.patchClip(clipId, { [key]: value } as Partial<Clip>)
}
</script>

<template>
  <div class="controls">
    <div class="row">
      <button class="btn" @click="store.isPlaying ? stopPlayback() : playClip(clip.id)">
        {{ store.isPlaying && store.activeClipId === clip.id ? t('recorder.stop') : t('recorder.play') }}
      </button>
      <input
        :value="clip.name"
        class="name-input"
        @input="patch(clip.id, 'name', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="grid">
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.pitch') }} {{ clip.pitchSemitones }}st</span>
        <input
          type="range" min="-12" max="12" step="1"
          :value="clip.pitchSemitones"
          @input="patch(clip.id, 'pitchSemitones', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.speed') }} {{ clip.speed.toFixed(2) }}×</span>
        <input
          type="range" min="0.5" max="2" step="0.05"
          :value="clip.speed"
          @input="patch(clip.id, 'speed', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.fadeIn') }} {{ clip.fadeIn.toFixed(2) }}s</span>
        <input
          type="range" min="0" max="2" step="0.05"
          :value="clip.fadeIn"
          @input="patch(clip.id, 'fadeIn', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.fadeOut') }} {{ clip.fadeOut.toFixed(2) }}s</span>
        <input
          type="range" min="0" max="2" step="0.05"
          :value="clip.fadeOut"
          @input="patch(clip.id, 'fadeOut', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <div class="row toggles">
      <button class="toggle" :class="{ on: clip.reverse }" @click="patch(clip.id, 'reverse', !clip.reverse)">
        {{ t('recorder.reverse') }}
      </button>
      <button class="toggle" :class="{ on: clip.loop }" @click="patch(clip.id, 'loop', !clip.loop)">
        {{ t('recorder.loop') }}
      </button>
      <button class="action" @click="normalize(clip.id)">{{ t('recorder.normalize') }}</button>
      <button class="action" @click="detectClipBpm(clip.id)">
        {{ t('recorder.detectBpm') }}<span v-if="clip.bpm" class="bpm-pill">{{ clip.bpm }}</span>
      </button>
      <button class="action" @click="exportClipWav(clip.id)">{{ t('recorder.exportWav') }}</button>
      <button class="action" @click="onSave(clip.id)">{{ t('recorder.saveCloud') }}</button>
      <button
        v-if="mpStore.isConnected"
        class="action share-room"
        :title="t('recorder.shareToRoomTooltip')"
        @click="onShareToRoom(clip.id)"
      >🎤 {{ t('recorder.shareToRoom') }}</button>
      <span v-if="saveStatus" class="status">{{ saveStatus }}</span>
    </div>

    <div class="tune-block">
      <div class="tune-head">
        <span class="tune-title mono">{{ t('recorder.tune.title') }}</span>
        <span class="tune-sub mono">{{ t('recorder.tune.subtitle') }}</span>
      </div>
      <div class="tune-row">
        <label class="tune-field">
          <span class="lbl mono">{{ t('recorder.tune.key') }}</span>
          <select v-model="store.songKey">
            <option v-for="k in KEY_NAMES" :key="k" :value="k">{{ k }}</option>
          </select>
        </label>
        <label class="tune-field">
          <span class="lbl mono">{{ t('recorder.tune.scale') }}</span>
          <select v-model="store.songScale">
            <option v-for="s in SCALES" :key="s" :value="s">{{ t(`recorder.tune.scaleName.${s}`) }}</option>
          </select>
        </label>
        <button class="action" @click="onDetectPitch">{{ t('recorder.tune.detect') }}</button>
        <button class="tune-go" @click="onTune">
          🎤 {{ t('recorder.tune.tuneToKey') }}
        </button>
      </div>
      <p v-if="detectedPitch" class="tune-readout mono">
        {{ t('recorder.tune.detected', {
          note: detectedPitch.noteName,
          cents: centsLabel,
        }) }}
      </p>
      <p v-if="tuneStatus" class="tune-status mono">{{ tuneStatus }}</p>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.btn {
  padding: 0.6rem 1.2rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
}
.btn:hover {
  opacity: 0.9;
}
.name-input {
  flex: 1;
  min-width: 200px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.6rem;
}
.ctl {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ctl input[type='range'] {
  width: 100%;
  appearance: none;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  border: 1px solid var(--border);
  padding: 0;
}
.ctl input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.toggles {
  flex-wrap: wrap;
}
.toggle, .action {
  font-size: 0.75rem;
  padding: 0.4rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-mono);
}
.toggle.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.share-room {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
}
.share-room:hover {
  background: var(--accent-secondary);
  color: var(--text-inverse);
}
.bpm-pill {
  margin-inline-start: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-size: 0.7rem;
}
.status {
  font-size: 0.75rem;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}
.tune-block {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.75rem 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
}
.tune-block::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, var(--accent-glow), transparent 60%);
  opacity: 0.18;
  pointer-events: none;
}
.tune-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  position: relative;
}
.tune-title {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-primary);
  font-weight: 700;
}
.tune-sub {
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.tune-row {
  display: flex;
  align-items: end;
  gap: 0.5rem;
  flex-wrap: wrap;
  position: relative;
}
.tune-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 90px;
}
.tune-field select {
  padding: 0.4rem 0.6rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  font-size: 0.78rem;
}
.tune-go {
  padding: 0.55rem 1rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  font-weight: 700;
  font-size: 0.8rem;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.tune-go:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
}
.tune-readout {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent-primary);
  position: relative;
}
.tune-status {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent-secondary);
  position: relative;
}
</style>
