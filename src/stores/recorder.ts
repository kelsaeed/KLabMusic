import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Scale, Key } from '@/lib/pitch'
import type { Clip, ClipPatch } from '@/lib/types'

export const useRecorderStore = defineStore('recorder', () => {
  const clips = ref<Clip[]>([])
  const activeClipId = ref<string | null>(null)
  const isRecording = ref(false)
  const isPlaying = ref(false)
  const recordSeconds = ref(0)
  const playheadSeconds = ref(0)
  const drawerOpen = ref(false)
  // Song-level tuning context — used by Vocal Tuning to know which scale to
  // snap detected pitches to. Persisted in localStorage so the choice
  // survives a refresh; whole-project state, not per-clip, because a song
  // is in one key and every vocal take should snap to it.
  const songKey = ref<Key>((localStorage.getItem('klm:songKey') as Key) || 'C')
  const songScale = ref<Scale>((localStorage.getItem('klm:songScale') as Scale) || 'major')
  watch(songKey, (v) => localStorage.setItem('klm:songKey', v))
  watch(songScale, (v) => localStorage.setItem('klm:songScale', v))

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
    songKey,
    songScale,
    addClip,
    removeClip,
    patchClip,
    replaceClipBuffer,
    setActive,
  }
})
