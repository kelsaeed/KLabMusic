<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'

// الرق / riq. Two strokes, two concentric zones — exactly how the
// instrument is actually played:
//   • inner disc  → 'dum'  (deep centre-skin hit)
//   • outer ring  → 'tak'  (bright rim / jingle snap)
//   • drag        → continuous soft 'shake' jingles
// The zone the pointer lands in is ALWAYS authoritative: tapping the
// centre fast plays a stream of dums (a dum roll), tapping the rim
// fast plays a stream of taks (a jingle roll). There is no separate
// "rapid taps → jingle" override any more — that was hijacking fast
// centre taps and playing the rim sound instead, which is the bug
// the user hit ("spam the middle, the outside sound plays").

const { t } = useI18n()
const { playOn } = useAudio()
const { recordLivePlay } = useLivePlay()

const surfaceRef = ref<HTMLDivElement | null>(null)
const dragging = ref(false)
const lastShakeTime = ref(0)

// Inner disc is the central 56% of the radius (matches the .head
// visual at inset 22% → radius fraction 1 − 0.44 = 0.56).
const DUM_RADIUS_FRAC = 0.56

const flash = ref<'dum' | 'tak' | 'shake' | null>(null)
function pulse(kind: 'dum' | 'tak' | 'shake') {
  flash.value = kind
  setTimeout(() => {
    if (flash.value === kind) flash.value = null
  }, 150)
}

function zoneAt(e: PointerEvent): 'dum' | 'tak' {
  const el = surfaceRef.value
  if (!el) return 'tak'
  const rect = el.getBoundingClientRect()
  const dx = e.clientX - (rect.left + rect.width / 2)
  const dy = e.clientY - (rect.top + rect.height / 2)
  // Normalise by the radius so the test is exact regardless of the
  // responsive surface size.
  const distFrac = Math.hypot(dx, dy) / (Math.min(rect.width, rect.height) / 2)
  return distFrac <= DUM_RADIUS_FRAC ? 'dum' : 'tak'
}

function onDown(e: PointerEvent) {
  ;(e.target as Element)?.releasePointerCapture?.(e.pointerId)
  dragging.value = true
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
  // jingles shimmer roughly every ~70 ms during a sustained shake.
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

// 10 jingles evenly spaced around the frame. Pre-computed angles so
// the template just maps them — placement is done with a clean polar
// transform (rotate then push out by the radius), not fragile
// per-jingle top/left math.
const JINGLES = Array.from({ length: 10 }, (_, i) => (i * 360) / 10)
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
      }"
      @pointerdown="onDown"
      @pointermove="onMove"
    >
      <!-- Jingles ride the rim. Each is centred, then a polar
           transform rotates it and pushes it out to the rim radius.
           transform-origin stays at the element centre so the maths
           is exact at any responsive size. -->
      <span
        v-for="angle in JINGLES"
        :key="angle"
        class="jingle"
        :style="{
          transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(calc(var(--rim) * -1)) rotate(${-angle}deg)`,
        }"
      />
      <span class="ring-label mono">{{ t('tambourine.tak') }}</span>
      <!-- Inner skin disc = the dum hit target. -->
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
  /* --d drives every internal measurement so the polar maths is
     exact at any size. */
  --d: clamp(220px, 50vw, 320px);
  --rim: calc(var(--d) / 2 - 20px);
  position: relative;
  width: var(--d);
  height: var(--d);
  border-radius: 50%;
  border: 3px solid #c79a33;
  background:
    radial-gradient(circle at 50% 42%, #2c2233 0%, #1b1524 68%, #110d17 100%);
  cursor: pointer;
  user-select: none;
  touch-action: none;
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.6), 0 4px 18px rgba(0, 0, 0, 0.5);
  transition: box-shadow var(--transition-fast), border-color var(--transition-fast);
}
.surface.flashTak {
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.6), 0 0 26px var(--accent-primary);
  border-color: var(--accent-primary);
}
.surface.flashShake {
  box-shadow: inset 0 0 26px rgba(0, 0, 0, 0.6), 0 0 20px #ccff00aa;
  border-color: #ccff00;
}

.head {
  position: absolute;
  /* inset 22% → inner disc spans the central 56% of the diameter,
     which is exactly the dum hit-test radius in script. */
  inset: 22%;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 50% 38%, rgba(235, 214, 182, 0.24) 0%, rgba(150, 110, 70, 0.34) 66%, rgba(86, 60, 38, 0.42) 100%);
  border: 1px solid rgba(235, 214, 182, 0.28);
  box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.5);
  transition: box-shadow var(--transition-fast), transform var(--transition-fast);
  pointer-events: none;
}
.head.flashDum {
  transform: scale(0.95);
  box-shadow: inset 0 2px 12px rgba(0, 0, 0, 0.5), 0 0 24px var(--accent-primary);
  border-color: var(--accent-primary);
}
.head-label {
  font-size: 0.74rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(235, 214, 182, 0.7);
}
.ring-label {
  position: absolute;
  left: 50%;
  bottom: 6%;
  transform: translateX(-50%);
  font-size: 0.62rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(235, 214, 182, 0.5);
  pointer-events: none;
}
.jingle {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: linear-gradient(160deg, #f7e98e 0%, #c79a33 60%, #8a6a1f 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55), inset 0 1px 1px rgba(255, 255, 255, 0.4);
  pointer-events: none;
}
</style>
