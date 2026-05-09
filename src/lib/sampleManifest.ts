// Phase 10 — sample manifest. The seam where future downloadable sample
// packs plug into the existing Tone.js synth approximations without
// rewriting any voice. Every BUILDER in useAudio.ts that wants to
// support real samples consults `getSampleEntry` first; if the entry
// exists, the voice loads + plays the sampled audio for that note /
// articulation, and the synth path becomes the offline fallback.
//
// Shape:
//   manifest[instrumentId][noteOrSampleName][articulation] = url-or-config
//
// - `instrumentId` matches lib/types.ts InstrumentId (e.g. 'violin').
// - `noteOrSampleName` is either a Western note name like "G3" / "C#4"
//   for melodic instruments, or a kit-piece name like "kick" / "snare"
//   for sample-based percussion.
// - `articulation` matches one of the ids in the instrument's
//   metadata `articulations` array (e.g. 'down-bow' / 'up-bow' /
//   'pizzicato' for violin, 'pluck' / 'strum-down' for guitar).
// - The leaf is either a plain URL string or a config object with an
//   optional gain trim — useful when one articulation's sample is
//   noticeably louder/softer than another and we want to balance the
//   set without re-rendering the audio.

export interface SampleSpec {
  /** URL to the audio file. Relative to the site origin or absolute. */
  url: string
  /** Optional gain trim in dB applied at load. Default 0 (no change). */
  gain?: number
}

export type SampleLeaf = string | SampleSpec

export type SampleArticulationMap = Record<string, SampleLeaf>

/**
 * Sample manifest indexed by instrument id → note/sample → articulation
 * → audio resource. The map is sparse; missing entries fall back to the
 * synth approximation in useAudio's BUILDERS.
 */
export interface SampleManifest {
  [instrumentId: string]: {
    [noteOrSampleName: string]: SampleArticulationMap
  }
}

/**
 * Default sample manifest shipped with the build. Routes the
 * percussion-heavy realDrums voice to recorded acoustic samples
 * because the multi-layered synth equivalent (deep membrane + beater
 * click + HPF, snare wires + body + crack + HPF, etc.) burns more
 * mobile DSP per audio frame than the audio worker can sustain — a
 * fast beat-maker pattern produced an electrical 'wshhhh' on real-
 * device QA when the kit was synth-only. A Tone.Player per piece is
 * one node + one buffer; the synth equivalent per kick was three
 * nodes plus a filter. Samples win on mobile.
 *
 * Source: Tonejs/audio drum-samples/acoustic-kit (kick / snare /
 * hihat / tom1 / tom2 / tom3). These are the same files Tone.js's
 * own examples ship — Chris Wilson's web-audio-samples repo,
 * publicly maintained for Web Audio tutorials and demos for years.
 * Files are tiny (5-7 KB each at 128 kbps mono) so first-load adds
 * essentially zero bandwidth. The synth fallback in BUILDERS still
 * handles ride / crash / floor (no samples for those in this kit)
 * and stays as the offline / blocked-CDN fallback for everything.
 *
 * Seams stay open for oud / tambourine / harmonica — no free
 * CDN-hostable pack with a consistent kit-piece set has been found:
 *  - oud → GM Soundfont 'sitar' is the closest plucked-double-
 *    string preset.
 *  - tambourine → BUILDERS.tambourine synth.
 *  - harmonica → nbrosowsky harmonium (free-reed neighbour).
 */
const TONE_ACOUSTIC = 'https://cdn.jsdelivr.net/gh/Tonejs/audio@master/drum-samples/acoustic-kit'
export const MANIFEST: SampleManifest = {
  realDrums: {
    kick: { default: `${TONE_ACOUSTIC}/kick.mp3` },
    snare: { default: `${TONE_ACOUSTIC}/snare.mp3` },
    // The kit ships only one closed hihat variant; route both
    // closed and open keys to it so the engine plays SOMETHING for
    // hihatO instead of dropping straight to the synth fallback. A
    // future pack with proper open / closed variants will override
    // these entries via loadSampleManifest({...}).
    hihatC: { default: `${TONE_ACOUSTIC}/hihat.mp3` },
    hihatO: { default: `${TONE_ACOUSTIC}/hihat.mp3` },
    tom1: { default: `${TONE_ACOUSTIC}/tom1.mp3` },
    tom2: { default: `${TONE_ACOUSTIC}/tom2.mp3` },
    floor: { default: `${TONE_ACOUSTIC}/tom3.mp3` },
    // ride / crash intentionally omitted — Tone.js acoustic-kit
    // doesn't include them. The synth fallback in buildRealDrums
    // covers those two pieces (MetalSynth ride + crash), which is
    // cheap enough on mobile that the manifest+synth hybrid is
    // a clear win over all-synth.
  },
}

/**
 * Look up a sample for a given instrument / note / articulation. Returns
 * undefined when there's no entry, signalling the BUILDER should keep
 * using the synth approximation.
 *
 * Articulation defaults to 'default' so callers that don't care about
 * articulation (e.g. piano) can pass just the note name.
 */
export function getSampleEntry(
  instrumentId: string,
  noteOrSampleName: string,
  articulation = 'default',
): SampleSpec | undefined {
  const perNote = MANIFEST[instrumentId]?.[noteOrSampleName]
  if (!perNote) return undefined
  const leaf = perNote[articulation] ?? perNote.default
  if (!leaf) return undefined
  if (typeof leaf === 'string') return { url: leaf }
  return leaf
}

/**
 * True when the manifest has at least one sample entry for the given
 * instrument. The audio engine consults this before building a voice
 * so it can pick the sampled path when entries exist and the synth
 * approximation when they don't, without scanning the per-note map.
 */
export function hasManifestEntries(instrumentId: string): boolean {
  const entries = MANIFEST[instrumentId]
  if (!entries) return false
  for (const note in entries) {
    if (Object.keys(entries[note]).length > 0) return true
  }
  return false
}

/**
 * Replace the manifest contents with new data — used by a future
 * sample-pack loader to swap in a downloaded pack at runtime. Performs
 * an in-place update so already-running BUILDERS that hold a reference
 * to MANIFEST see the new entries on next lookup.
 */
export function loadSampleManifest(next: SampleManifest): void {
  for (const key of Object.keys(MANIFEST)) delete MANIFEST[key]
  Object.assign(MANIFEST, next)
}
