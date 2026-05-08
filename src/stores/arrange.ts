import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ArrangeTrack, ArrangeClip } from '@/lib/types'

// Multitrack arrangement timeline — Phase 4 MVP.
//
// The arrangement is a list of horizontal tracks; each track holds zero or
// more clips at absolute positions in seconds. Playback (in
// composables/useArrange.ts) reads this state, schedules every clip on
// Tone.Transport, and runs them in parallel.
//
// What's intentionally out of scope for the MVP: per-track FX racks, clip
// trim handles, automation lanes, stem export. Each lands in its own pass
// so the timeline ships polished instead of half-finished.

const TRACK_COLORS = [
  'var(--accent-primary)',
  'var(--accent-secondary)',
  '#7c3aed',
  '#22d3ee',
  '#ec4899',
  '#f59e0b',
  '#22c55e',
]

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export const useArrangeStore = defineStore('arrange', () => {
  const tracks = ref<ArrangeTrack[]>([])
  const bpm = ref(120)
  const isPlaying = ref(false)
  /** Current playhead position in seconds. Updated by useArrange while playing. */
  const playheadSec = ref(0)
  /** Pixels per second on the timeline — controls horizontal zoom. */
  const pxPerSec = ref(60)
  /** Snap a beat to this division when dragging. 4 = 16th notes, 1 = quarter. */
  const snapDivision = ref(4)

  const anyTrackSoloed = computed(() => tracks.value.some((t) => t.soloed))

  function shouldPlayTrack(track: ArrangeTrack): boolean {
    if (track.muted) return false
    if (anyTrackSoloed.value && !track.soloed) return false
    return true
  }

  /** Total length of the arrangement in seconds — last clip's end. */
  const totalDurationSec = computed(() => {
    let max = 0
    for (const t of tracks.value) {
      for (const c of t.clips) {
        const end = c.startSec + c.durationSec
        if (end > max) max = end
      }
    }
    return Math.max(16, max)
  })

  function addAudioTrack(name: string): ArrangeTrack {
    const track: ArrangeTrack = {
      id: uid(),
      name,
      kind: 'audio',
      color: TRACK_COLORS[tracks.value.length % TRACK_COLORS.length],
      volume: 0.85,
      muted: false,
      soloed: false,
      clips: [],
    }
    tracks.value.push(track)
    return track
  }

  function addPatternTrack(name: string): ArrangeTrack {
    const track: ArrangeTrack = {
      id: uid(),
      name,
      kind: 'pattern',
      color: TRACK_COLORS[tracks.value.length % TRACK_COLORS.length],
      volume: 0.85,
      muted: false,
      soloed: false,
      clips: [],
    }
    tracks.value.push(track)
    return track
  }

  function removeTrack(trackId: string) {
    tracks.value = tracks.value.filter((t) => t.id !== trackId)
  }

  function updateTrack(trackId: string, patch: Partial<ArrangeTrack>) {
    const idx = tracks.value.findIndex((t) => t.id === trackId)
    if (idx < 0) return
    tracks.value[idx] = { ...tracks.value[idx], ...patch }
  }

  function addClip(trackId: string, clip: Omit<ArrangeClip, 'id'>): ArrangeClip | null {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return null
    const full: ArrangeClip = { id: uid(), ...clip }
    track.clips.push(full)
    return full
  }

  function removeClip(trackId: string, clipId: string) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    track.clips = track.clips.filter((c) => c.id !== clipId)
  }

  function moveClip(trackId: string, clipId: string, newStartSec: number) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    const clip = track.clips.find((c) => c.id === clipId)
    if (!clip) return
    clip.startSec = Math.max(0, newStartSec)
  }

  return {
    tracks,
    bpm,
    isPlaying,
    playheadSec,
    pxPerSec,
    snapDivision,
    anyTrackSoloed,
    totalDurationSec,
    shouldPlayTrack,
    addAudioTrack,
    addPatternTrack,
    removeTrack,
    updateTrack,
    addClip,
    removeClip,
    moveClip,
  }
})
