<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useChaos } from '@/composables/useChaos'
import Knob from '@/components/ui/Knob.vue'

const { chaosAmount, setChaosAmount, glitchBurst } = useChaos()
const { t } = useI18n()
</script>

<template>
  <section class="card">
    <header class="head">
      <h4>{{ t('chaos.chaosKnob') }}</h4>
      <span class="hint mono">{{ Math.round(chaosAmount * 100) }}%</span>
    </header>
    <div class="row">
      <Knob :model-value="chaosAmount" :size="80" @update:model-value="setChaosAmount" />
      <button class="glitch" @click="glitchBurst(1.2)">
        <span class="bolt">⚡</span>
        {{ t('chaos.glitch') }}
      </button>
    </div>
    <p class="hint-text mono">{{ t('chaos.chaosHint') }}</p>
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
.hint { font-size: 0.75rem; color: var(--accent-primary); }
.row {
  display: flex;
  align-items: center;
  gap: 1rem;
  justify-content: center;
  padding: 0.5rem 0;
}
.glitch {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1.2rem;
  font-family: var(--font-mono);
  font-size: 0.85rem;
  background: var(--accent-secondary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.glitch:hover { transform: scale(1.04); }
.bolt { font-size: 1.1rem; }
.hint-text {
  margin: 0;
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
}
</style>
