<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useMultiplayerStore } from '@/stores/multiplayer'

// Real-device QA aid. Hidden by default; opt in via the `?debug=1` URL
// param OR by tapping the screen 4× in <600 ms (so a tester on a phone
// can summon it without typing). Polls the engine's diagnostic snapshot
// at 4 Hz — frequent enough to see a stuck note linger, slow enough not
// to perceptibly compete with the audio worklet for cycles.
//
// Reads ONLY observed state. Mutating from here is intentionally not
// supported; if you need to clear a stuck note, use the panic button
// the audio engine already exposes.

const { getEngineDiagnostics, panic } = useAudio()
const audioStore = useAudioStore()
const mpStore = useMultiplayerStore()

const visible = ref(false)
const expanded = ref(true)
let pollTimer: ReturnType<typeof setInterval> | null = null
const diag = ref<ReturnType<typeof getEngineDiagnostics> | null>(null)

const isDebugQuery = () =>
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('debug')

// Tap-to-summon — 4 taps in 600 ms anywhere on the page.
const tapTimes: number[] = []
function onWindowPointer() {
  const now = performance.now()
  tapTimes.push(now)
  while (tapTimes.length > 0 && now - tapTimes[0] > 600) tapTimes.shift()
  if (tapTimes.length >= 4) {
    visible.value = !visible.value
    tapTimes.length = 0
  }
}

function tick() {
  if (!visible.value) return
  diag.value = getEngineDiagnostics()
}

onMounted(() => {
  if (isDebugQuery()) visible.value = true
  pollTimer = setInterval(tick, 250)
  window.addEventListener('pointerdown', onWindowPointer, { passive: true })
})

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer)
  window.removeEventListener('pointerdown', onWindowPointer)
})

// Per-instrument load state straight off the audio store. Filter to
// instruments the engine has touched so the overlay isn't a wall of
// "idle" rows for every preset the user never opened.
const loadStateRows = computed(() => {
  const map = audioStore.loadState as Record<string, string>
  return Object.entries(map)
    .filter(([, state]) => state && state !== 'idle')
    .sort(([a], [b]) => a.localeCompare(b))
})

const polyClass = computed(() => {
  if (!diag.value) return ''
  const { active, limit } = diag.value.polyphony
  if (active >= limit) return 'crit'
  if (active >= limit * 0.75) return 'warn'
  return ''
})

const ctxClass = computed(() => {
  if (!diag.value) return ''
  return diag.value.audioContextState === 'running' ? '' : 'warn'
})

const olderThanSec = (ts: number) =>
  ((performance.now() - ts) / 1000).toFixed(1)
</script>

<template>
  <div v-if="visible" class="dbg" :class="{ collapsed: !expanded }">
    <div class="head">
      <span class="ttl mono">DEBUG</span>
      <button type="button" class="btn mono" @click="panic">PANIC</button>
      <button type="button" class="btn mono" @click="expanded = !expanded">
        {{ expanded ? '−' : '+' }}
      </button>
      <button type="button" class="btn mono" @click="visible = false">×</button>
    </div>

    <div v-if="expanded && diag" class="body">
      <div class="row">
        <span class="k mono">ctx</span>
        <span class="v mono" :class="ctxClass">
          {{ diag.audioContextState }} · {{ diag.sampleRate }} Hz
        </span>
      </div>
      <div class="row">
        <span class="k mono">poly</span>
        <span class="v mono" :class="polyClass">
          {{ diag.polyphony.active }} / {{ diag.polyphony.limit }}
          <span class="muted">{{ diag.polyphony.isMobile ? '(mobile)' : '(desktop)' }}</span>
        </span>
      </div>
      <div class="row">
        <span class="k mono">room</span>
        <span class="v mono">
          <span v-if="mpStore.isConnected">
            {{ mpStore.roomCode }} · {{ mpStore.players.length }}p
          </span>
          <span v-else class="muted">offline</span>
        </span>
      </div>
      <div v-if="diag.activeNotes.length > 0" class="block">
        <div class="block-h mono">active notes</div>
        <div
          v-for="n in diag.activeNotes"
          :key="n.instrumentId + n.note + n.startedAt"
          class="note mono"
        >
          {{ n.instrumentId }}:{{ n.note }}
          <span class="muted">{{ olderThanSec(n.startedAt) }}s</span>
        </div>
      </div>
      <div v-if="loadStateRows.length > 0" class="block">
        <div class="block-h mono">instruments</div>
        <div v-for="[id, state] in loadStateRows" :key="id" class="note mono">
          {{ id }}
          <span class="muted">{{ state }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dbg {
  position: fixed;
  bottom: 8px;
  right: 8px;
  z-index: 9999;
  width: 240px;
  max-height: 60vh;
  overflow-y: auto;
  background: rgba(8, 8, 16, 0.92);
  color: #d8d8e8;
  border: 1px solid #4a4a6a;
  border-radius: 6px;
  font-size: 0.7rem;
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.55);
  pointer-events: auto;
  /* Pin to safe area so it doesn't disappear under iOS notches. */
  bottom: max(8px, env(safe-area-inset-bottom));
  right: max(8px, env(safe-area-inset-right));
}
.dbg.collapsed { width: auto; }
.head {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.45rem;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid #2a2a3e;
}
.ttl {
  font-size: 0.65rem;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: #9d8bff;
  flex: 1;
}
.btn {
  font-size: 0.6rem;
  padding: 0.2rem 0.45rem;
  background: #2a2a3e;
  color: #d8d8e8;
  border: 1px solid #4a4a6a;
  border-radius: 3px;
  cursor: pointer;
}
.btn:hover { border-color: #9d8bff; }
.body {
  padding: 0.4rem 0.5rem 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.row { display: flex; gap: 0.4rem; align-items: baseline; }
.k {
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6a6a82;
  min-width: 32px;
}
.v { font-size: 0.7rem; }
.v.warn { color: #f6c560; }
.v.crit { color: #ff5c8a; font-weight: 700; }
.muted { color: #6a6a82; font-size: 0.62rem; margin-inline-start: 0.25rem; }
.block { margin-top: 0.25rem; }
.block-h {
  font-size: 0.55rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6a6a82;
  padding-bottom: 0.15rem;
  border-bottom: 1px dashed #2a2a3e;
  margin-bottom: 0.2rem;
}
.note {
  font-size: 0.65rem;
  display: flex;
  justify-content: space-between;
  padding: 0.1rem 0;
}
</style>
