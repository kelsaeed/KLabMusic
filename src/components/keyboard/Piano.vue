<script setup lang="ts">
import { computed } from 'vue'
import { useAudioStore } from '@/stores/audio'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { formatNote } from '@/lib/notation'

const props = defineProps<{
  startOctave: number
  octaveCount: number
  showLabels: boolean
}>()

const emit = defineEmits<{
  (e: 'press', payload: { note: string; velocity: number }): void
  (e: 'release', note: string): void
}>()

const audioStore = useAudioStore()
const bindingStore = useKeyBindingsStore()

const WHITE_NOTES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const BLACK_LAYOUT: { note: string; afterIndex: number }[] = [
  { note: 'C#', afterIndex: 0 },
  { note: 'D#', afterIndex: 1 },
  { note: 'F#', afterIndex: 3 },
  { note: 'G#', afterIndex: 4 },
  { note: 'A#', afterIndex: 5 },
]

interface KeyCell {
  note: string
  isBlack: boolean
  octave: number
  whiteIndex: number
  leftPercent: number
}

const keys = computed<KeyCell[]>(() => {
  const cells: KeyCell[] = []
  const totalWhites = props.octaveCount * WHITE_NOTES.length
  for (let o = 0; o < props.octaveCount; o++) {
    const octave = props.startOctave + o
    for (let w = 0; w < WHITE_NOTES.length; w++) {
      const idx = o * WHITE_NOTES.length + w
      cells.push({
        note: `${WHITE_NOTES[w]}${octave}`,
        isBlack: false,
        octave,
        whiteIndex: idx,
        leftPercent: (idx / totalWhites) * 100,
      })
    }
    for (const b of BLACK_LAYOUT) {
      const baseWhite = o * WHITE_NOTES.length + b.afterIndex
      cells.push({
        note: `${b.note}${octave}`,
        isBlack: true,
        octave,
        whiteIndex: baseWhite,
        leftPercent: ((baseWhite + 1) / totalWhites) * 100,
      })
    }
  }
  return cells
})

const whiteKeys = computed(() => keys.value.filter((k) => !k.isBlack))
const blackKeys = computed(() => keys.value.filter((k) => k.isBlack))

function bindingKeyFor(note: string): string | undefined {
  for (const b of bindingStore.activeSet.bindings) {
    if (b.type === 'note' && b.note === note) return b.key
  }
  return undefined
}

function velocityFromEvent(e: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  return Math.round(30 + ratio * 97)
}

function onDown(note: string, e: PointerEvent) {
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  target.setPointerCapture(e.pointerId)
  emit('press', { note, velocity: velocityFromEvent(e, target) })
}

function onUp(note: string) {
  emit('release', note)
}
</script>

<template>
  <div class="piano">
    <div class="bed">
      <button
        v-for="k in whiteKeys"
        :key="k.note"
        class="white"
        :class="{ active: audioStore.activeNotes.has(k.note) }"
        :style="{
          '--pos': k.leftPercent + '%',
          '--size': 100 / (octaveCount * 7) + '%',
        }"
        :aria-label="k.note"
        @pointerdown="onDown(k.note, $event)"
        @pointerup="onUp(k.note)"
        @pointercancel="onUp(k.note)"
        @pointerleave="onUp(k.note)"
      >
        <span v-if="showLabels && bindingKeyFor(k.note)" class="kb-hint mono">
          {{ bindingKeyFor(k.note) }}
        </span>
        <span class="note-name mono">{{ formatNote(k.note, audioStore.notation) }}</span>
      </button>

      <button
        v-for="k in blackKeys"
        :key="k.note"
        class="black"
        :class="{ active: audioStore.activeNotes.has(k.note) }"
        :style="{
          '--pos': `calc(${k.leftPercent}% - ${100 / (octaveCount * 7) * 0.3}%)`,
          '--size': (100 / (octaveCount * 7) * 0.6) + '%',
        }"
        :aria-label="k.note"
        @pointerdown="onDown(k.note, $event)"
        @pointerup="onUp(k.note)"
        @pointercancel="onUp(k.note)"
        @pointerleave="onUp(k.note)"
      >
        <span v-if="showLabels && bindingKeyFor(k.note)" class="kb-hint mono">
          {{ bindingKeyFor(k.note) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.piano {
  width: 100%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6rem;
}
.bed {
  position: relative;
  width: 100%;
  height: 200px;
  user-select: none;
  touch-action: none;
}
.white,
.black {
  position: absolute;
  /* default landscape: keys are vertical strips along the X axis */
  top: 0;
  height: 100%;
  left: var(--pos);
  width: var(--size);
  padding: 0;
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  justify-content: flex-start;
  gap: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 4px 4px 8px 8px;
  cursor: pointer;
  transition: background var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
}
.white {
  background: linear-gradient(180deg, var(--bg-base) 0%, var(--bg-surface) 100%);
  color: var(--text-muted);
  z-index: 1;
}
.white:hover {
  background: linear-gradient(180deg, var(--bg-surface) 0%, var(--bg-elevated) 100%);
}
.white.active {
  background: var(--accent-primary);
  color: var(--text-inverse);
  box-shadow: inset 0 -8px 16px var(--accent-glow), 0 0 12px var(--accent-glow);
  transform: translateY(2px);
}
.black {
  height: 60%;
  background: linear-gradient(180deg, #0a0a14 0%, #1c1c28 100%);
  color: var(--text-muted);
  z-index: 2;
  border-color: rgba(255, 255, 255, 0.12);
  border-radius: 3px 3px 6px 6px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.5);
}
.black:hover {
  background: linear-gradient(180deg, #15152a 0%, #232342 100%);
}
.black.active {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  box-shadow: inset 0 -6px 12px rgba(0, 0, 0, 0.4), 0 0 12px var(--accent-secondary);
  transform: translateY(2px);
}
.note-name {
  font-size: 0.65rem;
  letter-spacing: 0.04em;
  padding-bottom: 0.4rem;
  opacity: 0.65;
}
.kb-hint {
  font-size: 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 0.05rem 0.3rem;
  color: var(--accent-primary);
  margin-top: 0.3rem;
  text-transform: uppercase;
}
.black .kb-hint {
  background: rgba(0, 0, 0, 0.5);
  color: var(--accent-secondary);
}

/* Portrait phones — flip the keyboard to vertical so each key gets the full screen width.
   Landscape phones and desktop keep the standard horizontal layout. */
@media (orientation: portrait) and (max-width: 720px) {
  .piano { padding: 0.4rem; }
  .bed {
    height: clamp(360px, 68vh, 760px);
    width: 100%;
  }
  .white,
  .black {
    /* Swap axes: --pos drives top, --size drives height */
    left: 0;
    width: 100%;
    top: var(--pos);
    height: var(--size);
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    padding: 0 0.7rem;
    gap: 0.4rem;
    border-radius: 6px 10px 10px 6px;
  }
  .white.active {
    /* Press-down feedback shifts horizontally now */
    transform: translateX(3px);
  }
  .black {
    /* Black keys overlay only the left half of the bed for a piano-like silhouette */
    width: 56%;
    height: var(--size);
    border-radius: 4px 8px 8px 4px;
    justify-content: flex-start;
    padding: 0 0.5rem;
  }
  .black.active { transform: translateX(3px); }
  .note-name {
    font-size: 0.78rem;
    padding-bottom: 0;
    opacity: 0.85;
  }
  .kb-hint {
    margin-top: 0;
    font-size: 0.7rem;
  }
}
</style>
