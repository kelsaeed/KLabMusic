<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { useKeyBindings } from '@/composables/useKeyBindings'
import QwertyKeyboard from './QwertyKeyboard.vue'
import KeyAssignDialog from './KeyAssignDialog.vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useKeyBindingsStore()
const { persistLocal, saveSetToCloud, exportJson, importJson } = useKeyBindings()
const { t } = useI18n()
const status = ref('')
const newSetName = ref('')

const isPreset = computed(() => store.activeSet?.isDefault === true)

function newSet() {
  const id = `set-${Date.now().toString(36)}`
  store.addSet({ id, name: newSetName.value || t('binding.unnamed'), bindings: [] })
  newSetName.value = ''
  persistLocal()
}

function deleteCurrent() {
  if (!store.activeSet || isPreset.value) return
  store.removeSet(store.activeSetId)
  persistLocal()
}

async function onSaveCloud() {
  status.value = ''
  const r = await saveSetToCloud(store.activeSetId)
  status.value = r.message
  setTimeout(() => (status.value = ''), 2500)
}

function doExport() {
  const json = exportJson(store.activeSetId)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.activeSet?.name || 'bindings'}.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const fileInput = ref<HTMLInputElement | null>(null)
async function onImport(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  if (importJson(text)) {
    persistLocal()
    status.value = t('binding.imported')
  } else {
    status.value = t('binding.importFailed')
  }
  setTimeout(() => (status.value = ''), 2500)
}

function onClose() {
  store.editingKey = null
  emit('close')
}

function onSaved() {
  if (!isPreset.value) persistLocal()
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="onClose">
        <div class="panel">
          <header class="head">
            <h2>{{ t('binding.title') }}</h2>
            <button class="close" @click="onClose">×</button>
          </header>

          <div class="bar">
            <label class="set-pick">
              <span class="lbl">{{ t('binding.set') }}</span>
              <select
                :value="store.activeSetId"
                @change="store.setActiveSet(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="s in store.sets" :key="s.id" :value="s.id">
                  {{ s.isDefault ? t(`binding.${s.name}`) : s.name }}
                </option>
              </select>
            </label>

            <input
              v-model="newSetName"
              class="new-name"
              :placeholder="t('binding.newSetName')"
              @keyup.enter="newSet"
            />
            <button @click="newSet">{{ t('binding.newSet') }}</button>
            <button :disabled="isPreset" @click="deleteCurrent">
              {{ t('binding.deleteSet') }}
            </button>
            <div class="spacer" />
            <button @click="doExport">{{ t('binding.export') }}</button>
            <button @click="fileInput?.click()">{{ t('binding.import') }}</button>
            <input
              ref="fileInput"
              type="file"
              accept="application/json"
              hidden
              @change="onImport"
            />
            <button class="primary" @click="onSaveCloud">
              {{ t('binding.saveCloud') }}
            </button>
          </div>

          <p v-if="status" class="status">{{ status }}</p>

          <QwertyKeyboard editable />

          <p class="hint">{{ t('binding.clickToAssign') }}</p>
        </div>
      </div>
    </Transition>

    <Transition name="dialog">
      <div
        v-if="open && store.editingKey"
        class="dialog-host"
        @click.self="store.editingKey = null"
      >
        <KeyAssignDialog
          :key-name="store.editingKey"
          @close="onClose"
          @saved="onSaved"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 200;
  padding: 1.5rem;
}
.panel {
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: min(1000px, 100%);
  max-height: 92vh;
  overflow: auto;
  padding: 1.25rem;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head h2 {
  margin: 0;
  color: var(--accent-primary);
  font-size: 1.2rem;
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.6rem;
  line-height: 1;
}
.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
.set-pick {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.new-name {
  flex: 1;
  min-width: 160px;
}
.spacer { flex: 1; }
.bar button {
  font-size: 0.78rem;
  padding: 0.45rem 0.85rem;
}
.bar .primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
}
.status {
  margin: 0;
  font-size: 0.8rem;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}
.hint {
  margin: 0;
  font-size: 0.75rem;
  color: var(--text-muted);
  text-align: center;
}
.dialog-host {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: grid;
  place-items: center;
  padding: 1rem;
  z-index: 210;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-base);
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity var(--transition-fast), transform var(--transition-fast);
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
  transform: scale(0.96);
}
</style>
