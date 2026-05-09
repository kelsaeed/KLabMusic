<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { formatNote } from '@/lib/notation'
import * as Tone from 'tone'

// Phase 8 — concert flute. Six tone holes laid out horizontally (the
// way a flute body reads when it's held across the player). Diatonic
// C major ascending — flute fingering charts go far beyond six holes
// in real life, but for a tap-pad UI the simple scale + register key
// keeps things playable on a phone.

const { t } = useI18n()
const audioStore = useAudioStore()
const { playOnTimed, dampInstrument } = useAudio()

const HOLE_COUNT = 6
// C major scale starting C4 → D, E, F, G, A.
const SCALE_OFFSETS = [0, 2, 4, 5, 7, 9]

const registerHigh = ref(false)

const holes = computed<{ idx: number; note: string }[]>(() => {
  return Array.from({ length: HOLE_COUNT }, (_, i) => {
    const midi = 60 + SCALE_OFFSETS[i] + (registerHigh.value ? 12 : 0)
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
  void playOnTimed('flute', note, 0.7, 100)
  flashed.value = holeIdx
  setTimeout(() => {
    if (flashed.value === holeIdx) flashed.value = null
  }, 220)
}

function damp() { dampInstrument('flute') }
function toggleNotation() {
  audioStore.setNotation(audioStore.notation === 'solfege' ? 'letters' : 'solfege')
}
</script>

<template>
  <div class="flute">
    <header class="bar">
      <button
        class="register mono"
        :class="{ on: registerHigh }"
        :title="t('flute.registerHint')"
        @click="registerHigh = !registerHigh"
      >▲ {{ t('flute.register') }}</button>
      <span class="title mono">{{ t('flute.hint') }}</span>
      <button class="notation mono" :title="t('guitar.notationHint')" @click="toggleNotation">
        {{ audioStore.notation === 'solfege' ? 'Do Re Mi' : 'C D E' }}
      </button>
      <button class="damp mono" :title="t('violin.dampHint')" @click="damp">
        ✋ {{ t('violin.damp') }}
      </button>
    </header>

    <!-- TODO(visual-asset): replace with a layered SVG of a real flute
         body + embouchure plate + foot joint in Phase 11. -->
    <div class="body">
      <div class="head" aria-hidden="true" />
      <div class="holes">
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
      </div>
      <div class="foot" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.flute { display: flex; flex-direction: column; gap: 0.6rem; }
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
  align-items: center;
  gap: 4px;
  padding: 1rem;
  background: linear-gradient(90deg, rgba(140, 140, 160, 0.18) 0%, rgba(60, 60, 80, 0.32) 100%);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow-x: auto;
}
.head, .foot {
  flex-shrink: 0;
  width: 50px;
  height: 36px;
  background: linear-gradient(180deg, #4a4a64 0%, #1c1c2c 100%);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.head { border-radius: 18px 8px 8px 18px; }
.foot { border-radius: 8px 18px 18px 8px; }
.holes {
  display: flex;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}
.hole {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.5rem 0.3rem;
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid var(--border);
  border-radius: 12px;
  cursor: pointer;
  min-width: 50px;
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
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-base);
  border: 1px solid var(--text-muted);
}
.hole.flash .hole-dot { background: var(--text-inverse); border-color: var(--text-inverse); }
.hole-note {
  font-size: 0.7rem;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}
.hole.flash .hole-note { color: var(--text-inverse); font-weight: 700; }

@media (max-width: 600px) {
  .body { padding: 0.6rem; }
  .head, .foot { width: 36px; height: 30px; }
  .hole { min-width: 40px; padding: 0.35rem 0.2rem; }
}
</style>
