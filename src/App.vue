<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'

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
