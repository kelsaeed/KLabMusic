import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Clip, ClipPatch } from '@/lib/types'

export const useRecorderStore = defineStore('recorder', () => {
  const clips = ref<Clip[]>([])
  const activeClipId = ref<string | null>(null)
  const isRecording = ref(false)
  const isPlaying = ref(false)
  const recordSeconds = ref(0)
  const playheadSeconds = ref(0)
  const drawerOpen = ref(false)

  const activeClip = computed(() => clips.value.find((c) => c.id === activeClipId.value) ?? null)

  function addClip(clip: Clip) {
    clips.value.unshift(clip)
    activeClipId.value = clip.id
  }

  function removeClip(id: string) {
    clips.value = clips.value.filter((c) => c.id !== id)
    if (activeClipId.value === id) activeClipId.value = clips.value[0]?.id ?? null
  }

  function patchClip(id: string, patch: ClipPatch) {
    const idx = clips.value.findIndex((c) => c.id === id)
    if (idx === -1) return
    clips.value[idx] = { ...clips.value[idx], ...patch }
  }

  function replaceClipBuffer(id: string, buffer: AudioBuffer, waveform: number[], blob: Blob) {
    const idx = clips.value.findIndex((c) => c.id === id)
    if (idx === -1) return
    clips.value[idx] = {
      ...clips.value[idx],
      buffer,
      waveform,
      blob,
      duration: buffer.duration,
    }
  }

  function setActive(id: string | null) {
    activeClipId.value = id
  }

  return {
    clips,
    activeClipId,
    activeClip,
    isRecording,
    isPlaying,
    recordSeconds,
    playheadSeconds,
    drawerOpen,
    addClip,
    removeClip,
    patchClip,
    replaceClipBuffer,
    setActive,
  }
})
