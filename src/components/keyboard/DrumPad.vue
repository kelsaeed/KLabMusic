<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useKeyBindingsStore } from '@/stores/keybindings'

const { playOn } = useAudio()
const bindingStore = useKeyBindingsStore()
const { t } = useI18n()

interface Pad {
  sample: string
  label: string
  icon: string
  color: string
}

const PADS: Pad[] = [
  { sample: 'kick', label: 'Kick', icon: '⬤', color: 'var(--accent-primary)' },
  { sample: 'snare', label: 'Snare', icon: '⬣', color: 'var(--accent-secondary)' },
  { sample: 'hihat', label: 'Hi-Hat', icon: '✕', color: '#ccff00' },
  { sample: 'hihatO', label: 'Open HH', icon: '✚', color: '#ff9d00' },
  { sample: 'clap', label: 'Clap', icon: '◍', color: '#ff5e9c' },
  { sample: 'tom', label: 'Tom', icon: '◐', color: '#9d4edd' },
  { sample: 'ride', label: 'Ride', icon: '☼', color: '#06ffa5' },
  { sample: '__empty', label: '', icon: '', color: 'transparent' },
]

// Reactive Set: `.add`/`.delete` are tracked per-key with no
// reallocation, so a fast drum roll only re-renders the pad that
// actually flashed instead of swapping the whole Set's identity and
// re-evaluating every pad's flash binding on every hit.
const flashing = reactive(new Set<string>())

function bindingKeyFor(sample: string): string | undefined {
  for (const b of bindingStore.activeSet.bindings) {
    if (b.type === 'sample' && b.instrument === 'drums' && b.note === sample) return b.key
  }
  return undefined
}

const padsWithKeys = computed(() =>
  PADS.map((p) => ({ ...p, key: bindingKeyFor(p.sample) })),
)

function velocityFromY(e: PointerEvent, target: HTMLElement): number {
  const rect = target.getBoundingClientRect()
  const ratio = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height))
  return Math.round(50 + ratio * 77)
}

function hit(sample: string, e: PointerEvent) {
  if (sample === '__empty') return
  e.preventDefault()
  const target = e.currentTarget as HTMLElement
  const vel = velocityFromY(e, target)
  void playOn('drums', sample, vel)
  flashing.add(sample)
  setTimeout(() => {
    flashing.delete(sample)
  }, 150)
}
</script>

<template>
  <div class="drum-rack">
    <div class="grid">
      <button
        v-for="pad in padsWithKeys"
        :key="pad.sample"
        class="pad"
        :class="{
          empty: pad.sample === '__empty',
          flash: flashing.has(pad.sample),
        }"
        :style="{ '--pad-color': pad.color }"
        :disabled="pad.sample === '__empty'"
        @pointerdown="hit(pad.sample, $event)"
      >
        <span v-if="pad.sample !== '__empty'" class="icon" aria-hidden="true">{{ pad.icon }}</span>
        <span v-if="pad.sample !== '__empty'" class="label mono">{{ pad.label }}</span>
        <span v-if="pad.key" class="kbd-hint mono">{{ pad.key.toUpperCase() }}</span>
      </button>
    </div>
    <p class="hint mono">{{ t('drums.hint') }}</p>
  </div>
</template>

<style scoped>
.drum-rack {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.6rem;
  user-select: none;
  touch-action: none;
}
.pad {
  position: relative;
  aspect-ratio: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.3rem;
  background: var(--bg-elevated);
  border: 2px solid var(--pad-color);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-weight: 600;
  cursor: pointer;
  transition:
    transform var(--transition-fast),
    background var(--transition-fast),
    box-shadow var(--transition-fast);
}
.pad.empty {
  border-color: transparent;
  background: transparent;
  cursor: default;
}
.pad:not(.empty):hover {
  background: color-mix(in srgb, var(--pad-color) 18%, var(--bg-elevated));
}
.pad.flash,
.pad:active {
  background: var(--pad-color);
  color: var(--bg-base);
  transform: scale(0.95);
  box-shadow: 0 0 24px var(--pad-color);
}
.icon {
  font-size: clamp(1.4rem, 4vw, 2.2rem);
  color: var(--pad-color);
  line-height: 1;
}
.pad.flash .icon,
.pad:active .icon {
  color: var(--bg-base);
}
.label {
  font-size: 0.78rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.kbd-hint {
  position: absolute;
  top: 6px;
  inset-inline-end: 8px;
  font-size: 0.65rem;
  padding: 0.05rem 0.35rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
}
.hint {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
@media (max-width: 600px) {
  .grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
