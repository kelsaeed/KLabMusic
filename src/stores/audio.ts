import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type { InstrumentId, EffectId, LoadState } from '@/lib/types'
import { EFFECT_ORDER } from '@/lib/instruments'
import {
  FACTORY_PRESETS,
  loadUserPresets,
  saveUserPresets,
  uid as presetUid,
  type SynthPreset,
} from '@/lib/synthPresets'

interface EffectControl {
  enabled: boolean
  amount: number
}

function defaultEffects(): Record<EffectId, EffectControl> {
  return EFFECT_ORDER.reduce(
    (acc, id) => {
      acc[id] = { enabled: false, amount: 0.4 }
      return acc
    },
    {} as Record<EffectId, EffectControl>,
  )
}

export const useAudioStore = defineStore('audio', () => {
  const activeInstrument = ref<InstrumentId>('piano')
  const masterVolumeDb = ref(-6)
  const masterMuted = ref(false)
  const octaveShift = ref(0)
  const notation = ref<'solfege' | 'letters'>(
    (localStorage.getItem('klm:notation') as 'solfege' | 'letters') || 'solfege',
  )
  // Mastering preset persisted across reloads so the user's "Punchy"
  // selection survives a refresh. The store doesn't import the preset type
  // from useAudio to keep the dependency direction one-way (useAudio reads
  // the store, not the other way around).
  const masteringPreset = ref<string>(
    localStorage.getItem('klm:mastering') || 'off',
  )
  function setMasteringPreset(id: string) {
    masteringPreset.value = id
    localStorage.setItem('klm:mastering', id)
  }
  const loadState = reactive<Record<InstrumentId, LoadState>>({} as Record<InstrumentId, LoadState>)
  const effects = reactive<Record<InstrumentId, Record<EffectId, EffectControl>>>(
    {} as Record<InstrumentId, Record<EffectId, EffectControl>>,
  )
  // Vue reactive Set (NOT ref<Set> + reallocation). Vue 3 proxies
  // Set mutations with per-key fine-grained tracking, so `.add(n)` /
  // `.delete(n)` only re-run the bindings that actually depend on
  // `has(n)` / size / iteration — instead of the old
  // `activeNotes.value = new Set(...)` which swapped the ref identity
  // every single note and forced every `activeNotes.has()` binding
  // (the Piano has 50+ key cells) to re-evaluate. That per-note
  // whole-keyboard re-render on the main thread was starving the
  // audio thread during fast play (a real chunk of the wshhh/lag).
  const activeNotes = reactive(new Set<string>())

  function ensureEffectsFor(id: InstrumentId) {
    if (!effects[id]) effects[id] = defaultEffects()
  }

  // — Synth presets —
  // Factory presets are static (bundled in lib/synthPresets) and read-only.
  // User presets live in localStorage and are mutable. We keep them as
  // separate refs so the UI can label and sort the two tiers, and so a
  // future "reset factory" button can blow away user presets without
  // touching the bundled set.
  const userPresets = ref<SynthPreset[]>(loadUserPresets())
  const allPresets = computed<SynthPreset[]>(() => [...FACTORY_PRESETS, ...userPresets.value])
  function presetsFor(id: InstrumentId): SynthPreset[] {
    return allPresets.value.filter((p) => p.instrumentId === id)
  }
  function loadPreset(presetId: string) {
    const preset = allPresets.value.find((p) => p.id === presetId)
    if (!preset) return
    ensureEffectsFor(preset.instrumentId)
    // Deep-copy so editing the live FX after loading doesn't mutate the
    // preset definition itself (factory presets must stay immutable, and
    // user presets must only change when the user explicitly re-saves).
    for (const id of EFFECT_ORDER) {
      effects[preset.instrumentId][id] = { ...preset.effects[id] }
    }
  }
  function saveCurrentAsPreset(name: string, instrumentId: InstrumentId): SynthPreset {
    ensureEffectsFor(instrumentId)
    const snapshot = {} as Record<EffectId, { enabled: boolean; amount: number }>
    for (const id of EFFECT_ORDER) snapshot[id] = { ...effects[instrumentId][id] }
    const preset: SynthPreset = {
      id: presetUid(),
      name: name.trim() || 'Untitled',
      instrumentId,
      effects: snapshot,
      isFactory: false,
    }
    userPresets.value = [...userPresets.value, preset]
    saveUserPresets(userPresets.value)
    return preset
  }
  function deletePreset(presetId: string) {
    const preset = userPresets.value.find((p) => p.id === presetId)
    if (!preset) return
    userPresets.value = userPresets.value.filter((p) => p.id !== presetId)
    saveUserPresets(userPresets.value)
  }

  function setLoadState(id: InstrumentId, state: LoadState) {
    loadState[id] = state
  }

  function getLoadState(id: InstrumentId): LoadState {
    return loadState[id] ?? 'idle'
  }

  const isLoading = computed(() => getLoadState(activeInstrument.value) === 'loading')
  const isReady = computed(() => getLoadState(activeInstrument.value) === 'ready')

  function noteOn(note: string) {
    activeNotes.add(note)
  }
  function noteOff(note: string) {
    activeNotes.delete(note)
  }
  // Bulk reset — used by panic / damp / live-play teardown. The Set is
  // a reactive const now, so callers `.clear()` through this instead
  // of reassigning a fresh Set (which would detach the reactive proxy).
  function clearActiveNotes() {
    activeNotes.clear()
  }

  function setNotation(next: 'solfege' | 'letters') {
    notation.value = next
    localStorage.setItem('klm:notation', next)
  }

  return {
    activeInstrument,
    masterVolumeDb,
    masterMuted,
    octaveShift,
    notation,
    masteringPreset,
    userPresets,
    allPresets,
    loadState,
    effects,
    activeNotes,
    isLoading,
    isReady,
    ensureEffectsFor,
    presetsFor,
    loadPreset,
    saveCurrentAsPreset,
    deletePreset,
    setLoadState,
    getLoadState,
    setNotation,
    setMasteringPreset,
    noteOn,
    noteOff,
    clearActiveNotes,
  }
})
