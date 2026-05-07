<script setup lang="ts">
import { onMounted } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import InstrumentSelector from './InstrumentSelector.vue'
import EffectsPanel from './EffectsPanel.vue'
import MasterControls from './MasterControls.vue'
import TestPad from './TestPad.vue'

const store = useAudioStore()
const { ensureInstrument } = useAudio()

onMounted(() => {
  store.ensureEffectsFor(store.activeInstrument)
  void ensureInstrument(store.activeInstrument)
})
</script>

<template>
  <div class="stage">
    <div class="col-main">
      <InstrumentSelector />
      <TestPad />
    </div>
    <aside class="col-aside">
      <MasterControls />
      <EffectsPanel />
    </aside>
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
}
.col-main,
.col-aside {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
@media (max-width: 880px) {
  .stage {
    grid-template-columns: 1fr;
  }
}
</style>
