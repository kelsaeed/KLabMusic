<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'

// الرق / riq. Two strokes, two zones:
//   • inner disc  → 'dum'  (deep centre-skin hit)
//   • outer ring  → 'tak'  (bright rim / jingle snap)
// Plus the continuous gestures, unchanged:
//   • drag (sustained motion) → stream of soft 'shake' jingles
//   • rapid taps (≥3 within 400 ms) → 'roll'
// A real riq is played exactly this way — the player alternates a
// centred dum with a rim tak and rolls the jingles between them.

const { t } = useI18n()
const { playOn } = useAudio()
const { recordLivePlay } = useLivePlay()

const surfaceRef = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
const lastShakeTime = ref(0)
const tapTimestamps: number[] = []

const flash = ref<'dum' | 'tak' | 'shake' | 'roll' | null>(null)
function pulse(kind: 'dum' | 'tak' | 'shake' | 'roll') {
  flash.value = kind
  setTimeout(() => {
    if (flash.value === kind) flash.value = null
  }, 170)
}

function detectRoll(now: number): boolean {
  while (tapTimestamps.length && now - tapTimestamps[0] > 400) tapTimestamps.shift()
  return tapTimestamps.length >= 3
}

// Where did the pointer land — the inner disc (dum) or the outer
// ring (tak)? Distance from centre as a fraction of the radius; the
// inner disc is the middle 56% (matches the .head visual at inset 22%).
function zoneAt(e: PointerEvent): 'dum' | 'tak' {
  const el = surfaceRef.value
  if (!el) return 'tak'
  const rect = el.getBoundingClientRect()
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const dist = Math.hypot(dx, dy) / (rect.width / 2)
  return dist <= 0.56 ? 'dum' : 'tak'
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  dragging.value = true
  const now = performance.now()
  tapTimestamps.push(now)
  if (detectRoll(now)) {
    void playOn('tambourine', 'roll', 100)
    recordLivePlay('tambourine', 'roll', 100, 0.2)
    pulse('roll')
    return
  }
  const zone = zoneAt(e)
  if (zone === 'dum') {
    void playOn('tambourine', 'dum', 118)
    recordLivePlay('tambourine', 'dum', 118, 0.25)
    pulse('dum')
  } else {
    void playOn('tambourine', 'tak', 110)
    recordLivePlay('tambourine', 'tak', 110, 0.2)
    pulse('tak')
  }
}

function onMove(e: PointerEvent) {
  if (!dragging.value) return
  if (e.pointerType === 'mouse' && e.buttons === 0) {
    onUp()
    return
  }
  // Throttle shake samples so the voice pool isn't hammered. Real
  // jingles shimmer every ~70 ms during a sustained shake.
  const now = performance.now()
  if (now - lastShakeTime.value < 70) return
  lastShakeTime.value = now
  void playOn('tambourine', 'shake', 80)
  recordLivePlay('tambourine', 'shake', 80, 0.1)
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
    <div
      ref="surfaceRef"
      class="surface"
      :class="{
        flashTak: flash === 'tak',
        flashShake: flash === 'shake',
        flashRoll: flash === 'roll',
      }"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <!-- Jingles around the frame (the tak zone) -->
      <span
        v-for="i in 12"
        :key="i"
        class="jingle"
        :style="{ '--angle': `${(i - 1) * 30}deg` }"
      />
      <span class="ring-label mono">{{ t('tambourine.tak') }}</span>
      <!-- Inner skin disc (the dum zone) — its own hit target -->
      <span class="head" :class="{ flashDum: flash === 'dum' }">
        <span class="head-label mono">{{ t('tambourine.dum') }}</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.tambourine {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  align-items: center;
}
.hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 0.03em;
  text-align: center;
  max-width: 360px;
  line-height: 1.5;
}
.surface {
  position: relative;
  width: clamp(220px, 50vw, 320px);
  aspect-ratio: 1;
  border-radius: 50%;
  border: 3px solid #b88d2a;
  background:
    radial-gradient(circle at 50% 45%, #2a2030 0%, #1a1422 70%, #120e18 100%);
  cursor: pointer;
  user-select: none;
  touch-action: none;
  display: grid;
  place-items: center;
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6), 0 4px 18px rgba(0, 0, 0, 0.5);
  transition: box-shadow var(--transition-fast);
}
/* tak = ring stroke: whole frame lights warm */
.surface.flashTak {
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6), 0 0 26px var(--accent-primary);
  border-color: var(--accent-primary);
}
.surface.flashShake {
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6), 0 0 20px #ccff00aa;
  border-color: #ccff00;
}
.surface.flashRoll {
  box-shadow: inset 0 0 24px rgba(0, 0, 0, 0.6), 0 0 28px var(--accent-secondary);
  border-color: var(--accent-secondary);
}

.head {
  position: absolute;
  inset: 22%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 40%, rgba(232, 210, 178, 0.22) 0%, rgba(150, 110, 70, 0.34) 70%, rgba(90, 64, 40, 0.4) 100%);
  border: 1px solid rgba(232, 210, 178, 0.25);
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.45);
  transition: box-shadow var(--transition-fast), transform var(--transition-fast);
  pointer-events: none;
}
/* dum = centre stroke: just the skin disc reacts */
.head.flashDum {
  transform: scale(0.96);
  box-shadow: inset 0 2px 10px rgba(0, 0, 0, 0.45), 0 0 22px var(--accent-primary);
  border-color: var(--accent-primary);
}
.head-label {
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(232, 210, 178, 0.65);
}
.ring-label {
  position: absolute;
  bottom: 7%;
  font-size: 0.62rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(232, 210, 178, 0.5);
  pointer-events: none;
}
.jingle {
  position: absolute;
  top: 5px;
  left: calc(50% - 8px);
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: linear-gradient(180deg, #f6e58d 0%, #b88d2a 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  transform-origin: 8px calc((min(220px, 50vw, 320px) / 2) - 5px);
  transform: rotate(var(--angle));
  pointer-events: none;
}
</style>
