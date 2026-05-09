<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import * as Tone from 'tone'
import { useI18n } from 'vue-i18n'
import { INSTRUMENTS, noteOptionsFor } from '@/lib/instruments'
import { MAQAM_PRESETS } from '@/lib/microtonal'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import type { InstrumentId } from '@/lib/types'

// Visual picker for the note (or sample) a beat-maker track plays. Replaces
// the dropdown so users can SEE the instrument layout while choosing — matches
// the rest of the app's no-typing, dropdowns-and-visuals design.
//
// Three layouts:
//   - 'sample' instruments (drums) → grid of pad buttons, one per kit piece
//   - 'guitar' → 6-string × 13-fret board mirroring the live-play layout, so
//     pitch picking matches what the player already knows from the studio
//   - everything else → mini piano keyboard scoped to that instrument's
//     playable range (noteOptionsFor)
//
// Clicking previews the sound through the same audio chain the beat-maker
// will use, so you hear what you're picking before committing.

const props = defineProps<{
  instrument: InstrumentId
  modelValue: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const { t } = useI18n()
const audio = useAudio()
const audioStore = useAudioStore()

const meta = computed(() => INSTRUMENTS[props.instrument])
const isSample = computed(() => meta.value.playMode === 'sample')
const isGuitar = computed(() => props.instrument === 'guitar')

// — Maqam presets (Phase 9 follow-up) —
// Microtonal-capable instruments (violin / cello / oud) get a chip row
// above the keyboard so a beat-maker user can scope the picker to a
// maqam. The chip highlights every key whose pitch class is in the
// maqam (semitone-rounded — the beat maker stores 12-TET notes only,
// quarter-tone playback happens on the live pads). Clicking a chip
// also seeds the picked note with the maqam's tonic so a fresh track
// starts from a sensible anchor.
const showsMaqam = computed(
  () => meta.value.hasQuarterTones === true && !isSample.value && !isGuitar.value,
)
const MAQAM_KEYS = Object.keys(MAQAM_PRESETS) as Array<keyof typeof MAQAM_PRESETS>
const selectedMaqam = ref<keyof typeof MAQAM_PRESETS | null>(null)
// Reset the maqam when the user picks a different instrument — a
// rast preset selected for a violin shouldn't carry over to a piano
// track that doesn't surface chips at all.
watch(
  () => props.instrument,
  () => { selectedMaqam.value = null },
)

const TONIC_SEMITONE: Record<string, number> = {
  C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
}

/** Pitch-class offsets (mod 12) of the chosen maqam, computed from its
 *  quarter-tone steps rounded to the nearest semitone. */
const maqamOffsets = computed<Set<number>>(() => {
  if (!selectedMaqam.value) return new Set()
  const m = MAQAM_PRESETS[selectedMaqam.value]
  return new Set(m.steps.map((s) => Math.round(s / 2) % 12))
})

/** Notes that should glow as "in the chosen maqam" on the keyboard. */
const maqamHighlightedNotes = computed<Set<string>>(() => {
  if (!selectedMaqam.value) return new Set()
  const m = MAQAM_PRESETS[selectedMaqam.value]
  const tonicSemi = TONIC_SEMITONE[m.tonic] ?? 0
  const offsets = maqamOffsets.value
  const out = new Set<string>()
  for (const note of allowed.value) {
    try {
      const midi = Tone.Frequency(note).toMidi()
      const off = ((midi - tonicSemi) % 12 + 12) % 12
      if (offsets.has(off)) out.add(note)
    } catch {
      /* skip un-parseable note */
    }
  }
  return out
})

function pickMaqam(k: keyof typeof MAQAM_PRESETS) {
  // Toggle off when the same chip is tapped twice — the user just
  // wants to clear the highlight without hopping to another maqam.
  if (selectedMaqam.value === k) {
    selectedMaqam.value = null
    return
  }
  selectedMaqam.value = k
  const tonicNote = `${MAQAM_PRESETS[k].tonic}4`
  if (allowed.value.includes(tonicNote)) {
    pick(tonicNote)
  }
}

const samples = computed(() =>
  isSample.value ? (meta.value.samples ?? []) : [],
)

// Guitar tab-convention: string 1 (high E) on top, string 6 (low E) on bottom.
const GUITAR_STRINGS = [
  { idx: 1, open: 'E4' },
  { idx: 2, open: 'B3' },
  { idx: 3, open: 'G3' },
  { idx: 4, open: 'D3' },
  { idx: 5, open: 'A2' },
  { idx: 6, open: 'E2' },
] as const
const GUITAR_FRETS = 13

interface FretCell { string: number; fret: number; note: string }
const guitarCells = computed<FretCell[]>(() => {
  if (!isGuitar.value) return []
  const out: FretCell[] = []
  for (const s of GUITAR_STRINGS) {
    for (let f = 0; f < GUITAR_FRETS; f++) {
      let note: string = s.open
      try { note = Tone.Frequency(s.open).transpose(f).toNote() as string } catch { /* fall back to open */ }
      out.push({ string: s.idx, fret: f, note })
    }
  }
  return out
})

interface PianoKey {
  note: string
  isBlack: boolean
  octave: number
  // Position of the key center (in white-key units) from the left edge of the
  // keyboard. White keys land on integer positions; black keys land between
  // their two neighbours.
  whiteIndex: number
}

const allowed = computed(() =>
  isSample.value ? [] : (noteOptionsFor(props.instrument) as readonly string[]),
)

const keys = computed<PianoKey[]>(() => {
  if (isSample.value || isGuitar.value) return []
  const ordered = [...allowed.value]
  // Build a parallel keyboard grid spanning every allowed octave.
  const parsed = ordered.map(parseNote).filter((p): p is { name: string; octave: number; semitone: number } => !!p)
  if (parsed.length === 0) return []
  const minOct = Math.min(...parsed.map((p) => p.octave))
  const maxOct = Math.max(...parsed.map((p) => p.octave))

  const cells: PianoKey[] = []
  let whiteCount = 0
  const WHITE = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
  const BLACK_AFTER: Record<string, string> = { C: 'C#', D: 'D#', F: 'F#', G: 'G#', A: 'A#' }

  for (let oct = minOct; oct <= maxOct; oct++) {
    for (const w of WHITE) {
      const noteName = `${w}${oct}`
      cells.push({ note: noteName, isBlack: false, octave: oct, whiteIndex: whiteCount })
      const black = BLACK_AFTER[w]
      if (black) {
        cells.push({
          note: `${black}${oct}`,
          isBlack: true,
          octave: oct,
          whiteIndex: whiteCount + 0.7,
        })
      }
      whiteCount += 1
    }
  }
  return cells
})

const totalWhites = computed(() => {
  if (isSample.value) return 0
  return keys.value.filter((k) => !k.isBlack).length
})

function parseNote(n: string): { name: string; octave: number; semitone: number } | null {
  const m = n.match(/^([A-G]#?)(-?\d+)$/)
  if (!m) return null
  return { name: m[1], octave: Number(m[2]), semitone: 0 }
}

function isAllowed(note: string): boolean {
  return allowed.value.includes(note)
}

function pick(value: string) {
  emit('update:modelValue', value)
  // Preview through the real audio chain so the user hears exactly what the
  // beat maker will play. Short timed trigger so it auto-releases — no risk
  // of a sustaining synth (bass, pad) latching from the preview.
  void audio.playOnTimed(props.instrument, value, 0.3, 100)
}

function pickSample(name: string) {
  emit('update:modelValue', name)
  void audio.playOnTimed(props.instrument, name, 0.3, 110)
}

function noteLabel(note: string): string {
  return formatNote(note, audioStore.notation)
}
</script>

<template>
  <div class="picker" :class="{ sample: isSample, guitar: isGuitar }">
    <div v-if="isSample" class="pads">
      <button
        v-for="s in samples"
        :key="s"
        type="button"
        class="pad mono"
        :class="{ on: modelValue === s }"
        @click="pickSample(s)"
      >
        {{ s }}
      </button>
    </div>

    <div v-else-if="isGuitar" class="fb-wrap">
      <div class="fb-grid">
        <span class="fb-corner" />
        <span
          v-for="f in GUITAR_FRETS"
          :key="`fnum-${f - 1}`"
          class="fret-num mono"
          :style="{ '--fret': f - 1 }"
        >{{ f - 1 }}</span>
        <span
          v-for="s in GUITAR_STRINGS"
          :key="`slbl-${s.idx}`"
          class="string-label mono"
          :style="{ '--string': s.idx }"
        >{{ s.idx }}</span>
        <button
          v-for="cell in guitarCells"
          :key="`${cell.string}-${cell.fret}`"
          type="button"
          class="fret-cell"
          :class="{ on: modelValue === cell.note, open: cell.fret === 0 }"
          :style="{ '--string': cell.string, '--fret': cell.fret }"
          @click="pick(cell.note)"
        >
          <span class="fret-note mono">{{ noteLabel(cell.note) }}</span>
        </button>
      </div>
      <p class="hint mono">{{ t('binding.note') }}: {{ noteLabel(modelValue) }}</p>
    </div>

    <div v-else class="kbd-wrap">
      <!-- Phase 9 follow-up: maqam chips for hasQuarterTones instruments
           (violin / cello / oud). Highlights the in-scale keys and seeds
           the picked note with the maqam's tonic. -->
      <div v-if="showsMaqam" class="maqam-chips">
        <span class="maqam-label mono">{{ t('violin.maqam') }}</span>
        <button
          v-for="k in MAQAM_KEYS"
          :key="k"
          type="button"
          class="maqam-chip mono"
          :class="{ on: selectedMaqam === k }"
          @click="pickMaqam(k)"
        >
          {{ MAQAM_PRESETS[k].name }}
        </button>
      </div>
      <div class="kbd" :style="{ '--whites': totalWhites }">
        <button
          v-for="k in keys"
          :key="k.note"
          type="button"
          class="key"
          :class="{
            black: k.isBlack,
            white: !k.isBlack,
            on: modelValue === k.note,
            maqam: maqamHighlightedNotes.has(k.note),
            disabled: !isAllowed(k.note),
          }"
          :disabled="!isAllowed(k.note)"
          :style="{ '--w-idx': k.whiteIndex }"
          @click="pick(k.note)"
        >
          <span v-if="!k.isBlack" class="lbl">{{ noteLabel(k.note) }}</span>
        </button>
      </div>
      <p class="hint mono">{{ t('binding.note') }}: {{ noteLabel(modelValue) }}</p>
    </div>
  </div>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

/* — Sample / drum-pad layout — */
.pads {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(70px, 1fr));
  gap: 0.4rem;
}
.pad {
  padding: 0.7rem 0.5rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast),
    transform var(--transition-fast);
}
.pad:hover { border-color: var(--accent-primary); }
.pad:active { transform: scale(0.96); }
.pad.on {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}

/* — Mini-piano layout — */
.kbd-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.kbd {
  position: relative;
  width: 100%;
  height: 110px;
  /* Each white key is 1 / --whites of the total width. Black keys are 60% as
     wide and overlay the white keys via absolute positioning by --w-idx. */
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0;
}
.key {
  position: absolute;
  top: 0;
  bottom: 0;
  padding: 0;
  border-radius: 0 0 4px 4px;
  cursor: pointer;
  transition: background var(--transition-fast), opacity var(--transition-fast);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  font-size: 0.62rem;
  font-family: var(--font-mono);
}
.key.white {
  width: calc(100% / var(--whites));
  left: calc(var(--w-idx) * 100% / var(--whites));
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  z-index: 1;
}
.key.white .lbl {
  padding: 0 0 0.3rem;
  opacity: 0.55;
}
.key.black {
  width: calc(100% / var(--whites) * 0.6);
  left: calc(var(--w-idx) * 100% / var(--whites));
  height: 65%;
  background: #060614;
  border: 1px solid var(--border);
  color: var(--text-inverse);
  z-index: 2;
  transform: translateX(-15%);
}
.key.white:hover:not(:disabled) { background: var(--bg-surface); border-color: var(--accent-primary); }
.key.black:hover:not(:disabled) { background: #0e0e22; border-color: var(--accent-primary); }
.key.on.white {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
  box-shadow: 0 0 12px var(--accent-glow);
}
.key.on.white .lbl { opacity: 1; }
.key.on.black {
  background: var(--accent-secondary);
  border-color: var(--accent-secondary);
  box-shadow: 0 0 12px var(--accent-secondary);
}
.key.disabled {
  opacity: 0.18;
  cursor: not-allowed;
}
/* Maqam-highlighted keys — subtle accent so the tonic + scale degrees
   read at a glance without overpowering the picker's existing on/off
   states. White and black keys get separate treatments because their
   base colors are inverted. */
.key.maqam.white:not(.on):not(.disabled) {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 12%, var(--bg-elevated));
}
.key.maqam.black:not(.on):not(.disabled) {
  border-color: var(--accent-primary);
  background: color-mix(in srgb, var(--accent-primary) 24%, #060614);
}

.maqam-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.4rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.maqam-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-inline-end: 0.3rem;
}
.maqam-chip {
  font-size: 0.65rem;
  padding: 0.3rem 0.6rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.04em;
  transition: border-color var(--transition-fast), color var(--transition-fast),
    background var(--transition-fast);
}
.maqam-chip:hover { border-color: var(--accent-primary); }
.maqam-chip.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
  box-shadow: 0 0 8px var(--accent-glow);
}
.hint {
  font-size: 0.72rem;
  color: var(--accent-primary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* — Guitar fretboard layout — */
.fb-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.fb-grid {
  display: grid;
  grid-template-columns: 28px repeat(13, minmax(34px, 1fr));
  grid-template-rows: 18px repeat(6, 30px);
  gap: 3px;
  overflow-x: auto;
  padding: 0.4rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.fb-corner { grid-row: 1; grid-column: 1; }
.fb-grid .fret-num {
  grid-row: 1;
  grid-column: calc(var(--fret) + 2);
  text-align: center;
  font-size: 0.6rem;
  color: var(--text-muted);
  align-self: end;
}
.fb-grid .string-label {
  grid-row: calc(var(--string) + 1);
  grid-column: 1;
  display: grid;
  place-items: center;
  font-size: 0.65rem;
  color: var(--text-muted);
}
.fb-grid .fret-cell {
  grid-row: calc(var(--string) + 1);
  grid-column: calc(var(--fret) + 2);
  display: grid;
  place-items: center;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  padding: 0;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.fb-grid .fret-cell.open { background: var(--bg-surface); border-style: dashed; }
.fb-grid .fret-cell:hover { border-color: var(--accent-primary); }
.fb-grid .fret-cell.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  box-shadow: 0 0 10px var(--accent-glow);
}
.fb-grid .fret-cell .fret-note {
  font-size: 0.6rem;
  color: var(--text-primary);
}
.fb-grid .fret-cell.on .fret-note { color: var(--text-inverse); }
</style>
