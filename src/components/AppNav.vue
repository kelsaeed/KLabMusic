<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import ThemeSwitcher from './theme/ThemeSwitcher.vue'
import LocaleSwitcher from './LocaleSwitcher.vue'
import BindingsModal from './keybindings/BindingsModal.vue'
import AIPanel from './ai/AIPanel.vue'
import ShortcutsHelp from './ShortcutsHelp.vue'
import AuthModal from './auth/AuthModal.vue'
import UserMenu from './auth/UserMenu.vue'
import MasteringDialog from './mastering/MasteringDialog.vue'
import { useUserStore } from '@/stores/user'

const { t } = useI18n()
const route = useRoute()
const userStore = useUserStore()
const isHome = computed(() => route.name === 'home')
const isInRoom = computed(() => route.name === 'room' || route.name === 'room-lobby')
const bindingsOpen = ref(false)
const aiOpen = ref(false)
const helpOpen = ref(false)
const authOpen = ref(false)
const masterOpen = ref(false)

function onKey(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement | null)?.tagName
  const inField = tag === 'INPUT' || tag === 'TEXTAREA'
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
    if (inField) return
    e.preventDefault()
    aiOpen.value = !aiOpen.value
    return
  }
  if (e.key === '?' && !inField) {
    e.preventDefault()
    helpOpen.value = !helpOpen.value
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <header class="nav">
    <RouterLink to="/" class="brand">
      <span class="logo-mark">K</span>
      <span class="brand-text">{{ t('app.name') }}</span>
    </RouterLink>

    <nav class="actions">
      <button
        v-if="!isHome"
        class="icon-btn ai"
        :class="{ on: aiOpen }"
        :title="t('ai.title') + ' (Ctrl+A)'"
        @click="aiOpen = !aiOpen"
      >
        <span class="kbd-icon">🤖</span>
        <span class="hide-sm">{{ t('ai.short') }}</span>
      </button>
      <button
        v-if="!isHome"
        class="icon-btn master"
        :title="t('mastering.title')"
        @click="masterOpen = true"
      >
        <span class="kbd-icon">🎚</span>
        <span class="hide-sm">{{ t('mastering.short') }}</span>
      </button>
      <button
        class="icon-btn"
        :title="t('help.title') + ' (?)'"
        @click="helpOpen = true"
      >
        <span class="kbd-icon mono">?</span>
      </button>
      <button
        v-if="!isHome"
        class="icon-btn"
        :title="t('binding.title')"
        @click="bindingsOpen = true"
      >
        <span class="kbd-icon mono">⌨︎</span>
        <span class="hide-sm">{{ t('binding.short') }}</span>
      </button>
      <RouterLink
        v-if="!isHome && !isInRoom"
        to="/room"
        class="icon-btn jam"
        :title="t('mp.jam')"
      >
        <span class="kbd-icon">🎤</span>
        <span class="hide-sm">{{ t('mp.jam') }}</span>
      </RouterLink>
      <RouterLink v-if="isHome" to="/app" class="cta">
        {{ t('nav.open') }}
      </RouterLink>
      <UserMenu v-if="userStore.isLoggedIn" />
      <button v-else class="icon-btn auth" @click="authOpen = true">
        <span class="kbd-icon">👤</span>
        <span class="hide-sm">{{ t('auth.signIn') }}</span>
      </button>
      <LocaleSwitcher />
      <ThemeSwitcher />
    </nav>

    <BindingsModal :open="bindingsOpen" @close="bindingsOpen = false" />
    <AIPanel :open="aiOpen" @close="aiOpen = false" />
    <ShortcutsHelp :open="helpOpen" @close="helpOpen = false" />
    <AuthModal :open="authOpen" @close="authOpen = false" />
    <MasteringDialog :open="masterOpen" @close="masterOpen = false" />
  </header>
</template>

<style scoped>
.nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  row-gap: 0.5rem;
  padding: 0.7rem clamp(0.75rem, 2vw, 1.5rem);
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 50;
  backdrop-filter: blur(8px);
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-primary);
  font-family: var(--font-display);
  font-weight: 800;
  font-size: clamp(0.95rem, 1.6vmin, 1.1rem);
  letter-spacing: 0.02em;
  flex-shrink: 0;
}

.logo-mark {
  display: grid;
  place-items: center;
  width: clamp(28px, 4vmin, 32px);
  height: clamp(28px, 4vmin, 32px);
  border-radius: 8px;
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-family: var(--font-display);
  font-weight: 800;
  box-shadow: 0 0 16px var(--accent-glow);
}

.actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.4rem;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.6rem;
  font-size: 0.78rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  white-space: nowrap;
}
.icon-btn.jam:hover {
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
  opacity: 1;
}
.icon-btn.ai.on {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}
.kbd-icon {
  font-size: 1rem;
  line-height: 1;
}
.cta {
  background: var(--accent-primary);
  color: var(--text-inverse);
  padding: 0.45rem 0.9rem;
  border-radius: var(--radius);
  font-weight: 600;
  font-size: 0.85rem;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
  white-space: nowrap;
}
.cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 16px var(--accent-glow);
  opacity: 1;
}

/* Mobile vertical — actions wrap to second row, centered */
@media (max-width: 640px) {
  .hide-sm { display: none; }
  .nav { padding: 0.55rem 0.75rem; }
  .brand { font-size: 1rem; }
  .actions {
    width: 100%;
    justify-content: center;
    gap: 0.3rem;
  }
  .icon-btn { padding: 0.32rem 0.5rem; font-size: 0.72rem; }
  .cta { padding: 0.4rem 0.8rem; font-size: 0.78rem; }
}

/* Very narrow phones — hide brand text, keep only logo */
@media (max-width: 360px) {
  .brand-text { display: none; }
}
</style>
