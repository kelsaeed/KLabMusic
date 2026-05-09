// Pitch detection + scale snapping for the recorder's "Tune to key" feature.
//
// detectPitchHz uses the YIN algorithm (Cheveigné & Kawahara, 2002) — the
// industry-standard approach for monophonic pitch detection in vocals and
// solo instruments. We compute the cumulative mean normalised difference
// function over a window, find the first dip below an absolute threshold,
// and refine with parabolic interpolation. Output is in Hz, or null if no
// confident pitch was found (silence, polyphonic content, breath noise).
//
// The rest of the file converts that frequency into a MIDI float, snaps it
// to the nearest tone in a user-chosen key + scale, and reports back the
// integer-semitone shift the recorder should apply to its Tone.PitchShift
// node so the clip lands on a scale-correct pitch.

export type Scale = 'major' | 'minor' | 'pentatonic' | 'minor-pent' | 'blues' | 'dorian' | 'chromatic'

export const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const
export type Key = typeof KEY_NAMES[number]

export const SCALE_INTERVALS: Record<Scale, number[]> = {
  major:        [0, 2, 4, 5, 7, 9, 11],
  minor:        [0, 2, 3, 5, 7, 8, 10],
  pentatonic:   [0, 2, 4, 7, 9],
  'minor-pent': [0, 3, 5, 7, 10],
  blues:        [0, 3, 5, 6, 7, 10],
  dorian:       [0, 2, 3, 5, 7, 9, 10],
  chromatic:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
}

export interface PitchResult {
  hz: number
  midi: number
  noteName: string
  cents: number
}

export interface TuneResult {
  detected: PitchResult
  target: PitchResult
  semitones: number
}

// YIN constants. THRESHOLD 0.1 is the value the original paper recommends —
// values below 0.1 give too few detections, above 0.15 produce octave errors.
const YIN_THRESHOLD = 0.12

/**
 * Detect the dominant fundamental frequency of an audio buffer slice.
 * Returns null when the signal is too noisy / silent / polyphonic to give
 * a confident answer (autocorrelation never finds a clear period).
 */
export function detectPitchHz(
  samples: Float32Array,
  sampleRate: number,
): number | null {
  const N = samples.length
  if (N < 1024) return null

  // Search range: 60 Hz → 1000 Hz covers every singing voice + most lead
  // melodic instruments. Below 60 Hz is sub-bass; above 1000 Hz autocorr.
  // becomes unreliable on short windows.
  const minPeriod = Math.max(2, Math.floor(sampleRate / 1000))
  const maxPeriod = Math.min(N - 1, Math.floor(sampleRate / 60))

  // Step 1+2 fused — difference function then cumulative mean normalisation.
  const yin = new Float32Array(maxPeriod + 1)
  for (let tau = 1; tau <= maxPeriod; tau++) {
    let sum = 0
    for (let i = 0; i + tau < N; i++) {
      const d = samples[i] - samples[i + tau]
      sum += d * d
    }
    yin[tau] = sum
  }
  yin[0] = 1
  let runningSum = 0
  for (let tau = 1; tau <= maxPeriod; tau++) {
    runningSum += yin[tau]
    if (runningSum === 0) {
      yin[tau] = 1
    } else {
      yin[tau] = (yin[tau] * tau) / runningSum
    }
  }

  // Step 3 — first dip below threshold, descending until local minimum.
  let tau = -1
  for (let t = minPeriod; t <= maxPeriod; t++) {
    if (yin[t] < YIN_THRESHOLD) {
      while (t + 1 <= maxPeriod && yin[t + 1] < yin[t]) t++
      tau = t
      break
    }
  }
  if (tau === -1) return null

  // Parabolic interpolation around tau for sub-sample precision.
  const x0 = tau > 0 ? yin[tau - 1] : yin[tau]
  const x1 = yin[tau]
  const x2 = tau + 1 <= maxPeriod ? yin[tau + 1] : yin[tau]
  const denom = 2 * (2 * x1 - x2 - x0)
  const refinedTau = denom !== 0 ? tau + (x2 - x0) / denom : tau

  const hz = sampleRate / refinedTau
  if (!isFinite(hz) || hz < 30 || hz > 4000) return null
  return hz
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function frequencyToMidiFloat(hz: number): number {
  return 12 * Math.log2(hz / 440) + 69
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function midiFloatToPitchResult(midi: number): PitchResult {
  // Round-half-down keeps cents in [-50, +50] which matches how tuners read.
  const nearest = Math.round(midi)
  const cents = Math.round((midi - nearest) * 100)
  const octave = Math.floor(nearest / 12) - 1
  const noteName = `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${octave}`
  return { hz: midiToFrequency(midi), midi, noteName, cents }
}

/**
 * Find the nearest in-key MIDI tone to a given pitch.
 * Searches one octave up and down from the detected pitch so a singer
 * landing 3 semitones above a scale note can be pulled DOWN, not pushed up
 * to the next octave's nearest tone.
 *
 * `customIntervals` lets the caller swap the scale's semitone-offset list
 * for a custom one (the maqam-aware tune flow uses this to feed in the
 * semitone-rounded steps of a chosen maqam preset). When omitted the
 * lookup falls back to SCALE_INTERVALS[scale] as before.
 */
export function snapMidiToScale(
  midi: number,
  keyIndex: number,
  scale: Scale,
  customIntervals?: number[],
): number {
  const intervals = customIntervals ?? SCALE_INTERVALS[scale]
  const baseOctave = Math.floor(midi / 12)
  let bestTarget = midi
  let bestDelta = Infinity
  for (let oct = baseOctave - 1; oct <= baseOctave + 1; oct++) {
    for (const offset of intervals) {
      const target = oct * 12 + keyIndex + offset
      const delta = Math.abs(target - midi)
      if (delta < bestDelta) {
        bestDelta = delta
        bestTarget = target
      }
    }
  }
  return bestTarget
}

/**
 * Detect the pitch of a clip and compute the integer-semitone shift needed
 * to land on the nearest scale tone in the user's key. Sample window is
 * pulled from the centre of the clip's trimmed range so we don't tune to
 * silent intro/outro frames.
 */
export function tuneClipToKey(
  buffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  keyIndex: number,
  scale: Scale,
  /** Optional maqam-derived intervals (semitone-rounded). When supplied,
   *  takes precedence over `scale` so the snap target lands on a
   *  maqam-scale tone instead of the Western scale tone. */
  customIntervals?: number[],
): TuneResult | null {
  const sr = buffer.sampleRate
  const channel = buffer.getChannelData(0)
  const startSample = Math.floor(trimStart * buffer.length)
  const endSample = Math.floor(trimEnd * buffer.length)
  const len = endSample - startSample
  if (len < 4096) return null

  // Take a 4096-sample window from the middle of the trimmed region — the
  // sustained part of a vocal phrase is the cleanest signal for autocorr.
  const winLen = Math.min(4096, len)
  const winStart = startSample + Math.floor((len - winLen) / 2)
  const window = channel.subarray(winStart, winStart + winLen)

  const hz = detectPitchHz(window, sr)
  if (hz === null) return null

  const midi = frequencyToMidiFloat(hz)
  const detected = midiFloatToPitchResult(midi)
  const targetMidi = snapMidiToScale(midi, keyIndex, scale, customIntervals)
  const target = midiFloatToPitchResult(targetMidi)
  // Round to integer semitones so it composes cleanly with the existing
  // pitchSemitones range slider — sub-semitone correction is a Phase 4
  // problem (full per-frame autotune via offline render).
  const semitones = Math.round(targetMidi - midi)
  return { detected, target, semitones }
}
