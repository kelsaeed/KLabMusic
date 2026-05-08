import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  ArrangeTrack,
  ArrangeClip,
  ArrangeTrackFx,
  AutomationParam,
  AutomationPoint,
} from '@/lib/types'

function defaultFx(): ArrangeTrackFx {
  return {
    reverb: { enabled: false, amount: 0.4 },
    delay: { enabled: false, amount: 0.4 },
    filter: { enabled: false, amount: 0.4 },
  }
}

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

  function makeTrack(name: string, kind: 'audio' | 'pattern'): ArrangeTrack {
    return {
      id: uid(),
      name,
      kind,
      color: TRACK_COLORS[tracks.value.length % TRACK_COLORS.length],
      volume: 0.85,
      muted: false,
      soloed: false,
      clips: [],
      fx: defaultFx(),
      automation: {},
      automationLaneOpen: false,
      automationParam: 'volume',
    }
  }

  function addAudioTrack(name: string): ArrangeTrack {
    const track = makeTrack(name, 'audio')
    tracks.value.push(track)
    return track
  }

  function addPatternTrack(name: string): ArrangeTrack {
    const track = makeTrack(name, 'pattern')
    tracks.value.push(track)
    return track
  }

  function updateTrackFx(trackId: string, key: keyof ArrangeTrackFx, patch: { enabled?: boolean; amount?: number }) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    if (patch.enabled !== undefined) track.fx[key].enabled = patch.enabled
    if (patch.amount !== undefined) track.fx[key].amount = patch.amount
  }

  // — Automation CRUD —
  // Points live as a sorted-by-time list per parameter. Insertion and edits
  // re-sort so the engine can do a simple linear scan when interpolating
  // — never need to handle out-of-order points downstream.

  function ensureAutomationLane(trackId: string, param: AutomationParam): AutomationPoint[] {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return []
    if (!track.automation[param]) track.automation[param] = []
    return track.automation[param]!
  }

  function addAutomationPoint(trackId: string, param: AutomationParam, point: AutomationPoint) {
    const lane = ensureAutomationLane(trackId, param)
    lane.push({
      time: Math.max(0, point.time),
      value: Math.max(0, Math.min(1, point.value)),
    })
    lane.sort((a, b) => a.time - b.time)
  }

  function moveAutomationPoint(
    trackId: string,
    param: AutomationParam,
    pointIndex: number,
    next: AutomationPoint,
  ) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    const lane = track.automation[param]
    if (!lane || pointIndex < 0 || pointIndex >= lane.length) return
    lane[pointIndex] = {
      time: Math.max(0, next.time),
      value: Math.max(0, Math.min(1, next.value)),
    }
    lane.sort((a, b) => a.time - b.time)
  }

  function removeAutomationPoint(trackId: string, param: AutomationParam, pointIndex: number) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    const lane = track.automation[param]
    if (!lane) return
    lane.splice(pointIndex, 1)
  }

  function setTrackAutomationOpen(trackId: string, open: boolean) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    track.automationLaneOpen = open
  }

  function setTrackAutomationParam(trackId: string, param: AutomationParam) {
    const track = tracks.value.find((t) => t.id === trackId)
    if (!track) return
    track.automationParam = param
  }

  /**
   * Sample a curve at an absolute timeline time. Linear interpolation
   * between adjacent points; outside the curve's range it clamps to the
   * first / last point's value (held). Returns null when the lane has
   * zero points so the caller can fall through to the static value.
   */
  function sampleAutomation(
    track: ArrangeTrack,
    param: AutomationParam,
    timeSec: number,
  ): number | null {
    const lane = track.automation[param]
    if (!lane || lane.length === 0) return null
    if (timeSec <= lane[0].time) return lane[0].value
    if (timeSec >= lane[lane.length - 1].time) return lane[lane.length - 1].value
    for (let i = 1; i < lane.length; i++) {
      const a = lane[i - 1]
      const b = lane[i]
      if (timeSec <= b.time) {
        const span = b.time - a.time
        if (span <= 0) return b.value
        const t = (timeSec - a.time) / span
        return a.value + (b.value - a.value) * t
      }
    }
    return lane[lane.length - 1].value
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
    updateTrackFx,
    ensureAutomationLane,
    addAutomationPoint,
    moveAutomationPoint,
    removeAutomationPoint,
    setTrackAutomationOpen,
    setTrackAutomationParam,
    sampleAutomation,
    addClip,
    removeClip,
    moveClip,
  }
})
