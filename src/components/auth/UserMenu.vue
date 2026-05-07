<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useUserStore } from '@/stores/user'
import { useAuth } from '@/composables/useAuth'

const store = useUserStore()
const { signOut } = useAuth()
const { t } = useI18n()
const open = ref(false)
const wrapRef = ref<HTMLDivElement | null>(null)

function close(e: MouseEvent) {
  if (!wrapRef.value) return
  if (!wrapRef.value.contains(e.target as Node)) open.value = false
}
onMounted(() => window.addEventListener('mousedown', close))
onBeforeUnmount(() => window.removeEventListener('mousedown', close))

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?'
}
</script>

<template>
  <div v-if="store.profile" ref="wrapRef" class="menu-wrap">
    <button class="trigger" @click="open = !open">
      <img v-if="store.profile.avatarUrl" :src="store.profile.avatarUrl" alt="" />
      <span v-else class="avatar mono">{{ initials(store.profile.displayName) }}</span>
      <span class="name hide-sm">{{ store.profile.displayName }}</span>
    </button>

    <div v-if="open" class="dropdown">
      <header class="head">
        <span class="email mono">{{ store.profile.email }}</span>
      </header>
      <button class="item mono" @click="signOut(); open = false">
        {{ t('auth.signOut') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu-wrap {
  position: relative;
}
.trigger {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.3rem 0.6rem;
  background: var(--bg-elevated);
}
.avatar,
.trigger img {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-size: 0.75rem;
  font-weight: 700;
  object-fit: cover;
}
.name {
  font-size: 0.8rem;
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dropdown {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  min-width: 200px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.4rem;
  box-shadow: var(--shadow);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
html[dir='rtl'] .dropdown {
  right: auto;
  left: 0;
}
.head {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
.email {
  font-size: 0.7rem;
  color: var(--text-muted);
  display: block;
  word-break: break-all;
}
.item {
  text-align: start;
  padding: 0.5rem 0.6rem;
  font-size: 0.8rem;
  background: transparent;
  border: none;
  border-radius: 6px;
}
.item:hover {
  background: var(--bg-surface);
  color: var(--accent-secondary);
}
@media (max-width: 600px) {
  .hide-sm { display: none; }
}
</style>
