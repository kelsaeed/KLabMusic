// Song-key detection used by the Smart Tune panel. The pipeline:
//   1. Slide a small window across each audio clip (every ~0.3 s).
//   2. Run YIN pitch detection at each window position. (lib/pitch.ts)
//   3. Convert detected pitches to MIDI floats, take pitch class (0-11).
//   4. Accumulate a 12-bin chromagram weighted by the number of detections
//      at that pitch class.
//   5. Score the chromagram against the Krumhansl-Kessler tonal-hierarchy
//      profiles for every major and minor key (24 in total). Pick the key
//      with the highest Pearson correlation.
//
// This is the standard approach for symbolic key detection and works
// surprisingly well on monophonic / homophonic material — typical use
// case for a vocal recording you want to auto-tune. Polyphonic mixed
// tracks reduce confidence but still usually give the right answer.

import { detectPitchHz, frequencyToMidiFloat, KEY_NAMES, type Key } from './pitch'

export interface KeyDetectionResult {
  key: Key
  scale: 'major' | 'minor'
  /** 0..1 — Pearson correlation of the winning key against the chromagram.
   *  Above ~0.6 is confident; below ~0.4 the answer is just a guess. */
  confidence: number
  /** The full pitch-class histogram, normalised to sum=1, for UI display. */
  chromagram: number[]
}

// Krumhansl & Kessler 1982 key profiles — empirically derived weights for
// each scale degree's prominence in major / minor tonal music.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const WINDOW_SIZE = 4096
const HOP_SECONDS = 0.3

function buildChromagram(buffer: AudioBuffer): number[] {
  const sr = buffer.sampleRate
  const channel = buffer.getChannelData(0)
  const hopSamples = Math.max(WINDOW_SIZE / 2, Math.floor(HOP_SECONDS * sr))
  const chroma = new Array(12).fill(0) as number[]
  for (let start = 0; start + WINDOW_SIZE < channel.length; start += hopSamples) {
    const window = channel.subarray(start, start + WINDOW_SIZE)
    const hz = detectPitchHz(window, sr)
    if (hz === null) continue
    const midi = frequencyToMidiFloat(hz)
    const pc = ((Math.round(midi) % 12) + 12) % 12
    chroma[pc] += 1
  }
  return chroma
}

function correlate(a: number[], b: number[]): number {
  // Pearson correlation. Both arrays length 12.
  const n = a.length
  const meanA = a.reduce((s, v) => s + v, 0) / n
  const meanB = b.reduce((s, v) => s + v, 0) / n
  let num = 0
  let denomA = 0
  let denomB = 0
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA
    const db = b[i] - meanB
    num += da * db
    denomA += da * da
    denomB += db * db
  }
  const denom = Math.sqrt(denomA * denomB)
  return denom === 0 ? 0 : num / denom
}

function rotate(arr: number[], n: number): number[] {
  const out = new Array(arr.length) as number[]
  for (let i = 0; i < arr.length; i++) {
    out[i] = arr[(i + n) % arr.length]
  }
  return out
}

/**
 * Detect the most likely key + scale across one or more audio buffers.
 * Returns null if no buffer yielded any pitched frames at all (silence,
 * pure noise, or extremely polyphonic content YIN can't latch onto).
 */
export function detectKey(buffers: AudioBuffer[]): KeyDetectionResult | null {
  if (buffers.length === 0) return null
  const combined = new Array(12).fill(0) as number[]
  for (const buf of buffers) {
    const chroma = buildChromagram(buf)
    for (let i = 0; i < 12; i++) combined[i] += chroma[i]
  }
  const total = combined.reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const normalised = combined.map((v) => v / total)

  let best = { key: 'C' as Key, scale: 'major' as 'major' | 'minor', score: -Infinity }
  for (let k = 0; k < 12; k++) {
    const majorScore = correlate(normalised, rotate(MAJOR_PROFILE, k))
    if (majorScore > best.score) {
      best = { key: KEY_NAMES[k], scale: 'major', score: majorScore }
    }
    const minorScore = correlate(normalised, rotate(MINOR_PROFILE, k))
    if (minorScore > best.score) {
      best = { key: KEY_NAMES[k], scale: 'minor', score: minorScore }
    }
  }
  return {
    key: best.key,
    scale: best.scale,
    // Pearson is in [-1, 1]. We map negatives to 0 (anti-correlation
    // never indicates a confident key) and report the positive half.
    confidence: Math.max(0, best.score),
    chromagram: normalised,
  }
}
