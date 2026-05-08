<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArrangeStore } from '@/stores/arrange'
import type {
  ArrangeTrack,
  AutomationParam,
} from '@/lib/types'

// Per-track automation lane. Renders the active parameter's curve as an
// SVG polyline with draggable point handles. Click empty space to drop a
// new point at (clientX → time, clientY → value 1..0). Drag a point to
// move it; double-click to delete.
//
// Time is converted to/from pixels via store.pxPerSec so the lane stays
// in sync with the timeline ruler and the clip blocks above it. Width is
// passed in by the parent so the SVG matches the lane column exactly.

const props = defineProps<{
  track: ArrangeTrack
  widthPx: number
}>()

const store = useArrangeStore()
const { t } = useI18n()

const PARAMS: AutomationParam[] = ['volume', 'reverb', 'delay', 'filter']
const HEIGHT = 56  // visual height of the lane in CSS pixels

const param = computed<AutomationParam>(() => props.track.automationParam)

function setParam(p: AutomationParam) {
  store.setTrackAutomationParam(props.track.id, p)
}

const points = computed(() => props.track.automation[param.value] ?? [])

// Audio tracks support all four params; pattern tracks only volume.
const isUnsupportedForKind = computed(() =>
  props.track.kind === 'pattern' && param.value !== 'volume',
)

// Convert (sec, value) → SVG coords. Y is inverted so 1.0 lives at the
// top of the lane and 0.0 at the bottom — matches every DAW convention.
function timeToX(sec: number): number {
  return sec * store.pxPerSec
}
function valueToY(v: number): number {
  return (1 - v) * HEIGHT
}
function xToTime(px: number): number {
  return Math.max(0, px / store.pxPerSec)
}
function yToValue(px: number): number {
  return Math.max(0, Math.min(1, 1 - px / HEIGHT))
}

// Polyline string for the curve. With < 2 points we still draw the
// connecting horizontal hold so users see something even with one point.
const polylinePoints = computed(() => {
  const pts = points.value
  if (pts.length === 0) return ''
  if (pts.length === 1) {
    const x = timeToX(pts[0].time)
    const y = valueToY(pts[0].value)
    return `0,${y} ${x},${y} ${props.widthPx},${y}`
  }
  // Hold the first point's value from x=0 until that point, and hold the
  // last point's value from that point to the right edge — same hold
  // semantics the engine's sampleAutomation uses.
  const head = `0,${valueToY(pts[0].value)}`
  const middle = pts.map((p) => `${timeToX(p.time)},${valueToY(p.value)}`).join(' ')
  const tail = `${props.widthPx},${valueToY(pts[pts.length - 1].value)}`
  return `${head} ${middle} ${tail}`
})

function snapTime(sec: number): number {
  if (store.snapDivision <= 0) return Math.max(0, sec)
  const beatSec = 60 / store.bpm
  const stepSec = beatSec / store.snapDivision
  return Math.max(0, Math.round(sec / stepSec) * stepSec)
}

interface DragState {
  pointIndex: number
  rect: DOMRect
}
const drag = ref<DragState | null>(null)

function onLanePointerDown(e: PointerEvent) {
  if (isUnsupportedForKind.value) return
  // Click on the SVG background → add a new point at the cursor.
  if ((e.target as HTMLElement).dataset.bg !== '1') return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  store.addAutomationPoint(props.track.id, param.value, {
    time: snapTime(xToTime(x)),
    value: yToValue(y),
  })
}

function onPointPointerDown(e: PointerEvent, idx: number) {
  if (isUnsupportedForKind.value) return
  e.stopPropagation()
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  const rect = (e.currentTarget as Element).closest('.lane-svg')!.getBoundingClientRect()
  drag.value = { pointIndex: idx, rect }
}

function onPointerMove(e: PointerEvent) {
  if (!drag.value) return
  const { rect, pointIndex } = drag.value
  const x = e.clientX - rect.left
  const y = e.clientY - rect.top
  store.moveAutomationPoint(props.track.id, param.value, pointIndex, {
    time: snapTime(xToTime(x)),
    value: yToValue(y),
  })
}

function onPointerUp() {
  drag.value = null
}

function onPointDoubleClick(idx: number) {
  if (isUnsupportedForKind.value) return
  store.removeAutomationPoint(props.track.id, param.value, idx)
}

function onClear() {
  // Clear current param's curve only — leaves other params' curves alone.
  const lane = props.track.automation[param.value]
  if (!lane) return
  while (lane.length > 0) lane.pop()
}

onMounted(() => {
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})
</script>

<template>
  <div class="auto-lane" :style="{ '--track-color': track.color }">
    <header class="lane-head">
      <div class="param-picker">
        <button
          v-for="p in PARAMS"
          :key="p"
          type="button"
          class="param-btn mono"
          :class="{ on: param === p, hasPoints: (track.automation[p]?.length ?? 0) > 0 }"
          @click="setParam(p)"
        >
          {{ t(`arrange.autoParam.${p}`) }}
        </button>
      </div>
      <button class="clear-btn mono" @click="onClear" :disabled="points.length === 0">
        {{ t('arrange.clearLane') }}
      </button>
    </header>

    <p v-if="isUnsupportedForKind" class="unsupported mono">
      {{ t('arrange.autoUnsupported') }}
    </p>

    <svg
      class="lane-svg"
      :width="widthPx"
      :height="HEIGHT"
      :class="{ disabled: isUnsupportedForKind }"
      @pointerdown="onLanePointerDown"
    >
      <!-- Background — captures click-to-add events. data-bg=1 lets the
           handler distinguish background clicks from clicks on point dots. -->
      <rect data-bg="1" x="0" y="0" :width="widthPx" :height="HEIGHT" fill="transparent" />

      <!-- Mid-line for visual reference at value 0.5 -->
      <line
        x1="0" :y1="HEIGHT * 0.5" :x2="widthPx" :y2="HEIGHT * 0.5"
        stroke="currentColor" stroke-opacity="0.12" stroke-dasharray="4 4"
      />

      <polyline
        v-if="points.length > 0"
        :points="polylinePoints"
        fill="none"
        :stroke="track.color"
        stroke-width="2"
        stroke-linejoin="round"
      />

      <!-- Filled area under curve to make the shape readable at a glance -->
      <polyline
        v-if="points.length > 0"
        :points="`0,${HEIGHT} ${polylinePoints} ${widthPx},${HEIGHT}`"
        :fill="track.color"
        fill-opacity="0.12"
        stroke="none"
      />

      <circle
        v-for="(point, idx) in points"
        :key="idx"
        :cx="timeToX(point.time)"
        :cy="valueToY(point.value)"
        r="6"
        :fill="track.color"
        stroke="white"
        stroke-width="1.5"
        class="point-handle"
        @pointerdown="onPointPointerDown($event, idx)"
        @dblclick="onPointDoubleClick(idx)"
      />
    </svg>
  </div>
</template>

<style scoped>
.auto-lane {
  position: relative;
  height: auto;
  border-bottom: 1px solid var(--border);
  border-left: 4px solid var(--track-color);
  background: var(--bg-elevated);
  display: flex;
  flex-direction: column;
}
.lane-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.param-picker { display: flex; gap: 0.25rem; flex-wrap: wrap; }
.param-btn {
  padding: 0.25rem 0.55rem;
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.param-btn:hover { border-color: var(--accent-primary); color: var(--text-primary); }
.param-btn.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
}
.param-btn.hasPoints:not(.on) {
  /* A small dot decorator marks parameters that already have a curve so
     the user can find their way back to a shaped param after toggling
     between them. */
  position: relative;
}
.param-btn.hasPoints:not(.on)::after {
  content: '';
  position: absolute;
  top: 4px;
  right: 5px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.clear-btn {
  font-size: 0.62rem;
  padding: 0.25rem 0.55rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
}
.clear-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.unsupported {
  margin: 0;
  padding: 0.4rem 0.6rem;
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
}

.lane-svg {
  display: block;
  cursor: crosshair;
  background: var(--bg-base);
  color: var(--text-primary);
}
.lane-svg.disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.point-handle {
  cursor: grab;
  transition: r 60ms;
}
.point-handle:hover { r: 7; }
.point-handle:active { cursor: grabbing; }
</style>
