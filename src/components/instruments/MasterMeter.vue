<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useAudio } from '@/composables/useAudio'

// Master output meter — peak + RMS bars driven by the master
// waveform analyser. Universal DAW expectation: the user wants to
// SEE how hot the mix is and whether it's clipping the limiter
// before they bake the export. Two bars (peak + RMS) at ~30Hz, with
// a clip indicator that latches red for 800ms when the peak
// crosses -1 dB so a single transient is visible even if the next
// frame drops back into the safe range.
//
// We tap getMasterAnalyser() which is configured as a 1024-sample
// time-domain analyser — same data the existing waveform
// visualiser reads, so this component adds zero new analyser
// nodes (the analyser was always running) and zero new audio-
// thread work.

const { getMasterAnalyser } = useAudio()

const peakDb = ref(-80)
const rmsDb = ref(-80)
const clipping = ref(false)

let raf = 0
let clipUntil = 0
// Smooth the bars on decay so a single fast transient doesn't make
// them flash unreadably; rise is instant so the meter responds
// faithfully to any peak. Same approach hardware peak meters use.
let smoothedPeak = -80
let smoothedRms = -80
const PEAK_DECAY_DB_PER_FRAME = 1.5
const RMS_DECAY_DB_PER_FRAME = 0.8

function tick() {
  const analyser = getMasterAnalyser()
  if (!analyser) {
    raf = requestAnimationFrame(tick)
    return
  }
  // Tone.Analyser.getValue() returns Float32Array for the waveform
  // analyser type; values are in [-1, 1] like a normal time-domain
  // signal.
  const values = analyser.getValue() as Float32Array
  let peak = 0
  let sumSq = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    const abs = Math.abs(v)
    if (abs > peak) peak = abs
    sumSq += v * v
  }
  const rms = Math.sqrt(sumSq / values.length)
  const peakDbInst = peak > 0 ? 20 * Math.log10(peak) : -80
  const rmsDbInst = rms > 0 ? 20 * Math.log10(rms) : -80

  // Instant rise, smooth decay.
  smoothedPeak = Math.max(peakDbInst, smoothedPeak - PEAK_DECAY_DB_PER_FRAME)
  smoothedRms = Math.max(rmsDbInst, smoothedRms - RMS_DECAY_DB_PER_FRAME)
  peakDb.value = smoothedPeak
  rmsDb.value = smoothedRms

  // Clip latch — anything within 1 dB of full-scale lights the
  // indicator and holds it for 800ms.
  if (peakDbInst >= -1) clipUntil = performance.now() + 800
  clipping.value = performance.now() < clipUntil

  raf = requestAnimationFrame(tick)
}

onMounted(() => {
  // Defer one frame so the analyser has time to be wired into the
  // master chain on first instrument load (the analyser is built in
  // ensureMaster() which runs on first instrument touch).
  raf = requestAnimationFrame(tick)
})

onBeforeUnmount(() => {
  if (raf) cancelAnimationFrame(raf)
})

// Map dB to a 0-100% bar height. Range -60 to 0 dB; below -60 reads
// as silence (bar empty), 0 dB pins the bar at full. The mapping is
// linear in dB which matches how the ear perceives loudness changes.
function dbToPct(db: number): number {
  if (db <= -60) return 0
  if (db >= 0) return 100
  return ((db + 60) / 60) * 100
}
</script>

<template>
  <div class="meter" :class="{ clipping }">
    <div class="bars">
      <div class="bar-track">
        <div class="bar peak" :style="{ height: dbToPct(peakDb) + '%' }" />
      </div>
      <div class="bar-track">
        <div class="bar rms" :style="{ height: dbToPct(rmsDb) + '%' }" />
      </div>
    </div>
    <div class="labels mono">
      <span class="lbl">PK</span>
      <span class="lbl">RMS</span>
    </div>
    <span class="db mono">
      {{ peakDb > -60 ? Math.round(peakDb) : '−∞' }} dB
    </span>
  </div>
</template>

<style scoped>
.meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  position: relative;
  width: 56px;
  transition: border-color var(--transition-fast);
}
.meter.clipping {
  border-color: #ff3b3b;
  box-shadow: 0 0 8px rgba(255, 59, 59, 0.6);
}
.bars {
  display: flex;
  gap: 4px;
  width: 100%;
  justify-content: center;
}
.bar-track {
  position: relative;
  width: 12px;
  height: 100px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  /* Three-stop gradient — green / amber / red — so the ear's
     loudness map matches what the eye sees: amber kicks in around
     -12 dB (typical mix headroom target) and red dominates the top
     6 dB where the limiter starts working hard. */
  background: linear-gradient(
    to top,
    #5be09a 0%,
    #5be09a 60%,
    #f6c560 80%,
    #ff3b3b 95%
  );
  transition: height 35ms linear;
}
.bar.rms { opacity: 0.85; }
.labels {
  display: flex;
  gap: 4px;
  width: 100%;
  justify-content: center;
}
.lbl {
  width: 12px;
  font-size: 0.5rem;
  text-align: center;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.db {
  font-size: 0.6rem;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.meter.clipping .db { color: #ff3b3b; font-weight: 700; }
</style>
