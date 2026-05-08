<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'
import { useKeyBindings } from '@/composables/useKeyBindings'
import { useAuth } from '@/composables/useAuth'
import { useAudio } from '@/composables/useAudio'

const { initTheme } = useTheme()
const { initLocale } = useLocale()
const { init: initBindings } = useKeyBindings()
const { init: initAuth } = useAuth()
const { prefetchAvailableInstruments } = useAudio()

onMounted(() => {
  initTheme()
  initLocale()
  initBindings()
  void initAuth()
  // Start downloading every Soundfont in the background once the app has
  // settled, so by the time the user clicks an instrument the samples are
  // already cached locally (the SW persists them across visits).
  prefetchAvailableInstruments()
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
