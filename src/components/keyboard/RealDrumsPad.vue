<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

// Phase 7 — full acoustic drum-kit pad. Distinct from the "Beats" pad
// (which is the TR-808 trigger box). The kit is laid out roughly the
// way a drummer sees it from the throne: cymbals high, kick low,
// snare front-and-centre, toms in a row. Each piece is a single
// hit; velocity scales with how low on the pad the user clicks
// (mirrors the existing Beats pad behaviour).

const { t } = useI18n()
const { playOn } = useAudio()

interface Piece {
  /** Sample id understood by buildRealDrums in useAudio. */
  sample: string
  label: string
  /** CSS color token used to tint the pad. */
  color: string
  /** Grid placement — col / row in a 6×4 layout that mirrors a kit. */
  col: string
  row: string
  /** Smaller piece visual (cymbals/hats) vs the bigger drums. */
  size: 'small' | 'medium' | 'large'
}

// 6-col × 4-row grid. Layout (left→right, top→bottom):
//   crash      |          | tom1 | tom2 |          | ride
//   hihatC     |          |               | crash...|
//             snare      |    floor tom
//                   kick (centered, 2 cols)
const PIECES: Piece[] = [
  { sample: 'hihatC', label: 'Hi-Hat',       color: '#ccff00', col: '1 / span 1', row: '1', size: 'small' },
  { sample: 'hihatO', label: 'Open Hat',     color: '#ff9d00', col: '2 / span 1', row: '1', size: 'small' },
  { sample: 'crash',  label: 'Crash',        color: '#ff5e9c', col: '3 / span 1', row: '1', size: 'medium' },
  { sample: 'tom1',   label: 'Tom 1',        color: '#9d4edd', col: '4 / span 1', row: '1', size: 'medium' },
  { sample: 'tom2',   label: 'Tom 2',        color: '#9d4edd', col: '5 / span 1', row: '1', size: 'medium' },
  { sample: 'ride',   label: 'Ride',         color: '#06ffa5', col: '6 / span 1', row: '1', size: 'medium' },
  { sample: 'snare',  label: 'Snare',        color: 'var(--accent-secondary)', col: '2 / span 2', row: '2', size: 'large' },
  { sample: 'floor',  label: 'Floor Tom',    color: '#ffae00', col: '4 / span 2', row: '2', size: 'large' },
  { sample: 'kick',   label: 'Kick',         color: 'var(--accent-primary)', col: '2 / span 4', row: '3', size: 'large' },
]

const flashing = ref<Set<string>>(new Set())

function velocityFromY(e: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  return Math.round(50 + ratio * 77)
}

function hit(piece: Piece, e: PointerEvent) {
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  const vel = velocityFromY(e, target)
  void playOn('realDrums', piece.sample, vel)
  flashing.value = new Set([...flashing.value, piece.sample])
  setTimeout(() => {
    flashing.value.delete(piece.sample)
    flashing.value = new Set(flashing.value)
  }, 160)
}
</script>

<template>
  <div class="kit">
    <!-- TODO(visual-asset): replace the round CSS pads with a layered
         drum-kit illustration in Phase 11 — pad data attributes stay
         the same so the click handler doesn't change. -->
    <div class="kit-grid">
      <button
        v-for="piece in PIECES"
        :key="piece.sample"
        class="piece"
        :class="[
          piece.size,
          { flash: flashing.has(piece.sample) },
        ]"
        :style="{
          '--piece-color': piece.color,
          gridColumn: piece.col,
          gridRow: piece.row,
        }"
        @pointerdown="hit(piece, $event)"
      >
        <span class="piece-icon" aria-hidden="true">●</span>
        <span class="piece-label mono">{{ piece.label }}</span>
      </button>
    </div>
    <p class="hint mono">{{ t('drums.hint') }}</p>
  </div>
</template>

<style scoped>
.kit {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.kit-grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  grid-template-rows: 130px 110px 110px;
  gap: 0.5rem;
  padding: 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  user-select: none;
  touch-action: none;
}
.piece {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  background: var(--bg-base);
  border: 2px solid var(--piece-color);
  border-radius: 50%;
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast);
}
/* Small (cymbal / hat) — pure circle. */
.piece.small {
  border-radius: 50%;
}
/* Medium (toms) — slight oval to read drum-like. */
.piece.medium {
  border-radius: 50%;
}
/* Large (snare, floor, kick) — rounded rectangle so the wide cells
   don't end up as ovals. */
.piece.large {
  border-radius: 18px;
}
.piece:hover {
  background: color-mix(in srgb, var(--piece-color) 18%, var(--bg-elevated));
}
.piece.flash,
.piece:active {
  background: var(--piece-color);
  color: var(--bg-base);
  transform: scale(0.94);
  box-shadow: 0 0 28px var(--piece-color);
}
.piece-icon {
  font-size: clamp(0.9rem, 2vw, 1.4rem);
  color: var(--piece-color);
  line-height: 1;
}
.piece.flash .piece-icon,
.piece:active .piece-icon {
  color: var(--bg-base);
}
.piece-label {
  font-size: 0.66rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.hint {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

@media (max-width: 720px) {
  .kit-grid {
    grid-template-rows: 100px 90px 90px;
    padding: 0.5rem;
  }
  .piece-label { font-size: 0.6rem; }
}
@media (max-width: 480px) {
  .kit-grid {
    grid-template-rows: 80px 78px 78px;
    gap: 0.35rem;
  }
}
</style>
