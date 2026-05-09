<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'

// Debug overlay is hidden until ?debug=1 is present in the URL or the
// user taps 4× quickly anywhere on the page — opt-in only. Loaded
// async so the overlay's transitive useAudio import (which pulls in
// tone + smplr) doesn't bloat the entry chunk. The route into the
// overlay's own bundle happens after first paint, before tap-to-summon
// is realistic anyway.
const DebugOverlay = defineAsyncComponent(
  () => import('@/components/debug/DebugOverlay.vue'),
)

const { initTheme } = useTheme()
const { initLocale } = useLocale()

onMounted(() => {
  initTheme()
  initLocale()
  // Defer the heavy composables off the entry chunk. useKeyBindings transitively
  // imports tone + smplr + supabase, and useAuth pulls supabase — keeping them
  // in the entry chunk pushes ~120 KB onto the LCP critical path of every page.
  // Loading them after first paint makes /app's TTI noticeably faster.
  void import('@/composables/useKeyBindings').then(({ useKeyBindings }) => {
    useKeyBindings().init()
  })
  void import('@/composables/useAuth').then(({ useAuth }) => {
    void useAuth().init()
  })
  void import('@/composables/useAudio').then(({ useAudio }) => {
    useAudio().prefetchAvailableInstruments()
  })
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <DebugOverlay />
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
