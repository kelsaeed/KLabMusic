<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import AppNav from '@/components/AppNav.vue'
import ModuleTabs from '@/components/ModuleTabs.vue'
import AudioStage from '@/components/instruments/AudioStage.vue'
import BeatMakerStage from '@/components/beatmaker/BeatMakerStage.vue'
import RecorderDrawer from '@/components/recorder/RecorderDrawer.vue'
import type { ModuleTab } from '@/lib/types'

const { t } = useI18n()
const active = ref<ModuleTab>('live')
</script>

<template>
  <div class="app-shell">
    <AppNav />
    <ModuleTabs :active="active" @change="(tab) => (active = tab)" />

    <main class="stage">
      <AudioStage v-if="active === 'live'" />
      <BeatMakerStage v-else-if="active === 'beat'" />

      <section v-else class="placeholder">
        <h2>{{ t(`modules.${active}`) }}</h2>
        <p>Module coming up in the next phase.</p>
      </section>
    </main>

    <RecorderDrawer />
  </div>
</template>

<style scoped>
.app-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.stage {
  flex: 1;
  padding: 1.5rem 1.5rem 5rem;
  display: flex;
  justify-content: center;
}
.placeholder {
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  padding: 3rem 2rem;
  background: var(--bg-surface);
  max-width: 560px;
  width: 100%;
  margin: auto;
}
.placeholder h2 {
  margin: 0 0 0.5rem;
  color: var(--accent-primary);
}
.placeholder p {
  margin: 0;
  color: var(--text-muted);
}
</style>
