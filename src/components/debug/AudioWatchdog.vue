<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAudioWatchdog } from '@/composables/useAudioWatchdog'

// Live audio fault monitor. Opt in with ?watchdog=1 (mirrors the
// ?debug=1 convention) OR toggle with the floating AUDIT button it
// shows when that param is present. It auto-starts when summoned so a
// tester just plays normally — fast runs, chords, instrument switches —
// and every wshhh / dropout / stall is captured with the exact metrics
// that tripped it. "Copy report" puts the full JSON on the clipboard.

const { running, live, events, counts, start, stop, clear, buildReport } =
  useAudioWatchdog()

const visible = ref(false)
const expanded = ref(true)
const copied = ref(false)

const isWatchdogQuery = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('watchdog')

onMounted(() => {
  if (isWatchdogQuery()) {
    visible.value = true
    start()
  }
})

function toggleRun() {
  if (running.value) stop()
  else start()
}

async function copyReport() {
  const text = buildReport()
  let ok = false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    /* fall through */
  }
  if (!ok) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); ok = true } catch { /* nothing else */ }
    document.body.removeChild(ta)
  }
  if (ok) {
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  }
}

// Level meter widths (0..1 → %). rms is quiet by nature so scale it up
// for the bar; peak is shown raw.
const rmsPct = computed(() => Math.min(100, (live.value?.rms ?? 0) * 350))
const peakPct = computed(() => Math.min(100, (live.value?.peak ?? 0) * 100))
const flatPct = computed(() => Math.min(100, (live.value?.flatness ?? 0) * 100))

const ctxBad = computed(() => live.value && live.value.ctxState !== 'running')
const flatBad = computed(() => (live.value?.flatness ?? 0) > 0.5 && (live.value?.rms ?? 0) > 0.02)
const gapBad = computed(() => (live.value?.frameGapMs ?? 0) > 120)

function evClass(type: string) {
  if (type === 'WSHHH' || type === 'DROPOUT' || type === 'CLIP') return 'crit'
  if (type === 'STALL' || type === 'CTX' || type === 'ERROR') return 'warn'
  return 'info'
}
const recent = computed(() => events.value.slice(-40).reverse())
function atSec(t: number) {
  // Relative seconds are in the report; here just show a short clock.
  const d = new Date()
  void t
  return d.toLocaleTimeString(undefined, { hour12: false })
}
</script>

<template>
  <div v-if="visible" class="wd" :class="{ collapsed: !expanded }">
    <div class="head">
      <span class="ttl mono">AUDIT</span>
      <span class="run mono" :class="{ on: running }">{{ running ? '● REC' : '○ idle' }}</span>
      <button type="button" class="b mono" @click="toggleRun">{{ running ? 'stop' : 'start' }}</button>
      <button type="button" class="b mono" @click="copyReport">{{ copied ? '✓' : 'copy' }}</button>
      <button type="button" class="b mono" @click="clear">clr</button>
      <button type="button" class="b mono" @click="expanded = !expanded">{{ expanded ? '−' : '+' }}</button>
      <button type="button" class="b mono" @click="visible = false">×</button>
    </div>

    <div v-if="expanded" class="body">
      <div v-if="live" class="meters">
        <div class="m">
          <span class="k mono">ctx</span>
          <span class="v mono" :class="{ bad: ctxBad }">{{ live.ctxState }}</span>
          <span class="k mono">voices</span>
          <span class="v mono">{{ live.voices }}</span>
          <span class="k mono">gap</span>
          <span class="v mono" :class="{ bad: gapBad }">{{ Math.round(live.frameGapMs) }}ms</span>
        </div>
        <div class="bar-row">
          <span class="bk mono">rms</span>
          <div class="bar"><i :style="{ width: rmsPct + '%' }" /></div>
        </div>
        <div class="bar-row">
          <span class="bk mono">peak</span>
          <div class="bar"><i class="peak" :style="{ width: peakPct + '%' }" /></div>
        </div>
        <div class="bar-row">
          <span class="bk mono">flat</span>
          <div class="bar"><i class="flat" :class="{ bad: flatBad }" :style="{ width: flatPct + '%' }" /></div>
        </div>
      </div>

      <div class="tally mono">
        <span class="crit">W{{ counts.WSHHH }}</span>
        <span class="crit">D{{ counts.DROPOUT }}</span>
        <span class="crit">C{{ counts.CLIP }}</span>
        <span class="warn">S{{ counts.STALL }}</span>
        <span class="warn">X{{ counts.CTX }}</span>
        <span class="warn">E{{ counts.ERROR }}</span>
      </div>

      <div class="log">
        <div v-if="recent.length === 0" class="empty mono">
          no faults yet — play fast / chords / switch instruments
        </div>
        <div
          v-for="(e, i) in recent"
          :key="e.t + '-' + i"
          class="ev mono"
          :class="evClass(e.type)"
        >
          <span class="et">{{ e.type }}</span>
          <span class="ed">{{ e.detail }}</span>
          <span class="em">{{ atSec(e.t) }}</span>
        </div>
      </div>
    </div>
  </div>

  <button
    v-else-if="isWatchdogQuery()"
    type="button"
    class="summon mono"
    @click="visible = true"
  >AUDIT</button>
</template>

<style scoped>
.wd {
  position: fixed;
  bottom: max(8px, env(safe-area-inset-bottom));
  left: max(8px, env(safe-area-inset-left));
  z-index: 10000;
  width: 320px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: rgba(8, 8, 16, 0.94);
  color: #d8d8e8;
  border: 1px solid #4a4a6a;
  border-radius: 6px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  font-size: 0.7rem;
}
.wd.collapsed { width: auto; }
.head {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.4rem;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid #2a2a3e;
}
.ttl { font-size: 0.62rem; font-weight: 700; letter-spacing: 0.08em; color: #6ad0ff; flex: 1; }
.run { font-size: 0.58rem; color: #6a6a82; }
.run.on { color: #ff5c8a; }
.b {
  font-size: 0.58rem;
  padding: 0.18rem 0.4rem;
  background: #2a2a3e;
  color: #d8d8e8;
  border: 1px solid #4a4a6a;
  border-radius: 3px;
  cursor: pointer;
}
.b:hover { border-color: #6ad0ff; }
.body { padding: 0.4rem 0.45rem 0.5rem; overflow-y: auto; }
.meters { display: flex; flex-direction: column; gap: 0.3rem; }
.m { display: flex; align-items: baseline; gap: 0.35rem; flex-wrap: wrap; }
.k { font-size: 0.54rem; text-transform: uppercase; color: #6a6a82; }
.v { font-size: 0.68rem; }
.v.bad { color: #ff5c8a; font-weight: 700; }
.bar-row { display: flex; align-items: center; gap: 0.4rem; }
.bk { font-size: 0.54rem; color: #6a6a82; min-width: 26px; text-transform: uppercase; }
.bar {
  flex: 1;
  height: 7px;
  background: #1a1a2a;
  border: 1px solid #2a2a3e;
  border-radius: 4px;
  overflow: hidden;
}
.bar i { display: block; height: 100%; background: #6ad0ff; transition: width 60ms linear; }
.bar i.peak { background: #f6c560; }
.bar i.flat { background: #7d7da0; }
.bar i.flat.bad { background: #ff5c8a; }
.tally {
  display: flex;
  gap: 0.45rem;
  padding: 0.35rem 0;
  font-size: 0.6rem;
  border-bottom: 1px dashed #2a2a3e;
  margin-bottom: 0.3rem;
}
.tally .crit { color: #ff5c8a; }
.tally .warn { color: #f6c560; }
.log { display: flex; flex-direction: column; gap: 0.15rem; }
.empty { color: #6a6a82; font-size: 0.6rem; padding: 0.4rem 0; }
.ev {
  display: grid;
  grid-template-columns: 46px 1fr auto;
  gap: 0.35rem;
  font-size: 0.58rem;
  padding: 0.2rem 0.25rem;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.02);
}
.ev .et { font-weight: 700; }
.ev .ed { color: #b8b8cc; word-break: break-word; }
.ev .em { color: #6a6a82; }
.ev.crit .et { color: #ff5c8a; }
.ev.warn .et { color: #f6c560; }
.ev.info .et { color: #6ad0ff; }
.summon {
  position: fixed;
  bottom: max(8px, env(safe-area-inset-bottom));
  left: max(8px, env(safe-area-inset-left));
  z-index: 10000;
  font-size: 0.6rem;
  padding: 0.3rem 0.6rem;
  background: rgba(8, 8, 16, 0.9);
  color: #6ad0ff;
  border: 1px solid #4a4a6a;
  border-radius: 4px;
  cursor: pointer;
}
</style>
