<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import * as Tone from 'tone'
import { useRecorderStore } from '@/stores/recorder'
import { useRecorder } from '@/composables/useRecorder'
import { detectPitchHz, frequencyToMidiFloat, midiFloatToPitchResult } from '@/lib/pitch'

// Live pitch readout shown while recording. Reads the SAME MediaStream
// the MediaRecorder is using (via useRecorder.getMicStream) and runs
// YIN at 15 Hz on a 4096-sample window — same algorithm Smart Tune
// uses for clip-level detection, just continuous and lightweight.
//
// Why share the mic stream instead of letting useTuner build its own:
// some mobile browsers don't allow two simultaneous getUserMedia
// streams against the mic, so a fresh stream from the tuner would
// silently break the active recorder stream. Tapping an AnalyserNode
// off the existing stream is free DSP-wise (no extra audio thread
// load) and works on every browser that allows recording at all.
//
// Auto-disables when not recording — no AudioContext nodes are kept
// alive between takes, so this component costs nothing when the
// recorder is idle.

const store = useRecorderStore()
const { getMicStream } = useRecorder()

interface Reading {
  noteName: string
  cents: number
  hz: number
  confident: boolean
}

const reading = ref<Reading | null>(null)
let analyser: AnalyserNode | null = null
let source: MediaStreamAudioSourceNode | null = null
const buffer = new Float32Array(4096)
let tickHandle: number | null = null

function teardown() {
  if (tickHandle !== null) {
    clearTimeout(tickHandle)
    tickHandle = null
  }
  try { analyser?.disconnect() } catch { /* idem */ }
  try { source?.disconnect() } catch { /* idem */ }
  analyser = null
  source = null
  reading.value = null
}

function setup(stream: MediaStream) {
  teardown()
  const ctx = Tone.getContext().rawContext as AudioContext
  source = ctx.createMediaStreamSource(stream)
  analyser = ctx.createAnalyser()
  analyser.fftSize = 4096
  analyser.smoothingTimeConstant = 0
  source.connect(analyser)
  tick()
}

function tick() {
  if (!analyser) return
  analyser.getFloatTimeDomainData(buffer)
  const hz = detectPitchHz(buffer, analyser.context.sampleRate)
  if (hz === null) {
    // Hold the previous reading at reduced confidence rather than
    // clearing — a singer drawing breath shouldn't blank the display.
    reading.value = reading.value ? { ...reading.value, confident: false } : null
  } else {
    const midi = frequencyToMidiFloat(hz)
    const r = midiFloatToPitchResult(midi)
    reading.value = {
      noteName: r.noteName,
      cents: r.cents,
      hz,
      confident: true,
    }
  }
  // 15Hz refresh — fast enough that the user sees their pitch
  // following their voice, slow enough not to compete with the audio
  // thread on mobile. Smart Tune itself uses 30Hz; 15 is plenty
  // for at-a-glance readout while singing.
  tickHandle = window.setTimeout(tick, 66)
}

watch(
  () => store.isRecording,
  (isRec) => {
    if (isRec) {
      const stream = getMicStream()
      // The recorder calls getUserMedia before flipping isRecording
      // to true, so the stream should be available — but it's a
      // promise chain inside startRecording so we still guard.
      if (stream) setup(stream)
    } else {
      teardown()
    }
  },
  { immediate: true },
)

onBeforeUnmount(teardown)

// Visual gauge: needle at -50 ¢ → +50 ¢, centre = in-tune. Same
// shape as the practice-panel tuner but compact for the recorder
// header bar.
const needlePct = computed(() => {
  const r = reading.value
  if (!r) return 50
  const clamped = Math.max(-50, Math.min(50, r.cents))
  return ((clamped + 50) / 100) * 100
})

const inTune = computed(() => {
  const r = reading.value
  return r && r.confident && Math.abs(r.cents) <= 5
})
</script>

<template>
  <div v-if="store.isRecording" class="readout" :class="{ tune: inTune }">
    <div class="note-line">
      <span class="big mono">{{ reading?.noteName ?? '—' }}</span>
      <span v-if="reading" class="cents mono">
        {{ reading.cents > 0 ? '+' : '' }}{{ reading.cents }}¢
      </span>
    </div>
    <div class="needle-track">
      <div class="needle-zero" />
      <div class="needle" :style="{ left: needlePct + '%' }" />
    </div>
  </div>
</template>

<style scoped>
.readout {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.3rem 0.55rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 110px;
  transition: border-color var(--transition-fast);
}
.readout.tune { border-color: #5be09a; box-shadow: 0 0 6px rgba(91, 224, 154, 0.45); }
.note-line {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
}
.big {
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--text-primary);
  min-width: 32px;
  text-align: center;
}
.readout.tune .big { color: #5be09a; }
.cents {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.readout.tune .cents { color: #5be09a; }
.needle-track {
  position: relative;
  height: 8px;
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.needle-zero {
  position: absolute;
  top: 1px;
  bottom: 1px;
  left: 50%;
  width: 1px;
  background: var(--accent-primary);
  opacity: 0.4;
}
.needle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: var(--accent-primary);
  border-radius: 1px;
  transform: translateX(-50%);
  transition: left 60ms ease-out;
  box-shadow: 0 0 4px var(--accent-glow);
}
.readout.tune .needle { background: #5be09a; box-shadow: 0 0 6px rgba(91, 224, 154, 0.6); }
</style>
