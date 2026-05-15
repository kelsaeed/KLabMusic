<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

const { getMasterAnalyser, getMasterFft } = useAudio()
const { t } = useI18n()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0
// Cached colour values + canvas backing-store size. The previous version
// re-read getComputedStyle() and re-assigned canvas.width/height every frame
// (~60 Hz). Setting canvas.width clears the bitmap AND triggers a full
// layout/paint, which on mobile was the single biggest source of jank during
// playback — every layout flush cost a few ms and starved the audio worker
// enough to produce the "wshhhhh" some listeners described.
let cachedAccent = '#00f5ff'
let cachedAccentSec = '#ff00aa'
let lastW = 0
let lastH = 0
let lastDpr = 0

function refreshTheme() {
  const styles = getComputedStyle(document.documentElement)
  cachedAccent = styles.getPropertyValue('--accent-primary').trim() || cachedAccent
  cachedAccentSec = styles.getPropertyValue('--accent-secondary').trim() || cachedAccentSec
}

function loop() {
  raf = requestAnimationFrame(loop)
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  const cssW = canvas.clientWidth
  const cssH = canvas.clientHeight
  const targetW = cssW * dpr
  const targetH = cssH * dpr
  // Only resize when the layout actually changed. Re-assigning width/height
  // every frame was clearing the bitmap unnecessarily and forcing a layout
  // flush — keeping the size stable lets the GPU hand back the cached
  // backing store on each frame.
  if (targetW !== lastW || targetH !== lastH || dpr !== lastDpr) {
    canvas.width = targetW
    canvas.height = targetH
    lastW = targetW
    lastH = targetH
    lastDpr = dpr
  }
  const w = lastW
  const h = lastH

  ctx.clearRect(0, 0, w, h)

  const fftAnalyser = getMasterFft()
  if (!fftAnalyser) return
  const fft = fftAnalyser.getValue() as Float32Array
  const barWidth = w / fft.length
  ctx.fillStyle = cachedAccent
  ctx.globalAlpha = 0.6
  for (let i = 0; i < fft.length; i++) {
    const v = (fft[i] + 100) / 100
    const barH = Math.max(2, v * h * 0.65)
    ctx.fillRect(i * barWidth, h - barH, Math.max(1, barWidth - 2), barH)
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = cachedAccentSec
  ctx.lineWidth = 2
  ctx.beginPath()
  const waveAnalyser = getMasterAnalyser()
  if (!waveAnalyser) return
  const wave = waveAnalyser.getValue() as Float32Array
  for (let i = 0; i < wave.length; i++) {
    const x = (i / wave.length) * w
    const y = h / 2 + wave[i] * h * 0.4
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
}

onMounted(() => {
  refreshTheme()
  raf = requestAnimationFrame(loop)
})
onUnmounted(() => {
  cancelAnimationFrame(raf)
})
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.visualizer') }}</h4>
    </header>
    <canvas ref="canvasRef" />
    <p class="help mono">{{ t('chaos.visualizerHelp') }}</p>
  </section>
</template>

<style scoped>
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.head h4 {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
canvas {
  display: block;
  width: 100%;
  height: 160px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.help {
  margin: 0;
  font-size: 0.7rem;
  line-height: 1.4;
  color: var(--text-muted);
  padding: 0.4rem 0.55rem;
  background: var(--bg-elevated);
  border-inline-start: 2px solid var(--accent-primary);
  border-radius: var(--radius);
}
</style>
