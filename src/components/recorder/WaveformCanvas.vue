<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, computed } from 'vue'
import type { Clip } from '@/lib/types'

const props = defineProps<{ clip: Clip; playhead: number; isPlaying: boolean }>()
const emit = defineEmits<{
  (e: 'update-trim', payload: { trimStart: number; trimEnd: number }): void
  (e: 'scrub', positionRatio: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const wrapRef = ref<HTMLDivElement | null>(null)
const dpr = window.devicePixelRatio || 1

const playheadRatio = computed(() => {
  if (!props.clip.duration) return 0
  return Math.min(1, Math.max(0, props.playhead / props.clip.duration))
})

function draw() {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return
  const w = wrap.clientWidth
  const h = wrap.clientHeight
  canvas.width = w * dpr
  canvas.height = h * dpr
  canvas.style.width = `${w}px`
  canvas.style.height = `${h}px`
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.scale(dpr, dpr)

  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--accent-primary').trim() || '#00f5ff'
  const muted = styles.getPropertyValue('--text-muted').trim() || '#888'
  const surface = styles.getPropertyValue('--bg-elevated').trim() || '#000'

  ctx.fillStyle = surface
  ctx.fillRect(0, 0, w, h)

  const peaks = props.clip.waveform
  const mid = h / 2
  ctx.fillStyle = muted
  for (let i = 0; i < peaks.length; i++) {
    const x = (i / peaks.length) * w
    const peak = peaks[i] * (h * 0.45)
    ctx.fillRect(x, mid - peak, Math.max(1, w / peaks.length - 0.5), peak * 2)
  }

  const ts = props.clip.trimStart * w
  const te = props.clip.trimEnd * w
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, 0, ts, h)
  ctx.fillRect(te, 0, w - te, h)

  ctx.strokeStyle = accent
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(ts, 0)
  ctx.lineTo(ts, h)
  ctx.moveTo(te, 0)
  ctx.lineTo(te, h)
  ctx.stroke()

  ctx.fillStyle = accent
  drawHandle(ctx, ts, h)
  drawHandle(ctx, te, h)

  if (props.isPlaying || props.playhead > 0) {
    const px = playheadRatio.value * w
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(px, 0)
    ctx.lineTo(px, h)
    ctx.stroke()
  }
}

function drawHandle(ctx: CanvasRenderingContext2D, x: number, h: number) {
  ctx.beginPath()
  ctx.moveTo(x - 6, h / 2 - 8)
  ctx.lineTo(x + 6, h / 2 - 8)
  ctx.lineTo(x + 6, h / 2 + 8)
  ctx.lineTo(x - 6, h / 2 + 8)
  ctx.closePath()
  ctx.fill()
}

let dragHandle: 'start' | 'end' | null = null

function ratioFromEvent(e: PointerEvent): number {
  const wrap = wrapRef.value
  if (!wrap) return 0
  const rect = wrap.getBoundingClientRect()
  return Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
}

function onPointerDown(e: PointerEvent) {
  const wrap = wrapRef.value
  if (!wrap) return
  const ratio = ratioFromEvent(e)
  const ts = props.clip.trimStart
  const te = props.clip.trimEnd
  const tolerance = 0.015
  if (Math.abs(ratio - ts) < tolerance) dragHandle = 'start'
  else if (Math.abs(ratio - te) < tolerance) dragHandle = 'end'
  else {
    emit('scrub', ratio)
    return
  }
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  if (!dragHandle) return
  const r = ratioFromEvent(e)
  if (dragHandle === 'start') {
    emit('update-trim', { trimStart: Math.min(r, props.clip.trimEnd - 0.01), trimEnd: props.clip.trimEnd })
  } else {
    emit('update-trim', { trimStart: props.clip.trimStart, trimEnd: Math.max(r, props.clip.trimStart + 0.01) })
  }
}

function onPointerUp() {
  dragHandle = null
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
}

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  draw()
  if (wrapRef.value) {
    resizeObs = new ResizeObserver(() => draw())
    resizeObs.observe(wrapRef.value)
  }
})
onUnmounted(() => {
  resizeObs?.disconnect()
})

watch(
  () => [props.clip.id, props.clip.waveform, props.clip.trimStart, props.clip.trimEnd, props.playhead, props.isPlaying],
  () => draw(),
)
</script>

<template>
  <div ref="wrapRef" class="wave-wrap" @pointerdown="onPointerDown">
    <canvas ref="canvasRef" />
  </div>
</template>

<style scoped>
.wave-wrap {
  position: relative;
  width: 100%;
  height: 140px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  cursor: crosshair;
  touch-action: none;
}
canvas {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
