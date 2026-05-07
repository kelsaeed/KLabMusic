import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Raw } from 'vue'
import * as Tone from 'tone'

export interface LoopLayer {
  id: string
  buffer: Raw<AudioBuffer>
  player: Raw<Tone.Player>
  name: string
  volume: number
  muted: boolean
  reversed: boolean
  halfSpeed: boolean
}

export type LoopSource = 'mic' | 'master'

export const MAX_LOOP_LAYERS = 8

export const useLoopStationStore = defineStore('loopstation', () => {
  const layers = ref<LoopLayer[]>([])
  const isRecording = ref(false)
  const recordSource = ref<LoopSource>('mic')
  const baseDuration = ref<number | null>(null)
  const recordSeconds = ref(0)
  const transportPlaying = ref(false)

  const layerCount = computed(() => layers.value.length)
  const isFull = computed(() => layers.value.length >= MAX_LOOP_LAYERS)

  function clearAll() {
    for (const layer of layers.value) {
      layer.player.stop()
      layer.player.dispose()
    }
    layers.value = []
    baseDuration.value = null
  }

  function removeLayer(id: string) {
    const layer = layers.value.find((l) => l.id === id)
    if (!layer) return
    layer.player.stop()
    layer.player.dispose()
    layers.value = layers.value.filter((l) => l.id !== id)
    if (layers.value.length === 0) baseDuration.value = null
  }

  function popLastLayer() {
    const last = layers.value[layers.value.length - 1]
    if (last) removeLayer(last.id)
  }

  return {
    layers,
    isRecording,
    recordSource,
    baseDuration,
    recordSeconds,
    transportPlaying,
    layerCount,
    isFull,
    clearAll,
    removeLayer,
    popLastLayer,
  }
})
