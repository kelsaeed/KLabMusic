<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMultiplayerStore } from '@/stores/multiplayer'

// Tiny status pill that appears on collaborative surfaces (Beat Maker,
// Arrangement) to tell the user "this view is being synced with N other
// people in your room." Hidden when the user isn't in a room — it would
// just be noise.

const store = useMultiplayerStore()
const { t } = useI18n()

const others = computed(() => Math.max(0, store.playerCount - 1))
</script>

<template>
  <div v-if="store.isConnected" class="badge mono" :title="t('mp.syncTooltip')">
    <span class="dot" />
    <span class="label">
      {{ t('mp.syncedWith', { n: others }) }}
    </span>
    <span v-if="store.roomCode" class="code">{{ store.roomCode }}</span>
  </div>
</template>

<style scoped>
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.25rem 0.6rem;
  border: 1px solid var(--accent-primary);
  border-radius: 999px;
  background: var(--bg-elevated);
  color: var(--accent-primary);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  box-shadow: 0 0 10px var(--accent-glow);
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
  animation: sync-pulse 1.6s ease-in-out infinite;
}
.code {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: var(--bg-base);
  color: var(--text-muted);
  letter-spacing: 0.08em;
}
@keyframes sync-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.55; transform: scale(0.85); }
}
</style>
