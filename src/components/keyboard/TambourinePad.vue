<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

// Phase 8 — tambourine. Three gestures map to the three sample names
// the buildTambourine voice understands:
//   - tap (no drag) → 'hit'
//   - drag (sustained motion) → continuous 'shake' samples
//   - rapid taps (≥3 within 400 ms) → 'roll'
// All gestures land on a single circular surface, the way a real
// tambourine has only one playing area.

const { t } = useI18n()
const { playOn } = useAudio()

const dragging = ref(false)
const lastShakeTime = ref(0)
const tapTimestamps: number[] = []

const flash = ref<'hit' | 'shake' | 'roll' | null>(null)
function pulse(kind: 'hit' | 'shake' | 'roll') {
  flash.value = kind
  setTimeout(() => {
    if (flash.value === kind) flash.value = null
  }, 180)
}

function detectRoll(now: number): boolean {
  // Drop tap timestamps older than 400 ms.
  while (tapTimestamps.length && now - tapTimestamps[0] > 400) tapTimestamps.shift()
  return tapTimestamps.length >= 3
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  dragging.value = true
  const now = performance.now()
  tapTimestamps.push(now)
  if (detectRoll(now)) {
    void playOn('tambourine', 'roll', 100)
    pulse('roll')
  } else {
    void playOn('tambourine', 'hit', 110)
    pulse('hit')
  }
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  // Throttle shake samples so the pool isn't hammered. Real tambourine
  // jingles trigger every ~70 ms during a sustained shake; closer than
  // that bunches them into a single perceived chick rather than a
  // continuous shimmer.
  const now = performance.now()
  if (now - lastShakeTime.value < 70) return
  lastShakeTime.value = now
  void playOn('tambourine', 'shake', 80)
  pulse('shake')
}

function onUp() {
  dragging.value = false
  lastShakeTime.value = 0
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
  <div class="tambourine">
    <p class="hint mono">{{ t('tambourine.hint') }}</p>
    <!-- TODO(visual-asset): replace with a layered SVG of a real
         tambourine frame + jingles in Phase 11. -->
    <div
      class="surface"
      :class="{ flashHit: flash === 'hit', flashShake: flash === 'shake', flashRoll: flash === 'roll' }"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <span
        v-for="i in 12"
        :key="i"
        class="jingle"
        :style="{ '--angle': `${(i - 1) * 30}deg` }"
      />
      <span class="head" />
      <span class="label mono">{{ t('tambourine.label') }}</span>
    </div>
  </div>
</template>

<style scoped>
.tambourine {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  align-items: center;
}
.hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.surface {
  position: relative;
  width: clamp(220px, 50vw, 320px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid var(--border);
  background: var(--bg-elevated);
  cursor: pointer;
  user-select: none;
  touch-action: none;
  display: grid;
  place-items: center;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.surface:active { transform: scale(0.97); }
.surface.flashHit {
  box-shadow: 0 0 24px var(--accent-glow);
  border-color: var(--accent-primary);
}
.surface.flashShake { box-shadow: 0 0 20px #ccff00aa; border-color: #ccff00; }
.surface.flashRoll { box-shadow: 0 0 26px var(--accent-secondary); border-color: var(--accent-secondary); }

.head {
  position: absolute;
  inset: 18%;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(220, 200, 170, 0.18) 0%, rgba(120, 90, 60, 0.32) 80%);
  border: 1px dashed var(--border);
}
.jingle {
  position: absolute;
  top: 6px;
  left: calc(50% - 8px);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(180deg, #f6e58d 0%, #b88d2a 100%);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
  transform-origin: 8px calc((min(220px, 50vw, 320px) / 2) - 6px);
  transform: rotate(var(--angle));
}
.label {
  position: relative;
  z-index: 1;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
}
</style>
