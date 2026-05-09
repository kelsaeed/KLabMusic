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
 * Default sample manifest shipped with the build. Empty out of the box
 * because the only free, CDN-hostable, properly-licensed pack with a
 * complete kit-piece set is the Boochi44 vintage trap kit, which
 * sounds like vinyl-textured hip-hop drums — not the band-style
 * acoustic kit users actually expect from realDrums. Shipping it as
 * the default got real-world feedback that the drums "sound like
 * beats" not "DOM TUCK Dum" band drums, so we removed the entries
 * and routed users to the well-tuned synth in buildRealDrums.
 *
 * Seams stay wired — drop in a real acoustic drum pack via
 * loadSampleManifest({realDrums: {...}}) when one becomes available
 * (or paste in a custom URL set), and the manifest path takes over
 * automatically. Same for oud / tambourine / harmonica, which never
 * had free CDN-hostable packs to begin with:
 *  - oud → falls back to GM Soundfont 'sitar' (closest plucked-
 *    double-string Soundfont preset).
 *  - tambourine → synth approximation in BUILDERS.tambourine.
 *  - harmonica → nbrosowsky/tonejs-instruments harmonium fallback
 *    (free reed neighbour; recorded audio, just not actually a
 *    harmonica). True harmonica samples need a paid / curated pack.
 *  - realDrums → multi-layered synth in BUILDERS.realDrums (kick
 *    has a beater click on top of a deep membrane, snare layers
 *    wires + body + a high-passed crack, etc.) tuned to read as a
 *    real acoustic kit rather than a TR-808 trigger box.
 */
export const MANIFEST: SampleManifest = {}

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
