<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import AppNav from '@/components/AppNav.vue'
import ModuleTabs from '@/components/ModuleTabs.vue'
import RecorderDrawer from '@/components/recorder/RecorderDrawer.vue'
import ToastStack from '@/components/ui/ToastStack.vue'
import AdRails from '@/components/ui/AdRails.vue'
import type { ModuleTab } from '@/lib/types'

const AudioStage = defineAsyncComponent(() => import('@/components/instruments/AudioStage.vue'))
const BeatMakerStage = defineAsyncComponent(() => import('@/components/beatmaker/BeatMakerStage.vue'))
const ArrangeStage = defineAsyncComponent(() => import('@/components/arrange/ArrangeStage.vue'))
const LoopStationStage = defineAsyncComponent(() => import('@/components/loopstation/LoopStationStage.vue'))
const ChaosStage = defineAsyncComponent(() => import('@/components/chaos/ChaosStage.vue'))
const LearnStage = defineAsyncComponent(() => import('@/components/learn/LearnStage.vue'))

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
        <ArrangeStage v-else-if="active === 'arrange'" />
        <LoopStationStage v-else-if="active === 'loop'" />
        <ChaosStage v-else-if="active === 'chaos'" />
        <LearnStage v-else-if="active === 'learn'" />
        <template #fallback>
          <div class="loading mono">Loading…</div>
        </template>
      </Suspense>
    </main>

    <RecorderDrawer />
    <ToastStack />
    <AdRails />
  </div>
</template>

<style scoped>
.app-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}
.stage {
  flex: 1;
  /* Bottom padding must clear the fixed RecorderDrawer (56 px collapsed) AND
     iOS's home-indicator safe area so the last track / control / lesson is
     reachable above the drawer. We use 7 rem (112 px) which is the 56 px
     drawer + 56 px breathing room, then add env(safe-area-inset-bottom) on
     top so iPhones with the home gesture bar don't eat into the clearance. */
  padding: clamp(0.75rem, 2vmin, 1.5rem) clamp(0.75rem, 2vw, 1.5rem)
    calc(7rem + env(safe-area-inset-bottom, 0px));
  display: flex;
  justify-content: center;
  width: 100%;
}
.loading {
  color: var(--text-muted);
  font-size: 0.85rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
@media (max-width: 600px) {
  .stage {
    padding: 0.75rem 0.75rem calc(7rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
