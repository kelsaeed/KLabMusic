<script setup lang="ts">
import { onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'
import { useKeyBindings } from '@/composables/useKeyBindings'
import { useAuth } from '@/composables/useAuth'

const { initTheme } = useTheme()
const { initLocale } = useLocale()
const { init: initBindings } = useKeyBindings()
const { init: initAuth } = useAuth()

onMounted(() => {
  initTheme()
  initLocale()
  initBindings()
  void initAuth()
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
