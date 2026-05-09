<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import InstrumentSurface from './placeholders/InstrumentSurface.vue'
import * as Tone from 'tone'

// Phase 6 — 10-hole diatonic harmonica in Richter tuning. Each hole
// has a blow note and a draw note; the player chooses by either
// flipping the global blow/draw toggle or by dragging the pointer
// downward (= blow) or upward (= draw) over the holes.

const { t } = useI18n()
const audioStore = useAudioStore()
const { playOnTimed, dampInstrument } = useAudio()
const { recordLivePlay } = useLivePlay()

// Standard Richter intervals from the harmonica's root, expressed in
// semitones. Notice hole 7's draw is BELOW its blow — the famous Richter
// "inversion" the harp's bend mechanic exploits.
const HOLE_INTERVALS: ReadonlyArray<{ blow: number; draw: number }> = [
  { blow: 0,  draw: 2  }, // hole 1: root, +M2
  { blow: 4,  draw: 7  }, // hole 2: M3, P5
  { blow: 7,  draw: 11 }, // hole 3: P5, M7
  { blow: 12, draw: 14 }, // hole 4: octave, +M2
  { blow: 16, draw: 17 }, // hole 5: M3, P4
  { blow: 19, draw: 21 }, // hole 6: P5, M6
  { blow: 24, draw: 23 }, // hole 7: 2nd octave, M7  (inversion)
  { blow: 28, draw: 26 }, // hole 8
  { blow: 31, draw: 29 }, // hole 9
  { blow: 36, draw: 33 }, // hole 10
]

// Available harmonica keys — every common Western harmonica key. Root
// is given as a MIDI number in roughly the same register the real
// instrument plays in.
interface HarmonicaKey {
  /** Display label. */
  name: string
  /** Root MIDI note for hole 1 blow. */
  rootMidi: number
}

const KEYS: readonly HarmonicaKey[] = [
  { name: 'C', rootMidi: 60 },
  { name: 'G', rootMidi: 55 },
  { name: 'D', rootMidi: 62 },
  { name: 'A', rootMidi: 57 },
  { name: 'E', rootMidi: 64 },
  { name: 'F', rootMidi: 65 },
] as const

const selectedKey = ref<HarmonicaKey>(KEYS[0])

type BreathMode = 'blow' | 'draw'
const mode = ref<BreathMode>('blow')

interface Hole {
  index: number
  blowNote: string
  drawNote: string
}

const holes = computed<Hole[]>(() => {
  const root = selectedKey.value.rootMidi
  return HOLE_INTERVALS.map((iv, i) => ({
    index: i + 1,
    blowNote: Tone.Frequency(root + iv.blow, 'midi').toNote(),
    drawNote: Tone.Frequency(root + iv.draw, 'midi').toNote(),
  }))
})

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

const dragging = ref(false)
const dragStartY = ref(0)
const lastHoleIndex = ref(0)
// Drag throttle. Mobile audio worker can't keep up with one new hole
// per pointermove on a fast swipe — each harmonica note plays for
// 0.4 s, so a 10-hole swipe in 200 ms accumulates 10 overlapping
// samples and audibly chokes the audio pipeline. Skip new fires
// inside this window to keep the swipe musical.
const lastFireAt = ref(0)
const flashedHole = ref<{ index: number; mode: BreathMode } | null>(null)

function flash(index: number, m: BreathMode) {
  flashedHole.value = { index, mode: m }
  setTimeout(() => {
    if (flashedHole.value?.index === index) flashedHole.value = null
  }, 240)
}

function playHole(index: number, m: BreathMode, velocity = 100) {
  const hole = holes.value[index - 1]
  if (!hole) return
  const note = m === 'blow' ? hole.blowNote : hole.drawNote
  void playOnTimed('harmonica', note, 0.4, velocity)
  recordLivePlay('harmonica', note, velocity, 0.4)
  flash(index, m)
}

function readHoleIndex(el: Element | null): number {
  if (!el) return 0
  const holeEl = (el as Element).closest('[data-harmonica-hole]') as HTMLElement | null
  if (!holeEl) return 0
  const idx = Number(holeEl.dataset.harmonicaHole)
  return Number.isFinite(idx) ? idx : 0
}

function swipeThrottleMs(e: PointerEvent): number {
  // Touch pointers always get the slower 60 ms rate; mouse keeps the
  // snappier desktop default. See `lastFireAt` comment for why.
  return e.pointerType === 'mouse' ? 30 : 60
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  const idx = readHoleIndex(document.elementFromPoint(e.clientX, e.clientY))
  if (!idx) return
  dragging.value = true
  dragStartY.value = e.clientY
  lastHoleIndex.value = idx
  lastFireAt.value = performance.now()
  // Initial press uses whatever mode the toggle currently has.
  playHole(idx, mode.value, 110)
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  // Drag direction can override the global mode mid-gesture so the
  // player gets that breath-flip-on-the-fly feel real harmonica
  // playing has. ≥18 px change in Y triggers the flip — small enough
  // to feel responsive, large enough to ignore jitter.
  const dy = e.clientY - dragStartY.value
  let liveMode: BreathMode = mode.value
  if (Math.abs(dy) > 18) {
    liveMode = dy > 0 ? 'blow' : 'draw'
  }
  const idx = readHoleIndex(document.elementFromPoint(e.clientX, e.clientY))
  if (!idx) return
  const now = performance.now()
  if (idx !== lastHoleIndex.value && now - lastFireAt.value > swipeThrottleMs(e)) {
    lastHoleIndex.value = idx
    lastFireAt.value = now
    playHole(idx, liveMode, 100)
  }
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  lastHoleIndex.value = 0
}

function damp() {
  dampInstrument('harmonica')
  onUp()
}

function toggleNotation() {
  audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')
}

onMounted(() => {
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', onUp)
  window.removeEventListener('pointercancel', onUp)
})
</script>

<template>
  <div class="harmonica">
    <header class="bar">
      <label class="key-pick mono">
        <span class="lbl">{{ t('harmonica.key') }}</span>
        <select v-model="selectedKey" class="key-select">
          <option v-for="key in KEYS" :key="key.name" :value="key">{{ key.name }}</option>
        </select>
      </label>

      <div class="mode-toggle">
        <button
          class="mode-btn mono"
          :class="{ on: mode === 'blow' }"
          @click="mode = 'blow'"
        >↓ {{ t('harmonica.blow') }}</button>
        <button
          class="mode-btn mono"
          :class="{ on: mode === 'draw' }"
          @click="mode = 'draw'"
        >↑ {{ t('harmonica.draw') }}</button>
      </div>

      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>

      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <p class="hint mono">{{ t('harmonica.hint') }}</p>

    <!-- TODO(visual-asset): InstrumentSurface placeholder; real
         harmonica comb illustration plugs in later. -->
    <InstrumentSurface
      variant="harmonica"
      class="comb"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <button
        v-for="hole in holes"
        :key="hole.index"
        class="hole"
        :class="{
          flashBlow: flashedHole?.index === hole.index && flashedHole.mode === 'blow',
          flashDraw: flashedHole?.index === hole.index && flashedHole.mode === 'draw',
        }"
        :data-harmonica-hole="hole.index"
      >
        <span class="hole-num mono">{{ hole.index }}</span>
        <span
          class="note draw"
          :class="{ active: mode === 'draw' }"
        >
          ↑ {{ notationOf(hole.drawNote) }}
        </span>
        <span class="aperture" />
        <span
          class="note blow"
          :class="{ active: mode === 'blow' }"
        >
          ↓ {{ notationOf(hole.blowNote) }}
        </span>
      </button>
    </InstrumentSurface>
  </div>
</template>

<style scoped>
.harmonica {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.key-pick {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.key-select {
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}
.key-select:focus { outline: none; border-color: var(--accent-primary); }
.mode-toggle {
  display: inline-flex;
  gap: 0.3rem;
}
.mode-btn {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text-muted);
  border-radius: var(--radius);
  cursor: pointer;
}
.mode-btn.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-glow);
}
.notation {
  margin-inline-start: auto;
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.damp {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.comb {
  display: grid;
  grid-template-columns: repeat(10, minmax(0, 1fr));
  gap: 6px;
  padding: 0.85rem;
  touch-action: none;
}
.hole {
  position: relative;
  display: grid;
  grid-template-rows: 22px 1fr 8px 1fr 22px;
  gap: 4px;
  align-items: center;
  padding: 0.5rem 0.2rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  min-height: 130px;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}
.hole:hover { border-color: var(--accent-primary); }
.hole-num {
  font-size: 0.8rem;
  font-weight: 700;
  text-align: center;
  color: var(--text-muted);
}
.note {
  font-size: 0.7rem;
  text-align: center;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  transition: color var(--transition-fast);
}
.note.active {
  color: var(--accent-primary);
  font-weight: 700;
}
.aperture {
  height: 4px;
  background: linear-gradient(90deg, transparent, var(--text-muted), transparent);
  border-radius: 2px;
}

.hole.flashBlow {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: scale(0.96);
  box-shadow: 0 0 14px var(--accent-glow);
}
.hole.flashDraw {
  background: var(--accent-secondary);
  border-color: var(--accent-secondary);
  transform: scale(0.96);
  box-shadow: 0 0 14px rgba(255, 0, 110, 0.6);
}
.hole.flashBlow .note,
.hole.flashBlow .hole-num,
.hole.flashDraw .note,
.hole.flashDraw .hole-num {
  color: var(--text-inverse);
}

@media (max-width: 720px) {
  .comb { gap: 4px; padding: 0.5rem; }
  .hole { padding: 0.35rem 0.15rem; min-height: 110px; }
  .note { font-size: 0.62rem; }
  .hole-num { font-size: 0.7rem; }
}
</style>
