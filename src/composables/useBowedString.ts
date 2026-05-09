// Shared bow physics for the bowed-string family — violin (Phase 3) and
// cello (Phase 4) both consume this. The pad components handle the
// gesture (pointer / touch tracking, where on the fingerboard the user
// is, swipe direction) and feed the engine high-level "bow this string
// at this position with this much speed" calls. The engine maps those
// to attack / detune / release events on the instrument's voice.
//
// Lives at the composables/ layer (not lib/) because it touches the
// audio engine via useAudio. Pure-data math lives in lib/microtonal.ts.
import * as Tone from 'tone'
import { ref, type Ref } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useLivePlay } from '@/composables/useLivePlay'
import type { InstrumentId } from '@/lib/types'

export interface BowedStringSpec {
  /** Display name and anchor pitch for an open string. e.g. { name: 'G3', midi: 55 }. */
  name: string
  midi: number
}

export type BowDirection = 'down' | 'up'

export interface BowConfig {
  instrumentId: InstrumentId
  strings: readonly BowedStringSpec[]
  /** Maximum quarter-tone reach above the open string the fingerboard
   *  exposes. 12 quarter-tones = 6 semitones = a "first position" reach
   *  on a real violin. Phase 4 cello uses a slightly larger value. */
  maxQuarterSteps?: number
  /** Slight envelope tweak — cello prefers a slower, deeper attack. */
  defaultAttack?: number
  /** Default release time in seconds. Cello sustains longer. */
  defaultRelease?: number
}

interface BowState {
  /** Index into the spec.strings array that the bow is currently on. -1 = not bowing. */
  stringIndex: number
  /** Quarter-tone steps above the open string at the current finger position. */
  quarterSteps: number
  /** Cached MIDI semitone the engine actually triggered (after rounding). */
  noteMidi: number
  /** Cached cents detune applied for the quarter-tone shift. */
  detuneCents: number
  /** Latest bow direction inferred from the gesture. */
  direction: BowDirection
}

/**
 * Round a quarter-tone step count to the nearest 12-TET semitone and the
 * remaining cents detune. Steps are HALF semitones (1 step = 50 cents),
 * so step 0 → (0 semi, 0 cents), step 1 → (1 semi, -50 cents), step 2 →
 * (1 semi, 0 cents), step 3 → (2 semi, -50 cents), and so on. Detuning
 * down from the next semitone (rather than up from the previous) keeps
 * the synth's keytracked filter envelope close to the played pitch.
 */
function quarterStepsToSemitone(steps: number): { semitone: number; cents: number } {
  if (steps <= 0) return { semitone: 0, cents: 0 }
  // Snap to even: even steps are pure semitones (no detune); odd steps
  // round up to the next semitone with a -50 cent detune. Equivalent to
  // splitting the cent grid 0/-50/0/-50… across the step axis.
  const isOdd = steps % 2 !== 0
  const semitone = Math.ceil(steps / 2)
  return { semitone, cents: isOdd ? -50 : 0 }
}

/**
 * Convert a MIDI semitone number to a Tone.js note string (e.g. 67 → "G4").
 * Wraps Tone.Frequency so pads don't have to import Tone directly.
 */
function midiToNote(midi: number): string {
  return Tone.Frequency(midi, 'midi').toNote()
}

export interface UseBowedStringReturn {
  state: Ref<BowState>
  /** Begin a bow stroke on a string at a given fingerboard position. */
  bowAttack: (stringIndex: number, quarterSteps: number, velocity: number, direction: BowDirection) => void
  /** Bow has crossed onto a new string or new finger position mid-drag. */
  bowMoveTo: (stringIndex: number, quarterSteps: number, velocity: number, direction: BowDirection) => void
  /** Bow lifted off the fingerboard. */
  bowRelease: () => void
  /** One-shot pluck (pizzicato) — single tap, no sustain. */
  pluck: (stringIndex: number, quarterSteps: number, velocity: number) => void
}

export function useBowedString(config: BowConfig): UseBowedStringReturn {
  const audio = useAudio()
  const live = useLivePlay()
  const state = ref<BowState>({
    stringIndex: -1,
    quarterSteps: 0,
    noteMidi: 0,
    detuneCents: 0,
    direction: 'down',
  })
  // When did the current bow segment begin? Each "segment" is the time
  // from one bowAttack until the next bowMoveTo / bowRelease — that's
  // the duration we report to the live-take recorder when the segment
  // ends so playback re-articulates with the right note length.
  let segmentStartedAt = 0
  let segmentNote = ''
  let segmentVelocity = 0

  function resolveNote(stringIndex: number, quarterSteps: number) {
    const string = config.strings[stringIndex]
    const { semitone, cents } = quarterStepsToSemitone(quarterSteps)
    const noteMidi = string.midi + semitone
    return { note: midiToNote(noteMidi), noteMidi, cents }
  }

  /**
   * Down-bow articulates marginally louder with a faster attack than up-
   * bow — that's the cue real bowed-string players use to mark accent
   * patterns. Velocity is already a 0-127 number from the gesture; we
   * shape it slightly so direction is audible without sounding like a
   * volume jump.
   */
  function shapeVelocity(velocity: number, direction: BowDirection): number {
    const v = Math.max(20, Math.min(127, velocity))
    return direction === 'down' ? Math.min(127, Math.round(v * 1.0)) : Math.round(v * 0.86)
  }

  function bowAttack(
    stringIndex: number,
    quarterSteps: number,
    velocity: number,
    direction: BowDirection,
  ) {
    const string = config.strings[stringIndex]
    if (!string) return
    const { note, noteMidi, cents } = resolveNote(stringIndex, quarterSteps)
    // Set quarter-tone detune BEFORE the attack so the very first sample
    // is already at the correct microtonal pitch. Doing it in the wrong
    // order produces an audible 50-cent slide on every quarter-tone note.
    audio.setBend(config.instrumentId, cents)
    const shaped = shapeVelocity(velocity, direction)
    void audio.playOn(config.instrumentId, note, shaped, true)
    segmentStartedAt = performance.now()
    segmentNote = note
    segmentVelocity = shaped
    state.value = {
      stringIndex,
      quarterSteps,
      noteMidi,
      detuneCents: cents,
      direction,
    }
  }

  function flushSegment() {
    if (!segmentNote) return
    const durationSec = (performance.now() - segmentStartedAt) / 1000
    live.recordLivePlay(config.instrumentId, segmentNote, segmentVelocity, durationSec)
    segmentNote = ''
  }

  function bowMoveTo(
    stringIndex: number,
    quarterSteps: number,
    velocity: number,
    direction: BowDirection,
  ) {
    if (state.value.stringIndex === -1) {
      bowAttack(stringIndex, quarterSteps, velocity, direction)
      return
    }
    // Same string + same finger position + same direction = nothing to do;
    // the sustained note already keeps singing through the bow envelope.
    if (
      state.value.stringIndex === stringIndex &&
      state.value.quarterSteps === quarterSteps &&
      state.value.direction === direction
    ) {
      return
    }
    // Anything else — different string, different finger, or a direction
    // flip — re-articulates the note. Release the prior pitch first so
    // the polyphonic synth doesn't accumulate stale voices.
    audio.stopOn(config.instrumentId, midiToNote(state.value.noteMidi))
    flushSegment()
    bowAttack(stringIndex, quarterSteps, velocity, direction)
  }

  function bowRelease() {
    if (state.value.stringIndex === -1) return
    audio.stopOn(config.instrumentId, midiToNote(state.value.noteMidi))
    flushSegment()
    // Reset detune so a future plain-tone attack on this instrument from
    // some other UI doesn't inherit a 50 cent shift.
    audio.setBend(config.instrumentId, 0)
    state.value = {
      stringIndex: -1,
      quarterSteps: 0,
      noteMidi: 0,
      detuneCents: 0,
      direction: 'down',
    }
  }

  function pluck(stringIndex: number, quarterSteps: number, velocity: number) {
    const string = config.strings[stringIndex]
    if (!string) return
    const { note, cents } = resolveNote(stringIndex, quarterSteps)
    audio.setBend(config.instrumentId, cents)
    const v = Math.max(40, Math.min(127, velocity))
    void audio.playOnTimed(config.instrumentId, note, 0.4, v)
    live.recordLivePlay(config.instrumentId, note, v, 0.4)
  }

  return {
    state,
    bowAttack,
    bowMoveTo,
    bowRelease,
    pluck,
  }
}

/**
 * Helpful for pads: given a maxQuarterSteps reach and the maqam preset
 * step list, returns booleans for each step position 0..max telling the
 * UI whether that fingerboard position is "in" the maqam (so it can
 * highlight the dot). Pure function — no Vue / Tone deps — so it's
 * trivially testable.
 */
export function maqamHighlightMap(
  maqamSteps: readonly number[],
  maxSteps: number,
): boolean[] {
  const inMaqam = new Set(maqamSteps.map((s) => s % 24))
  const out: boolean[] = []
  for (let s = 0; s <= maxSteps; s++) out.push(inMaqam.has(s % 24))
  return out
}
