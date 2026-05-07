<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useMultiplayer } from '@/composables/useMultiplayer'
import { INSTRUMENTS } from '@/lib/instruments'

const store = useMultiplayerStore()
const { leaveRoom } = useMultiplayer()
const { t } = useI18n()
const router = useRouter()
const copied = ref(false)

async function copyCode() {
  if (!store.roomCode) return
  try {
    await navigator.clipboard.writeText(store.roomCode)
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    /* noop */
  }
}

async function onLeave() {
  await leaveRoom()
  void router.push({ name: 'app' })
}
</script>

<template>
  <header class="room-bar">
    <div class="left">
      <button class="code-btn mono" :title="t('mp.copyCode')" @click="copyCode">
        <span class="dot" />
        {{ store.roomCode }}
        <span v-if="copied" class="copied mono">✓</span>
      </button>
      <span class="hint mono">{{ store.players.length }} / 8</span>
    </div>

    <div class="players">
      <div
        v-for="p in store.players"
        :key="p.id"
        class="chip"
        :class="{ me: p.id === store.localId, host: p.isHost }"
        :title="`${p.name} · ${t(`audio.instrument.${p.instrument}`)}${p.isHost ? ' · host' : ''}`"
      >
        <span class="ico" :style="{ color: p.color }">{{ INSTRUMENTS[p.instrument].icon }}</span>
        <span class="nm">{{ p.name }}</span>
      </div>
    </div>

    <button class="leave mono" @click="onLeave">{{ t('mp.leave') }}</button>
  </header>
</template>

<style scoped>
.room-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 1rem;
  background: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}
.left { display: flex; align-items: center; gap: 0.6rem; }
.code-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.85rem;
  background: var(--bg-elevated);
  font-size: 0.85rem;
  letter-spacing: 0.06em;
}
.dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.copied { color: var(--accent-primary); }
.hint { color: var(--text-muted); font-size: 0.75rem; }

.players {
  display: flex;
  gap: 0.4rem;
  flex: 1;
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.7rem;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  border-radius: 999px;
  font-size: 0.8rem;
}
.chip.me { border-color: var(--accent-primary); }
.chip.host::after {
  content: '★';
  color: var(--accent-secondary);
  font-size: 0.7rem;
}
.ico { font-size: 0.95rem; }
.leave {
  font-size: 0.75rem;
  padding: 0.45rem 0.85rem;
  border-color: var(--accent-secondary);
  color: var(--accent-secondary);
}
</style>
