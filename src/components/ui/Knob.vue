<script setup lang="ts">
import { computed, ref } from 'vue'

const props = withDefaults(
  defineProps<{
    modelValue: number
    min?: number
    max?: number
    size?: number
    label?: string
    disabled?: boolean
  }>(),
  { min: 0, max: 1, size: 56, disabled: false },
)
const emit = defineEmits<{ (e: 'update:modelValue', value: number): void }>()

const dragging = ref(false)

const normalized = computed(() => (props.modelValue - props.min) / (props.max - props.min))
const angle = computed(() => -135 + normalized.value * 270)
const valueLabel = computed(() => {
  const v = props.modelValue
  const range = props.max - props.min
  if (range <= 1.5) return Math.round(normalized.value * 100) + '%'
  return v.toFixed(0)
})

// Min/max indicator coordinates (start of arc at -135°, end at +135°)
const minMarker = computed(() => {
  const a = (-135 * Math.PI) / 180
  return { x: 50 + 46 * Math.sin(a), y: 50 - 46 * Math.cos(a) }
})
const maxMarker = computed(() => {
  const a = (135 * Math.PI) / 180
  return { x: 50 + 46 * Math.sin(a), y: 50 - 46 * Math.cos(a) }
})

function clamp(v: number) {
  return Math.min(props.max, Math.max(props.min, v))
}

function startDrag(e: PointerEvent) {
  if (props.disabled) return
  dragging.value = true
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  const startX = e.clientX
  const startVal = props.modelValue
  const range = props.max - props.min

  function onMove(ev: PointerEvent) {
    // Horizontal drag rotates the knob: right = increase, left = decrease.
    const dx = ev.clientX - startX
    const next = clamp(startVal + (dx / 160) * range)
    emit('update:modelValue', next)
  }
  function onUp() {
    dragging.value = false
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}

function onWheel(e: WheelEvent) {
  if (props.disabled) return
  e.preventDefault()
  const range = props.max - props.min
  const delta = -Math.sign(e.deltaY) * range * 0.04
  emit('update:modelValue', clamp(props.modelValue + delta))
}
</script>

<template>
  <div class="knob-wrap" :class="{ disabled }">
    <div
      class="knob"
      :style="{ width: `${size}px`, height: `${size}px` }"
      role="slider"
      :aria-valuenow="modelValue"
      :aria-valuemin="min"
      :aria-valuemax="max"
      :aria-label="label"
      tabindex="0"
      @pointerdown="startDrag"
      @wheel.passive="onWheel"
    >
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="42" class="track" />
        <!-- min/max guide ticks -->
        <circle :cx="minMarker.x" :cy="minMarker.y" r="3" class="tick min-tick" />
        <circle :cx="maxMarker.x" :cy="maxMarker.y" r="3" class="tick max-tick" />
        <path
          class="fill"
          :d="`M 50 50 L 50 8 A 42 42 0 ${normalized > 0.5 ? 1 : 0} 1 ${
            50 + 42 * Math.sin((angle * Math.PI) / 180)
          } ${50 - 42 * Math.cos((angle * Math.PI) / 180)} Z`"
        />
        <line
          x1="50"
          y1="50"
          :x2="50 + 32 * Math.sin((angle * Math.PI) / 180)"
          :y2="50 - 32 * Math.cos((angle * Math.PI) / 180)"
          class="indicator"
        />
        <circle cx="50" cy="50" r="6" class="cap" />
      </svg>
    </div>
    <div class="ranges mono">
      <span class="r-min">MIN</span>
      <span class="r-val">{{ valueLabel }}</span>
      <span class="r-max">MAX</span>
    </div>
    <span v-if="label" class="label">{{ label }}</span>
  </div>
</template>

<style scoped>
.knob-wrap {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  user-select: none;
}
.knob-wrap.disabled {
  opacity: 0.4;
  pointer-events: none;
}
.knob {
  cursor: ew-resize;
  touch-action: none;
}
.knob:active { cursor: grabbing; }
.knob:focus-visible {
  outline: 2px solid var(--accent-primary);
  outline-offset: 2px;
  border-radius: 50%;
}
.track {
  fill: var(--bg-elevated);
  stroke: var(--border);
  stroke-width: 2;
}
.fill {
  fill: var(--accent-primary);
  opacity: 0.18;
}
.indicator {
  stroke: var(--accent-primary);
  stroke-width: 4;
  stroke-linecap: round;
}
.cap {
  fill: var(--bg-base);
  stroke: var(--accent-primary);
  stroke-width: 2;
}
.tick { stroke: var(--text-muted); stroke-width: 1; }
.min-tick { fill: var(--accent-secondary); }
.max-tick { fill: var(--accent-primary); }
.ranges {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.4rem;
  align-items: baseline;
  font-size: 0.55rem;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  width: 100%;
}
.r-min { color: var(--accent-secondary); }
.r-max { color: var(--accent-primary); }
.r-val {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-primary);
}
.label {
  font-size: 0.7rem;
  font-family: var(--font-mono);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
