<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import InstrumentSurface from './placeholders/InstrumentSurface.vue'
import * as Tone from 'tone'

// Phase 8 — concert harp. Vertical strings; tap one to pluck, swipe
// across them for a glissando. We expose a 22-string subset (3 octaves
// of a C-major scale-ish layout) since a real concert harp's 47
// strings would be unreadable on a phone screen.

const { t } = useI18n()
const audioStore = useAudioStore()
const { dampInstrument, playOnTimed } = useAudio()
const { recordLivePlay } = useLivePlay()

const SCALE_DEGREES = [0, 2, 4, 5, 7, 9, 11] // C major
const STRING_COUNT = 22

const strings = computed<{ note: string; midi: number }[]>(() => {
  const out: { note: string; midi: number }[] = []
  // Start at C3 (MIDI 48) — comfortable harp low end for the synth.
  for (let i = 0; i < STRING_COUNT; i++) {
    const octave = Math.floor(i / SCALE_DEGREES.length)
    const degree = i % SCALE_DEGREES.length
    const midi = 48 + octave * 12 + SCALE_DEGREES[degree]
    out.push({ note: Tone.Frequency(midi, 'midi').toNote(), midi })
  }
  return out
})

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

const dragging = ref(false)
const lastNote = ref<string>('')
const flashed = ref<string>('')

function pluck(note: string) {
  void playOnTimed('harp', note, 1.6, 110)
  recordLivePlay('harp', note, 110, 1.6)
  flashed.value = note
  setTimeout(() => {
    if (flashed.value === note) flashed.value = ''
  }, 220)
}

function readNote(el: Element | null): string | null {
  if (!el) return null
  const stringEl = (el as Element).closest('[data-harp-note]') as HTMLElement | null
  return stringEl?.dataset.harpNote ?? null
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  const note = readNote(document.elementFromPoint(e.clientX, e.clientY))
  if (!note) return
  dragging.value = true
  lastNote.value = note
  pluck(note)
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  const note = readNote(document.elementFromPoint(e.clientX, e.clientY))
  if (note && note !== lastNote.value) {
    lastNote.value = note
    pluck(note)
  }
}

function onUp() {
  if (!dragging.value) return
  dragging.value = false
  lastNote.value = ''
}

function damp() {
  dampInstrument('harp')
  onUp()
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
  <div class="harp">
    <header class="bar">
      <span class="title mono">{{ t('harp.hint') }}</span>
      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <!-- TODO(visual-asset): InstrumentSurface placeholder; real harp
         frame + soundbox SVG plugs in here later. -->
    <InstrumentSurface
      variant="harp"
      class="strings"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <button
        v-for="s in strings"
        :key="s.note"
        class="string"
        :class="{ flash: flashed === s.note }"
        :data-harp-note="s.note"
      >
        <span class="line" />
        <span class="note mono">{{ notationOf(s.note) }}</span>
      </button>
    </InstrumentSurface>
  </div>
</template>

<style scoped>
.harp { display: flex; flex-direction: column; gap: 0.6rem; }
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.damp {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.strings {
  display: grid;
  grid-template-columns: repeat(22, minmax(0, 1fr));
  gap: 3px;
  padding: 0.85rem;
  height: clamp(220px, 30vh, 320px);
  touch-action: none;
}
.string {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  padding: 0.4rem 0.1rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast);
}
.string:hover { border-color: var(--accent-primary); }
.line {
  width: 2px;
  height: 100%;
  background: linear-gradient(180deg, transparent 0%, var(--text-muted) 30%, var(--text-muted) 70%, transparent 100%);
  border-radius: 1px;
  transition: background var(--transition-fast), width var(--transition-fast);
}
.string.flash .line {
  width: 4px;
  background: linear-gradient(180deg, transparent 0%, var(--accent-primary) 20%, var(--accent-primary) 80%, transparent 100%);
}
.note {
  font-size: 0.55rem;
  color: var(--text-muted);
  margin-top: 0.3rem;
  writing-mode: vertical-rl;
  transform: rotate(180deg);
}
.string.flash .note { color: var(--accent-primary); }

@media (max-width: 600px) {
  .strings { gap: 2px; padding: 0.5rem; }
  .note { font-size: 0.5rem; }
}
</style>
