<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { useRecorderStore } from '@/stores/recorder'
import { INSTRUMENTS, INSTRUMENT_ORDER } from '@/lib/instruments'
import { BINDING_ACTIONS, keyDisplay } from '@/lib/keybindings'
import type { BindingType, InstrumentId, BindingActionId, KeyBinding } from '@/lib/types'

const props = defineProps<{ keyName: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'saved'): void }>()

const store = useKeyBindingsStore()
const recorderStore = useRecorderStore()
const { t } = useI18n()

const existing = computed(() => store.getBinding(props.keyName))

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
const OCTAVES = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const

function splitNote(n: string): { name: string; octave: number } {
  const match = /^([A-G]#?)(-?\d)$/.exec(n)
  if (!match) return { name: 'C', octave: 4 }
  return { name: match[1], octave: Number(match[2]) }
}

const type = ref<BindingType>('note')
const instrument = ref<InstrumentId>('piano')
const noteValue = ref('C4')
const noteName = ref('C')
const noteOctave = ref(4)
const chordNotes = ref<string[]>(['C4', 'E4', 'G4'])
const clipId = ref<string>('')
const action = ref<BindingActionId>('damp')
const velocity = ref(100)
const sustainMode = ref(false)
const labelText = ref('')

watch(
  () => props.keyName,
  () => {
    const b = existing.value
    if (b) {
      type.value = b.type
      instrument.value = b.instrument ?? 'piano'
      noteValue.value = b.note ?? 'C4'
      const split = splitNote(noteValue.value)
      noteName.value = split.name
      noteOctave.value = split.octave
      chordNotes.value = b.chord ?? ['C4', 'E4', 'G4']
      clipId.value = b.clipId ?? ''
      action.value = b.action ?? 'damp'
      velocity.value = b.velocity ?? 100
      sustainMode.value = b.sustainMode ?? false
      labelText.value = b.label ?? ''
    } else {
      type.value = 'note'
      instrument.value = 'piano'
      noteValue.value = 'C4'
      noteName.value = 'C'
      noteOctave.value = 4
      chordNotes.value = ['C4', 'E4', 'G4']
      clipId.value = ''
      action.value = 'damp'
      velocity.value = 100
      sustainMode.value = false
      labelText.value = ''
    }
  },
  { immediate: true },
)

watch([noteName, noteOctave], ([n, o]) => {
  noteValue.value = `${n}${o}`
})

const sampleSuggestions = computed(() => INSTRUMENTS[instrument.value].samples ?? [])

function save() {
  const binding: KeyBinding = {
    key: props.keyName,
    type: type.value,
    velocity: velocity.value,
    sustainMode: sustainMode.value || undefined,
    label: labelText.value || undefined,
  }
  if (type.value === 'note' || type.value === 'sample') {
    binding.instrument = instrument.value
    binding.note = noteValue.value
  } else if (type.value === 'chord') {
    binding.instrument = instrument.value
    binding.chord = chordNotes.value.filter((n) => n.trim())
  } else if (type.value === 'clip') {
    binding.clipId = clipId.value
  } else if (type.value === 'action') {
    binding.action = action.value
  }
  store.upsertBinding(binding)
  store.editingKey = null
  emit('saved')
}

function clear() {
  store.clearBinding(props.keyName)
  store.editingKey = null
  emit('saved')
}

function close() {
  store.editingKey = null
  emit('close')
}

function updateChord(idx: number, value: string) {
  const next = [...chordNotes.value]
  next[idx] = value
  chordNotes.value = next
}

function addChordNote() {
  chordNotes.value = [...chordNotes.value, 'C4']
}

function removeChordNote(idx: number) {
  chordNotes.value = chordNotes.value.filter((_, i) => i !== idx)
}
</script>

<template>
  <div class="dialog">
    <header class="head">
      <h3>{{ t('binding.assign') }} <span class="key-pill mono">{{ keyDisplay(keyName) }}</span></h3>
      <button class="close" @click="close">×</button>
    </header>

    <fieldset class="types">
      <label v-for="opt in (['note','sample','chord','clip','action'] as BindingType[])" :key="opt" :class="{ on: type === opt }">
        <input v-model="type" type="radio" :value="opt" />
        <span>{{ t(`binding.type.${opt}`) }}</span>
      </label>
    </fieldset>

    <div v-if="type === 'note' || type === 'sample'" class="fields">
      <label>
        <span class="lbl">{{ t('binding.instrument') }}</span>
        <select v-model="instrument">
          <option v-for="id in INSTRUMENT_ORDER" :key="id" :value="id">{{ t(`audio.instrument.${id}`) }}</option>
        </select>
      </label>
      <label v-if="type === 'note'">
        <span class="lbl">{{ t('binding.note') }}</span>
        <div class="note-picker">
          <select v-model="noteName">
            <option v-for="n in NOTE_NAMES" :key="n" :value="n">{{ n }}</option>
          </select>
          <select v-model.number="noteOctave">
            <option v-for="o in OCTAVES" :key="o" :value="o">{{ o }}</option>
          </select>
          <span class="picker-preview mono">{{ noteValue }}</span>
        </div>
      </label>
      <label v-else>
        <span class="lbl">{{ t('binding.note') }}</span>
        <select v-model="noteValue">
          <option v-for="s in sampleSuggestions" :key="s" :value="s">{{ s }}</option>
        </select>
      </label>
    </div>

    <div v-else-if="type === 'chord'" class="fields">
      <label>
        <span class="lbl">{{ t('binding.instrument') }}</span>
        <select v-model="instrument">
          <option v-for="id in INSTRUMENT_ORDER" :key="id" :value="id">{{ t(`audio.instrument.${id}`) }}</option>
        </select>
      </label>
      <div class="chord-list">
        <span class="lbl">{{ t('binding.chord') }}</span>
        <div v-for="(n, i) in chordNotes" :key="i" class="chord-row">
          <input :value="n" @input="updateChord(i, ($event.target as HTMLInputElement).value)" />
          <button class="mini" @click="removeChordNote(i)">×</button>
        </div>
        <button class="mini" @click="addChordNote">+ {{ t('binding.addNote') }}</button>
      </div>
    </div>

    <div v-else-if="type === 'clip'" class="fields">
      <label>
        <span class="lbl">{{ t('binding.clip') }}</span>
        <select v-model="clipId">
          <option value="">{{ t('binding.pickClip') }}</option>
          <option v-for="c in recorderStore.clips" :key="c.id" :value="c.id">{{ c.name }}</option>
        </select>
      </label>
    </div>

    <div v-else-if="type === 'action'" class="fields">
      <label>
        <span class="lbl">{{ t('binding.action.label') }}</span>
        <select v-model="action">
          <option v-for="a in BINDING_ACTIONS" :key="a" :value="a">{{ t(`binding.action.${a}`) }}</option>
        </select>
      </label>
      <label v-if="action === 'damp-instrument'">
        <span class="lbl">{{ t('binding.instrument') }}</span>
        <select v-model="instrument">
          <option v-for="id in INSTRUMENT_ORDER" :key="id" :value="id">{{ t(`audio.instrument.${id}`) }}</option>
        </select>
      </label>
    </div>

    <div class="extras">
      <label class="extra">
        <span class="lbl mono">{{ t('binding.velocity') }} {{ velocity }}</span>
        <input v-model.number="velocity" type="range" min="1" max="127" />
      </label>
      <label class="extra check">
        <input v-model="sustainMode" type="checkbox" />
        <span>{{ t('binding.sustain') }}</span>
      </label>
      <label class="extra">
        <span class="lbl">{{ t('binding.label') }}</span>
        <input v-model="labelText" :placeholder="t('binding.labelHint')" />
      </label>
    </div>

    <footer class="foot">
      <button class="ghost" @click="clear">{{ t('binding.clear') }}</button>
      <div class="spacer" />
      <button class="ghost" @click="close">{{ t('common.cancel') }}</button>
      <button class="primary" @click="save">{{ t('common.save') }}</button>
    </footer>
  </div>
</template>

<style scoped>
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: min(520px, 100%);
  max-height: 85vh;
  overflow: auto;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head h3 {
  margin: 0;
  font-size: 1rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.key-pill {
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: 6px;
  padding: 0.1rem 0.5rem;
  color: var(--accent-primary);
}
.close {
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 1.4rem;
  line-height: 1;
}
.types {
  border: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.types label {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.8rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.8rem;
  cursor: pointer;
}
.types label.on {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.types input[type='radio'] {
  display: none;
}
.fields {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.fields label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.note-picker {
  display: grid;
  grid-template-columns: 1fr 1fr auto;
  gap: 0.4rem;
  align-items: center;
}
.picker-preview {
  padding: 0.4rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  color: var(--accent-primary);
  border-radius: var(--radius);
  font-size: 0.9rem;
  text-align: center;
  letter-spacing: 0.04em;
}
.lbl {
  font-size: 0.7rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.chord-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.chord-row {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}
.chord-row input {
  flex: 1;
}
.mini {
  padding: 0.2rem 0.6rem;
  font-size: 0.75rem;
}
.extras {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
}
.extra {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.extra.check {
  flex-direction: row;
  align-items: center;
  gap: 0.5rem;
}
.foot {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.spacer { flex: 1; }
.ghost {
  background: transparent;
  font-size: 0.85rem;
}
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
  padding: 0.55rem 1rem;
}
</style>
