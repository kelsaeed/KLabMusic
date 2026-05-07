<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLivePlay } from '@/composables/useLivePlay'

const { modWheel, setMod } = useLivePlay()
const { t } = useI18n()
const wheelRef = ref<HTMLDivElement | null>(null)

function start(e: PointerEvent) {
  if (!wheelRef.value) return
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  apply(e)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function move(e: PointerEvent) {
  apply(e)
}
function apply(e: PointerEvent) {
  if (!wheelRef.value) return
  const rect = wheelRef.value.getBoundingClientRect()
  const ratio = 1 - (e.clientY - rect.top) / rect.height
  setMod(ratio)
}
function end() {
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
}
</script>

<template>
  <div class="mod">
    <div class="lbl mono">{{ t('live.mod') }}</div>
    <div ref="wheelRef" class="wheel" @pointerdown="start">
      <div class="track" />
      <div class="indicator" :style="{ bottom: modWheel * 100 + '%' }" />
    </div>
    <div class="value mono">{{ Math.round(modWheel * 100) }}</div>
  </div>
</template>

<style scoped>
.mod {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  width: 56px;
}
.lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.wheel {
  position: relative;
  width: 28px;
  height: 96px;
  cursor: ns-resize;
  touch-action: none;
}
.track {
  position: absolute;
  inset: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.indicator {
  position: absolute;
  left: 50%;
  width: 22px;
  height: 8px;
  margin-left: -11px;
  background: var(--accent-primary);
  border-radius: 2px;
  box-shadow: 0 0 6px var(--accent-glow);
  transform: translateY(50%);
}
.value {
  font-size: 0.7rem;
  color: var(--accent-primary);
}
</style>
