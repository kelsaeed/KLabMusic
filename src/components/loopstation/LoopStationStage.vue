<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useLoopStationStore, MAX_LOOP_LAYERS } from '@/stores/loopstation'
import { useLoopStation } from '@/composables/useLoopStation'
import LayerRow from './LayerRow.vue'

const store = useLoopStationStore()
const { toggleRecord, stopAll, startAll, exportMixWav } = useLoopStation()
const { t } = useI18n()
</script>

<template>
  <section class="stage">
    <header class="head">
      <h3>{{ t('loop.title') }}</h3>
      <span class="hint mono">
        {{ store.layerCount }} / {{ MAX_LOOP_LAYERS }}
      </span>
    </header>

    <div class="bar">
      <div class="source">
        <button
          v-for="opt in (['mic','master'] as const)"
          :key="opt"
          class="src-btn mono"
          :class="{ on: store.recordSource === opt }"
          @click="store.recordSource = opt"
        >
          {{ t(`loop.source.${opt}`) }}
        </button>
      </div>

      <button
        class="rec"
        :class="{ live: store.isRecording, full: store.isFull }"
        :disabled="store.isFull && !store.isRecording"
        @click="toggleRecord"
      >
        <span class="rec-dot" />
        {{ store.isRecording ? t('loop.stopRec', { t: store.recordSeconds.toFixed(1) }) : t('loop.record') }}
      </button>

      <div class="transport">
        <button class="t mono" :class="{ on: store.transportPlaying }" @click="store.transportPlaying ? stopAll() : startAll()">
          {{ store.transportPlaying ? '◼' : '▶' }}
        </button>
        <button class="t mono" :title="t('loop.undo')" :disabled="store.layers.length === 0" @click="store.popLastLayer">↶</button>
        <button class="t mono" :title="t('loop.clearAll')" :disabled="store.layers.length === 0" @click="store.clearAll">⌫</button>
        <button class="t mono" :disabled="store.layers.length === 0" @click="exportMixWav">{{ t('loop.export') }}</button>
      </div>
    </div>

    <p v-if="store.baseDuration" class="base mono">
      {{ t('loop.baseLength') }}: {{ store.baseDuration.toFixed(2) }}s
    </p>

    <div v-if="store.layers.length === 0" class="empty">
      {{ t('loop.empty') }}
    </div>
    <div v-else class="layers">
      <LayerRow
        v-for="(layer, i) in store.layers"
        :key="layer.id"
        :layer="layer"
        :index="i"
      />
    </div>
  </section>
</template>

<style scoped>
.stage {
  width: 100%;
  max-width: 1000px;
  margin: 0 auto;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.head h3 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint { font-size: 0.8rem; color: var(--accent-primary); }

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}
.source { display: inline-flex; gap: 0.2rem; }
.src-btn {
  font-size: 0.75rem;
  padding: 0.45rem 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.src-btn.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.rec {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.7rem 1.4rem;
  font-size: 0.85rem;
  font-family: var(--font-mono);
  border: 1px solid var(--accent-secondary);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}
.rec.live {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  animation: pulse-rec 1s ease-in-out infinite;
}
.rec.full { opacity: 0.4; cursor: not-allowed; }
.rec-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: currentColor;
}
@keyframes pulse-rec {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 110, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(255, 0, 110, 0); }
}

.transport { display: inline-flex; gap: 0.3rem; margin-left: auto; }
.t {
  width: 36px;
  height: 36px;
  padding: 0;
  font-size: 0.95rem;
}
.t.on { color: var(--accent-primary); border-color: var(--accent-primary); }
.t:disabled { opacity: 0.4; cursor: not-allowed; }

.base { margin: 0; font-size: 0.75rem; color: var(--text-muted); }

.empty {
  border: 1px dashed var(--border);
  padding: 2rem;
  text-align: center;
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 0.85rem;
}

.layers {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
</style>
