<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChaos, type ArpMode, type MaqamId } from '@/composables/useChaos'
import { MAQAM_PRESETS } from '@/lib/microtonal'
import { GUITAR_CHORDS, STRING_PRESETS } from '@/lib/instrumentPresets'

// AutoArp — dropdown chord builder (no typing) feeds the arpeggiator.
//
// Earlier iteration used a free-text input ("C4 E4 G4 B4") which broke
// the project's "no typing in UI" rule. The builder now composes the
// chord from three scoped dropdowns:
//   - Root note (12 chromatic, locked to a single octave)
//   - Quality (Western triads, sevenths, sixths, sus chords)
//   - Maqam override — when set, ignores root + quality and builds
//     the chord from the maqam's 1 / 3 / 5 / 7 scale degrees
//     (semitone-rounded, since the arp engine plays through the
//     12-TET instrument path).
//
// Octave stays at 4 — moves outside that range happen via the
// existing octave drift in useChaos rather than UI.

const { startArp, stopArp, arpRunning } = useChaos()
const { t } = useI18n()

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
type RootKey = typeof KEYS[number]

const QUALITIES = [
  'maj', 'min', 'dim', 'aug',
  'sus2', 'sus4',
  'maj7', 'min7', '7', 'min7b5',
  '6', 'min6',
] as const
type Quality = typeof QUALITIES[number]

// Semitone offsets per quality. Indexed from the root.
const QUALITY_INTERVALS: Record<Quality, readonly number[]> = {
  maj:    [0, 4, 7],
  min:    [0, 3, 7],
  dim:    [0, 3, 6],
  aug:    [0, 4, 8],
  sus2:   [0, 2, 7],
  sus4:   [0, 5, 7],
  maj7:   [0, 4, 7, 11],
  min7:   [0, 3, 7, 10],
  '7':    [0, 4, 7, 10],
  min7b5: [0, 3, 6, 10],
  '6':    [0, 4, 7, 9],
  min6:   [0, 3, 7, 9],
}

const MAQAM_IDS: MaqamId[] = [
  'rast', 'bayati', 'hijaz', 'saba', 'sika', 'nahawand', 'kurd', 'ajam',
]

// "Source" picks where the chord notes come from. 'custom' is the
// root + quality builder; 'guitar' / 'violin' / 'cello' / 'oud' pull
// from the shared instrumentPresets — same notes the corresponding
// pad uses, so the user can echo a guitar chord card or a bowed
// instrument's open strings into the arp without having to type or
// remember the voicing.
// 'typed' is the paste destination: the Random Melody generator's
// "Copy" button puts a space-separated note list on the clipboard;
// the user pastes it here and the arp plays it. Accepts Western
// letters (C4 D#4 Eb3) and Arabic / Italian solfège (do4 re4 mi4),
// space / comma / dot-separated — same grammar the chaos custom-
// melody box uses, so a melody copied from anywhere round-trips.
type ChordSource = 'custom' | 'guitar' | 'strings' | 'typed'
const source = ref<ChordSource>('custom')
const guitarChordId = ref(GUITAR_CHORDS[0].id)
const stringSetId = ref(STRING_PRESETS[0].id)
const typedText = ref('')

const SOLFEGE_MAP: Record<string, string> = {
  do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B', ti: 'B',
}
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d{1,2})$/
const SOLFEGE_RE = /^(do|re|mi|fa|sol|la|si|ti)([#b]?)(-?\d{1,2})$/i

function parseTypedNotes(text: string): string[] {
  const tokens = text.split(/[\s,·]+/).map((s) => s.trim()).filter(Boolean)
  const out: string[] = []
  for (const raw of tokens) {
    const m = NOTE_RE.exec(raw)
    if (m) {
      out.push(`${m[1].toUpperCase()}${m[2]}${m[3]}`)
      continue
    }
    const s = SOLFEGE_RE.exec(raw)
    if (s) {
      const letter = SOLFEGE_MAP[s[1].toLowerCase()]
      if (letter) out.push(`${letter}${s[2]}${s[3]}`)
    }
  }
  return out
}

const typedNotes = computed(() => parseTypedNotes(typedText.value))

async function pasteFromClipboard() {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      const txt = await navigator.clipboard.readText()
      if (txt) typedText.value = txt
    }
  } catch {
    /* clipboard read blocked — user can still paste manually into the box */
  }
}

const root = ref<RootKey>('C')
const quality = ref<Quality>('maj')
const maqam = ref<MaqamId | null>(null)
const octave = ref(4)
const mode = ref<ArpMode>('up')
const speed = ref(0.18)
const gate = ref(0.7)

const modes: ArpMode[] = ['up', 'down', 'random', 'chord']

// Picking a non-custom source clears the maqam override since the
// preset already specifies its own voicing. Without this you could
// pick "Guitar — Em" and "Maqam: Hijaz" and the maqam would silently
// take precedence in the chord computed below; toggling the source
// makes the relationship visible.
watch(source, (s) => {
  if (s !== 'custom') maqam.value = null
})

/**
 * Convert a maqam preset's quarter-tone steps into semitone offsets
 * from the maqam's tonic. Same rounding rule the chaos melody and
 * recorder tune use — multiple quarter-tones collapsing to the same
 * semitone are deduped, result sorted ascending.
 */
function maqamSemitones(id: MaqamId): { offsets: number[]; tonic: string } {
  const m = MAQAM_PRESETS[id]
  const semis = new Set<number>()
  for (const step of m.steps) semis.add(Math.round(step / 2) % 12)
  return {
    offsets: [...semis].sort((a, b) => a - b),
    tonic: m.tonic,
  }
}

const chord = computed<string[]>(() => {
  if (source.value === 'typed') {
    return typedNotes.value
  }
  if (source.value === 'guitar') {
    const c = GUITAR_CHORDS.find((x) => x.id === guitarChordId.value)
    return c ? [...c.notes] : []
  }
  if (source.value === 'strings') {
    const s = STRING_PRESETS.find((x) => x.id === stringSetId.value)
    return s ? [...s.notes] : []
  }
  if (maqam.value) {
    const { offsets, tonic } = maqamSemitones(maqam.value)
    const tonicIdx = KEYS.indexOf(tonic as RootKey)
    if (tonicIdx < 0) return []
    // Pick scale degrees 1, 3, 5, 7 — the same chord shape every
    // maqam-aware composer picks first when stacking thirds. Drops
    // out the 7th if the maqam only has 6 distinct semitones.
    const degrees = [0, 2, 4, 6].filter((d) => d < offsets.length)
    return degrees.map((d) => {
      const semi = offsets[d]
      const noteIdx = (tonicIdx + semi) % 12
      const oct = octave.value + Math.floor((tonicIdx + semi) / 12)
      return `${KEYS[noteIdx]}${oct}`
    })
  }
  const rootIdx = KEYS.indexOf(root.value)
  if (rootIdx < 0) return []
  const intervals = QUALITY_INTERVALS[quality.value]
  return intervals.map((semi) => {
    const noteIdx = (rootIdx + semi) % 12
    const oct = octave.value + Math.floor((rootIdx + semi) / 12)
    return `${KEYS[noteIdx]}${oct}`
  })
})

async function toggle() {
  if (arpRunning.value) {
    stopArp()
    return
  }
  if (chord.value.length === 0) return
  await startArp(chord.value, mode.value, speed.value, gate.value)
}
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.autoArp') }}</h4>
      <button class="play" :class="{ on: arpRunning }" @click="toggle">
        {{ arpRunning ? '◼' : '▶' }}
      </button>
    </header>

    <!-- Source picker — where the chord notes come from. Switching
         away from "Custom" hides the root / quality / octave / maqam
         row and shows the source-specific picker instead. -->
    <label class="field full">
      <span class="lbl mono">{{ t('chaos.chord.source') }}</span>
      <select v-model="source">
        <option value="custom">{{ t('chaos.chord.sourceCustom') }}</option>
        <option value="typed">{{ t('chaos.chord.sourceTyped') }}</option>
        <option value="guitar">{{ t('chaos.chord.sourceGuitar') }}</option>
        <option value="strings">{{ t('chaos.chord.sourceStrings') }}</option>
      </select>
    </label>

    <!-- Typed / paste: the destination for a melody copied from the
         Random Melody generator (or anywhere). Paste button pulls
         straight from the clipboard; the box is editable too. -->
    <template v-if="source === 'typed'">
      <div class="paste-head">
        <span class="lbl mono">{{ t('chaos.chord.typedNotes') }}</span>
        <button type="button" class="paste-btn mono" @click="pasteFromClipboard">
          ⧉ {{ t('chaos.chord.paste') }}
        </button>
      </div>
      <textarea
        v-model="typedText"
        class="paste-input mono"
        :placeholder="t('chaos.chord.typedPlaceholder')"
        rows="2"
      />
      <p class="parsed mono">
        {{ t('chaos.chord.typedParsed', { n: typedNotes.length }) }}
      </p>
    </template>

    <!-- Custom: existing root + quality + octave + maqam builder. -->
    <template v-if="source === 'custom'">
      <div class="builder">
        <label class="field">
          <span class="lbl mono">{{ t('chaos.chord.root') }}</span>
          <select v-model="root" :disabled="maqam !== null">
            <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
          </select>
        </label>
        <label class="field">
          <span class="lbl mono">{{ t('chaos.chord.quality') }}</span>
          <select v-model="quality" :disabled="maqam !== null">
            <option v-for="q in QUALITIES" :key="q" :value="q">{{ q }}</option>
          </select>
        </label>
        <label class="field">
          <span class="lbl mono">{{ t('chaos.chord.octave') }}</span>
          <select v-model.number="octave">
            <option :value="3">3</option>
            <option :value="4">4</option>
            <option :value="5">5</option>
          </select>
        </label>
      </div>
      <label class="field full">
        <span class="lbl mono">{{ t('chaos.maqam') }}</span>
        <select v-model="maqam">
          <option :value="null">{{ t('chaos.maqamNone') }}</option>
          <option v-for="m in MAQAM_IDS" :key="m" :value="m">
            {{ MAQAM_PRESETS[m].name }} ({{ MAQAM_PRESETS[m].tonic }})
          </option>
        </select>
      </label>
    </template>

    <!-- Guitar chord cards — picks one of the eight first-position
         chords the GuitarPad ships with. Same voicing the player gets
         tapping that chord card directly. -->
    <label v-else-if="source === 'guitar'" class="field full">
      <span class="lbl mono">{{ t('chaos.chord.guitarChord') }}</span>
      <select v-model="guitarChordId">
        <option v-for="c in GUITAR_CHORDS" :key="c.id" :value="c.id">
          {{ c.name }} — {{ c.notes.join(' ') }}
        </option>
      </select>
    </label>

    <!-- Bowed / oud open strings. The chord is the open-string column
         of the picked instrument; arping it produces the natural
         "play every string in turn" pattern. Explicit v-else-if (not
         a bare v-else) so it doesn't also render when source==='typed'
         — that block is a separate v-if above the custom chain. -->
    <label v-else-if="source === 'strings'" class="field full">
      <span class="lbl mono">{{ t('chaos.chord.stringSet') }}</span>
      <select v-model="stringSetId">
        <option v-for="s in STRING_PRESETS" :key="s.id" :value="s.id">
          {{ s.name }} — {{ s.notes.join(' ') }}
        </option>
      </select>
    </label>

    <p class="preview mono">
      <span class="preview-lbl">{{ t('chaos.chord.preview') }}</span>
      <span class="preview-notes">{{ chord.join(' · ') || '—' }}</span>
    </p>

    <div class="modes">
      <button
        v-for="m in modes"
        :key="m"
        class="mode mono"
        :class="{ on: mode === m }"
        @click="mode = m"
      >
        {{ t(`chaos.arpMode.${m}`) }}
      </button>
    </div>

    <label class="field">
      <span class="lbl mono">{{ t('chaos.arpSpeed') }} {{ speed.toFixed(2) }}s</span>
      <input v-model.number="speed" type="range" min="0.05" max="0.6" step="0.01" />
    </label>

    <label class="field">
      <span class="lbl mono">{{ t('chaos.arpGate') }} {{ Math.round(gate * 100) }}%</span>
      <input v-model.number="gate" type="range" min="0.1" max="1" step="0.05" />
    </label>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.head { display: flex; align-items: center; justify-content: space-between; }
.head h4 {
  margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
}
.play {
  width: 36px; height: 36px; padding: 0;
  background: var(--accent-primary); color: var(--text-inverse); border: none;
  font-size: 0.95rem;
}
.play.on { background: var(--accent-secondary); }

.paste-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.paste-btn {
  font-size: 0.62rem;
  padding: 0.25rem 0.7rem;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--accent-primary);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.paste-btn:hover { background: var(--accent-primary); color: var(--text-inverse); }
.paste-input {
  width: 100%;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.6rem;
  font-size: 0.78rem;
  resize: vertical;
  min-height: 42px;
}
.paste-input:focus { outline: none; border-color: var(--accent-primary); }
.parsed {
  margin: 0;
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.builder {
  display: grid;
  grid-template-columns: 1fr 1.4fr 0.7fr;
  gap: 0.4rem;
}
.field { display: flex; flex-direction: column; gap: 0.25rem; }
.field.full { grid-column: 1 / -1; }
.lbl { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
select:disabled { opacity: 0.45; cursor: not-allowed; }

.preview {
  margin: 0;
  padding: 0.45rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.7rem;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
}
.preview-lbl { color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.preview-notes { color: var(--accent-primary); word-break: break-word; }

.modes { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.mode {
  font-size: 0.7rem;
  padding: 0.35rem 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mode.on { color: var(--accent-primary); border-color: var(--accent-primary); }
input[type='range'] { width: 100%; padding: 0; }
</style>
