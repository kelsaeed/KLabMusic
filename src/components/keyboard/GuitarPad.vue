<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

const { playOn, dampInstrument } = useAudio()
const { t } = useI18n()

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

const STRINGS = [
  { name: '6 (low E)', note: 'E2' },
  { name: '5 (A)',     note: 'A2' },
  { name: '4 (D)',     note: 'D3' },
  { name: '3 (G)',     note: 'G3' },
  { name: '2 (B)',     note: 'B3' },
  { name: '1 (high E)', note: 'E4' },
] as const

const STRUM_GAP_MS = 28
const flashed = ref<string>('')

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

function pluck(note: string) {
  void playOn('guitar', note, 110)
  flashed.value = note
  setTimeout(() => {
    if (flashed.value === note) flashed.value = ''
  }, 200)
}

function damp() {
  dampInstrument('guitar')
}
</script>

<template>
  <div class="guitar">
    <section class="strings">
      <header class="head">
        <h4 class="mono">{{ t('guitar.strings') }}</h4>
        <button class="damp mono" :title="t('guitar.dampHint')" @click="damp">
          ✋ {{ t('guitar.damp') }}
        </button>
      </header>
      <div class="strings-row">
        <button
          v-for="s in STRINGS"
          :key="s.note"
          class="string"
          :class="{ flash: flashed === s.note }"
          @pointerdown="pluck(s.note)"
        >
          <span class="line" />
          <span class="lbl mono">{{ s.name }}</span>
          <span class="note mono">{{ s.note }}</span>
        </button>
      </div>
    </section>

    <section class="chords">
      <header class="head">
        <h4 class="mono">{{ t('guitar.chords') }}</h4>
        <span class="hint mono">{{ t('guitar.strumHint') }}</span>
      </header>
      <div class="chord-grid">
        <div v-for="c in CHORDS" :key="c.name" class="chord-cell">
          <button class="chord up" :title="t('guitar.strumDown')" @pointerdown="strum(c.notes, false)">
            <span class="name">{{ c.name }}</span>
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
  gap: 1rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.55rem;
}
.head h4 {
  margin: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.hint {
  font-size: 0.65rem;
  color: var(--text-muted);
}
.damp {
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.strings {
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
  grid-template-columns: 90px 1fr 50px;
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
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--text-muted) 30%,
    var(--text-muted) 70%,
    transparent 100%
  );
  border-radius: 1px;
  transition: height var(--transition-fast), background var(--transition-fast);
}
.string.flash .line {
  height: 4px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-primary) 30%,
    var(--accent-primary) 70%,
    transparent 100%
  );
  animation: vibrate 0.3s ease-out;
}
@keyframes vibrate {
  0%, 100% { transform: translateY(0); }
  20% { transform: translateY(-2px); }
  40% { transform: translateY(2px); }
  60% { transform: translateY(-1px); }
  80% { transform: translateY(1px); }
}
.string.flash {
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}

.chords {
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
.chord:active .name {
  color: var(--text-inverse);
}
.chord .dir {
  font-size: 0.85rem;
  color: var(--text-muted);
}

@media (max-width: 720px) {
  .string {
    grid-template-columns: 70px 1fr 50px;
  }
  .chord-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
