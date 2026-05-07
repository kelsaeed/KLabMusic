<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useChaos } from '@/composables/useChaos'

const { setChaosX, setChaosY } = useChaos()
const { t } = useI18n()
const padRef = ref<HTMLDivElement | null>(null)
const x = ref(0)
const y = ref(0)
const dragging = ref(false)

function ratios(e: PointerEvent): { x: number; y: number } {
  if (!padRef.value) return { x: 0, y: 0 }
  const rect = padRef.value.getBoundingClientRect()
  return {
    x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
    y: 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
  }
}

function apply(e: PointerEvent) {
  const r = ratios(e)
  x.value = r.x
  y.value = r.y
  setChaosX(r.x)
  setChaosY(r.y)
}

function start(e: PointerEvent) {
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  dragging.value = true
  apply(e)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function move(e: PointerEvent) {
  apply(e)
}
function end() {
  dragging.value = false
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
}
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.xyPad') }}</h4>
      <span class="hint mono">{{ t('chaos.xyHint') }}</span>
    </header>
    <div ref="padRef" class="pad" :class="{ dragging }" @pointerdown="start">
      <div class="grid" />
      <div class="dot" :style="{ left: x * 100 + '%', bottom: y * 100 + '%' }" />
      <span class="axis-x mono">{{ t('chaos.filter') }}</span>
      <span class="axis-y mono">{{ t('chaos.reverb') }}</span>
    </div>
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
.head { display: flex; justify-content: space-between; align-items: baseline; }
.head h4 {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.hint { font-size: 0.7rem; color: var(--text-muted); }
.pad {
  position: relative;
  width: 100%;
  aspect-ratio: 1.4;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: crosshair;
  touch-action: none;
  overflow: hidden;
}
.grid {
  position: absolute;
  inset: 0;
  background:
    linear-gradient(transparent 49%, var(--border) 50%, transparent 51%),
    linear-gradient(90deg, transparent 49%, var(--border) 50%, transparent 51%);
}
.dot {
  position: absolute;
  width: 22px;
  height: 22px;
  margin: -11px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 16px var(--accent-glow);
  transition: box-shadow var(--transition-fast);
}
.pad.dragging .dot {
  box-shadow: 0 0 28px var(--accent-glow);
  transform: scale(1.1);
}
.axis-x, .axis-y {
  position: absolute;
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  pointer-events: none;
}
.axis-x { bottom: 6px; left: 50%; transform: translateX(-50%); }
.axis-y { top: 50%; right: 6px; transform: translateY(-50%) rotate(90deg); transform-origin: center; }
</style>
