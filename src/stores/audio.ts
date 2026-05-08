import { defineStore } from 'pinia'
import { ref, reactive, computed } from 'vue'
import type { InstrumentId, EffectId, LoadState } from '@/lib/types'
import { EFFECT_ORDER } from '@/lib/instruments'

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
  const activeNotes = ref<Set<string>>(new Set())

  function ensureEffectsFor(id: InstrumentId) {
    if (!effects[id]) effects[id] = defaultEffects()
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
    activeNotes.value.add(note)
    activeNotes.value = new Set(activeNotes.value)
  }
  function noteOff(note: string) {
    activeNotes.value.delete(note)
    activeNotes.value = new Set(activeNotes.value)
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
    loadState,
    effects,
    activeNotes,
    isLoading,
    isReady,
    ensureEffectsFor,
    setLoadState,
    getLoadState,
    setNotation,
    setMasteringPreset,
    noteOn,
    noteOff,
  }
})
