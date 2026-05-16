<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import * as Tone from 'tone'
import {
  useChaos,
  type Scale,
  type Mood,
  type MaqamId,
  MOODS,
} from '@/composables/useChaos'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'

const {
  generateMelody,
  playMelody,
  stopMelody,
  melodyPlaying,
  lastMelody,
  KEYS,
  MAQAM_IDS,
  MAQAM_PRESETS,
} = useChaos()
const { playOnTimed } = useAudio()
const audioStore = useAudioStore()
const { t } = useI18n()

const key = ref<string>('C')
const scale = ref<Scale>('major')
const length = ref(8)
const mood = ref<Mood>('calm')
const stepSec = ref(0.25)
// null = no maqam, fall back to the user's scale + mood. Selecting a
// maqam overrides both the scale picker and the mood's scaleOverride,
// and forces the key to the maqam's canonical tonic so the result
// sounds like the named maqam, not a transposed approximation.
const maqam = ref<MaqamId | null>(null)

const scales: Scale[] = ['major', 'minor', 'pentatonic', 'blues', 'dorian']

// — Custom notes input —
// Text-typed melody. Whitespace- or comma-separated note names like
// "C4 D4 E4 G4" or "do4 re4 mi4 sol4" or with sharps/flats (F#3, Bb2).
// Validated client-side so the user gets immediate feedback on any
// note that won't parse, and only the valid notes are passed to the
// playback path. Generated melodies can be copied into this input
// with one click, so users can use the generator as a starting
// point and then edit individual notes by hand.
const customText = ref('')
// Advanced controls (maqam picker + step-length slider) start hidden so
// the default view stays compact. Users who need maqam mode or a custom
// step length open the disclosure and the controls slide in.
const showAdvanced = ref(false)
// Transient flash on the copy button so the user sees confirmation
// (the clipboard write itself is silent and async).
const justCopied = ref(false)
let copyResetTimer: ReturnType<typeof setTimeout> | null = null
// Paste-button state — mirrors the copy flow. 'ok' flashes "Pasted!",
// 'fail' tells the user to Ctrl+V manually (clipboard *read* can be
// blocked by permissions / insecure origin and, unlike copy, has no
// reliable execCommand fallback — browsers block synthetic paste).
const pasteState = ref<'idle' | 'ok' | 'fail'>('idle')
let pasteResetTimer: ReturnType<typeof setTimeout> | null = null
const customInputRef = ref<HTMLTextAreaElement | null>(null)
const NOTE_RE = /^([A-Ga-g])([#b]?)(-?\d{1,2})$/
// Solfège → letter map so 'do re mi fa sol la si' (the Arabic /
// French / Italian convention used heavily in maqam pedagogy)
// works alongside Western letter names.
const SOLFEGE_MAP: Record<string, string> = {
  do: 'C', re: 'D', mi: 'E', fa: 'F', sol: 'G', la: 'A', si: 'B', ti: 'B',
}
const SOLFEGE_RE = /^(do|re|mi|fa|sol|la|si|ti)([#b]?)(-?\d{1,2})$/i

interface ParsedNote {
  raw: string
  note: string | null
  ok: boolean
}

const parsedNotes = computed<ParsedNote[]>(() => {
  const text = customText.value.trim()
  if (!text) return []
  // Allow space, comma, dot-separator (the generator's display uses
  // ' · '), or newline as separators. Empty tokens are filtered.
  const tokens = text
    .split(/[\s,·]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  return tokens.map((raw): ParsedNote => {
    const m = NOTE_RE.exec(raw)
    if (m) {
      // Normalise to upper-case letter + accidental + octave so the
      // playback path always sees the canonical Tone.Frequency form.
      const note = `${m[1].toUpperCase()}${m[2]}${m[3]}`
      // Sanity-check via Tone.Frequency: anything Tone can't parse
      // would trip the engine downstream.
      try {
        Tone.Frequency(note).toMidi()
        return { raw, note, ok: true }
      } catch {
        return { raw, note: null, ok: false }
      }
    }
    const s = SOLFEGE_RE.exec(raw)
    if (s) {
      const letter = SOLFEGE_MAP[s[1].toLowerCase()] ?? ''
      if (!letter) return { raw, note: null, ok: false }
      const note = `${letter}${s[2]}${s[3]}`
      try {
        Tone.Frequency(note).toMidi()
        return { raw, note, ok: true }
      } catch {
        return { raw, note: null, ok: false }
      }
    }
    return { raw, note: null, ok: false }
  })
})

const validCustomNotes = computed(() => parsedNotes.value
  .filter((p) => p.ok && p.note)
  .map((p) => p.note as string))

const invalidCount = computed(() =>
  parsedNotes.value.filter((p) => !p.ok).length)

// Track-which-note-is-playing for the chip-strip highlight. We don't
// have a per-note callback from playMelody, so we rebuild the same
// schedule locally by counting on stepSec.
const activeChipIndex = ref(-1)
let chipScheduleIds: number[] = []

function clearChipSchedule() {
  for (const id of chipScheduleIds) {
    try { Tone.getDraw().cancel(id as unknown as number) } catch { /* idem */ }
  }
  chipScheduleIds = []
  activeChipIndex.value = -1
}

watch(melodyPlaying, (playing) => {
  // When the chaos melody stops mid-stream, drop our visual highlight.
  if (!playing) clearChipSchedule()
})

function generate() {
  generateMelody(key.value, scale.value, length.value, mood.value, maqam.value)
}

function play() {
  if (lastMelody.value.length === 0) generate()
  scheduleChipHighlights(lastMelody.value, stepSec.value)
  void playMelody(lastMelody.value, stepSec.value)
}

function toggle() {
  // The play button doubles as a stop button while a melody is in
  // flight — the previous "Play" with no Stop left every queued note
  // unstoppable until the whole melody finished, which is a real-
  // device QA flag because a long mood like "celebrating" runs ~10s.
  if (melodyPlaying.value) stopMelody()
  else play()
}

function playCustom() {
  if (melodyPlaying.value) {
    stopMelody()
    return
  }
  const notes = validCustomNotes.value
  if (notes.length === 0) return
  // Custom melody bypasses generateMelody (which fills lastMelodyCents
  // from the maqam/mood path) and goes straight to playMelody. The
  // user typed exact notes, so no maqam shift is applied — they
  // already chose every pitch.
  scheduleChipHighlights(notes, stepSec.value)
  void playMelody(notes, stepSec.value)
}

function scheduleChipHighlights(notes: string[], step: number) {
  clearChipSchedule()
  notes.forEach((_, i) => {
    const t = Tone.now() + i * step
    const id = Tone.getDraw().schedule(() => {
      activeChipIndex.value = i
    }, t)
    chipScheduleIds.push(id as unknown as number)
  })
  // Final tick clears the highlight a step after the last note.
  const endId = Tone.getDraw().schedule(() => {
    activeChipIndex.value = -1
  }, Tone.now() + notes.length * step + 0.05)
  chipScheduleIds.push(endId as unknown as number)
}

function previewSingleNote(note: string) {
  // One-tap preview when the user clicks a generated chip — fires
  // on the active instrument so they can hear what each note will
  // sound like without playing the full melody.
  void playOnTimed(audioStore.activeInstrument, note, 0.4, 100)
}

function copyGeneratedToCustom() {
  // Lets the user use the generator as a starting point: click,
  // edit individual notes by hand in the textarea, hit Play Custom.
  if (lastMelody.value.length === 0) return
  customText.value = lastMelody.value.join(' ')
}

async function copyMelodyToClipboard() {
  // Writes the generated melody to the system clipboard so the user
  // can paste it into the custom-melody textarea, the chat, a note,
  // or back into this app on another device. Falls back to a hidden
  // textarea selection when the async clipboard API isn't available
  // (older Safari, insecure-origin builds).
  if (lastMelody.value.length === 0) return
  const text = lastMelody.value.join(' ')
  let ok = false
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
      ok = true
    }
  } catch {
    // Fall through to the legacy path below.
  }
  if (!ok) {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-1000px'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); ok = true } catch { /* nothing else to try */ }
    document.body.removeChild(ta)
  }
  if (ok) {
    justCopied.value = true
    if (copyResetTimer) clearTimeout(copyResetTimer)
    copyResetTimer = setTimeout(() => { justCopied.value = false }, 1400)
  }
}

async function pasteFromClipboard() {
  // Clipboard → custom-melody textarea in one tap: the inverse of
  // copyMelodyToClipboard, and the answer to "where do I paste a
  // melody". The textarea already accepts a manual Ctrl+V; this just
  // removes the "is this even a paste target" friction. readText()
  // has no execCommand fallback (browsers block synthetic paste), so
  // when it's unavailable we focus the textarea and tell the user to
  // paste manually rather than failing silently.
  let text: string | null = null
  try {
    if (navigator.clipboard && window.isSecureContext) {
      text = await navigator.clipboard.readText()
    }
  } catch {
    text = null
  }
  if (text !== null) {
    customText.value = text.trim()
    pasteState.value = 'ok'
  } else {
    customInputRef.value?.focus()
    pasteState.value = 'fail'
  }
  if (pasteResetTimer) clearTimeout(pasteResetTimer)
  pasteResetTimer = setTimeout(() => { pasteState.value = 'idle' }, 1600)
}
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.randomMelody') }}</h4>
      <span class="hint mono" :title="lastMelody.join(' ')">
        {{ lastMelody.length > 0 ? lastMelody.length + ' notes' : '—' }}
      </span>
    </header>

    <div class="row">
      <label>
        <span class="lbl mono">{{ t('chaos.key') }}</span>
        <select v-model="key" :disabled="maqam !== null">
          <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
        </select>
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.scale') }}</span>
        <select v-model="scale" :disabled="maqam !== null">
          <option v-for="s in scales" :key="s" :value="s">{{ t(`chaos.scaleName.${s}`) }}</option>
        </select>
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.length') }}</span>
        <input v-model.number="length" type="number" min="4" max="32" />
      </label>
      <label>
        <span class="lbl mono">{{ t('chaos.mood') }}</span>
        <select v-model="mood">
          <option v-for="m in MOODS" :key="m" :value="m">{{ t(`chaos.moodName.${m}`) }}</option>
        </select>
      </label>
    </div>

    <!-- Advanced disclosure: maqam picker + step-length slider live
         here so the default view stays compact. Stays in the same
         card so closing it doesn't shift other sections. -->
    <details class="adv" :open="showAdvanced" @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open">
      <summary class="adv-summary mono">{{ t('chaos.advanced') }}</summary>
      <div class="adv-body">
        <label class="full">
          <span class="lbl mono">{{ t('chaos.maqam') }}</span>
          <select v-model="maqam">
            <option :value="null">{{ t('chaos.maqamNone') }}</option>
            <option v-for="m in MAQAM_IDS" :key="m" :value="m">
              {{ MAQAM_PRESETS[m].name }} ({{ MAQAM_PRESETS[m].tonic }})
            </option>
          </select>
        </label>
        <label class="full">
          <span class="lbl mono">{{ t('chaos.stepLength') }} {{ stepSec.toFixed(2) }}s</span>
          <input v-model.number="stepSec" type="range" min="0.1" max="0.6" step="0.01" />
        </label>
      </div>
    </details>

    <div class="actions">
      <button class="ghost" @click="generate">{{ t('chaos.generate') }}</button>
      <button class="primary" :class="{ on: melodyPlaying }" @click="toggle">
        {{ melodyPlaying ? '◼ ' + t('chaos.stopMelody') : '▶ ' + t('chaos.playMelody') }}
      </button>
    </div>

    <!-- Generated notes — clickable chips. Tap a chip to preview just
         that note on the active instrument; chips light up in sync
         with the melody during playback. The toolbar above the chip
         strip is the answer to "I can't copy the generated melody" —
         one tap puts it on the clipboard, another tap loads it into
         the custom-melody textarea below. -->
    <div v-if="lastMelody.length > 0" class="chip-block">
      <div class="chip-toolbar">
        <button
          type="button"
          class="chip-tool mono"
          :class="{ done: justCopied }"
          :title="t('chaos.copyMelodyTitle')"
          @click="copyMelodyToClipboard"
        >
          {{ justCopied ? '✓ ' + t('chaos.copyMelodyDone') : '⧉ ' + t('chaos.copyMelody') }}
        </button>
        <button
          type="button"
          class="chip-tool mono"
          :title="t('chaos.useGenerated')"
          @click="copyGeneratedToCustom"
        >↓ {{ t('chaos.useGenerated') }}</button>
      </div>
      <div class="chips">
        <button
          v-for="(note, i) in lastMelody"
          :key="`gen-${i}-${note}`"
          type="button"
          class="chip"
          :class="{ active: activeChipIndex === i }"
          :title="t('chaos.notePreviewHint')"
          @click="previewSingleNote(note)"
        >{{ note }}</button>
      </div>
    </div>

    <!-- Custom-notes text input — type a note sequence and play it.
         Accepts Western letters (C4 D#4 Eb3) and Arabic / Italian
         solfège (do4 re4 mi4) so users coming from maqam pedagogy
         can write what they actually call the notes. -->
    <div class="custom">
      <header class="custom-head">
        <span class="custom-label mono">{{ t('chaos.customNotes') }}</span>
        <button
          type="button"
          class="chip-tool mono"
          :class="{ done: pasteState === 'ok' }"
          :title="t('chaos.pasteMelodyTitle')"
          @click="pasteFromClipboard"
        >
          {{ pasteState === 'ok'
            ? '✓ ' + t('chaos.pasteMelodyDone')
            : pasteState === 'fail'
              ? '⌨ ' + t('chaos.pasteMelodyFail')
              : '📋 ' + t('chaos.pasteMelody') }}
        </button>
      </header>
      <textarea
        ref="customInputRef"
        v-model="customText"
        class="custom-input mono"
        :placeholder="t('chaos.customPlaceholder')"
        rows="2"
      />
      <div v-if="parsedNotes.length > 0" class="custom-feedback">
        <span class="parsed mono">
          {{ t('chaos.notesParsed', { ok: validCustomNotes.length, total: parsedNotes.length }) }}
        </span>
        <span v-if="invalidCount > 0" class="parsed err mono">
          {{ t('chaos.notesInvalid', { n: invalidCount }) }}
        </span>
      </div>
      <button
        type="button"
        class="primary"
        :class="{ on: melodyPlaying }"
        :disabled="validCustomNotes.length === 0"
        @click="playCustom"
      >
        {{ melodyPlaying ? '◼ ' + t('chaos.stopMelody') : '▶ ' + t('chaos.playCustom') }}
      </button>
    </div>
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
  gap: 0.6rem;
}
.head { display: flex; align-items: baseline; justify-content: space-between; }
.head h4 {
  margin: 0; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted);
}
.hint { font-size: 0.7rem; color: var(--text-muted); }
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 0.4rem;
}
.row label, .full { display: flex; flex-direction: column; gap: 0.2rem; }
.full-row { grid-column: 1 / -1; }
select:disabled { opacity: 0.45; cursor: not-allowed; }
.lbl { font-size: 0.65rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.04em; }
.full input[type='range'] { width: 100%; padding: 0; }
.actions { display: flex; gap: 0.4rem; }
.ghost { background: transparent; font-size: 0.8rem; padding: 0.45rem 0.85rem; }
.primary {
  background: var(--accent-primary); color: var(--text-inverse); border: none;
  font-weight: 600; font-size: 0.8rem; padding: 0.45rem 0.85rem;
}
.adv {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.35rem 0.6rem;
}
.adv-summary {
  cursor: pointer;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  user-select: none;
  padding: 0.2rem 0;
}
.adv-summary:hover { color: var(--accent-primary); }
.adv[open] .adv-summary { color: var(--accent-primary); margin-bottom: 0.45rem; }
.adv-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.adv-body .full input[type='range'] { width: 100%; padding: 0; }

.chip-block {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.chip-toolbar {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.chip-tool {
  font-size: 0.65rem;
  padding: 0.3rem 0.7rem;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--accent-primary);
  border-radius: 999px;
  cursor: pointer;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
}
.chip-tool:hover {
  background: var(--accent-primary);
  color: var(--text-inverse);
}
.chip-tool.done {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  padding: 0.5rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.chip {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0.25rem 0.55rem;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: 999px;
  cursor: pointer;
  transition: border-color var(--transition-fast),
    background var(--transition-fast),
    color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.chip:hover {
  border-color: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.chip.active {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
  transform: scale(1.06);
}

.custom {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.55rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.custom-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.4rem;
}
.custom-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.custom-input {
  width: 100%;
  background: var(--bg-base);
  color: var(--accent-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.6rem;
  font-size: 0.78rem;
  resize: vertical;
  min-height: 44px;
}
.custom-input:focus { outline: none; border-color: var(--accent-primary); }
.custom-feedback {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.parsed {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}
.parsed.err { color: var(--accent-secondary); }
.primary:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
