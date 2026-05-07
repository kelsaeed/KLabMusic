<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

const { getMasterAnalyser, getMasterFft } = useAudio()
const { t } = useI18n()
const canvasRef = ref<HTMLCanvasElement | null>(null)
let raf = 0

function loop() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const w = canvas.width = canvas.clientWidth * (window.devicePixelRatio || 1)
  const h = canvas.height = canvas.clientHeight * (window.devicePixelRatio || 1)
  const styles = getComputedStyle(document.documentElement)
  const accent = styles.getPropertyValue('--accent-primary').trim() || '#00f5ff'
  const accentSec = styles.getPropertyValue('--accent-secondary').trim() || '#ff00aa'

  ctx.clearRect(0, 0, w, h)

  const fft = getMasterFft().getValue() as Float32Array
  const barWidth = w / fft.length
  for (let i = 0; i < fft.length; i++) {
    const v = (fft[i] + 100) / 100
    const barH = Math.max(2, v * h * 0.65)
    ctx.fillStyle = accent
    ctx.globalAlpha = 0.6
    ctx.fillRect(i * barWidth, h - barH, Math.max(1, barWidth - 2), barH)
  }

  ctx.globalAlpha = 1
  ctx.strokeStyle = accentSec
  ctx.lineWidth = 2
  ctx.beginPath()
  const wave = getMasterAnalyser().getValue() as Float32Array
  for (let i = 0; i < wave.length; i++) {
    const x = (i / wave.length) * w
    const y = h / 2 + wave[i] * h * 0.4
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  raf = requestAnimationFrame(loop)
}

onMounted(() => {
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
</style>
