<script setup lang="ts">
import { ref } from 'vue'
import AppNav from '@/components/AppNav.vue'
import ModuleTabs from '@/components/ModuleTabs.vue'
import AudioStage from '@/components/instruments/AudioStage.vue'
import BeatMakerStage from '@/components/beatmaker/BeatMakerStage.vue'
import LoopStationStage from '@/components/loopstation/LoopStationStage.vue'
import ChaosStage from '@/components/chaos/ChaosStage.vue'
import RecorderDrawer from '@/components/recorder/RecorderDrawer.vue'
import type { ModuleTab } from '@/lib/types'

const active = ref<ModuleTab>('live')
</script>

<template>
  <div class="app-shell">
    <AppNav />
    <ModuleTabs :active="active" @change="(tab) => (active = tab)" />

    <main class="stage">
      <AudioStage v-if="active === 'live'" />
      <BeatMakerStage v-else-if="active === 'beat'" />
      <LoopStationStage v-else-if="active === 'loop'" />
      <ChaosStage v-else-if="active === 'chaos'" />
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
</style>
