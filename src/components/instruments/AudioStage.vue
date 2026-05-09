<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import InstrumentSelector from './InstrumentSelector.vue'
import EffectsPanel from './EffectsPanel.vue'
import MasterControls from './MasterControls.vue'
import EffectsLibrary from './EffectsLibrary.vue'
import LivePlay from '@/components/keyboard/LivePlay.vue'
import PracticePanel from '@/components/practice/PracticePanel.vue'

const store = useAudioStore()
const { ensureInstrument } = useAudio()
const { t } = useI18n()
const fxLibOpen = ref(false)

onMounted(() => {
  store.ensureEffectsFor(store.activeInstrument)
  void ensureInstrument(store.activeInstrument)
})
</script>

<template>
  <div class="stage">
    <div class="col-main">
      <InstrumentSelector />
      <LivePlay />
    </div>
    <aside class="col-aside">
      <MasterControls />
      <button
        class="lib-btn mono"
        :title="t('fxlib.title')"
        @click="fxLibOpen = true"
      >
        <span class="lib-ico" aria-hidden="true">🎛</span>
        <span class="lib-label">{{ t('fxlib.openButton') }}</span>
      </button>
      <PracticePanel />
      <EffectsPanel />
    </aside>
    <EffectsLibrary :open="fxLibOpen" @close="fxLibOpen = false" />
  </div>
</template>

<style scoped>
.stage {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(280px, 360px);
  gap: 1rem;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  min-width: 0;
}
.col-main,
.col-aside {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-width: 0;
}
.lib-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.55rem 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast),
    box-shadow var(--transition-fast);
}
.lib-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 14px var(--accent-glow);
}
.lib-ico { font-size: 0.95rem; }
@media (max-width: 880px) {
  .stage {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
