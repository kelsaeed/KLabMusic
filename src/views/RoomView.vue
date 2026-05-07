<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useMultiplayer } from '@/composables/useMultiplayer'
import AppNav from '@/components/AppNav.vue'
import ModuleTabs from '@/components/ModuleTabs.vue'
import AudioStage from '@/components/instruments/AudioStage.vue'
import BeatMakerStage from '@/components/beatmaker/BeatMakerStage.vue'
import LoopStationStage from '@/components/loopstation/LoopStationStage.vue'
import ChaosStage from '@/components/chaos/ChaosStage.vue'
import RecorderDrawer from '@/components/recorder/RecorderDrawer.vue'
import RoomLobbyForm from '@/components/multiplayer/RoomLobbyForm.vue'
import RoomHeader from '@/components/multiplayer/RoomHeader.vue'
import ChatPanel from '@/components/multiplayer/ChatPanel.vue'
import ReactionsLayer from '@/components/multiplayer/ReactionsLayer.vue'
import type { ModuleTab } from '@/lib/types'

const props = defineProps<{ code?: string }>()

const store = useMultiplayerStore()
const { leaveRoom } = useMultiplayer()
const { t } = useI18n()
const active = ref<ModuleTab>('beat')

onMounted(() => {
  if (!props.code) {
    void leaveRoom()
  }
})

onBeforeUnmount(() => {
  void leaveRoom()
})
</script>

<template>
  <div class="room-shell">
    <AppNav />

    <template v-if="!store.isConnected">
      <main class="lobby-stage">
        <h1 class="brand mono">{{ t('mp.lobby') }}</h1>
        <RoomLobbyForm :prefilled-code="code" />
      </main>
    </template>

    <template v-else>
      <RoomHeader />
      <ModuleTabs :active="active" @change="(tab) => (active = tab)" />
      <main class="stage">
        <AudioStage v-if="active === 'live'" />
        <BeatMakerStage v-else-if="active === 'beat'" />
        <LoopStationStage v-else-if="active === 'loop'" />
        <ChaosStage v-else-if="active === 'chaos'" />
      </main>
      <ChatPanel />
      <ReactionsLayer />
    </template>

    <RecorderDrawer />
  </div>
</template>

<style scoped>
.room-shell {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}
.lobby-stage {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 2rem 1.5rem 6rem;
  gap: 1.5rem;
  text-align: center;
}
.brand {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-primary);
}
.stage {
  flex: 1;
  padding: 1.5rem 1.5rem 5rem;
  padding-inline-end: calc(1.5rem + 36px);
  display: flex;
  justify-content: center;
}
@media (max-width: 720px) {
  .stage { padding-inline-end: 1.5rem; padding-bottom: calc(60vh + 60px); }
}
</style>
