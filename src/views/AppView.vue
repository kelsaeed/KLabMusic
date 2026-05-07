<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import AppNav from '@/components/AppNav.vue'
import ModuleTabs from '@/components/ModuleTabs.vue'
import RecorderDrawer from '@/components/recorder/RecorderDrawer.vue'
import ToastStack from '@/components/ui/ToastStack.vue'
import type { ModuleTab } from '@/lib/types'

const AudioStage = defineAsyncComponent(() => import('@/components/instruments/AudioStage.vue'))
const BeatMakerStage = defineAsyncComponent(() => import('@/components/beatmaker/BeatMakerStage.vue'))
const LoopStationStage = defineAsyncComponent(() => import('@/components/loopstation/LoopStationStage.vue'))
const ChaosStage = defineAsyncComponent(() => import('@/components/chaos/ChaosStage.vue'))

const active = ref<ModuleTab>('live')
</script>

<template>
  <div class="app-shell">
    <AppNav />
    <ModuleTabs :active="active" @change="(tab) => (active = tab)" />

    <main class="stage">
      <Suspense>
        <AudioStage v-if="active === 'live'" />
        <BeatMakerStage v-else-if="active === 'beat'" />
        <LoopStationStage v-else-if="active === 'loop'" />
        <ChaosStage v-else-if="active === 'chaos'" />
        <template #fallback>
          <div class="loading mono">Loading…</div>
        </template>
      </Suspense>
    </main>

    <RecorderDrawer />
    <ToastStack />
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
.loading {
  color: var(--text-muted);
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
</style>
