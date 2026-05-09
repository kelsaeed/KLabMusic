<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useBowedString, type BowDirection, maqamHighlightMap } from '@/composables/useBowedString'
import { MAQAM_PRESETS, noteToArabicLabel } from '@/lib/microtonal'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 4 — bowed cello. Reuses the violin's bow engine; only the
// strings, the reach across the fingerboard, and the placeholder
// styling differ. The cello sits an octave below the violin in pitch
// and accommodates a slightly larger first-position reach (14 quarter-
// tone steps vs the violin's 12) because real cello fingerings span
// further on the longer neck.

const { t } = useI18n()
const audioStore = useAudioStore()
const { dampInstrument } = useAudio()

interface CelloString {
  name: string
  midi: number
  display: string
}

const STRINGS: readonly CelloString[] = [
  { name: 'A3', midi: 57, display: 'A3' },
  { name: 'D3', midi: 50, display: 'D3' },
  { name: 'G2', midi: 43, display: 'G2' },
  { name: 'C2', midi: 36, display: 'C2' },
] as const

const MAX_STEPS = 14

const bow = useBowedString({
  instrumentId: 'cello',
  strings: STRINGS,
  maxQuarterSteps: MAX_STEPS,
  defaultAttack: 0.28,
  defaultRelease: 1.2,
})

const MAQAM_KEYS = Object.keys(MAQAM_PRESETS) as Array<keyof typeof MAQAM_PRESETS>
const selectedMaqam = ref<keyof typeof MAQAM_PRESETS>('rast')

const highlightMap = computed(() =>
  maqamHighlightMap(MAQAM_PRESETS[selectedMaqam.value].steps, MAX_STEPS),
)

interface Cell {
  stringIndex: number
  step: number
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
  }, 240)
}

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

function readCell(el: Element | null): Cell | null {
  if (!el) return null
  const cellEl = (el as Element).closest('[data-cello-cell]') as HTMLElement | null
  if (!cellEl) return null
  const stringIndex = Number(cellEl.dataset.celloString)
  const step = Number(cellEl.dataset.celloStep)
  if (!Number.isFinite(stringIndex) || !Number.isFinite(step)) return null
  return buildCell(stringIndex, step)
}

function computeVelocity(deltaPx: number, deltaMs: number): number {
  if (deltaMs <= 0) return 90
  // Cello bow is heavier — same speed translates to slightly more
  // perceived loudness, so the velocity floor sits a touch lower than
  // the violin's. Range: 35..115 instead of 40..120.
  const speed = Math.abs(deltaPx) / deltaMs
  const norm = Math.min(1, speed / 1.0)
  return Math.round(35 + norm * 80)
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
  if (deltaMs < 8) return
  const dx = e.clientX - lastClientX.value
  const dy = e.clientY - lastClientY.value
  const velocity = computeVelocity(Math.hypot(dx, dy), deltaMs)
  const direction = computeDirection(e.clientY, lastClientY.value)

  const cell = readCell(document.elementFromPoint(e.clientX, e.clientY))
  if (!cell) {
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
  dampInstrument('cello')
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
  <div class="cello">
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

    <p class="hint mono">{{ t('cello.bowHint') }}</p>

    <!-- TODO(visual-asset): replace this CSS-only board with a layered
         SVG / canvas of a cello neck + body in Phase 11. The data
         attributes the gesture reads stay stable. -->
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
            :data-cello-cell="true"
            :data-cello-string="sIdx"
            :data-cello-step="step - 1"
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
.cello {
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

.fingerboard {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.85rem;
  /* Cello placeholder uses a darker / warmer wood gradient than the
     violin to read at a glance. */
  background:
    linear-gradient(180deg, rgba(80, 40, 20, 0.32) 0%, rgba(40, 18, 6, 0.45) 100%),
    var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  touch-action: none;
}
.string-row {
  display: grid;
  grid-template-columns: 60px 1fr;
  gap: 0.4rem;
  align-items: center;
}
.string-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 0.4rem 0.4rem;
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
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
  /* Cello cells are slightly taller — wider bow, longer reach. */
  padding: 0.6rem 0.15rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  min-height: 50px;
  transition:
    background var(--transition-fast),
    border-color var(--transition-fast),
    transform var(--transition-fast);
}
.cell.open { background: var(--bg-surface); border-style: dashed; }
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
  .string-row { grid-template-columns: 44px 1fr; }
  .string-label { font-size: 0.7rem; padding: 0.3rem 0.2rem; }
  .cell { min-height: 42px; padding: 0.4rem 0.1rem; }
  .cell-note { font-size: 0.62rem; }
  .cell-arabic { font-size: 0.5rem; }
}
</style>
