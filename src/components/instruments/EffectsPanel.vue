<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import { EFFECT_ORDER } from '@/lib/instruments'
import Knob from '@/components/ui/Knob.vue'
import type { EffectId } from '@/lib/types'

const store = useAudioStore()
const { toggleEffect } = useAudio()
const { t } = useI18n()

const controls = computed(() => store.effects[store.activeInstrument])

function onAmount(id: EffectId, value: number) {
  const c = store.effects[store.activeInstrument]?.[id]
  if (c) c.amount = value
}
</script>

<template>
  <section class="fx">
    <header class="head">
      <h3>{{ t('audio.effects') }}</h3>
      <span class="hint mono">{{ t(`audio.instrument.${store.activeInstrument}`) }}</span>
    </header>

    <div v-if="controls" class="row">
      <div v-for="id in EFFECT_ORDER" :key="id" class="cell" :class="{ on: controls[id].enabled }">
        <button class="toggle mono" @click="toggleEffect(id)">
          <span class="led" />
          {{ t(`audio.effect.${id}`) }}
        </button>
        <Knob
          :model-value="controls[id].amount"
          :disabled="!controls[id].enabled"
          @update:model-value="(v: number) => onAmount(id, v)"
        />
      </div>
    </div>
    <p v-else class="empty">{{ t('audio.pickInstrument') }}</p>
  </section>
</template>

<style scoped>
.fx {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.head h3 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  font-size: 0.7rem;
  color: var(--accent-primary);
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.75rem;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--transition-fast);
}
.cell.on {
  border-color: var(--accent-primary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.7rem;
  background: transparent;
  border: 1px solid var(--border);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.cell.on .led {
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}
</style>
