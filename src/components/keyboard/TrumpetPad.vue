<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 8 — B♭ trumpet (rendered in concert pitch). Three valves +
// three partials covers a usable chromatic range. Picking valves alone
// doesn't make a sound — the user has to tap a partial cell to actually
// blow that pitch, the way a real trumpet works (valves choose the
// fingering, the embouchure picks which harmonic of that fingering
// rings).

const { t } = useI18n()
const audioStore = useAudioStore()
const { playOnTimed, dampInstrument } = useAudio()

// Standard semitone offset for each three-bit valve combination
// (1+2 = 3 semis down, etc) referenced from open. Index 0..7 = bits
// (3,2,1) → semitones: open=0, 2nd=1, 1st=2, 1+2=3, 2+3=4, 1+3=5, 1+2+3=6.
// We render them in playable order rather than bit order:
const FINGERINGS: { valves: readonly number[]; semiDown: number }[] = [
  { valves: [], semiDown: 0 },          // open
  { valves: [2], semiDown: 1 },         // 2
  { valves: [1], semiDown: 2 },         // 1
  { valves: [1, 2], semiDown: 3 },      // 1+2
  { valves: [2, 3], semiDown: 4 },      // 2+3
  { valves: [1, 3], semiDown: 5 },      // 1+3
  { valves: [1, 2, 3], semiDown: 6 },   // 1+2+3
]

// Three partials we expose. Open partial-3 = F4, partial-4 = B♭4,
// partial-5 = D5. Numbers are MIDI notes for "open" fingering — every
// other fingering is shifted down by `semiDown`.
const PARTIAL_BASES = [
  { label: 'low', baseMidi: 65 },   // F4 (partial 3 of B♭1 fundamental)
  { label: 'mid', baseMidi: 70 },   // B♭4 (partial 4)
  { label: 'high', baseMidi: 74 },  // D5 (partial 5)
]

// Currently held valves — purely informational on the pad (the cell
// click already encodes the fingering — but the valves visually
// "press" so the user sees what state would produce that note).
const heldValves = ref<Set<number>>(new Set())

interface Cell {
  valves: readonly number[]
  partial: 'low' | 'mid' | 'high'
  note: string
}

const cells = computed<Cell[]>(() => {
  const out: Cell[] = []
  for (const fing of FINGERINGS) {
    for (const partial of PARTIAL_BASES) {
      const midi = partial.baseMidi - fing.semiDown
      out.push({
        valves: fing.valves,
        partial: partial.label as 'low' | 'mid' | 'high',
        note: Tone.Frequency(midi, 'midi').toNote(),
      })
    }
  }
  return out
})

const flashed = ref<string>('')

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

function play(cell: Cell) {
  // Visual feedback: light up exactly the valves this fingering uses.
  heldValves.value = new Set(cell.valves)
  setTimeout(() => {
    heldValves.value = new Set()
  }, 350)
  void playOnTimed('trumpet', cell.note, 0.7, 110)
  flashed.value = `${cell.valves.join(',')}-${cell.partial}`
  setTimeout(() => {
    if (flashed.value === `${cell.valves.join(',')}-${cell.partial}`) flashed.value = ''
  }, 220)
}

function damp() {
  dampInstrument('trumpet')
}

function toggleNotation() {
  audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')
}
</script>

<template>
  <div class="trumpet">
    <header class="bar">
      <span class="title mono">{{ t('trumpet.hint') }}</span>
      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>
      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <!-- TODO(visual-asset): replace this CSS placeholder with a layered
         SVG of a trumpet bell + valve cluster in Phase 11. -->
    <div class="valve-row">
      <span
        v-for="v in [1, 2, 3]"
        :key="v"
        class="valve"
        :class="{ down: heldValves.has(v) }"
      >
        <span class="valve-cap" />
        <span class="valve-num mono">{{ v }}</span>
      </span>
    </div>

    <div class="grid">
      <button
        v-for="cell in cells"
        :key="`${cell.valves.join(',')}-${cell.partial}`"
        class="cell"
        :class="[
          cell.partial,
          { flash: flashed === `${cell.valves.join(',')}-${cell.partial}` },
        ]"
        @pointerdown="play(cell)"
      >
        <span class="cell-valves mono">
          {{ cell.valves.length === 0 ? t('trumpet.open') : cell.valves.join('+') }}
        </span>
        <span class="cell-note">{{ notationOf(cell.note) }}</span>
        <span class="cell-partial mono">{{ t(`trumpet.partial.${cell.partial}`) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.trumpet { display: flex; flex-direction: column; gap: 0.6rem; }
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
.title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; flex: 1; }
.notation, .damp { font-size: 0.7rem; padding: 0.4rem 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
.damp { border-color: var(--accent-secondary); color: var(--accent-secondary); }

.valve-row {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  padding: 0.4rem 0.6rem;
}
.valve {
  position: relative;
  display: grid;
  grid-template-rows: 36px auto;
  gap: 0.2rem;
  align-items: center;
  justify-items: center;
  width: 40px;
  transition: transform var(--transition-fast);
}
.valve.down { transform: translateY(6px); }
.valve-cap {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 2px solid var(--border);
  box-shadow: inset 0 -4px 10px rgba(0, 0, 0, 0.5);
}
.valve.down .valve-cap {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 14px var(--accent-glow);
}
.valve-num {
  font-size: 0.65rem;
  color: var(--text-muted);
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.45rem;
  padding: 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.cell {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  align-items: center;
  padding: 0.65rem 0.4rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}
.cell.low { border-left: 3px solid #06ffa5; }
.cell.mid { border-left: 3px solid #ccff00; }
.cell.high { border-left: 3px solid #ff5e9c; }
.cell:hover { border-color: var(--accent-primary); }
.cell.flash {
  background: var(--accent-primary);
  color: var(--text-inverse);
  transform: scale(0.96);
  box-shadow: 0 0 14px var(--accent-glow);
}
.cell-valves {
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cell.flash .cell-valves { color: var(--text-inverse); }
.cell-note {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--accent-primary);
}
.cell.flash .cell-note { color: var(--text-inverse); }
.cell-partial {
  font-size: 0.55rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.cell.flash .cell-partial { color: var(--text-inverse); }

@media (max-width: 480px) {
  .grid { gap: 0.3rem; padding: 0.5rem; }
  .cell { padding: 0.45rem 0.25rem; }
  .cell-note { font-size: 0.85rem; }
}
</style>
