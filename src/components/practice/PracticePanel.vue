<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMidi } from '@/composables/useMidi'
import { useMetronome } from '@/composables/useMetronome'
import { useDrone } from '@/composables/useDrone'
import { useTuner } from '@/composables/useTuner'
import { useToast } from '@/composables/useToast'
import { useDirection } from '@/composables/useDirection'

// Practice hub for musicians — collapsible panel that lives in the
// audio stage's sidebar. Holds four tools each musician uses every
// session:
//   • MIDI keyboard input (auto-routes to active instrument)
//   • Drone reference tone (essential for maqam — sing against the
//     tonic, hear the half-flat sika in tune)
//   • Metronome with count-in + Arabic time signatures
//   • Real-time tuner (live mic pitch + cents off + needle)
//
// Each section is opt-in (no MIDI prompt until you click Connect, no
// mic permission until you start the tuner) so the panel is silent
// and permission-free until the user actually engages with a tool.

const { t } = useI18n()
const { show } = useToast()
const { isRtl } = useDirection()

const midi = useMidi()
const metronome = useMetronome()
const drone = useDrone()
const tuner = useTuner()

// Sections collapse independently — most users won't want all four
// open at once on a small screen. Tuner stays closed by default
// because opening it triggers a mic permission prompt.
const open = ref({ midi: false, drone: true, metronome: true, tuner: false })

async function onConnectMidi() {
  const r = await midi.init()
  if (!r.ok) show({ type: 'error', title: r.message ?? 'MIDI failed', duration: 3000 })
}

function onMetronomeToggle() {
  if (metronome.playing.value) metronome.stop()
  else void metronome.start()
}

async function onTunerToggle() {
  if (tuner.running.value) {
    tuner.stop()
    return
  }
  const r = await tuner.start()
  if (!r.ok) show({ type: 'error', title: r.message ?? 'Tuner failed', duration: 3000 })
}

// Tuner gauge — needle position in [-50, +50] cents mapped to a
// 0-100% horizontal track. Reading is "in tune" when |cents| <= 5;
// the threshold is the standard tolerance most pro tuners use before
// they call a note centred.
const tunerReading = computed(() => tuner.reading.value)
const tunerNeedlePct = computed(() => {
  const r = tunerReading.value
  if (!r) return 50
  const clamped = Math.max(-50, Math.min(50, r.cents))
  const pct = ((clamped + 50) / 100) * 100
  // Mirror in RTL so the −50¢ label sits on the visual reading-start
  // (right edge) and the needle moves the same direction as the label
  // strip below it. Without this, +cents was on the left and the
  // labels read backwards relative to the needle.
  return isRtl.value ? 100 - pct : pct
})
const tunerInTune = computed(() => {
  const r = tunerReading.value
  return r && r.confident && Math.abs(r.cents) <= 5
})

function onPickTonic(next: string) {
  drone.setTonic(next)
}
</script>

<template>
  <div class="practice">
    <header class="head">
      <span class="ttl mono">{{ t('practice.title') }}</span>
    </header>

    <!-- MIDI -->
    <section class="sec">
      <button type="button" class="sec-h mono" @click="open.midi = !open.midi">
        <span>{{ t('practice.midi.title') }}</span>
        <span v-if="midi.inputs.value.length > 0" class="badge">
          {{ midi.inputs.value.length }}
        </span>
        <span class="chev">{{ open.midi ? '−' : '+' }}</span>
      </button>
      <div v-if="open.midi" class="sec-body">
        <div v-if="!midi.access.value">
          <button class="primary mono" @click="onConnectMidi">
            {{ t('practice.midi.connect') }}
          </button>
          <p v-if="midi.error.value" class="hint err mono">{{ midi.error.value }}</p>
          <p v-else class="hint mono">{{ t('practice.midi.hint') }}</p>
        </div>
        <div v-else>
          <label class="row">
            <input
              type="checkbox"
              :checked="midi.enabled.value"
              @change="midi.setEnabled(($event.target as HTMLInputElement).checked)"
            />
            <span class="mono">{{ t('practice.midi.enabled') }}</span>
          </label>
          <ul v-if="midi.inputs.value.length > 0" class="device-list mono">
            <li v-for="d in midi.inputs.value" :key="d.id">
              {{ d.name }}<span v-if="d.manufacturer" class="muted"> · {{ d.manufacturer }}</span>
            </li>
          </ul>
          <p v-else class="hint mono">{{ t('practice.midi.noDevices') }}</p>
        </div>
      </div>
    </section>

    <!-- Drone -->
    <section class="sec">
      <button type="button" class="sec-h mono" @click="open.drone = !open.drone">
        <span>{{ t('practice.drone.title') }}</span>
        <span v-if="drone.playing.value" class="dot live" />
        <span class="chev">{{ open.drone ? '−' : '+' }}</span>
      </button>
      <div v-if="open.drone" class="sec-body">
        <div class="row">
          <button
            class="primary mono"
            :class="{ on: drone.playing.value }"
            @click="drone.toggle()"
          >
            {{ drone.playing.value ? t('practice.drone.stop') : t('practice.drone.start') }}
          </button>
          <select
            class="picker mono"
            :value="drone.tonic.value"
            @change="onPickTonic(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="n in drone.tonics" :key="n" :value="n">{{ n }}</option>
          </select>
        </div>
        <label class="row">
          <span class="lbl mono">{{ t('practice.drone.cents') }}</span>
          <input
            type="range" min="-50" max="50" step="1"
            :value="drone.detuneCents.value"
            @input="drone.setCents(Number(($event.target as HTMLInputElement).value))"
          />
          <span class="val mono">
            {{ drone.detuneCents.value > 0 ? '+' : '' }}{{ drone.detuneCents.value }}
          </span>
        </label>
        <p class="hint mono">{{ t('practice.drone.hint') }}</p>
      </div>
    </section>

    <!-- Metronome -->
    <section class="sec">
      <button type="button" class="sec-h mono" @click="open.metronome = !open.metronome">
        <span>{{ t('practice.metronome.title') }}</span>
        <span v-if="metronome.playing.value" class="dot live" />
        <span class="chev">{{ open.metronome ? '−' : '+' }}</span>
      </button>
      <div v-if="open.metronome" class="sec-body">
        <div class="row">
          <button class="primary mono" :class="{ on: metronome.playing.value }" @click="onMetronomeToggle">
            {{ metronome.playing.value ? t('practice.metronome.stop') : t('practice.metronome.start') }}
          </button>
          <span class="bpm mono">{{ metronome.bpm.value }} BPM</span>
        </div>
        <label class="row">
          <span class="lbl mono">{{ t('practice.metronome.bpm') }}</span>
          <input
            type="range" min="40" max="240" step="1"
            :value="metronome.bpm.value"
            @input="metronome.setBpm(Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label class="row">
          <span class="lbl mono">{{ t('practice.metronome.signature') }}</span>
          <select
            class="picker mono"
            :value="metronome.sigId.value"
            @change="metronome.setSignature(($event.target as HTMLSelectElement).value as typeof metronome.sigId.value)"
          >
            <option v-for="s in metronome.signatures" :key="s.id" :value="s.id">{{ s.label }}</option>
          </select>
        </label>
        <!-- Beat indicator — flashes the active beat lined up with the
             audio click. groups[] drives the visual grouping so 7/8
             reads as 3+2+2 dots, not seven undifferentiated dots. -->
        <div class="beats">
          <span
            v-for="i in metronome.currentSignature().beats"
            :key="i"
            class="beat"
            :class="{
              on: metronome.currentBeat.value === i - 1,
              accent: i === 1,
            }"
          />
        </div>
      </div>
    </section>

    <!-- Tuner -->
    <section class="sec">
      <button type="button" class="sec-h mono" @click="open.tuner = !open.tuner">
        <span>{{ t('practice.tuner.title') }}</span>
        <span v-if="tuner.running.value" class="dot live" />
        <span class="chev">{{ open.tuner ? '−' : '+' }}</span>
      </button>
      <div v-if="open.tuner" class="sec-body">
        <div class="row">
          <button class="primary mono" :class="{ on: tuner.running.value }" @click="onTunerToggle">
            {{ tuner.running.value ? t('practice.tuner.stop') : t('practice.tuner.start') }}
          </button>
        </div>
        <p v-if="tuner.error.value" class="hint err mono">{{ tuner.error.value }}</p>
        <div v-else-if="tuner.running.value" class="tuner-display">
          <div class="tuner-note mono" :class="{ tune: tunerInTune, dim: tunerReading && !tunerReading.confident }">
            <span class="big">{{ tunerReading?.noteName ?? '—' }}</span>
            <span class="cents mono" v-if="tunerReading">
              {{ tunerReading.cents > 0 ? '+' : '' }}{{ tunerReading.cents }}¢
            </span>
          </div>
          <div class="needle-track">
            <div class="needle-zero" />
            <div class="needle" :style="{ left: tunerNeedlePct + '%' }" />
          </div>
          <div class="needle-labels mono">
            <span>−50¢</span><span>0</span><span>+50¢</span>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.practice {
  display: flex;
  flex-direction: column;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}
.head {
  padding: 0.5rem 0.75rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
}
.ttl {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--accent-primary);
  font-weight: 700;
}
.sec { border-bottom: 1px solid var(--border); }
.sec:last-child { border-bottom: none; }
.sec-h {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 0.55rem 0.75rem;
  background: transparent;
  border: 0;
  color: var(--text-primary);
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
}
.sec-h:hover { background: var(--bg-surface); }
.sec-h > span:first-child { flex: 1; text-align: start; }
.chev { color: var(--text-muted); font-family: var(--font-mono); }
.badge {
  font-size: 0.55rem;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  background: var(--accent-primary);
  color: var(--text-inverse);
  margin-inline-end: 0.4rem;
}
.dot.live {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-secondary);
  box-shadow: 0 0 6px var(--accent-secondary);
  margin-inline-end: 0.4rem;
  animation: pulse 1.2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
.sec-body {
  padding: 0.5rem 0.75rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}
.row input[type='range'] { flex: 1; }
.lbl {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  min-width: 56px;
}
.val { font-size: 0.7rem; color: var(--accent-primary); min-width: 36px; text-align: end; }
.bpm { font-size: 0.85rem; color: var(--accent-primary); margin-inline-start: auto; font-weight: 700; }
.primary {
  padding: 0.4rem 0.85rem;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}
.primary:hover { border-color: var(--accent-primary); }
.primary.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
  box-shadow: 0 0 8px var(--accent-glow);
}
.picker {
  flex: 1;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.3rem 0.5rem;
  font-size: 0.72rem;
}
.hint {
  font-size: 0.62rem;
  color: var(--text-muted);
  margin: 0;
}
.hint.err { color: var(--accent-secondary); }
.device-list {
  list-style: none;
  margin: 0;
  padding: 0.25rem 0 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.65rem;
}
.muted { color: var(--text-muted); }

.beats {
  display: flex;
  gap: 0.3rem;
  justify-content: center;
  padding: 0.4rem 0;
}
.beat {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--bg-base);
  border: 1px solid var(--border);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.beat.accent {
  border-color: var(--accent-primary);
}
.beat.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 10px var(--accent-glow);
}

.tuner-display {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.tuner-note {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
}
.tuner-note .big {
  font-family: var(--font-display);
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
}
.tuner-note.tune .big { color: #5be09a; }
.tuner-note.dim { opacity: 0.55; }
.tuner-note .cents {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.needle-track {
  position: relative;
  height: 22px;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 11px;
}
.needle-zero {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 1px;
  background: var(--accent-primary);
  opacity: 0.4;
}
.needle {
  position: absolute;
  top: 2px;
  bottom: 2px;
  width: 4px;
  background: var(--accent-primary);
  border-radius: 2px;
  transform: translateX(-50%);
  transition: left 80ms ease-out;
  box-shadow: 0 0 8px var(--accent-glow);
}
.needle-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.55rem;
  color: var(--text-muted);
}
</style>
