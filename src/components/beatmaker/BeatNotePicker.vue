<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { INSTRUMENTS, noteOptionsFor } from '@/lib/instruments'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import type { InstrumentId } from '@/lib/types'

// Visual picker for the note (or sample) a beat-maker track plays. Replaces
// the dropdown so users can SEE the keyboard / drum pads while choosing —
// matches the rest of the app's no-typing, dropdowns-and-visuals design.
//
// Two layouts:
//   - 'sample' instruments (drums) → grid of pad buttons, one per kit piece
//   - 'note' instruments (everything else) → mini piano keyboard scoped to
//     that instrument's playable range (noteOptionsFor)
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

const samples = computed(() =>
  isSample.value ? (meta.value.samples ?? []) : [],
)

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
  if (isSample.value) return []
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
  <div class="picker" :class="{ sample: isSample }">
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

    <div v-else class="kbd-wrap">
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
.hint {
  font-size: 0.72rem;
  color: var(--accent-primary);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
