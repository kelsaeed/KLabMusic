import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Pattern, BeatTrack, StepCount, InstrumentId } from '@/lib/types'
import {
  defaultPattern,
  clonePattern,
  resizePattern,
  makeTrack,
  emptyPattern,
  MAX_PATTERNS,
  PATTERN_LABELS,
} from '@/lib/beatmaker'

export const useBeatMakerStore = defineStore('beatmaker', () => {
  const initial = defaultPattern(16)
  const patterns = ref<Pattern[]>([initial])
  const activePatternId = ref<string>(initial.id)
  const stepCount = ref<StepCount>(16)
  const bpm = ref(120)
  const swing = ref(0)
  const playing = ref(false)
  const currentStep = ref(0)
  const songMode = ref(false)
  const songSequence = ref<string[]>([initial.id])
  const songIndex = ref(0)

  const activePattern = computed<Pattern>(
    () => patterns.value.find((p) => p.id === activePatternId.value) ?? patterns.value[0],
  )

  const anyTrackSoloed = computed(() => activePattern.value.tracks.some((t) => t.soloed))

  function setActivePattern(id: string) {
    if (patterns.value.some((p) => p.id === id)) activePatternId.value = id
  }

  function addPattern() {
    if (patterns.value.length >= MAX_PATTERNS) return
    const next = emptyPattern(stepCount.value, PATTERN_LABELS[patterns.value.length] ?? 'New')
    patterns.value.push(next)
    activePatternId.value = next.id
  }

  function duplicateActivePattern() {
    if (patterns.value.length >= MAX_PATTERNS) return
    const cloned = clonePattern(activePattern.value, PATTERN_LABELS[patterns.value.length] ?? 'New')
    patterns.value.push(cloned)
    activePatternId.value = cloned.id
  }

  function removePattern(id: string) {
    if (patterns.value.length <= 1) return
    patterns.value = patterns.value.filter((p) => p.id !== id)
    if (activePatternId.value === id) activePatternId.value = patterns.value[0].id
    songSequence.value = songSequence.value.filter((sid) => sid !== id)
    if (songSequence.value.length === 0) songSequence.value = [patterns.value[0].id]
  }

  function renamePattern(id: string, name: string) {
    const p = patterns.value.find((x) => x.id === id)
    if (p) p.name = name
  }

  function setStepCount(count: StepCount) {
    stepCount.value = count
    patterns.value = patterns.value.map((p) => resizePattern(p, count))
  }

  function toggleStep(trackId: string, stepIndex: number) {
    const pattern = activePattern.value
    const track = pattern.tracks.find((t) => t.id === trackId)
    if (!track) return
    const step = track.steps[stepIndex]
    if (!step) return
    step.active = !step.active
  }

  function setStepActive(trackId: string, stepIndex: number, active: boolean) {
    const track = activePattern.value.tracks.find((t) => t.id === trackId)
    if (!track) return
    const step = track.steps[stepIndex]
    if (!step) return
    step.active = active
  }

  function setStepVelocity(trackId: string, stepIndex: number, velocity: number) {
    const track = activePattern.value.tracks.find((t) => t.id === trackId)
    if (!track) return
    const step = track.steps[stepIndex]
    if (!step) return
    step.velocity = Math.max(1, Math.min(127, velocity))
  }

  // Per-step microtonal cents — clamped to ±100 because beyond that the
  // user is really asking for a different note name, which is what the
  // step's `note` field is for. Most maqam usage sits in [-50, +50].
  function setStepCents(trackId: string, stepIndex: number, cents: number) {
    const track = activePattern.value.tracks.find((t) => t.id === trackId)
    if (!track) return
    const step = track.steps[stepIndex]
    if (!step) return
    step.cents = Math.max(-100, Math.min(100, Math.round(cents)))
  }

  function clearTrack(trackId: string) {
    const track = activePattern.value.tracks.find((t) => t.id === trackId)
    if (!track) return
    track.steps.forEach((s) => {
      s.active = false
      s.microShift = 0
      s.cents = 0
    })
  }

  function addTrack(instrument: InstrumentId, note: string, clipId?: string) {
    const track = makeTrack(instrument, note, stepCount.value)
    if (clipId) track.clipId = clipId
    activePattern.value.tracks.push(track)
  }

  function removeTrack(trackId: string) {
    activePattern.value.tracks = activePattern.value.tracks.filter((t) => t.id !== trackId)
  }

  function updateTrack(trackId: string, patch: Partial<BeatTrack>) {
    const idx = activePattern.value.tracks.findIndex((t) => t.id === trackId)
    if (idx < 0) return
    activePattern.value.tracks[idx] = { ...activePattern.value.tracks[idx], ...patch }
  }

  function humanize() {
    for (const t of activePattern.value.tracks) {
      for (const s of t.steps) {
        if (!s.active) continue
        s.microShift = (Math.random() - 0.5) * 20
        s.velocity = Math.max(20, Math.min(127, s.velocity + Math.round((Math.random() - 0.5) * 20)))
      }
    }
  }

  // Sprinkle random hits across every track in the active pattern.
  // Density ≈ how often a step lights up — kicks/snares stay sparse,
  // hi-hats and percussion get a busier carpet. Cleared first so the
  // result is a fresh take, not a layer on top of what's there.
  function randomize(density = 0.25) {
    for (const t of activePattern.value.tracks) {
      for (let i = 0; i < t.steps.length; i++) {
        const onDownbeat = i % 4 === 0
        // Downbeats get a stronger chance so the pattern always lands;
        // off-beats use the base density.
        const p = onDownbeat ? Math.min(0.85, density * 2.5) : density
        const active = Math.random() < p
        t.steps[i].active = active
        t.steps[i].velocity = active
          ? Math.round(70 + Math.random() * 50)
          : 100
        t.steps[i].microShift = 0
        t.steps[i].cents = 0
      }
    }
  }

  // Reset every step in every track of the active pattern to off.
  // Useful when starting over without losing track configs (note,
  // volume, mute, solo).
  function clearActivePattern() {
    for (const t of activePattern.value.tracks) {
      for (const s of t.steps) {
        s.active = false
        s.microShift = 0
        s.cents = 0
      }
    }
  }

  function shouldPlayTrack(track: BeatTrack): boolean {
    if (track.muted) return false
    if (anyTrackSoloed.value && !track.soloed) return false
    return true
  }

  function setSongSequence(seq: string[]) {
    songSequence.value = seq.length > 0 ? seq : [patterns.value[0].id]
  }

  return {
    patterns,
    activePatternId,
    activePattern,
    stepCount,
    bpm,
    swing,
    playing,
    currentStep,
    songMode,
    songSequence,
    songIndex,
    anyTrackSoloed,
    setActivePattern,
    addPattern,
    duplicateActivePattern,
    removePattern,
    renamePattern,
    setStepCount,
    toggleStep,
    setStepActive,
    setStepVelocity,
    setStepCents,
    clearTrack,
    addTrack,
    removeTrack,
    updateTrack,
    humanize,
    randomize,
    clearActivePattern,
    shouldPlayTrack,
    setSongSequence,
  }
})
