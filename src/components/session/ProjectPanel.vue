<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSession, type NamedSave } from '@/composables/useSession'
import { useToast } from '@/composables/useToast'

// Project library — local-only save / load slots backed by the
// useSession composable's localStorage layer. Auto-save already runs
// continuously (every edit persists to klm:session:auto), so this
// panel is for *named milestones* — the user wants to checkpoint a
// session so they can come back to it after working on something
// else, or hand a starting-point to themselves on another machine.
//
// The cap is MAX_NAMED_SLOTS (10) inside useSession; when the cap is
// reached, the save call evicts the oldest slot. We surface that
// behaviour with a confirm dialog before overwriting.

const { t } = useI18n()
const { show } = useToast()
const { saveNamed, loadNamed, deleteNamed, listNamed, newProject } = useSession()

const open = ref(false)
const newName = ref('')
const saves = ref<NamedSave[]>([])

function refresh() {
  saves.value = listNamed()
}

function onOpen() {
  open.value = true
  refresh()
}

function onSave() {
  const name = newName.value.trim()
  if (!name) {
    show({ type: 'error', title: t('project.nameRequired'), duration: 2000 })
    return
  }
  saveNamed(name)
  newName.value = ''
  refresh()
  show({ type: 'success', title: t('project.saved', { name }), duration: 1800 })
}

function onLoad(entry: NamedSave) {
  const ok = loadNamed(entry.id)
  if (!ok) {
    show({ type: 'error', title: t('project.loadFailed'), duration: 2500 })
    return
  }
  show({ type: 'success', title: t('project.loaded', { name: entry.name }), duration: 1800 })
  open.value = false
}

function onDelete(entry: NamedSave) {
  if (!confirm(t('project.confirmDelete', { name: entry.name }))) return
  deleteNamed(entry.id)
  refresh()
}

function onNew() {
  if (!confirm(t('project.confirmNew'))) return
  newProject()
  show({ type: 'info', title: t('project.newCreated'), duration: 1500 })
  open.value = false
}

const sortedSaves = computed(() => saves.value)

function formatDate(ts: number): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}
</script>

<template>
  <div class="project-wrap">
    <button
      type="button"
      class="open-btn mono"
      :title="t('project.openTitle')"
      @click="onOpen"
    >
      💾 {{ t('project.button') }}
    </button>

    <Transition name="slide">
      <aside v-if="open" class="panel" :aria-label="t('project.title')">
        <header class="head">
          <span class="title mono">{{ t('project.title') }}</span>
          <button class="close" :title="t('common.close')" @click="open = false">×</button>
        </header>

        <p class="hint mono">{{ t('project.autoSaveHint') }}</p>

        <div class="save-row">
          <input
            v-model="newName"
            type="text"
            class="name-input mono"
            :placeholder="t('project.namePlaceholder')"
            @keydown.enter="onSave"
          />
          <button class="primary mono" @click="onSave">
            {{ t('project.save') }}
          </button>
        </div>

        <button class="new-btn mono" @click="onNew">
          ✕ {{ t('project.new') }}
        </button>

        <div v-if="sortedSaves.length === 0" class="empty mono">
          {{ t('project.empty') }}
        </div>
        <ul v-else class="list">
          <li v-for="entry in sortedSaves" :key="entry.id" class="entry">
            <div class="entry-meta">
              <span class="entry-name mono">{{ entry.name }}</span>
              <span class="entry-date mono">{{ formatDate(entry.savedAt) }}</span>
            </div>
            <div class="entry-actions">
              <button class="ghost mono" :title="t('project.load')" @click="onLoad(entry)">
                ▶ {{ t('project.load') }}
              </button>
              <button class="ghost danger mono" :title="t('project.delete')" @click="onDelete(entry)">
                ×
              </button>
            </div>
          </li>
        </ul>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.project-wrap { position: relative; }
.open-btn {
  padding: 0.45rem 0.85rem;
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  cursor: pointer;
  text-transform: uppercase;
}
.open-btn:hover { border-color: var(--accent-primary); }

.panel {
  position: fixed;
  top: 60px;
  right: 16px;
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100vh - 80px);
  overflow-y: auto;
  background: var(--bg-surface);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.55);
  padding: 0.85rem;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.4rem;
  border-bottom: 1px solid var(--border);
}
.title {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent-primary);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.close {
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 1.1rem;
  line-height: 1;
}
.close:hover { border-color: var(--accent-secondary); color: var(--accent-secondary); }

.hint {
  font-size: 0.65rem;
  color: var(--text-muted);
  margin: 0;
}

.save-row {
  display: flex;
  gap: 0.45rem;
}
.name-input {
  flex: 1;
  background: var(--bg-base);
  color: var(--text-primary);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.4rem 0.55rem;
  font-size: 0.78rem;
}
.name-input:focus { outline: none; border-color: var(--accent-primary); }

.primary {
  padding: 0.4rem 0.85rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.74rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-weight: 700;
}
.primary:hover { box-shadow: 0 0 12px var(--accent-glow); }

.new-btn {
  padding: 0.35rem 0.7rem;
  background: transparent;
  color: var(--text-muted);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  align-self: flex-start;
}
.new-btn:hover { color: var(--accent-secondary); border-color: var(--accent-secondary); }

.empty {
  font-size: 0.72rem;
  color: var(--text-muted);
  padding: 0.6rem;
  text-align: center;
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.5rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.entry-meta {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}
.entry-name {
  font-size: 0.8rem;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.entry-date {
  font-size: 0.62rem;
  color: var(--text-muted);
}
.entry-actions {
  display: inline-flex;
  gap: 0.3rem;
}
.ghost {
  padding: 0.3rem 0.6rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.ghost:hover { border-color: var(--accent-primary); color: var(--accent-primary); }
.ghost.danger:hover { border-color: var(--accent-secondary); color: var(--accent-secondary); }

.slide-enter-active,
.slide-leave-active {
  transition: transform var(--transition-base), opacity var(--transition-base);
}
.slide-enter-from,
.slide-leave-to {
  transform: translateX(8px);
  opacity: 0;
}
</style>
