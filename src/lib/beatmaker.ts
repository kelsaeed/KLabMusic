import type { Pattern, BeatTrack, Step, StepCount, InstrumentId } from './types'

export const MAX_PATTERNS = 16

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function makeStep(active = false, velocity = 100): Step {
  return { active, velocity, microShift: 0 }
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
  return {
    id: uid(),
    name: 'A',
    tracks: [
      makeTrack('drums', 'kick', stepCount, [0, 4, 8, 12], 'var(--accent-primary)'),
      makeTrack('drums', 'snare', stepCount, [4, 12], 'var(--accent-secondary)'),
      makeTrack('drums', 'hihat', stepCount, [0, 2, 4, 6, 8, 10, 12, 14]),
      makeTrack('drums', 'clap', stepCount, [12]),
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
