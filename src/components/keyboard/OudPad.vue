<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'
import { useMultiplayer } from '@/composables/useMultiplayer'
import { useAudioStore } from '@/stores/audio'
import { MAQAM_PRESETS, noteToArabicLabel } from '@/lib/microtonal'
import { maqamHighlightMap } from '@/composables/useBowedString'
import InstrumentSurface from './placeholders/InstrumentSurface.vue'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 5 — Arabic oud. Six courses, modeled after the standard
// (most common) Arabic tuning C2-F2-A2-D3-G3-C4. The lowest course
// (C2) is a single string (bass / "doum"); the upper five are doubled
// pairs as in the real instrument. Audio doesn't double the upper
// courses (the synth fallback would just sound like a phasing chorus
// — better to wait for samples in Phase 10), but the visual placeholder
// shows the doubled string pairs so it reads as an oud at a glance.

const { t } = useI18n()
const audioStore = useAudioStore()
const { dampInstrument, playOnTimed } = useAudio()
const { recordLivePlay } = useLivePlay()
const { broadcastNote } = useMultiplayer()

interface OudCourse {
  /** Display name for the course. */
  name: string
  /** Open-string MIDI pitch. */
  midi: number
  /** True for the doubled upper five courses, false for the bass single. */
  doubled: boolean
}

// Top-of-screen = highest course (C4), conventional tab order.
const COURSES: readonly OudCourse[] = [
  { name: 'C4', midi: 60, doubled: true },
  { name: 'G3', midi: 55, doubled: true },
  { name: 'D3', midi: 50, doubled: true },
  { name: 'A2', midi: 45, doubled: true },
  { name: 'F2', midi: 41, doubled: true },
  { name: 'C2', midi: 36, doubled: false },
] as const

// 14 quarter-tone steps from open = 7 semitones, the comfortable first-
// position reach on an oud (the fingerboard is fretless, so any pitch
// in between is reachable too — but 14 covers the maqam scale degrees
// most players use without scrolling).
const MAX_STEPS = 14

const MAQAM_KEYS = Object.keys(MAQAM_PRESETS) as Array<keyof typeof MAQAM_PRESETS>
const selectedMaqam = ref<keyof typeof MAQAM_PRESETS>('rast')

const highlightMap = computed(() =>
  maqamHighlightMap(MAQAM_PRESETS[selectedMaqam.value].steps, MAX_STEPS),
)

interface Cell {
  courseIndex: number
  step: number
  noteName: string
  arabic: string
  isOpen: boolean
  isQuarterTone: boolean
  cents: number
}

function buildCell(courseIndex: number, step: number): Cell {
  const course = COURSES[courseIndex]
  const isOdd = step % 2 !== 0
  const semitone = isOdd ? Math.ceil(step / 2) : step / 2
  const noteMidi = course.midi + semitone
  const noteName = Tone.Frequency(noteMidi, 'midi').toNote()
  return {
    courseIndex,
    step,
    noteName,
    arabic: noteToArabicLabel(noteName, { quarterShift: isOdd ? -1 : 0, withOctave: false }),
    isOpen: step === 0,
    isQuarterTone: isOdd,
    cents: isOdd ? -50 : 0,
  }
}

// — Gesture state —
// Same swipe-drag pattern as GuitarPad: pointerdown opens the gesture,
// pointermove finds the cell under the finger via document.elementFromPoint
// and triggers a fresh pluck whenever the cell changes (so dragging across
// courses produces a risha-style strum, dragging along a single course
// produces a slide tremolo). Tracking last cell + last fire time prevents
// re-triggering on the same cell every frame.
const dragging = ref(false)
const lastCellKey = ref<string>('')
const lastFireTime = ref(0)
const flashedCell = ref<string>('')

function flash(key: string) {
  flashedCell.value = key
  setTimeout(() => {
    if (flashedCell.value === key) flashedCell.value = ''
  }, 220)
}

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

function readCell(el: Element | null): Cell | null {
  if (!el) return null
  const cellEl = (el as Element).closest('[data-oud-cell]') as HTMLElement | null
  if (!cellEl) return null
  const courseIndex = Number(cellEl.dataset.oudCourse)
  const step = Number(cellEl.dataset.oudStep)
  if (!Number.isFinite(courseIndex) || !Number.isFinite(step)) return null
  return buildCell(courseIndex, step)
}

function pluckCell(cell: Cell, velocity: number) {
  // Quarter-tone cents bake into the per-attack frequency now — two
  // adjacent cells fired in quick succession at different microtones
  // no longer collide through a shared detune param. PluckSynth has
  // no detune AudioParam anyway, so the prior setBend path was already
  // partly inert; per-attack cents fixes it for the Karplus-Strong
  // delay line by transposing the seed frequency directly.
  // 'risha' (the oud's traditional plectrum) is the canonical
  // articulation tag for an oud pluck — voices ignore it today, but a
  // future risha-vs-finger sample pack auto-routes via the manifest.
  void playOnTimed('oud', cell.noteName, 1.4, velocity, cell.cents, 'risha')
  broadcastNote('oud', cell.noteName, velocity, cell.cents)
  recordLivePlay('oud', cell.noteName, velocity, 1.4, cell.cents)
  flash(`${cell.courseIndex}:${cell.step}`)
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  const cell = readCell(document.elementFromPoint(e.clientX, e.clientY))
  if (!cell) return
  dragging.value = true
  lastCellKey.value = `${cell.courseIndex}:${cell.step}`
  lastFireTime.value = performance.now()
  pluckCell(cell, 105)
}

// Re-pluck throttle window. Mobile audio worker can't sustain the
// 28 ms desktop rate when each pluck spawns a Soundfont buffer source
// that rings for 0.9 s — the simultaneous-source pile-up was a
// concrete cause of the 'wshhhh' real-device QA flagged. 60 ms (~16
// plucks/sec) keeps a fast strum musical without saturating the
// audio pipeline. Touch pointers always get the slower rate, mouse
// keeps the snappier desktop value.
function strumThrottleMs(e: PointerEvent): number {
  return e.pointerType === 'mouse' ? 28 : 60
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  const cell = readCell(document.elementFromPoint(e.clientX, e.clientY))
  if (!cell) return
  const key = `${cell.courseIndex}:${cell.step}`
  const now = performance.now()
  if (key !== lastCellKey.value && now - lastFireTime.value > strumThrottleMs(e)) {
    lastCellKey.value = key
    lastFireTime.value = now
    // Velocity scales with how fast the user is moving — for now use a
    // mid value; full velocity-from-speed tuning can come once we have
    // real samples to differentiate.
    pluckCell(cell, 110)
  }
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  lastCellKey.value = ''
}

function damp() {
  dampInstrument('oud')
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
  <div class="oud">
    <header class="bar">
      <label class="maqam-pick mono">
        <span class="lbl">{{ t('violin.maqam') }}</span>
        <select v-model="selectedMaqam" class="maqam-select">
          <option v-for="key in MAQAM_KEYS" :key="key" :value="key">
            {{ MAQAM_PRESETS[key].name }}
          </option>
        </select>
      </label>

      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>

      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <p class="hint mono">{{ t('oud.bowHint') }}</p>

    <!-- TODO(visual-asset): InstrumentSurface is the placeholder for the
         oud body — soundhole + fingerboard chrome lives here in CSS for
         now. Swap for a real SVG / canvas asset in Phase 11+. -->
    <InstrumentSurface variant="oud" class="body-wrap">
      <div class="soundhole" aria-hidden="true">
        <span class="rosette" />
      </div>
      <div
        class="fingerboard"
        @pointerdown="onDown"
        @pointermove="onMove"
      >
        <div v-for="(course, cIdx) in COURSES" :key="course.name" class="course-row">
          <span class="course-label mono" :class="{ bass: !course.doubled }">
            {{ notationOf(course.name) }}
            <span v-if="course.doubled" class="doubled-mark">‖</span>
          </span>
          <div class="cells">
            <button
              v-for="step in MAX_STEPS + 1"
              :key="`${cIdx}-${step - 1}`"
              class="cell"
              :class="{
                open: step - 1 === 0,
                quarter: (step - 1) % 2 !== 0,
                maqam: highlightMap[step - 1],
                flash: flashedCell === `${cIdx}:${step - 1}`,
              }"
              :data-oud-cell="true"
              :data-oud-course="cIdx"
              :data-oud-step="step - 1"
            >
              <span class="cell-note mono">
                {{ notationOf(buildCell(cIdx, step - 1).noteName) }}
              </span>
              <span
                v-if="(step - 1) % 2 !== 0"
                class="cell-arabic mono"
                :title="t('violin.quarterTone')"
              >
                {{ buildCell(cIdx, step - 1).arabic }}
              </span>
            </button>
          </div>
        </div>
      </div>
    </InstrumentSurface>
  </div>
</template>

<style scoped>
.oud {
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
.maqam-pick {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.maqam-select {
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0.55rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
}
.maqam-select:focus { outline: none; border-color: var(--accent-primary); }
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

/* — Body / soundhole placeholder —
   Wraps the fingerboard with a stylized oud body. The soundhole sits
   above the fingerboard, just decorative — pluck gestures happen on the
   fingerboard itself. */
.body-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.85rem;
}
.soundhole {
  position: relative;
  height: 32px;
  display: grid;
  place-items: center;
}
.rosette {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.55) 30%, rgba(180, 120, 60, 0.15) 70%);
  border: 1px solid var(--border);
}
.fingerboard {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  touch-action: none;
}
.course-row {
  display: grid;
  grid-template-columns: 64px 1fr;
  gap: 0.4rem;
  align-items: center;
}
.course-label {
  position: relative;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 0.35rem 0.4rem;
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
}
.course-label.bass {
  /* Single bass course reads with a slightly darker label so the user
     sees at a glance that it's the "doum" string. */
  color: var(--accent-secondary);
}
.doubled-mark {
  font-size: 0.6rem;
  margin-inline-start: 0.2rem;
  color: var(--text-muted);
}
.cells {
  display: grid;
  grid-template-columns: repeat(15, minmax(0, 1fr));
  gap: 3px;
}
.cell {
  position: relative;
  display: grid;
  place-items: center;
  gap: 0.05rem;
  padding: 0.5rem 0.15rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  min-height: 44px;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}
.cell.open {
  background: var(--bg-surface);
  border-style: dashed;
}
.cell.quarter {
  background: linear-gradient(180deg, var(--bg-base) 0%, rgba(255, 0, 110, 0.06) 100%);
}
.cell.maqam {
  border-color: var(--accent-primary);
  box-shadow: inset 0 0 0 1px var(--accent-glow);
}
.cell:hover { border-color: var(--accent-primary); }
.cell.flash {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: scale(0.94);
  box-shadow: 0 0 14px var(--accent-glow);
}
.cell-note { font-size: 0.7rem; letter-spacing: 0.02em; }
.cell.flash .cell-note { color: var(--text-inverse); }
.cell-arabic {
  font-size: 0.55rem;
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cell.flash .cell-arabic { color: var(--text-inverse); }

@media (max-width: 720px) {
  .course-row { grid-template-columns: 48px 1fr; }
  .course-label { font-size: 0.7rem; padding: 0.3rem 0.25rem; }
  .cell { min-height: 38px; padding: 0.35rem 0.1rem; }
  .cell-note { font-size: 0.62rem; }
  .cell-arabic { font-size: 0.5rem; }
}
</style>
