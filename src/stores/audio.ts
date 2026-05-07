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

  return {
    activeInstrument,
    masterVolumeDb,
    masterMuted,
    octaveShift,
    loadState,
    effects,
    activeNotes,
    isLoading,
    isReady,
    ensureEffectsFor,
    setLoadState,
    getLoadState,
    noteOn,
    noteOff,
  }
})
