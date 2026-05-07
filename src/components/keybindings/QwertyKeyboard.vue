<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { QWERTY_ROWS, keyDisplay, normalizeKey } from '@/lib/keybindings'
import type { KeyBinding } from '@/lib/types'

const props = defineProps<{ editable?: boolean }>()
const emit = defineEmits<{ (e: 'pick', key: string): void }>()

const store = useKeyBindingsStore()
const { t } = useI18n()

function onKey(k: string) {
  if (!props.editable) return
  store.editingKey = k
  emit('pick', k)
}

function bindingFor(k: string): KeyBinding | undefined {
  return store.getBinding(k)
}

function summary(b: KeyBinding | undefined): string {
  if (!b) return ''
  if (b.label) return b.label
  if (b.type === 'note' || b.type === 'sample') return `${b.instrument}·${b.note}`
  if (b.type === 'chord') return `${b.instrument}·${b.chord?.length ?? 0}`
  if (b.type === 'clip') return t('binding.clip')
  if (b.type === 'action') return t(`binding.action.${b.action}`)
  return ''
}
</script>

<template>
  <div class="kb">
    <div v-for="(row, ri) in QWERTY_ROWS" :key="ri" class="row" :class="`row-${ri}`">
      <button
        v-for="k in row"
        :key="k"
        class="key"
        :class="{
          space: k === ' ',
          bound: !!bindingFor(k),
          active: store.activeKey === normalizeKey(k),
          editing: store.editingKey === normalizeKey(k),
        }"
        :data-type="bindingFor(k)?.type"
        @click="onKey(k)"
      >
        <span class="kchar">{{ keyDisplay(k) }}</span>
        <span v-if="bindingFor(k)" class="ksum mono">{{ summary(bindingFor(k)) }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.kb {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.row {
  display: flex;
  gap: 0.35rem;
  justify-content: center;
}
.row-2 { padding-inline-start: 1rem; }
.row-3 { padding-inline-start: 2rem; }
.row-4 { justify-content: center; }
.key {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: space-between;
  width: 56px;
  height: 56px;
  padding: 0.3rem 0.4rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  text-align: start;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast),
    transform var(--transition-fast);
}
.key.space {
  width: 360px;
}
.key:hover {
  border-color: var(--accent-primary);
}
.key.bound {
  background: var(--bg-base);
  border-color: var(--accent-primary);
  box-shadow: inset 0 0 0 1px var(--accent-primary);
}
.key.bound[data-type='action'] {
  border-color: var(--accent-secondary);
  box-shadow: inset 0 0 0 1px var(--accent-secondary);
}
.key.bound[data-type='clip'] {
  border-style: dashed;
}
.key.active,
.key.editing {
  transform: scale(0.94);
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-color: var(--accent-primary);
}
.kchar {
  font-family: var(--font-mono);
  font-weight: 700;
  font-size: 0.95rem;
}
.ksum {
  font-size: 0.6rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.key.bound .ksum {
  color: var(--accent-primary);
}
.key.active .ksum,
.key.editing .ksum {
  color: var(--text-inverse);
}
@media (max-width: 760px) {
  .key {
    width: 42px;
    height: 48px;
    padding: 0.2rem 0.25rem;
  }
  .key.space { width: 220px; }
}
</style>
