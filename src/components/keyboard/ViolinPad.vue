<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useBowedString, type BowDirection, maqamHighlightMap } from '@/composables/useBowedString'
import { MAQAM_PRESETS, noteToArabicLabel } from '@/lib/microtonal'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 3 — bowed violin pad. The fingerboard exposes 4 strings × 13
// fingerboard positions (open + 12 quarter-tone steps). Quarter-tone
// positions are highlighted when they fall in the chosen maqam, so a
// player can read a maqam off the board and play it without thinking
// about Western intervals. The bow itself is a swipe across strings:
// down-bow (drag downward across strings) and up-bow (drag upward) are
// handled differently by the engine — one accents, one understates.
//
// TODO(visual-asset): the wood-grain fingerboard, scroll, and bridge SVG
// arrives in Phase 11 — this pad keeps a structured CSS placeholder so
// the swap is non-invasive.

const { t } = useI18n()
const audioStore = useAudioStore()
const { dampInstrument } = useAudio()

interface ViolinString {
  name: string
  midi: number
  /** Display octave for label rendering when the user has notation set to letters. */
  display: string
}

// Top of the screen = highest pitch (E5), TAB convention.
const STRINGS: readonly ViolinString[] = [
  { name: 'E5', midi: 76, display: 'E5' },
  { name: 'A4', midi: 69, display: 'A4' },
  { name: 'D4', midi: 62, display: 'D4' },
  { name: 'G3', midi: 55, display: 'G3' },
] as const

const MAX_STEPS = 12 // open + 12 quarter-tone positions = a comfortable first-position reach.

const bow = useBowedString({
  instrumentId: 'violin',
  strings: STRINGS,
})

// — Maqam selection —
// Keys mirror the lib/microtonal MAQAM_PRESETS map so the highlight
// computation is just a Set lookup.
const MAQAM_KEYS = Object.keys(MAQAM_PRESETS) as Array<keyof typeof MAQAM_PRESETS>
const selectedMaqam = ref<keyof typeof MAQAM_PRESETS>('rast')

const highlightMap = computed(() =>
  maqamHighlightMap(MAQAM_PRESETS[selectedMaqam.value].steps, MAX_STEPS),
)

// — Cell rendering helpers —
// Each cell is a unique (string, step) pair, rendered as a button with
// data attributes the gesture handler reads via elementFromPoint.

interface Cell {
  stringIndex: number
  step: number
  /** 12-TET note name we'll snap to (e.g. "F#4"). For odd steps the
   *  engine adds a -50 cent detune; the label still shows the snapped
   *  name with a microtonal indicator so the user knows. */
  label: string
  arabic: string
  isOpen: boolean
  isQuarterTone: boolean
}

function buildCell(stringIndex: number, step: number): Cell {
  const string = STRINGS[stringIndex]
  const isOdd = step % 2 !== 0
  const semitone = isOdd ? Math.ceil(step / 2) : step / 2
  const noteMidi = string.midi + semitone
  const noteName = Tone.Frequency(noteMidi, 'midi').toNote()
  return {
    stringIndex,
    step,
    label: noteName,
    arabic: noteToArabicLabel(noteName, { quarterShift: isOdd ? -1 : 0, withOctave: false }),
    isOpen: step === 0,
    isQuarterTone: isOdd,
  }
}

// — Gesture state —
// We track drag start point + last point + last time so we can derive
// bow speed (px/ms → 0..1 → MIDI velocity) and bow direction (sign of
// the latest Y delta). Direction matters because the engine articulates
// down-bow louder than up-bow.
const dragging = ref(false)
const lastClientY = ref(0)
const lastClientX = ref(0)
const lastTime = ref(0)
const lastDirection = ref<BowDirection>('down')
const lastCellKey = ref<string>('')
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
  const cellEl = (el as Element).closest('[data-violin-cell]') as HTMLElement | null
  if (!cellEl) return null
  const stringIndex = Number(cellEl.dataset.violinString)
  const step = Number(cellEl.dataset.violinStep)
  if (!Number.isFinite(stringIndex) || !Number.isFinite(step)) return null
  return buildCell(stringIndex, step)
}

function computeVelocity(deltaPx: number, deltaMs: number): number {
  if (deltaMs <= 0) return 90
  // Pixels per ms → squashed onto a sensible MIDI velocity range. 0.05
  // ≈ a slow bow draw, 1.5 ≈ frenetic — clamp to 40..120 so even the
  // gentlest bow is audible and frantic strokes don't blow out the
  // limiter.
  const speed = Math.abs(deltaPx) / deltaMs
  const norm = Math.min(1, speed / 1.2)
  return Math.round(40 + norm * 80)
}

function computeDirection(currentY: number, prevY: number): BowDirection {
  const dy = currentY - prevY
  if (Math.abs(dy) < 2) return lastDirection.value
  return dy < 0 ? 'up' : 'down'
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  const cell = readCell(document.elementFromPoint(e.clientX, e.clientY))
  if (!cell) return
  dragging.value = true
  lastClientX.value = e.clientX
  lastClientY.value = e.clientY
  lastTime.value = performance.now()
  lastDirection.value = 'down'
  lastCellKey.value = `${cell.stringIndex}:${cell.step}`
  // Initial press: a tap that doesn't move turns into a pizzicato; we
  // treat the first sample as a slow bow attack and let bowMoveTo
  // re-articulate when the gesture extends.
  bow.bowAttack(cell.stringIndex, cell.step, 80, 'down')
  flash(lastCellKey.value)
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  const now = performance.now()
  const deltaMs = now - lastTime.value
  if (deltaMs < 8) return // don't spam re-articulations on every frame
  const dx = e.clientX - lastClientX.value
  const dy = e.clientY - lastClientY.value
  const velocity = computeVelocity(Math.hypot(dx, dy), deltaMs)
  const direction = computeDirection(e.clientY, lastClientY.value)

  const cell = readCell(document.elementFromPoint(e.clientX, e.clientY))
  if (!cell) {
    // Bow has drifted off the fingerboard area — release.
    onUp()
    return
  }
  const key = `${cell.stringIndex}:${cell.step}`
  if (key !== lastCellKey.value || direction !== lastDirection.value) {
    bow.bowMoveTo(cell.stringIndex, cell.step, velocity, direction)
    flash(key)
    lastCellKey.value = key
    lastDirection.value = direction
  }
  lastClientX.value = e.clientX
  lastClientY.value = e.clientY
  lastTime.value = now
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  lastCellKey.value = ''
  bow.bowRelease()
}

function damp() {
  dampInstrument('violin')
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
  <div class="violin">
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

    <p class="hint mono">{{ t('violin.bowHint') }}</p>

    <!-- TODO(visual-asset): replace this CSS-only fingerboard with a
         layered SVG / canvas of a real violin neck in Phase 11 — the
         per-cell data attributes the gesture reads stay the same. -->
    <div
      class="fingerboard"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <div v-for="(string, sIdx) in STRINGS" :key="string.name" class="string-row">
        <span class="string-label mono">{{ notationOf(string.display) }}</span>
        <div class="cells">
          <button
            v-for="step in MAX_STEPS + 1"
            :key="`${sIdx}-${step - 1}`"
            class="cell"
            :class="{
              open: step - 1 === 0,
              quarter: (step - 1) % 2 !== 0,
              maqam: highlightMap[step - 1],
              flash: flashedCell === `${sIdx}:${step - 1}`,
            }"
            :data-violin-cell="true"
            :data-violin-string="sIdx"
            :data-violin-step="step - 1"
          >
            <span class="cell-note mono">
              {{ notationOf(buildCell(sIdx, step - 1).label) }}
            </span>
            <span
              v-if="(step - 1) % 2 !== 0"
              class="cell-arabic mono"
              :title="t('violin.quarterTone')"
            >
              {{ buildCell(sIdx, step - 1).arabic }}
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.violin {
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
.maqam-select:focus {
  outline: none;
  border-color: var(--accent-primary);
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

.fingerboard {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.7rem;
  background:
    linear-gradient(180deg, rgba(120, 80, 40, 0.18) 0%, rgba(60, 30, 10, 0.32) 100%),
    var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  /* Gestures: every pointermove must reach our handler, not be eaten by
     scroll or zoom. */
  touch-action: none;
}
.string-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  gap: 0.4rem;
  align-items: center;
}
.string-label {
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 0.3rem 0.4rem;
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
}
.cells {
  display: grid;
  grid-template-columns: repeat(13, minmax(0, 1fr));
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
  /* Quarter-tone cells are visually distinct so the user knows they're
     stepping off the Western grid. */
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
.cell-note {
  font-size: 0.7rem;
  letter-spacing: 0.02em;
}
.cell.flash .cell-note { color: var(--text-inverse); }
.cell-arabic {
  font-size: 0.55rem;
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cell.flash .cell-arabic { color: var(--text-inverse); }

@media (max-width: 720px) {
  .string-row { grid-template-columns: 42px 1fr; }
  .string-label { font-size: 0.7rem; padding: 0.25rem 0.2rem; }
  .cell { min-height: 38px; padding: 0.35rem 0.1rem; }
  .cell-note { font-size: 0.62rem; }
  .cell-arabic { font-size: 0.5rem; }
}
</style>
