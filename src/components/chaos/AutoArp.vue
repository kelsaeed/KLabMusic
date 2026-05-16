<script setup lang="ts">
import * as Tone from 'tone'
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

const { startArp, startSequence, stopArp, arpRunning, arpStepIndex } = useChaos()
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

function parseOneNote(raw: string): string | null {
  const m = NOTE_RE.exec(raw)
  if (m) {
    const n = `${m[1].toUpperCase()}${m[2]}${m[3]}`
    try { Tone.Frequency(n).toMidi(); return n } catch { return null }
  }
  const s = SOLFEGE_RE.exec(raw)
  if (s) {
    const letter = SOLFEGE_MAP[s[1].toLowerCase()]
    if (!letter) return null
    const n = `${letter}${s[2]}${s[3]}`
    try { Tone.Frequency(n).toMidi(); return n } catch { return null }
  }
  return null
}

// — Piano-roll step model —
// `steps[i]` = the notes sounding at step i; [] = a rest. The text box
// and the grid are two views of this one model. Text grammar (a small,
// reversible extension of the old flat list): tokens separated by
// whitespace/comma/· are steps; `+` inside a token groups notes into a
// chord step (C4+E4+G4); `_` (or `-`) is a rest. serializeStepsToText
// is the exact inverse of parseStepsFromText, so a round-trip through
// either view is lossless and the two never drift apart.
const MAX_STEPS = 64
const steps = ref<string[][]>([])

function midiOf(note: string): number {
  try { return Tone.Frequency(note).toMidi() } catch { return 60 }
}
function sortByMidi(notes: string[]): string[] {
  return [...notes].sort((a, b) => midiOf(a) - midiOf(b))
}
function parseStepsFromText(text: string): string[][] {
  const tokens = text.split(/[\s,·]+/).map((s) => s.trim()).filter(Boolean)
  const out: string[][] = []
  for (const tok of tokens.slice(0, MAX_STEPS)) {
    if (tok === '_' || tok === '-') { out.push([]); continue }
    const notes: string[] = []
    for (const part of tok.split('+')) {
      const n = parseOneNote(part)
      if (n && !notes.includes(n)) notes.push(n)
    }
    if (notes.length > 0) out.push(sortByMidi(notes))
  }
  return out
}
function serializeStepsToText(s: string[][]): string {
  return s.map((step) => (step.length === 0 ? '_' : step.join('+'))).join(' ')
}

// — Pitch window (the visible rows of the roll) —
// Declared before the sync watch: its immediate run can call
// fitWindowIfNeeded(), which reads windowLowMidi — a TDZ crash if the
// ref were declared later and the text ever seeded non-empty.
const ROWS = 24
const windowLowMidi = ref(48) // C3 at the bottom by default

// Two-way sync, compare-guarded so neither side can loop the other:
// a text edit reparses only when the text differs from what the grid
// would serialise to, and commitSteps only rewrites the text when it
// actually changed. immediate:true seeds the grid from any existing /
// pre-pasted text.
watch(typedText, (txt) => {
  if (txt === serializeStepsToText(steps.value)) return
  steps.value = parseStepsFromText(txt)
  fitWindowIfNeeded()
}, { immediate: true })

function commitSteps() {
  const txt = serializeStepsToText(steps.value)
  if (txt !== typedText.value) typedText.value = txt
}

const rowMidis = computed(() => {
  // High pitch first so the grid reads like a real piano roll.
  const arr: number[] = []
  for (let r = ROWS - 1; r >= 0; r--) arr.push(windowLowMidi.value + r)
  return arr
})
function noteName(midi: number): string {
  try { return Tone.Frequency(midi, 'midi').toNote() } catch { return '' }
}
function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}
function allMidis(): number[] {
  const ms: number[] = []
  for (const st of steps.value) for (const n of st) ms.push(midiOf(n))
  return ms
}
function clampWindow(low: number): number {
  return Math.max(12, Math.min(96, low))
}
function shiftWindow(semi: number) {
  windowLowMidi.value = clampWindow(windowLowMidi.value + semi)
}
function fitWindow() {
  const ms = allMidis()
  if (ms.length === 0) return
  const mid = Math.round((Math.min(...ms) + Math.max(...ms)) / 2)
  windowLowMidi.value = clampWindow(mid - Math.floor(ROWS / 2))
}
function fitWindowIfNeeded() {
  const ms = allMidis()
  if (ms.length === 0) return
  const top = windowLowMidi.value + ROWS - 1
  if (Math.min(...ms) < windowLowMidi.value || Math.max(...ms) > top) fitWindow()
}

// — Cell / step editing (the grid is directly mutable) —
function cellActive(stepIdx: number, midi: number): boolean {
  const st = steps.value[stepIdx]
  return !!st && st.includes(noteName(midi))
}
function toggleCell(stepIdx: number, midi: number) {
  const name = noteName(midi)
  const st = steps.value[stepIdx] ? [...steps.value[stepIdx]] : []
  const at = st.indexOf(name)
  if (at >= 0) st.splice(at, 1)
  else st.push(name)
  const next = steps.value.slice()
  next[stepIdx] = sortByMidi(st)
  steps.value = next
  commitSteps()
}
function addStep() {
  if (steps.value.length >= MAX_STEPS) return
  steps.value = [...steps.value, []]
  commitSteps()
}
function deleteStep(stepIdx: number) {
  steps.value = steps.value.filter((_, i) => i !== stepIdx)
  commitSteps()
}
function clearGrid() {
  steps.value = []
  commitSteps()
}

const stepCount = computed(() => steps.value.length)
const noteCount = computed(() =>
  steps.value.reduce((acc, s) => acc + s.length, 0))
// Plain index list so the grid's v-for needs no unused value binding.
const stepIndices = computed(() => steps.value.map((_, i) => i))

// Column the running sequence is currently sounding — drives the
// playhead highlight. arpStepIndex is -1 when nothing is playing.
const playheadStep = computed(() => {
  if (!arpRunning.value || arpStepIndex.value < 0 || steps.value.length === 0) {
    return -1
  }
  return arpStepIndex.value % steps.value.length
})

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
  // Centre the roll on the pasted notes when the user lands on the
  // diagram view (steps stay synced from the text watch regardless of
  // which source is active, so they're already current here).
  if (s === 'typed') fitWindowIfNeeded()
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

// The root / quality / octave / maqam dropdowns no longer drive the
// chord directly — they SEED an editable text field. This is the
// "let the user be free" change: the builder is just a starting
// point, and the actual notes are whatever the user typed/edited.
const builderChord = computed<string[]>(() => {
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

// Free-form chord the user can type anything into (any notes, any
// count, space / comma / · separated, Western or solfège). Seeded
// from the builder and re-seeded whenever a builder dropdown changes,
// but otherwise the user's edits stand untouched.
const customChordText = ref('')

function parseFreeNotes(text: string): string[] {
  const out: string[] = []
  for (const tok of text.split(/[\s,·]+/).map((s) => s.trim()).filter(Boolean)) {
    const n = parseOneNote(tok)
    if (n) out.push(n)
  }
  return out
}

watch(
  [root, quality, octave, maqam],
  () => { customChordText.value = builderChord.value.join(' ') },
  { immediate: true },
)

function rebuildCustomChord() {
  customChordText.value = builderChord.value.join(' ')
}

const chord = computed<string[]>(() => {
  if (source.value === 'typed') {
    return steps.value.flat()
  }
  if (source.value === 'guitar') {
    const c = GUITAR_CHORDS.find((x) => x.id === guitarChordId.value)
    return c ? [...c.notes] : []
  }
  if (source.value === 'strings') {
    const s = STRING_PRESETS.find((x) => x.id === stringSetId.value)
    return s ? [...s.notes] : []
  }
  // Custom source — the user's free-form notes are the source of truth.
  return parseFreeNotes(customChordText.value)
})

async function toggle() {
  if (arpRunning.value) {
    stopArp()
    return
  }
  // Typed source plays the diagram exactly as drawn (left → right,
  // chords and rests intact) via startSequence — arp mode doesn't
  // apply to a hand-drawn pattern. Other sources keep the chord +
  // mode arpeggiator.
  if (source.value === 'typed') {
    if (noteCount.value === 0) return
    await startSequence(steps.value, speed.value, gate.value)
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
        {{ t('chaos.chord.typedParsed', { steps: stepCount, notes: noteCount }) }}
      </p>

      <!-- Piano-roll diagram. Columns = steps, rows = pitch; the model
           is the same `steps` the text box reflects, so editing here
           rewrites the text and vice versa. The lit column tracks
           playback. -->
      <div class="roll">
        <div class="roll-toolbar">
          <div class="roll-grp">
            <button type="button" class="roll-btn mono" :title="t('chaos.chord.gridOctUp')" @click="shiftWindow(12)">▲</button>
            <button type="button" class="roll-btn mono" :title="t('chaos.chord.gridOctDown')" @click="shiftWindow(-12)">▼</button>
            <button type="button" class="roll-btn mono" :title="t('chaos.chord.gridFit')" @click="fitWindow">⤢</button>
          </div>
          <div class="roll-grp">
            <button type="button" class="roll-btn mono" @click="addStep">{{ t('chaos.chord.gridAddStep') }}</button>
            <button type="button" class="roll-btn mono" :disabled="stepCount === 0" @click="clearGrid">{{ t('chaos.chord.gridClear') }}</button>
          </div>
        </div>

        <div v-if="stepCount === 0" class="roll-empty mono">
          {{ t('chaos.chord.gridEmpty') }}
        </div>
        <div v-else class="roll-scroll">
          <div
            class="roll-grid"
            :style="{ gridTemplateColumns: `var(--lblw) repeat(${stepCount}, var(--cellw))` }"
          >
            <div class="rg-corner" />
            <div
              v-for="si in stepIndices"
              :key="`h${si}`"
              class="rg-colh"
              :class="{ play: playheadStep === si }"
            >
              <span class="rg-num mono">{{ si + 1 }}</span>
              <button
                type="button"
                class="rg-del"
                :title="t('chaos.chord.gridDeleteStep')"
                @click="deleteStep(si)"
              >×</button>
            </div>

            <template v-for="m in rowMidis" :key="`r${m}`">
              <div class="rg-label mono" :class="{ blk: isBlackKey(m) }">{{ noteName(m) }}</div>
              <button
                v-for="si in stepIndices"
                :key="`c${si}-${m}`"
                type="button"
                class="rg-cell"
                :class="{ on: cellActive(si, m), blk: isBlackKey(m), play: playheadStep === si }"
                @click="toggleCell(si, m)"
              />
            </template>
          </div>
        </div>
        <p class="roll-hint mono">{{ t('chaos.chord.gridHint') }}</p>
      </div>
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

      <!-- The chord is yours: the dropdowns above just SEED this box.
           Edit it freely — any notes, any count. Reset re-derives it
           from the dropdowns; changing any dropdown also re-seeds it. -->
      <div class="field full">
        <div class="chord-head">
          <span class="lbl mono">{{ t('chaos.chord.preview') }}</span>
          <button
            type="button"
            class="paste-btn mono"
            :title="t('chaos.chord.rebuild')"
            @click="rebuildCustomChord"
          >↺ {{ t('chaos.chord.rebuild') }}</button>
        </div>
        <input
          v-model="customChordText"
          class="chord-input mono"
          :placeholder="t('chaos.chord.customChordPlaceholder')"
        />
        <p class="parsed mono">
          {{ t('chaos.chord.customChordParsed', { n: chord.length }) }} · {{ chord.join(' · ') || '—' }}
        </p>
      </div>
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

    <!-- Read-only chord preview for the preset pickers only. The custom
         source has its own editable chord field above; the typed source
         shows the grid instead, so neither needs this line. -->
    <p v-if="source === 'guitar' || source === 'strings'" class="preview mono">
      <span class="preview-lbl">{{ t('chaos.chord.preview') }}</span>
      <span class="preview-notes">{{ chord.join(' · ') || '—' }}</span>
    </p>

    <div v-if="source !== 'typed'" class="modes">
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

.chord-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.chord-input {
  width: 100%;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.6rem;
  font-size: 0.82rem;
  letter-spacing: 0.03em;
}
.chord-input:focus { outline: none; border-color: var(--accent-primary); }

.modes { display: flex; gap: 0.3rem; flex-wrap: wrap; }
.mode {
  font-size: 0.7rem;
  padding: 0.35rem 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.mode.on { color: var(--accent-primary); border-color: var(--accent-primary); }
input[type='range'] { width: 100%; padding: 0; }

/* — Piano-roll diagram — */
.roll {
  --lblw: 34px;
  --cellw: 22px;
  --rowh: 13px;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.roll-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.roll-grp { display: inline-flex; gap: 0.3rem; }
.roll-btn {
  font-size: 0.62rem;
  padding: 0.22rem 0.55rem;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.roll-btn:hover { border-color: var(--accent-primary); }
.roll-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.roll-empty {
  padding: 0.7rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 0.66rem;
  color: var(--text-muted);
  text-align: center;
}
.roll-scroll {
  overflow-x: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
  /* A piano roll reads left→right (step 1 … step N, low pitch label
     column on the start side) in EVERY locale — same as a DAW
     timeline. Forcing LTR here keeps the sticky label column, the
     cell borders and the horizontal scroll origin consistent in
     Arabic RTL; without it the grid laid itself right-to-left while
     the sticky `left:0` label column stayed on the left, so labels
     detached from their rows and the first steps scrolled off-screen.
     The Arabic toolbar/hint around it stay RTL (they're outside). */
  direction: ltr;
}
.roll-grid {
  display: grid;
  /* gridTemplateColumns set inline from the step count */
  width: max-content;
}
.rg-corner,
.rg-label {
  position: sticky;
  left: 0;
  z-index: 2;
  background: var(--bg-elevated);
}
.rg-corner { height: 18px; border-bottom: 1px solid var(--border); }
.rg-colh {
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px;
  border-bottom: 1px solid var(--border);
  border-left: 1px solid var(--border);
}
.rg-colh.play { background: var(--accent-glow); }
.rg-num { font-size: 0.55rem; color: var(--text-muted); }
.rg-del {
  width: 14px;
  height: 14px;
  padding: 0;
  line-height: 1;
  font-size: 0.7rem;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}
.rg-del:hover { color: var(--accent-secondary); }
.rg-label {
  height: var(--rowh);
  display: flex;
  align-items: center;
  padding-left: 4px;
  font-size: 0.52rem;
  color: var(--text-muted);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 35%, transparent);
}
.rg-label.blk { color: color-mix(in srgb, var(--text-muted) 60%, transparent); }
.rg-cell {
  height: var(--rowh);
  padding: 0;
  border: none;
  border-left: 1px solid color-mix(in srgb, var(--border) 45%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--border) 25%, transparent);
  background: transparent;
  cursor: pointer;
}
.rg-cell.blk { background: color-mix(in srgb, var(--bg-elevated) 55%, transparent); }
.rg-cell.play { background: color-mix(in srgb, var(--accent-glow) 40%, transparent); }
.rg-cell:hover { background: color-mix(in srgb, var(--accent-primary) 25%, transparent); }
.rg-cell.on {
  background: var(--accent-primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-primary) 60%, #fff);
}
.rg-cell.on.play { background: var(--accent-secondary); }
.roll-hint {
  margin: 0;
  font-size: 0.58rem;
  color: var(--text-muted);
  line-height: 1.35;
}
</style>
