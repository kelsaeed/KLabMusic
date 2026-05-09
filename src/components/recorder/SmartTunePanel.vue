<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecorderStore, type MaqamTuneId } from '@/stores/recorder'
import { useRecorder } from '@/composables/useRecorder'
import { useToast } from '@/composables/useToast'
import { MAQAM_PRESETS } from '@/lib/microtonal'
import type { KeyDetectionResult } from '@/lib/keyDetection'

// Mirrors the order in ClipControls' tune row so the user sees the
// same maqam labels in the same order in both places.
const MAQAM_IDS: MaqamTuneId[] = [
  'rast', 'bayati', 'hijaz', 'saba', 'sika', 'nahawand', 'kurd', 'ajam',
]

// Smart Tune — one-click vocal tuning for every recorded clip.
// 1. Detect Song Key runs the chromagram + Krumhansl-Kessler matcher
//    across every clip and reports the most likely key + scale +
//    confidence score.
// 2. Tune Everything snaps each clip's pitch to the nearest scale tone
//    in that key, in one shot. Reuses the per-clip vocal-tuning path,
//    so a track the user already hand-tuned still ends up correct
//    (the function ADDS the new correction on top of existing
//    pitchSemitones rather than overwriting).

const store = useRecorderStore()
const { detectSongKey, tuneAllClipsToKey } = useRecorder()
const { show } = useToast()
const { t } = useI18n()

const detection = ref<KeyDetectionResult | null>(null)
const detecting = ref(false)
const tuning = ref(false)

const confidenceLabel = computed(() => {
  if (!detection.value) return ''
  const c = detection.value.confidence
  if (c >= 0.7) return t('smartTune.confidenceHigh')
  if (c >= 0.45) return t('smartTune.confidenceMedium')
  return t('smartTune.confidenceLow')
})

async function onDetect() {
  if (store.clips.length === 0) {
    show({ type: 'info', title: t('smartTune.noClips'), duration: 2000 })
    return
  }
  detecting.value = true
  // YIN over the entire clip library is CPU-bound. Yield once via a
  // microtask so the UI gets to paint the "Detecting…" spinner before we
  // block the main thread for 100-500 ms on a large library.
  await new Promise((r) => setTimeout(r, 0))
  try {
    detection.value = detectSongKey()
    if (!detection.value) {
      show({ type: 'error', title: t('smartTune.couldNotDetect'), duration: 2500 })
    }
  } finally {
    detecting.value = false
  }
}

async function onTuneAll() {
  if (!detection.value) return
  tuning.value = true
  await new Promise((r) => setTimeout(r, 0))
  try {
    // Forward the user's maqam override (if any) so a Smart Tune bulk
    // pass uses the same target as the per-clip tune row. Without this,
    // ClipControls would tune one clip to Hijaz on D and Smart Tune
    // would tune everything else to Western major — a confusing mix.
    // When the user has accepted the maqam suggestion via onPickMaqam,
    // store.songMaqam is set and the recorder pipeline takes the maqam
    // path with fractional-cents intervals.
    const { tuned, skipped } = tuneAllClipsToKey(
      detection.value.key,
      detection.value.scale,
      store.songMaqam,
    )
    show({
      type: 'success',
      title: t('smartTune.tunedSummary', { tuned, skipped }),
      duration: 3000,
    })
  } finally {
    tuning.value = false
  }
}

/**
 * One-tap accept of the detected maqam. We persist both the maqam id
 * AND the maqam's tonic onto the recorder store so a subsequent bulk
 * tune-all targets the maqam's canonical key (Bayati on D, Hijaz on D,
 * Rast on C…) instead of whatever Western key the major/minor matcher
 * happened to land on. Tapping a second time toggles back to "none".
 */
function onPickMaqam() {
  if (!detection.value?.maqam) return
  const m = detection.value.maqam
  if (store.songMaqam === m.maqamId) {
    store.songMaqam = null
    return
  }
  store.songMaqam = m.maqamId
  // The recorder pipeline reads songKey separately for non-maqam paths;
  // overriding it to the maqam tonic keeps the displayed key + the
  // active tune target consistent if the user later switches off the
  // maqam without re-running detection.
  store.songKey = m.tonic
}

const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const chromaBars = computed(() => {
  if (!detection.value) return []
  const max = Math.max(...detection.value.chromagram, 0.01)
  return detection.value.chromagram.map((v, i) => ({
    name: PITCH_NAMES[i],
    height: (v / max) * 100,
  }))
})
</script>

<template>
  <div class="smart">
    <header class="head">
      <span class="title mono">{{ t('smartTune.title') }}</span>
      <span class="sub mono">{{ t('smartTune.subtitle') }}</span>
    </header>

    <div class="row">
      <button
        class="detect-btn mono"
        :disabled="detecting || store.clips.length === 0"
        @click="onDetect"
      >
        {{ detecting ? t('smartTune.detecting') : t('smartTune.detectKey') }}
      </button>
      <label class="maqam-pick mono">
        <span class="maqam-pick-lbl">{{ t('recorder.tune.maqam') }}</span>
        <select v-model="store.songMaqam" class="maqam-pick-select">
          <option :value="null">{{ t('recorder.tune.maqamNone') }}</option>
          <option v-for="m in MAQAM_IDS" :key="m" :value="m">
            {{ MAQAM_PRESETS[m].name }}
          </option>
        </select>
      </label>
      <span v-if="!detection && store.clips.length === 0" class="hint mono">
        {{ t('smartTune.noClips') }}
      </span>
    </div>

    <div v-if="detection" class="result">
      <div class="result-head">
        <span class="big mono">{{ detection.key }} {{ t(`recorder.tune.scaleName.${detection.scale}`) }}</span>
        <span class="conf mono">
          {{ confidenceLabel }} ({{ Math.round(detection.confidence * 100) }}%)
        </span>
      </div>
      <!-- Maqam suggestion — surfaces whatever maqam the 24-bin matcher
           preferred. Lets the user one-tap switch the bulk-tune target
           from Western major/minor to a maqam shape; the bulk tune call
           below already accepts a maqam id. -->
      <div v-if="detection.maqam && detection.maqam.confidence > 0.2" class="maqam-suggest">
        <span class="maqam-suggest-lbl mono">{{ t('smartTune.maqamMatch') }}</span>
        <button
          type="button"
          class="maqam-suggest-btn mono"
          :class="{ on: store.songMaqam === detection.maqam.maqamId }"
          @click="onPickMaqam"
        >
          {{ detection.maqam.tonic }} {{ MAQAM_PRESETS[detection.maqam.maqamId].name }}
        </button>
        <span class="maqam-suggest-conf mono">
          {{ Math.round(detection.maqam.confidence * 100) }}%
        </span>
      </div>

      <!-- Chromagram visualisation — pitch class histogram. The detected
           key root gets a strong colour so the user can sanity-check the
           result at a glance. -->
      <div class="chroma">
        <div
          v-for="bar in chromaBars"
          :key="bar.name"
          class="bar"
          :class="{ tonic: bar.name.replace('♯', '#') === detection.key }"
          :style="{ height: bar.height + '%' }"
          :title="bar.name"
        >
          <span class="bar-label mono">{{ bar.name }}</span>
        </div>
      </div>

      <button
        class="tune-all mono"
        :disabled="tuning"
        @click="onTuneAll"
      >
        🎤 {{ tuning ? t('smartTune.tuning') : t('smartTune.tuneAll') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.smart {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.8rem 0.9rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  position: relative;
  overflow: hidden;
}
.smart::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(124, 58, 237, 0.18), transparent 60%);
  pointer-events: none;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
  position: relative;
}
.title {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: #a78bfa;
}
.sub {
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
  position: relative;
}
.detect-btn {
  padding: 0.45rem 0.95rem;
  font-size: 0.78rem;
  letter-spacing: 0.05em;
  background: #7c3aed;
  color: #fff;
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.detect-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(124, 58, 237, 0.45);
}
.detect-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.maqam-pick {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  position: relative;
}
.maqam-pick-select {
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.3rem 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.7rem;
}
.maqam-pick-select:focus { outline: none; border-color: #a78bfa; }

.result {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  position: relative;
}
.result-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.big {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  color: #a78bfa;
  letter-spacing: 0.02em;
}
.conf {
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.chroma {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 60px;
  padding: 0.25rem 0;
  border-radius: var(--radius);
  background: var(--bg-base);
  border: 1px solid var(--border);
  padding: 0.4rem 0.45rem 0.5rem;
}
.bar {
  flex: 1;
  position: relative;
  background: rgba(167, 139, 250, 0.5);
  border-radius: 2px;
  min-height: 2px;
  transition: height var(--transition-fast);
}
.bar.tonic {
  background: #a78bfa;
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.55);
}
.bar-label {
  position: absolute;
  top: -14px;
  left: 50%;
  transform: translateX(-50%);
  font-size: 0.55rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.bar.tonic .bar-label { color: #a78bfa; font-weight: 700; }

.tune-all {
  padding: 0.55rem 1rem;
  font-size: 0.82rem;
  letter-spacing: 0.05em;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-weight: 700;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.tune-all:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
}
.tune-all:disabled { opacity: 0.5; cursor: not-allowed; }

.maqam-suggest {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.35rem 0.5rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  flex-wrap: wrap;
  position: relative;
}
.maqam-suggest-lbl {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.maqam-suggest-btn {
  font-size: 0.7rem;
  padding: 0.3rem 0.65rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.maqam-suggest-btn:hover { border-color: #a78bfa; }
.maqam-suggest-btn.on {
  background: #a78bfa;
  border-color: #a78bfa;
  color: var(--text-inverse);
  box-shadow: 0 0 8px rgba(167, 139, 250, 0.55);
}
.maqam-suggest-conf {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin-inline-start: auto;
}
</style>
