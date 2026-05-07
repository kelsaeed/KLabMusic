<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLivePlay } from '@/composables/useLivePlay'

const { pitchBend, setBend, releaseBend } = useLivePlay()
const { t } = useI18n()
const stripRef = ref<HTMLDivElement | null>(null)

function start(e: PointerEvent) {
  if (!stripRef.value) return
  ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  apply(e)
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', end)
}
function move(e: PointerEvent) {
  apply(e)
}
function apply(e: PointerEvent) {
  if (!stripRef.value) return
  const rect = stripRef.value.getBoundingClientRect()
  const ratio = (e.clientX - rect.left) / rect.width
  setBend(ratio * 2 - 1)
}
function end() {
  releaseBend()
  window.removeEventListener('pointermove', move)
  window.removeEventListener('pointerup', end)
}
</script>

<template>
  <div class="bend">
    <div class="lbl mono">{{ t('live.bend') }}</div>
    <div ref="stripRef" class="strip" @pointerdown="start">
      <div class="track" />
      <div class="indicator" :style="{ left: ((pitchBend + 1) / 2) * 100 + '%' }" />
      <div class="center" />
    </div>
    <div class="value mono">{{ Math.round(pitchBend * 100) }}</div>
  </div>
</template>

<style scoped>
.bend {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  flex: 1;
  min-width: 140px;
}
.lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.strip {
  position: relative;
  width: 100%;
  height: 28px;
  cursor: ew-resize;
  touch-action: none;
}
.track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  transform: translateY(-50%);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 2px;
}
.center {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 1px;
  background: var(--text-muted);
  opacity: 0.4;
}
.indicator {
  position: absolute;
  top: 0;
  width: 14px;
  height: 28px;
  margin-left: -7px;
  background: var(--accent-primary);
  border-radius: 4px;
  box-shadow: 0 0 8px var(--accent-glow);
  transition: left 100ms ease-out;
}
.value {
  font-size: 0.7rem;
  color: var(--accent-primary);
}
</style>
