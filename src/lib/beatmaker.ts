import type { Pattern, BeatTrack, Step, StepCount, InstrumentId } from './types'

export const MAX_PATTERNS = 16

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function makeStep(active = false, velocity = 100): Step {
  return { active, velocity, microShift: 0, cents: 0 }
}

export function makeSteps(count: StepCount, activeSteps: number[] = []): Step[] {
  const steps: Step[] = []
  for (let i = 0; i < count; i++) steps.push(makeStep(activeSteps.includes(i)))
  return steps
}

export function makeTrack(
  instrument: InstrumentId,
  note: string,
  stepCount: StepCount,
  activeSteps: number[] = [],
  color?: string,
): BeatTrack {
  return {
    id: uid(),
    instrument,
    note,
    steps: makeSteps(stepCount, activeSteps),
    volume: 0.85,
    muted: false,
    soloed: false,
    color,
  }
}

export function defaultPattern(stepCount: StepCount = 16): Pattern {
  // Default starter pattern uses the new realDrums acoustic kit
  // (Tone.js/audio drum-samples) instead of the TR-808 trigger box.
  // Real-device feedback was that the engine 'sounds like beats' on
  // first launch — making the default a band-style kit means a fresh
  // user hears DOM TUCK Dum (kick / snare / hihat) the moment they
  // press play, which matches what the practice / playback workflow
  // is actually for. The TR-808 'drums' instrument is still
  // available — users add it via Add Track when they want the
  // 808 sound deliberately.
  return {
    id: uid(),
    name: 'A',
    tracks: [
      makeTrack('realDrums', 'kick', stepCount, [0, 4, 8, 12], 'var(--accent-primary)'),
      makeTrack('realDrums', 'snare', stepCount, [4, 12], 'var(--accent-secondary)'),
      makeTrack('realDrums', 'hihatC', stepCount, [0, 2, 4, 6, 8, 10, 12, 14]),
      makeTrack('bass', 'C2', stepCount, [0, 8]),
      makeTrack('lead', 'C4', stepCount, []),
    ],
  }
}

export function emptyPattern(_stepCount: StepCount = 16, name = 'New'): Pattern {
  return {
    id: uid(),
    name,
    tracks: [],
  }
}

export function clonePattern(pattern: Pattern, name?: string): Pattern {
  return {
    id: uid(),
    name: name ?? `${pattern.name}'`,
    tracks: pattern.tracks.map((t) => ({
      ...t,
      id: uid(),
      steps: t.steps.map((s) => ({ ...s })),
    })),
  }
}

export function resizePattern(pattern: Pattern, count: StepCount): Pattern {
  return {
    ...pattern,
    tracks: pattern.tracks.map((t) => ({
      ...t,
      steps: resizeSteps(t.steps, count),
    })),
  }
}

function resizeSteps(steps: Step[], count: StepCount): Step[] {
  if (steps.length === count) return steps
  if (steps.length < count) {
    return [...steps, ...makeSteps(count).slice(steps.length)]
  }
  return steps.slice(0, count)
}

export const PATTERN_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P']
