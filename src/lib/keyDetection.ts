// Song-key detection used by the Smart Tune panel. The pipeline:
//   1. Slide a small window across each audio clip (every ~0.3 s).
//   2. Run YIN pitch detection at each window position. (lib/pitch.ts)
//   3. Convert detected pitches to MIDI floats, take pitch class (0-11
//      for the Western pass, 0-23 for the maqam pass — the latter
//      preserves quarter-tone information YIN already provides via the
//      sub-MIDI fractional bin).
//   4. Accumulate the matching chromagram, weighted by detection count.
//   5. Score against the Krumhansl-Kessler tonal-hierarchy profiles for
//      every major and minor key (24 candidates) AND against the
//      bundled 8-maqam quarter-tone profiles rotated through every
//      tonic (96 candidates). The Smart Tune UI gets the best of each
//      family so the user can see "C major (62%)" and "D Bayati (54%)"
//      side-by-side and pick whichever matches the recording.
//
// This is the standard approach for symbolic key detection and works
// surprisingly well on monophonic / homophonic material — typical use
// case for a vocal recording you want to auto-tune. Polyphonic mixed
// tracks reduce confidence but still usually give the right answer.

import { detectPitchHz, frequencyToMidiFloat, KEY_NAMES, type Key } from './pitch'
import { MAQAM_PRESETS } from './microtonal'

/** Bundled maqam ids — kept as a literal-string union so callers can
 *  switch on the value without falling back to plain string. */
export type MaqamId = keyof typeof MAQAM_PRESETS

export interface MaqamMatch {
  tonic: Key
  maqamId: MaqamId
  /** Same 0..1 Pearson confidence the Western matcher reports. */
  confidence: number
}

export interface KeyDetectionResult {
  key: Key
  scale: 'major' | 'minor'
  /** 0..1 — Pearson correlation of the winning key against the chromagram.
   *  Above ~0.6 is confident; below ~0.4 the answer is just a guess. */
  confidence: number
  /** The full 12-bin pitch-class histogram, normalised to sum=1, for UI display. */
  chromagram: number[]
  /** Best maqam fit across the same audio. Undefined if YIN found no
   *  pitched frames at all. The UI compares this against the major/
   *  minor confidence and presents whichever the user wants to act on. */
  maqam?: MaqamMatch
  /** 24-bin quarter-tone chromagram — kept alongside the 12-bin one
   *  so a future visualizer can show the half-flat columns explicitly. */
  chromagram24?: number[]
}

// Krumhansl & Kessler 1982 key profiles — empirically derived weights for
// each scale degree's prominence in major / minor tonal music.
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88]
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17]

const WINDOW_SIZE = 4096
const HOP_SECONDS = 0.3

function buildChromagram(buffer: AudioBuffer): { c12: number[]; c24: number[] } {
  const sr = buffer.sampleRate
  const channel = buffer.getChannelData(0)
  const hopSamples = Math.max(WINDOW_SIZE / 2, Math.floor(HOP_SECONDS * sr))
  const c12 = new Array(12).fill(0) as number[]
  const c24 = new Array(24).fill(0) as number[]
  for (let start = 0; start + WINDOW_SIZE < channel.length; start += hopSamples) {
    const window = channel.subarray(start, start + WINDOW_SIZE)
    const hz = detectPitchHz(window, sr)
    if (hz === null) continue
    const midi = frequencyToMidiFloat(hz)
    const pc12 = ((Math.round(midi) % 12) + 12) % 12
    c12[pc12] += 1
    // Quarter-tone bin: round MIDI*2 (each bin = 50 cents). A vocalist
    // landing on a half-flat E lands in bin 8 (4*2=8), distinct from
    // bin 7 (D#/Eb, 3.5*2) and bin 9 (E natural, 4.5*2). YIN is
    // accurate to a few cents on a sustained vocal note, so this bin
    // assignment is stable across windows.
    const pc24 = ((Math.round(midi * 2) % 24) + 24) % 24
    c24[pc24] += 1
  }
  return { c12, c24 }
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
 * Build a 24-bin maqam profile from a preset's quarter-tone steps.
 * Mimics the Krumhansl-Kessler shape used for major/minor profiles:
 * a strong tonic, a slightly weaker fifth (when in scale), and elevated
 * weights on the rest of the scale degrees, with a low background for
 * out-of-scale pitches. The values are heuristic — derived from the
 * pattern of relative emphasis in canonical Arabic conservatory
 * pedagogy (tonic = qarar, fifth = nawa is the structural anchor),
 * not measured from a corpus. They give sensible relative scores
 * across the 8 bundled maqamat on monophonic vocal takes.
 */
function buildMaqamProfile(steps: readonly number[]): number[] {
  const BG = 1.5
  const SCALE = 4.0
  const TONIC = 6.5
  const FIFTH = 5.0
  const profile = new Array(24).fill(BG) as number[]
  const inScale = new Set<number>()
  for (const s of steps) inScale.add(((s % 24) + 24) % 24)
  for (const s of inScale) profile[s] = SCALE
  profile[0] = TONIC
  // 14 quarter-tones = perfect fifth. Nahawand / Ajam / Kurd / Hijaz
  // all have it; Sika / Saba don't, in which case we leave whatever
  // weight the loop above assigned (SCALE if it's in-scale, BG if not).
  if (inScale.has(14)) profile[14] = FIFTH
  return profile
}

const MAQAM_PROFILES: Array<{ id: MaqamId; profile: number[] }> = (() => {
  const out: Array<{ id: MaqamId; profile: number[] }> = []
  for (const id of Object.keys(MAQAM_PRESETS) as MaqamId[]) {
    out.push({ id, profile: buildMaqamProfile(MAQAM_PRESETS[id].steps) })
  }
  return out
})()

function bestMaqamMatch(c24: number[]): MaqamMatch | null {
  const total = c24.reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const normalised = c24.map((v) => v / total)
  let best = { tonic: 'C' as Key, maqamId: 'rast' as MaqamId, score: -Infinity }
  for (const { id, profile } of MAQAM_PROFILES) {
    for (let k = 0; k < 12; k++) {
      // Each semitone rotation in 24-bin space is two slots, so the
      // tonic at semitone k aligns with profile bin 2*k.
      const rotated = rotate(profile, k * 2)
      const score = correlate(normalised, rotated)
      if (score > best.score) {
        best = { tonic: KEY_NAMES[k], maqamId: id, score }
      }
    }
  }
  return {
    tonic: best.tonic,
    maqamId: best.maqamId,
    confidence: Math.max(0, best.score),
  }
}

/**
 * Detect the most likely key + scale across one or more audio buffers.
 * Returns null if no buffer yielded any pitched frames at all (silence,
 * pure noise, or extremely polyphonic content YIN can't latch onto).
 *
 * The result also includes the best-fit maqam under a 24-bin quarter-
 * tone matcher — UI consumers can compare its confidence against the
 * Western major/minor confidence and pick whichever the recording
 * actually leans toward.
 */
export function detectKey(buffers: AudioBuffer[]): KeyDetectionResult | null {
  if (buffers.length === 0) return null
  const combined12 = new Array(12).fill(0) as number[]
  const combined24 = new Array(24).fill(0) as number[]
  for (const buf of buffers) {
    const { c12, c24 } = buildChromagram(buf)
    for (let i = 0; i < 12; i++) combined12[i] += c12[i]
    for (let i = 0; i < 24; i++) combined24[i] += c24[i]
  }
  const total = combined12.reduce((s, v) => s + v, 0)
  if (total === 0) return null
  const normalised = combined12.map((v) => v / total)

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
  const total24 = combined24.reduce((s, v) => s + v, 0)
  const maqam = bestMaqamMatch(combined24) ?? undefined
  const chromagram24 = total24 > 0 ? combined24.map((v) => v / total24) : undefined
  return {
    key: best.key,
    scale: best.scale,
    // Pearson is in [-1, 1]. We map negatives to 0 (anti-correlation
    // never indicates a confident key) and report the positive half.
    confidence: Math.max(0, best.score),
    chromagram: normalised,
    maqam,
    chromagram24,
  }
}
