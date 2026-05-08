<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useRecorderStore } from '@/stores/recorder'
import { INSTRUMENTS, INSTRUMENT_ORDER, DEFAULT_NOTE_FOR } from '@/lib/instruments'
import BeatNotePicker from './BeatNotePicker.vue'
import type { InstrumentId } from '@/lib/types'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useBeatMakerStore()
const recorderStore = useRecorderStore()
const { t } = useI18n()

const instrument = ref<InstrumentId>('drums')
const note = ref(DEFAULT_NOTE_FOR.drums)
const useClip = ref(false)
const clipId = ref('')

function add() {
  if (useClip.value && clipId.value) {
    store.addTrack('drums', 'clip', clipId.value)
  } else {
    store.addTrack(instrument.value, note.value)
  }
  emit('close')
}

function pickInstrument(id: InstrumentId) {
  instrument.value = id
  note.value = DEFAULT_NOTE_FOR[id]
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="dialog">
          <header class="head">
            <h3>{{ t('beat.addTrack') }}</h3>
            <button class="close" @click="emit('close')">×</button>
          </header>

          <fieldset class="source">
            <label :class="{ on: !useClip }">
              <input v-model="useClip" type="radio" :value="false" />
              <span>{{ t('beat.fromInstrument') }}</span>
            </label>
            <label
              :class="{ on: useClip, disabled: recorderStore.clips.length === 0 }"
              :title="recorderStore.clips.length === 0 ? t('beat.noClipsHint') : ''"
            >
              <input v-model="useClip" type="radio" :value="true" :disabled="recorderStore.clips.length === 0" />
              <span>{{ t('beat.fromClip') }}</span>
            </label>
          </fieldset>
          <p v-if="recorderStore.clips.length === 0" class="empty-clip-hint mono">
            {{ t('beat.fromClipExplain') }}
          </p>

          <div v-if="!useClip" class="grid">
            <button
              v-for="id in INSTRUMENT_ORDER"
              :key="id"
              class="card"
              :class="{ active: instrument === id, unavailable: !INSTRUMENTS[id].available }"
              :disabled="!INSTRUMENTS[id].available"
              @click="pickInstrument(id)"
            >
              <span class="ico">{{ INSTRUMENTS[id].icon }}</span>
              <span class="lbl">{{ t(`audio.instrument.${id}`) }}</span>
            </button>
          </div>

          <div v-if="!useClip" class="note-row">
            <span class="lbl">{{ t('binding.note') }}</span>
            <BeatNotePicker v-model="note" :instrument="instrument" />
          </div>

          <label v-else class="note-row">
            <span class="lbl">{{ t('beat.pickClip') }}</span>
            <select v-model="clipId">
              <option value="">{{ t('binding.pickClip') }}</option>
              <option v-for="c in recorderStore.clips" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>

          <footer class="foot">
            <button class="ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
            <button class="primary" :disabled="useClip && !clipId" @click="add">
              {{ t('beat.addTrack') }}
            </button>
          </footer>
        </div>
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
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  width: min(560px, 100%);
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-height: 88vh;
  overflow: auto;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head h3 { margin: 0; color: var(--accent-primary); font-size: 1rem; }
.close { background: transparent; border: none; color: var(--text-muted); font-size: 1.4rem; line-height: 1; }
.source {
  border: none; padding: 0; margin: 0; display: flex; gap: 0.5rem;
}
.source label {
  display: inline-flex;
  gap: 0.4rem;
  align-items: center;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.8rem;
}
.source input { display: none; }
.source label.on { border-color: var(--accent-primary); color: var(--accent-primary); }
.source label.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.empty-clip-hint {
  margin: -0.4rem 0 0;
  padding: 0.5rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.4;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 0.4rem;
}
.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  padding: 0.6rem;
  background: var(--bg-elevated);
}
.card.active { color: var(--accent-primary); border-color: var(--accent-primary); }
.card.unavailable { opacity: 0.4; cursor: not-allowed; }
.ico { font-size: 1.2rem; }
.lbl { font-size: 0.7rem; font-family: var(--font-mono); }
.note-row { display: flex; flex-direction: column; gap: 0.3rem; }
.note-row .lbl {
  font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em;
}
.foot { display: flex; justify-content: flex-end; gap: 0.5rem; }
.ghost { background: transparent; }
.primary { background: var(--accent-primary); color: var(--text-inverse); border: none; font-weight: 600; padding: 0.55rem 1rem; }
.fade-enter-active, .fade-leave-active { transition: opacity var(--transition-base); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
