<script setup lang="ts">
import { ref, computed } from 'vue'
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

const fretboard = computed(() =>
  STRINGS.map((s) => ({
    string: s,
    cells: Array.from({ length: FRET_COUNT }, (_, fret) => ({
      fret,
      note: noteAtFret(s.open, fret),
    })),
  })),
)

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
      <div class="fret-numbers">
        <span class="string-label" />
        <span
          v-for="f in FRET_COUNT"
          :key="f - 1"
          class="fret-num mono"
          :class="{ marker: FRET_MARKERS.has(f - 1) || (f - 1) === DOUBLE_MARKER }"
        >
          {{ f - 1 }}
        </span>
      </div>
      <div v-for="row in fretboard" :key="row.string.idx" class="fret-row">
        <span class="string-label mono">{{ row.string.name }}</span>
        <button
          v-for="cell in row.cells"
          :key="cell.fret"
          class="fret-cell"
          :class="{
            open: cell.fret === 0,
            flash: flashed === cell.note,
            marker: FRET_MARKERS.has(cell.fret) || cell.fret === DOUBLE_MARKER,
          }"
          @pointerdown="pluck(cell.note)"
        >
          <span class="fret-note mono">{{ formatNote(cell.note, audioStore.notation) }}</span>
        </button>
      </div>
    </section>

    <!-- OPEN STRINGS -->
    <section v-else-if="mode === 'strings'" class="strings-panel">
      <div class="strings-row">
        <button
          v-for="s in [...STRINGS].reverse()"
          :key="s.open"
          class="string"
          :class="{ flash: flashed === s.open }"
          @pointerdown="pluck(s.open)"
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
        <div v-for="c in CHORDS" :key="c.name" class="chord-cell">
          <button class="chord up" :title="t('guitar.strumDown')" @pointerdown="strum(c.notes, false)">
            <span class="name">{{ formatChord(c.name, audioStore.notation) }}</span>
            <span class="dir mono">↓</span>
          </button>
          <button class="chord down" :title="t('guitar.strumUp')" @pointerdown="strum(c.notes, true)">
            <span class="dir mono">↑</span>
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
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow-x: auto;
}
.fret-numbers,
.fret-row {
  display: grid;
  grid-template-columns: 32px repeat(13, minmax(50px, 1fr));
  gap: 4px;
  align-items: stretch;
}
.fret-numbers { padding-bottom: 0.2rem; }
.fret-num {
  text-align: center;
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.fret-num.marker { color: var(--accent-primary); font-weight: 700; }
.string-label {
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.fret-cell {
  position: relative;
  display: grid;
  place-items: center;
  height: 38px;
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
}
.chord-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.5rem;
}
.chord-cell {
  display: grid;
  grid-template-rows: 1fr auto;
  gap: 0.25rem;
}
.chord {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.7rem 0.4rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast);
}
.chord:hover { border-color: var(--accent-primary); }
.chord:active { background: var(--accent-primary); color: var(--text-inverse); }
.chord.up { padding-top: 1rem; }
.chord.down { padding: 0.35rem; }
.chord .name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 1.4rem;
  color: var(--accent-primary);
}
.chord:active .name { color: var(--text-inverse); }
.chord .dir { font-size: 0.85rem; color: var(--text-muted); }

@media (max-width: 720px) {
  .string { grid-template-columns: 70px 1fr 70px; }
  .chord-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
