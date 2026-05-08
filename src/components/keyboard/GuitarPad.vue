<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import * as Tone from 'tone'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { formatNote, formatChord } from '@/lib/notation'

type Mode = 'fretboard' | 'strings' | 'chords'

const { playOn, dampInstrument } = useAudio()
const audioStore = useAudioStore()
const { t } = useI18n()

const mode = ref<Mode>('fretboard')

interface Chord {
  name: string
  // Notes are listed lowest pitch (string 6, low E) first → highest (string 1, high E)
  // so a downstrum simply iterates this list and an upstrum iterates it reversed.
  notes: string[]
}

const CHORDS: Chord[] = [
  { name: 'Em', notes: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'] },
  { name: 'Am', notes: ['A2', 'E3', 'A3', 'C4', 'E4'] },
  { name: 'C',  notes: ['C3', 'E3', 'G3', 'C4', 'E4'] },
  { name: 'G',  notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'D4'] },
  { name: 'D',  notes: ['D3', 'A3', 'D4', 'F#4'] },
  { name: 'E',  notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { name: 'A',  notes: ['A2', 'E3', 'A3', 'C#4', 'E4'] },
  { name: 'F',  notes: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'] },
]

// Currently focused chord — clicking a chord card selects it and reveals the
// per-string layout below so the user can play each chord tone individually
// or strum across all of them.
const selectedChord = ref<Chord>(CHORDS[0])

// Strings displayed top-down in TAB convention: 1st (high E) on top, 6th (low E) on bottom.
const STRINGS = [
  { idx: 1, name: '1', open: 'E4' },
  { idx: 2, name: '2', open: 'B3' },
  { idx: 3, name: '3', open: 'G3' },
  { idx: 4, name: '4', open: 'D3' },
  { idx: 5, name: '5', open: 'A2' },
  { idx: 6, name: '6', open: 'E2' },
] as const

const FRET_COUNT = 13 // 0 (open) through 12

function noteAtFret(open: string, fret: number): string {
  try {
    return Tone.Frequency(open).transpose(fret).toNote()
  } catch {
    return open
  }
}

interface FlatCell {
  string: number
  fret: number
  note: string
}

const flatCells = computed<FlatCell[]>(() => {
  const out: FlatCell[] = []
  for (const s of STRINGS) {
    for (let f = 0; f < FRET_COUNT; f++) {
      out.push({ string: s.idx, fret: f, note: noteAtFret(s.open, f) })
    }
  }
  return out
})

const FRET_MARKERS = new Set([3, 5, 7, 9])
const DOUBLE_MARKER = 12

const STRUM_GAP_MS = 28
const flashed = ref<string>('')

function flash(note: string, ms = 200) {
  flashed.value = note
  setTimeout(() => {
    if (flashed.value === note) flashed.value = ''
  }, ms)
}

function pluck(note: string, vel = 105) {
  void playOn('guitar', note, vel)
  flash(note)
}

function strum(notes: string[], reverse = false) {
  const seq = reverse ? [...notes].reverse() : notes
  flashed.value = seq[0]
  seq.forEach((note, i) => {
    setTimeout(() => {
      void playOn('guitar', note, 110)
      flashed.value = note
    }, i * STRUM_GAP_MS)
  })
  setTimeout(() => (flashed.value = ''), seq.length * STRUM_GAP_MS + 200)
}

function damp() {
  dampInstrument('guitar')
}

function toggleNotation() {
  audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')
}

// — Drag-to-strum support —
//
// Holding the pointer down and sliding across cells should pluck each cell
// the pointer enters, both for mouse-drag and touch-swipe. Two pieces are
// needed for this to work correctly:
//
// 1. Touch pointers default-capture the element they started on, so without
//    intervention pointerenter never fires on neighbouring elements during a
//    drag. Calling releasePointerCapture() on pointerdown opts out of that
//    capture so subsequent moves report the element actually under the
//    pointer.
//
// 2. We track the last-played note on this drag so a stationary pointer
//    inside a single cell doesn't retrigger over and over.
const dragging = ref(false)
const lastDragNote = ref<string>('')

function startDrag(e: PointerEvent, note: string) {
  ;(e.currentTarget as Element)?.releasePointerCapture?.(e.pointerId)
  dragging.value = true
  lastDragNote.value = note
  pluck(note)
}

function dragInto(e: PointerEvent, note: string) {
  if (!dragging.value) return
  // e.buttons === 0 means the user released the button outside our handlers
  // (e.g., released over a non-pad element). Bail out so we don't accidentally
  // strum on simple hovering.
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    dragging.value = false
    return
  }
  if (lastDragNote.value === note) return
  lastDragNote.value = note
  pluck(note)
}

function endDrag() {
  dragging.value = false
  lastDragNote.value = ''
}

onMounted(() => {
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
})
</script>

<template>
  <div class="guitar">
    <header class="bar">
      <div class="modes">
        <button
          v-for="m in (['fretboard', 'strings', 'chords'] as Mode[])"
          :key="m"
          class="mode mono"
          :class="{ on: mode === m }"
          @click="mode = m"
        >
          {{ t(`guitar.mode.${m}`) }}
        </button>
      </div>

      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>

      <button class="damp mono" :title="t('guitar.dampHint')" @click="damp">
        ✋ {{ t('guitar.damp') }}
      </button>
    </header>

    <!-- FRETBOARD -->
    <section v-if="mode === 'fretboard'" class="fretboard">
      <div class="fb-grid">
        <span class="fb-corner" />
        <span
          v-for="f in FRET_COUNT"
          :key="`fnum-${f - 1}`"
          class="fret-num mono"
          :class="{ marker: FRET_MARKERS.has(f - 1) || (f - 1) === DOUBLE_MARKER }"
          :style="{ '--fret': f - 1 }"
        >{{ f - 1 }}</span>
        <span
          v-for="s in STRINGS"
          :key="`slbl-${s.idx}`"
          class="string-label mono"
          :style="{ '--string': s.idx }"
        >{{ s.name }}</span>
        <button
          v-for="cell in flatCells"
          :key="`${cell.string}-${cell.fret}`"
          class="fret-cell"
          :class="{
            open: cell.fret === 0,
            flash: flashed === cell.note,
            marker: FRET_MARKERS.has(cell.fret) || cell.fret === DOUBLE_MARKER,
          }"
          :style="{ '--string': cell.string, '--fret': cell.fret }"
          @pointerdown="startDrag($event, cell.note)"
          @pointerenter="dragInto($event, cell.note)"
        >
          <span class="fret-note mono">{{ formatNote(cell.note, audioStore.notation) }}</span>
        </button>
      </div>
    </section>

    <!-- OPEN STRINGS -->
    <section v-else-if="mode === 'strings'" class="strings-panel">
      <p class="hint mono">{{ t('guitar.stringsHint') }}</p>
      <div class="strings-row">
        <button
          v-for="s in [...STRINGS].reverse()"
          :key="s.open"
          class="string"
          :class="{ flash: flashed === s.open }"
          @pointerdown="startDrag($event, s.open)"
          @pointerenter="dragInto($event, s.open)"
        >
          <span class="line" />
          <span class="lbl mono">{{ t('guitar.stringLabel', { n: s.idx }) }}</span>
          <span class="note mono">{{ formatNote(s.open, audioStore.notation) }}</span>
        </button>
      </div>
    </section>

    <!-- CHORDS -->
    <section v-else class="chords-panel">
      <div class="chord-grid">
        <button
          v-for="c in CHORDS"
          :key="c.name"
          class="chord-card"
          :class="{ active: selectedChord.name === c.name }"
          :title="t('guitar.chordCardHint')"
          @click="selectedChord = c"
        >
          <span class="name">{{ formatChord(c.name, audioStore.notation) }}</span>
        </button>
      </div>

      <div class="chord-play">
        <header class="chord-play-head">
          <span class="title mono">{{ formatChord(selectedChord.name, audioStore.notation) }}</span>
          <p class="hint mono">{{ t('guitar.chordPlayHint') }}</p>
        </header>

        <div class="chord-strings">
          <button
            v-for="(note, i) in [...selectedChord.notes].reverse()"
            :key="`${selectedChord.name}-${i}`"
            class="chord-string"
            :class="{ flash: flashed === note }"
            @pointerdown="startDrag($event, note)"
            @pointerenter="dragInto($event, note)"
          >
            <span class="line" />
            <span class="note mono">{{ formatNote(note, audioStore.notation) }}</span>
          </button>
        </div>

        <div class="strum-row">
          <button class="strum mono" @pointerdown="strum(selectedChord.notes, false)">
            ↓ {{ t('guitar.strumDown') }}
          </button>
          <button class="strum mono" @pointerdown="strum(selectedChord.notes, true)">
            ↑ {{ t('guitar.strumUp') }}
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.guitar {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
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
.modes { display: inline-flex; gap: 0.3rem; }
.mode {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.mode.on {
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

/* FRETBOARD */
.fretboard {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem;
  overflow-x: auto;
}
.fb-grid {
  display: grid;
  grid-template-columns: 32px repeat(13, minmax(36px, 1fr));
  grid-template-rows: 22px repeat(6, 38px);
  gap: 4px;
  min-width: 0;
  /* Touch swipe across cells must reach our pointerenter handler instead of
     being consumed by browser scroll/zoom — we already provide our own
     gesture semantics for strumming. */
  touch-action: none;
}
.fb-corner { grid-row: 1; grid-column: 1; }
.fret-num {
  grid-row: 1;
  grid-column: calc(var(--fret) + 2);
  text-align: center;
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  align-self: end;
  padding-bottom: 0.2rem;
}
.fret-num.marker { color: var(--accent-primary); font-weight: 700; }
.string-label {
  grid-row: calc(var(--string) + 1);
  grid-column: 1;
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.fret-cell {
  position: relative;
  grid-row: calc(var(--string) + 1);
  grid-column: calc(var(--fret) + 2);
  display: grid;
  place-items: center;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}
.fret-cell.open { background: var(--bg-surface); border-style: dashed; }
.fret-cell.marker::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 4px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-primary);
  opacity: 0.45;
}
.fret-cell:hover { border-color: var(--accent-primary); }
.fret-cell.flash,
.fret-cell:active {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: scale(0.94);
  box-shadow: 0 0 14px var(--accent-glow);
}
.fret-note {
  font-size: 0.72rem;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}
.fret-cell.flash .fret-note,
.fret-cell:active .fret-note {
  color: var(--text-inverse);
}

/* OPEN STRINGS */
.strings-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
}
.strings-row {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.string {
  position: relative;
  display: grid;
  grid-template-columns: 90px 1fr 70px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.4rem 0.75rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: start;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.string:hover { border-color: var(--accent-primary); }
.string .lbl {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.string .note {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent-primary);
  text-align: end;
}
.line {
  height: 2px;
  background: linear-gradient(90deg, transparent 0%, var(--text-muted) 30%, var(--text-muted) 70%, transparent 100%);
  border-radius: 1px;
  transition: height var(--transition-fast), background var(--transition-fast);
}
.string.flash .line {
  height: 4px;
  background: linear-gradient(90deg, transparent 0%, var(--accent-primary) 30%, var(--accent-primary) 70%, transparent 100%);
  animation: vibrate 0.3s ease-out;
}
.string.flash {
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}
@keyframes vibrate {
  0%, 100% { transform: translateY(0); }
  20% { transform: translateY(-2px); }
  40% { transform: translateY(2px); }
  60% { transform: translateY(-1px); }
  80% { transform: translateY(1px); }
}

/* CHORDS */
.chords-panel {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  /* Disable browser-managed touch gestures so a finger swipe across the
     chord strings actually triggers our drag handlers instead of being
     consumed as a scroll/zoom. */
  touch-action: none;
}
.chord-grid {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 0.4rem;
}
.chord-card {
  padding: 0.5rem 0.3rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast),
    color var(--transition-fast);
}
.chord-card:hover { border-color: var(--accent-primary); }
.chord-card.active {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}
.chord-card .name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.2rem;
}
.chord-card.active .name { color: var(--text-inverse); }

.chord-play {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.85rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.chord-play-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.chord-play-head .title {
  font-size: 1.4rem;
  color: var(--accent-primary);
  font-family: var(--font-display);
  font-weight: 700;
}
.chord-play-head .hint {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}

.chord-strings {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  touch-action: none;
}
.chord-string {
  position: relative;
  display: grid;
  grid-template-columns: 1fr 80px;
  align-items: center;
  gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
  text-align: start;
}
.chord-string:hover { border-color: var(--accent-primary); }
.chord-string.flash {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 14px var(--accent-glow);
}
.chord-string.flash .note { color: var(--text-inverse); }
.chord-string .note {
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--accent-primary);
  text-align: end;
}

.strum-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.strum {
  padding: 0.7rem 0.5rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 1px solid var(--accent-secondary);
  color: var(--accent-secondary);
  background: transparent;
  border-radius: var(--radius);
  cursor: pointer;
}
.strum:active { background: var(--accent-secondary); color: var(--text-inverse); }

.strings-panel .hint {
  margin: 0 0 0.5rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.strings-row { touch-action: none; }

@media (max-width: 720px) {
  .string { grid-template-columns: 70px 1fr 70px; }
  .chord-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}

/* Portrait phones — flip the fretboard so strings are columns and frets are rows.
   Strings ordered low (6th) on the left, high (1st) on the right; frets read top-down. */
@media (orientation: portrait) and (max-width: 720px) {
  .fretboard { overflow: visible; padding: 0.5rem; }
  .fb-grid {
    grid-template-columns: 28px repeat(6, minmax(0, 1fr));
    grid-template-rows: 22px repeat(13, minmax(34px, 1fr));
    height: clamp(420px, 70vh, 760px);
  }
  .fret-num {
    grid-row: calc(var(--fret) + 2);
    grid-column: 1;
    align-self: center;
    padding: 0;
  }
  .string-label {
    grid-row: 1;
    grid-column: calc(8 - var(--string));
  }
  .fret-cell {
    grid-row: calc(var(--fret) + 2);
    grid-column: calc(8 - var(--string));
  }
  .bar { gap: 0.4rem; padding: 0.45rem 0.6rem; }
  .mode { padding: 0.4rem 0.7rem; font-size: 0.65rem; }
  .notation, .damp { padding: 0.4rem 0.7rem; font-size: 0.65rem; }
  .notation { margin-inline-start: 0; }
}
</style>
