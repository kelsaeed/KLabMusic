<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRecorderStore } from '@/stores/recorder'

const store = useRecorderStore()
const { t } = useI18n()

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <aside class="clips">
    <header class="head">
      <h4>{{ t('recorder.clips') }}</h4>
      <span class="hint mono">{{ store.clips.length }}</span>
    </header>
    <div v-if="store.clips.length === 0" class="empty">
      {{ t('recorder.noClips') }}
    </div>
    <ul v-else class="list">
      <li
        v-for="clip in store.clips"
        :key="clip.id"
        :class="['clip-row', { active: clip.id === store.activeClipId }]"
        @click="store.setActive(clip.id)"
      >
        <span class="dot" :class="`src-${clip.source}`" />
        <span class="name">{{ clip.name }}</span>
        <span class="duration mono">{{ fmt(clip.duration) }}</span>
        <button class="del" :title="t('recorder.delete')" @click.stop="store.removeClip(clip.id)">×</button>
      </li>
    </ul>
  </aside>
</template>

<style scoped>
.clips {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.6rem;
}
.head h4 {
  margin: 0;
  font-size: 0.85rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.empty {
  font-size: 0.8rem;
  color: var(--text-muted);
  padding: 1rem 0.5rem;
  text-align: center;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  overflow: auto;
}
.clip-row {
  display: grid;
  grid-template-columns: 10px 1fr auto auto;
  gap: 0.6rem;
  align-items: center;
  padding: 0.5rem 0.6rem;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  border: 1px solid transparent;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}
.clip-row:hover {
  border-color: var(--border);
}
.clip-row.active {
  border-color: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-glow);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-secondary);
}
.dot.src-mic {
  background: var(--accent-primary);
}
.name {
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.duration {
  color: var(--text-muted);
  font-size: 0.75rem;
}
.del {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  color: var(--text-muted);
  background: transparent;
}
.del:hover {
  color: var(--accent-secondary);
}
</style>
