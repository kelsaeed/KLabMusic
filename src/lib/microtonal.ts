// Quarter-tone / microtonal helpers — Phase 2 of the instrument-system
// expansion. The Arabic, Persian, Turkish, and several South Asian
// traditions divide the octave into 24 quarter-tones rather than 12 equal
// semitones. The added pitches sit between the Western chromatic notes
// (e.g. "half-flat E" = a quarter-tone below E) and are essential to
// maqam playing — without them the Hijaz / Bayati / Saba / Sika scales
// just don't sound right.
//
// This module is the math + naming layer the upcoming oud, violin, and
// cello UIs use to render fingerboards with quarter-tone positions and
// to drive playback at those pitches. It deliberately stays UI- and
// audio-engine-free so anything in the codebase can import it.

/** Quarter-tone offset relative to the chromatic note. */
export type QuarterShift = -1 | 0 | 1 | 2 | 3
//  -1 = quarter-flat       (50 cents below the named pitch)
//   0 = exact named pitch  (Western 12-TET)
//   1 = quarter-sharp       (50 cents above)
//   2 = sharp / flat next   (a full semitone — same as the next chromatic
//                            position, kept here only so callers using
//                            "step counts" can pass shifts without branching)
//   3 = three quarters above (75 cents below the next named pitch)

/**
 * Convert a chromatic MIDI note number (e.g. 60 = C4) to its frequency
 * in Hz under 12-tone equal temperament. A4 = 69 = 440 Hz by definition.
 */
export function semitoneToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

/**
 * Frequency at a quarter-tone offset above a named MIDI note. A quarter-
 * tone is 50 cents = a 24-EDO step. Useful for rendering fingerboard
 * positions and for pitch-shifting samples to maqam tones.
 *
 * Example: quarterToneToFrequency(64, -1) returns the half-flat E4
 *   (50 cents below E4) — the "sika" pitch in many Arabic maqamat.
 */
export function quarterToneToFrequency(midi: number, shift: QuarterShift = 0): number {
  return 440 * Math.pow(2, (midi - 69 + shift / 2) / 12)
}

/**
 * Detune in cents needed to nudge a Western 12-TET sample to its quarter-
 * tone neighbour. Returns 0 for shift 0, ±50 for ±1, ±100 for ±2, ±150 for
 * 3. Apply via voice.setBendCents(cents) or AudioParam.detune.value.
 */
export function quarterToneCents(shift: QuarterShift): number {
  return shift * 50
}

/**
 * Bend the active voice by a microtonal interval expressed as fractional
 * semitones (so 0.5 = a quarter-tone up, -0.25 = an eighth-tone down).
 * Wraps the existing setBendCents path so callers can speak in semitones
 * without thinking about cents.
 *
 * The first argument is the voice's own setBendCents — passed in instead
 * of imported so this module stays free of audio-engine dependencies and
 * can be unit-tested without a Tone.js context.
 */
export function applyMicrotonalPitchBend(
  setBendCents: (cents: number) => void,
  semitones: number,
): void {
  setBendCents(semitones * 100)
}

// — Arabic note naming —
//
// In maqam practice the seven scale degrees keep their solfège names and
// the quarter-tone variants get their own. The most common chromatic /
// quarter-tone names heard in conservatory and folk teaching are below.
// Sources: Egyptian conservatory pedagogy + Touma, "The Music of the
// Arabs" — these are the names a player learning oud or violin in Cairo
// or Beirut would actually hear.

const ARABIC_BASE: Record<string, string> = {
  C: 'do',
  D: 're',
  E: 'mi',
  F: 'fa',
  G: 'sol',
  A: 'la',
  B: 'si',
}

// "Half-flat" pitches — the sika/awj tones that sit between Western half-
// step positions and give Bayati / Rast / Saba their character.
const ARABIC_HALF_FLAT: Record<string, string> = {
  // half-flat E = sika (the third degree of Maqam Rast)
  E: 'sika',
  // half-flat B = awj (used in Iraqi maqam)
  B: 'awj',
  // half-flat A = nim-husseini
  A: 'nim-husseini',
}

const ARABIC_HALF_SHARP: Record<string, string> = {
  // half-sharp F = nim-jaharkah
  F: 'nim-jaharkah',
}

const ARABIC_SHARP: Record<string, string> = {
  C: 'do#',
  D: 're#',
  F: 'fa#',
  G: 'sol#',
  A: 'la#',
}

const ARABIC_FLAT: Record<string, string> = {
  D: 'reb',
  E: 'mib',
  G: 'solb',
  A: 'lab',
  B: 'sib',
}

export interface ArabicLabelOptions {
  /** Show the octave number after the name (e.g. "do4"). Default true. */
  withOctave?: boolean
  /** Use quarter-tone shift to refine the label. Default 0 = exact pitch. */
  quarterShift?: QuarterShift
}

/**
 * Translate a Western note name like "E4" / "C#3" / "Bb5" into its Arabic
 * solfège equivalent, optionally accounting for a quarter-tone shift so a
 * "sika" tone reads as "sika4" instead of "mi4". Returns the original
 * input unchanged if it can't parse — never throws.
 */
export function noteToArabicLabel(noteName: string, options: ArabicLabelOptions = {}): string {
  const { withOctave = true, quarterShift = 0 } = options
  const m = /^([A-G])(#|b)?(-?\d+)?$/.exec(noteName)
  if (!m) return noteName
  const letter = m[1]
  const accidental = m[2]
  const octave = m[3] ?? ''
  let base: string
  if (quarterShift === -1) {
    // Quarter-flat — falls onto the named letter; map via half-flat table.
    base = ARABIC_HALF_FLAT[letter] ?? `${ARABIC_BASE[letter] ?? letter}-`
  } else if (quarterShift === 1) {
    base = ARABIC_HALF_SHARP[letter] ?? `${ARABIC_BASE[letter] ?? letter}+`
  } else if (accidental === '#') {
    base = ARABIC_SHARP[letter] ?? `${ARABIC_BASE[letter] ?? letter}#`
  } else if (accidental === 'b') {
    base = ARABIC_FLAT[letter] ?? `${ARABIC_BASE[letter] ?? letter}b`
  } else {
    base = ARABIC_BASE[letter] ?? letter
  }
  return withOctave && octave ? `${base}${octave}` : base
}

/**
 * Convert a note name + quarter-shift into a MIDI float (where integer
 * values are 12-TET semitones and 0.5 increments are quarter-tones).
 * Handy for the upcoming maqam-aware pitch-detection / tuning work.
 */
export function noteToMidiFloat(noteName: string, quarterShift: QuarterShift = 0): number | null {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(noteName)
  if (!m) return null
  const semitoneOffsets: Record<string, number> = {
    C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11,
  }
  const base = semitoneOffsets[m[1]]
  if (base === undefined) return null
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  const octave = Number(m[3])
  return (octave + 1) * 12 + base + accidental + quarterShift / 2
}

/**
 * Common maqam presets — each one pinned to its conventional starting
 * tonic. Stored as quarter-tone steps from the tonic, so a value of 1
 * = quarter-tone up, 2 = semitone, 3 = three-quarter, 4 = whole tone.
 * UIs can convert these into fingerboard positions on the upcoming
 * oud / violin renderers.
 */
export const MAQAM_PRESETS: Record<string, { tonic: string; steps: number[]; name: string }> = {
  rast:    { tonic: 'C', steps: [0, 4, 7, 10, 14, 18, 21], name: 'Rast' },
  bayati:  { tonic: 'D', steps: [0, 3, 6, 10, 14, 17, 20], name: 'Bayati' },
  hijaz:   { tonic: 'D', steps: [0, 2, 8, 10, 14, 16, 20], name: 'Hijaz' },
  saba:    { tonic: 'D', steps: [0, 3, 6, 8, 14, 16, 20], name: 'Saba' },
  sika:    { tonic: 'E', steps: [0, 3, 7, 11, 14, 17, 21], name: 'Sika' },
  nahawand:{ tonic: 'C', steps: [0, 4, 6, 10, 14, 16, 20], name: 'Nahawand' },
  kurd:    { tonic: 'D', steps: [0, 2, 6, 10, 14, 16, 20], name: 'Kurd' },
  ajam:    { tonic: 'C', steps: [0, 4, 8, 10, 14, 18, 22], name: 'Ajam' },
}
