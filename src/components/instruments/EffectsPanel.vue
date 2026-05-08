<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import { useToast } from '@/composables/useToast'
import { EFFECT_ORDER } from '@/lib/instruments'
import Knob from '@/components/ui/Knob.vue'
import type { EffectId } from '@/lib/types'

const store = useAudioStore()
const { toggleEffect } = useAudio()
const { t } = useI18n()
const { show } = useToast()

const controls = computed(() => store.effects[store.activeInstrument])
const presetsForActive = computed(() => store.presetsFor(store.activeInstrument))
const selectedPresetId = ref<string>('')
const namingPreset = ref(false)
const newPresetName = ref('')

function onAmount(id: EffectId, value: number) {
  const c = store.effects[store.activeInstrument]?.[id]
  if (c) c.amount = value
}

function onPresetChange(id: string) {
  selectedPresetId.value = id
  if (id) store.loadPreset(id)
}

function startSaveFlow() {
  newPresetName.value = ''
  namingPreset.value = true
}

function confirmSavePreset() {
  if (!newPresetName.value.trim()) {
    namingPreset.value = false
    return
  }
  const preset = store.saveCurrentAsPreset(newPresetName.value, store.activeInstrument)
  selectedPresetId.value = preset.id
  namingPreset.value = false
  show({ type: 'success', title: t('preset.saved', { name: preset.name }), duration: 1800 })
}

function cancelSavePreset() {
  namingPreset.value = false
  newPresetName.value = ''
}

function onDeletePreset() {
  if (!selectedPresetId.value) return
  const preset = presetsForActive.value.find((p) => p.id === selectedPresetId.value)
  if (!preset || preset.isFactory) return
  store.deletePreset(selectedPresetId.value)
  selectedPresetId.value = ''
  show({ type: 'success', title: t('preset.deleted', { name: preset.name }), duration: 1500 })
}

const selectedPreset = computed(() =>
  presetsForActive.value.find((p) => p.id === selectedPresetId.value),
)
const canDelete = computed(() => selectedPreset.value && !selectedPreset.value.isFactory)
</script>

<template>
  <section class="fx">
    <header class="head">
      <h3>{{ t('audio.effects') }}</h3>
      <span class="hint mono">{{ t(`audio.instrument.${store.activeInstrument}`) }}</span>
    </header>

    <div class="preset-bar">
      <select
        class="preset-select mono"
        :value="selectedPresetId"
        @change="onPresetChange(($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ t('preset.placeholder') }}</option>
        <optgroup
          v-if="presetsForActive.filter((p) => p.isFactory).length"
          :label="t('preset.factoryGroup')"
        >
          <option
            v-for="p in presetsForActive.filter((p) => p.isFactory)"
            :key="p.id"
            :value="p.id"
          >{{ p.name }}</option>
        </optgroup>
        <optgroup
          v-if="presetsForActive.filter((p) => !p.isFactory).length"
          :label="t('preset.userGroup')"
        >
          <option
            v-for="p in presetsForActive.filter((p) => !p.isFactory)"
            :key="p.id"
            :value="p.id"
          >{{ p.name }}</option>
        </optgroup>
      </select>

      <template v-if="!namingPreset">
        <button class="preset-btn save mono" :title="t('preset.saveTooltip')" @click="startSaveFlow">
          💾 {{ t('preset.save') }}
        </button>
        <button
          v-if="canDelete"
          class="preset-btn delete mono"
          :title="t('preset.deleteTooltip')"
          @click="onDeletePreset"
        >×</button>
      </template>
      <template v-else>
        <input
          v-model="newPresetName"
          class="preset-name-input mono"
          :placeholder="t('preset.namePlaceholder')"
          @keydown.enter="confirmSavePreset"
          @keydown.escape="cancelSavePreset"
        />
        <button class="preset-btn save mono" @click="confirmSavePreset">{{ t('preset.confirm') }}</button>
        <button class="preset-btn ghost mono" @click="cancelSavePreset">{{ t('common.cancel') }}</button>
      </template>
    </div>

    <div v-if="controls" class="row">
      <div v-for="id in EFFECT_ORDER" :key="id" class="cell" :class="{ on: controls[id].enabled }">
        <button class="toggle mono" @click="toggleEffect(id)">
          <span class="led" />
          {{ t(`audio.effect.${id}`) }}
        </button>
        <Knob
          :model-value="controls[id].amount"
          :label="t(`audio.effect.${id}`)"
          :disabled="!controls[id].enabled"
          @update:model-value="(v: number) => onAmount(id, v)"
        />
      </div>
    </div>
    <p v-else class="empty">{{ t('audio.pickInstrument') }}</p>
  </section>
</template>

<style scoped>
.fx {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.head h3 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  font-size: 0.7rem;
  color: var(--accent-primary);
}
.preset-bar {
  display: flex;
  gap: 0.4rem;
  align-items: stretch;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
}
.preset-select {
  flex: 1;
  min-width: 140px;
  padding: 0.4rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  font-size: 0.75rem;
}
.preset-name-input {
  flex: 1;
  min-width: 140px;
  padding: 0.4rem 0.6rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  color: var(--text-primary);
  border-radius: var(--radius);
  font-size: 0.75rem;
  outline: none;
}
.preset-btn {
  padding: 0.4rem 0.7rem;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  border-radius: var(--radius);
  cursor: pointer;
  text-transform: uppercase;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text-primary);
  transition: border-color var(--transition-fast), color var(--transition-fast),
    background var(--transition-fast);
}
.preset-btn.save:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.preset-btn.delete {
  width: 32px;
  padding: 0;
  font-size: 1rem;
  color: var(--accent-secondary);
  border-color: var(--accent-secondary);
}
.preset-btn.delete:hover {
  background: var(--accent-secondary);
  color: var(--text-inverse);
}
.preset-btn.ghost {
  background: transparent;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.75rem;
}
.cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  transition: border-color var(--transition-fast);
}
.cell.on {
  border-color: var(--accent-primary);
}
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.3rem 0.55rem;
  font-size: 0.7rem;
  background: transparent;
  border: 1px solid var(--border);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.led {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
  transition: background var(--transition-fast), box-shadow var(--transition-fast);
}
.cell.on .led {
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  margin: 0;
}
</style>
