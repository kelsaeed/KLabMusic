<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 8 — clarinet. The body of the instrument is rendered as a
// vertical stack of 12 tone holes (chromatic ascending from D3). A
// register key at the top toggles the chalumeau / clarion octave shift,
// matching how a real clarinet's register key jumps the pitch up a
// twelfth (we approximate as a one-octave jump for tonal simplicity).

const { t } = useI18n()
const audioStore = useAudioStore()
const { playOnTimed, dampInstrument } = useAudio()
const { recordLivePlay } = useLivePlay()

const HOLE_COUNT = 12

// Chromatic ascending from D3 — covers the lower hand of a real
// clarinet's first register.
const baseMidiFor = (i: number) => 50 + i

const registerHigh = ref(false)

const holes = computed<{ idx: number; note: string }[]>(() => {
  return Array.from({ length: HOLE_COUNT }, (_, i) => {
    const midi = baseMidiFor(i) + (registerHigh.value ? 12 : 0)
    return { idx: i, note: Tone.Frequency(midi, 'midi').toNote() }
  })
})

const flashed = ref<number | null>(null)

function notationOf(note: string): string {
  return formatNote(note, audioStore.notation)
}

function play(holeIdx: number) {
  const note = holes.value[holeIdx]?.note
  if (!note) return
  void playOnTimed('clarinet', note, 0.55, 105)
  recordLivePlay('clarinet', note, 105, 0.55)
  flashed.value = holeIdx
  setTimeout(() => {
    if (flashed.value === holeIdx) flashed.value = null
  }, 200)
}

function damp() {
  dampInstrument('clarinet')
}

function toggleNotation() {
  audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')
}
</script>

<template>
  <div class="clarinet">
    <header class="bar">
      <button
        class="register mono"
        :class="{ on: registerHigh }"
        :title="t('clarinet.registerHint')"
        @click="registerHigh = !registerHigh"
      >
        ▲ {{ t('clarinet.register') }}
      </button>
      <span class="title mono">{{ t('clarinet.hint') }}</span>
      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>
      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <!-- TODO(visual-asset): replace this CSS body with a layered SVG of
         a real clarinet body + bell + mouthpiece in Phase 11. -->
    <div class="body">
      <div class="mouthpiece" aria-hidden="true" />
      <button
        v-for="hole in holes"
        :key="hole.idx"
        class="hole"
        :class="{ flash: flashed === hole.idx }"
        @pointerdown="play(hole.idx)"
      >
        <span class="hole-dot" />
        <span class="hole-note mono">{{ notationOf(hole.note) }}</span>
      </button>
      <div class="bell" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.clarinet { display: flex; flex-direction: column; gap: 0.6rem; align-items: stretch; }
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
.register, .notation, .damp {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.register.on { color: var(--accent-primary); border-color: var(--accent-primary); box-shadow: 0 0 8px var(--accent-glow); }
.damp { border-color: var(--accent-secondary); color: var(--accent-secondary); }

.body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 1rem 0;
  background: linear-gradient(180deg, rgba(20, 16, 28, 0.4) 0%, rgba(10, 8, 16, 0.6) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.mouthpiece {
  width: 60px;
  height: 36px;
  border-radius: 18px 18px 6px 6px;
  background: linear-gradient(180deg, #2c2c40 0%, #14141e 100%);
  border: 1px solid var(--border);
  margin-bottom: 6px;
}
.bell {
  width: 90px;
  height: 32px;
  border-radius: 0 0 24px 24px;
  background: linear-gradient(180deg, #1c1c2c 0%, #0a0a14 100%);
  border: 1px solid var(--border);
  margin-top: 6px;
}
.hole {
  width: 80%;
  display: grid;
  grid-template-columns: 26px 1fr;
  gap: 0.5rem;
  align-items: center;
  padding: 0.45rem 0.6rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  border-radius: 14px;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast);
}
.hole:hover { border-color: var(--accent-primary); }
.hole.flash {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  transform: scale(0.96);
  box-shadow: 0 0 14px var(--accent-glow);
}
.hole-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--bg-base);
  border: 1px solid var(--text-muted);
}
.hole.flash .hole-dot { background: var(--text-inverse); border-color: var(--text-inverse); }
.hole-note {
  font-size: 0.78rem;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}
.hole.flash .hole-note { color: var(--text-inverse); font-weight: 700; }
</style>
