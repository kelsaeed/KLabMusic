// Curated loop library — Phase 3 of the Soundtrap-parity plan.
//
// Strategy: instead of bundling megabytes of static WAV/MP3 samples (which
// cost bandwidth on every page load AND lock the audio to one mix forever)
// every loop is described as DATA — instrument + note + step pattern at a
// known BPM and key. Preview renders through our existing audio engine in
// real time, so a loop sounds correct in whatever theme/mastering preset
// the user has selected; "Add to Beat Maker" turns the loop into a real
// pattern the user can edit step by step.
//
// This means the library is also infinitely extensible: anyone can author
// a new loop by adding a LoopDef object, and it inherits every voice
// upgrade we ever ship.

import type { InstrumentId, StepCount } from './types'

export type LoopCategory = 'drums' | 'bass' | 'chords' | 'melody' | 'fx'
export type LoopGenre =
  | 'hip-hop'
  | 'lofi'
  | 'trap'
  | 'house'
  | 'edm'
  | 'jazz'
  | 'rock'
  | 'rnb'
  | 'pop'
  | 'ambient'

export interface LoopTrack {
  instrument: InstrumentId
  /** A note name like "C4", or a drum sample name like "kick" / "snare". */
  note: string
  /** Velocities 1-127 per step; null means the step is silent. */
  steps: (number | null)[]
}

export interface LoopDef {
  id: string
  name: string
  category: LoopCategory
  genre: LoopGenre
  bpm: number
  /** "C", "Am", "Cmaj7", or "—" for non-pitched material. */
  key: string
  bars: 1 | 2 | 4
  stepCount: StepCount
  tracks: LoopTrack[]
}

// Helpers: build a steps array of length n with active beats. Velocity is
// optional; defaults to 100 for active, null for silence.
const N = (n: number) => new Array(n).fill(null) as (number | null)[]
function hits(len: number, beats: number[], vel = 100): (number | null)[] {
  const arr = N(len)
  for (const b of beats) arr[b] = vel
  return arr
}
function ghosts(len: number, accents: number[], ghosts: number[], vel = 105, ghostVel = 50) {
  const arr = N(len)
  for (const a of accents) arr[a] = vel
  for (const g of ghosts) arr[g] = ghostVel
  return arr
}

// — DRUMS —
const drums: LoopDef[] = [
  {
    id: 'drums-boombap',
    name: 'Boom Bap',
    category: 'drums',
    genre: 'hip-hop',
    bpm: 90,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 6, 8], 115) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [4, 12], 110) },
      { instrument: 'drums', note: 'hihat', steps: ghosts(16, [0, 4, 8, 12], [2, 6, 10, 14]) },
    ],
  },
  {
    id: 'drums-trap-kick',
    name: 'Trap Kick',
    category: 'drums',
    genre: 'trap',
    bpm: 140,
    key: '—',
    bars: 1,
    stepCount: 32,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(32, [0, 12, 16], 120) },
      { instrument: 'drums', note: 'snare', steps: hits(32, [8, 24], 115) },
      { instrument: 'drums', note: 'hihat', steps: hits(32, [0, 2, 4, 6, 8, 10, 12, 13, 14, 15, 16, 18, 20, 22, 24, 26, 27, 28, 29, 30, 31], 80) },
    ],
  },
  {
    id: 'drums-four-floor',
    name: 'Four on the Floor',
    category: 'drums',
    genre: 'house',
    bpm: 124,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 4, 8, 12], 118) },
      { instrument: 'drums', note: 'clap', steps: hits(16, [4, 12], 105) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [2, 6, 10, 14], 95) },
      { instrument: 'drums', note: 'hihatO', steps: hits(16, [10], 90) },
    ],
  },
  {
    id: 'drums-halftime',
    name: 'Half-Time',
    category: 'drums',
    genre: 'rnb',
    bpm: 80,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 9], 115) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [8], 110) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [0, 2, 4, 6, 8, 10, 12, 14], 80) },
    ],
  },
  {
    id: 'drums-disco',
    name: 'Disco Beat',
    category: 'drums',
    genre: 'house',
    bpm: 118,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 4, 8, 12], 118) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [4, 12], 100) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 70) },
      { instrument: 'drums', note: 'hihatO', steps: hits(16, [2, 6, 10, 14], 95) },
    ],
  },
  {
    id: 'drums-lofi',
    name: 'Lo-Fi Sleepy',
    category: 'drums',
    genre: 'lofi',
    bpm: 70,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 6], 95) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [4, 12], 80) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [2, 6, 10, 14], 60) },
    ],
  },
  {
    id: 'drums-dnb',
    name: 'Drum & Bass',
    category: 'drums',
    genre: 'edm',
    bpm: 174,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 10], 120) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [4, 12], 115) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [0, 2, 4, 6, 8, 10, 12, 14], 80) },
    ],
  },
  {
    id: 'drums-reggaeton',
    name: 'Reggaeton',
    category: 'drums',
    genre: 'pop',
    bpm: 95,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'drums', note: 'kick', steps: hits(16, [0, 6, 8, 14], 115) },
      { instrument: 'drums', note: 'snare', steps: hits(16, [3, 7, 11, 15], 95) },
      { instrument: 'drums', note: 'hihat', steps: hits(16, [0, 2, 4, 6, 8, 10, 12, 14], 80) },
    ],
  },
]

// — BASS —
const bass: LoopDef[] = [
  {
    id: 'bass-funk',
    name: 'Funk Slap',
    category: 'bass',
    genre: 'rnb',
    bpm: 105,
    key: 'Em',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'bass', note: 'E2', steps: hits(16, [0, 6, 10], 115) },
      { instrument: 'bass', note: 'G2', steps: hits(16, [4], 105) },
      { instrument: 'bass', note: 'B2', steps: hits(16, [12], 100) },
    ],
  },
  {
    id: 'bass-house',
    name: 'House Driver',
    category: 'bass',
    genre: 'house',
    bpm: 124,
    key: 'Cm',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'bass', note: 'C2', steps: hits(16, [0, 2, 4, 6, 8, 10, 12, 14], 100) },
    ],
  },
  {
    id: 'bass-sub-wobble',
    name: 'Sub Wobble',
    category: 'bass',
    genre: 'trap',
    bpm: 140,
    key: 'Fm',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'bass', note: 'F1', steps: hits(16, [0, 8], 120) },
      { instrument: 'bass', note: 'A#1', steps: hits(16, [4, 12], 110) },
    ],
  },
  {
    id: 'bass-walking-jazz',
    name: 'Walking Jazz',
    category: 'bass',
    genre: 'jazz',
    bpm: 110,
    key: 'Cm',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'bass', note: 'C2', steps: hits(16, [0], 100) },
      { instrument: 'bass', note: 'E2', steps: hits(16, [4], 95) },
      { instrument: 'bass', note: 'G2', steps: hits(16, [8], 95) },
      { instrument: 'bass', note: 'A#2', steps: hits(16, [12], 95) },
    ],
  },
  {
    id: 'bass-acid',
    name: 'Acid Line',
    category: 'bass',
    genre: 'edm',
    bpm: 128,
    key: 'Am',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'bass', note: 'A1', steps: hits(16, [0, 2, 6, 8, 12], 110) },
      { instrument: 'bass', note: 'C2', steps: hits(16, [4, 14], 95) },
      { instrument: 'bass', note: 'E2', steps: hits(16, [10], 100) },
    ],
  },
]

// — CHORDS / PADS —
const chords: LoopDef[] = [
  {
    id: 'chord-lofi-pad',
    name: 'Chillhop Pad',
    category: 'chords',
    genre: 'lofi',
    bpm: 75,
    key: 'Am',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'pad', note: 'A3', steps: hits(16, [0, 8], 90) },
      { instrument: 'pad', note: 'C4', steps: hits(16, [0, 8], 88) },
      { instrument: 'pad', note: 'E4', steps: hits(16, [0, 8], 88) },
      { instrument: 'pad', note: 'G4', steps: hits(16, [0, 8], 80) },
    ],
  },
  {
    id: 'chord-dreamy',
    name: 'Dreamy Pad',
    category: 'chords',
    genre: 'ambient',
    bpm: 80,
    key: 'Cmaj7',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'pad', note: 'C4', steps: hits(16, [0], 90) },
      { instrument: 'pad', note: 'E4', steps: hits(16, [0], 88) },
      { instrument: 'pad', note: 'G4', steps: hits(16, [0], 88) },
      { instrument: 'pad', note: 'B4', steps: hits(16, [0], 85) },
    ],
  },
  {
    id: 'chord-house-stab',
    name: 'House Stab',
    category: 'chords',
    genre: 'house',
    bpm: 124,
    key: 'Cm',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'electricPiano', note: 'C4', steps: hits(16, [2, 6, 10, 14], 95) },
      { instrument: 'electricPiano', note: 'D#4', steps: hits(16, [2, 6, 10, 14], 90) },
      { instrument: 'electricPiano', note: 'G4', steps: hits(16, [2, 6, 10, 14], 90) },
    ],
  },
  {
    id: 'chord-jazz-comp',
    name: 'Jazz Comping',
    category: 'chords',
    genre: 'jazz',
    bpm: 110,
    key: 'Dm7',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'electricPiano', note: 'D4', steps: hits(16, [0, 6, 10], 90) },
      { instrument: 'electricPiano', note: 'F4', steps: hits(16, [0, 6, 10], 88) },
      { instrument: 'electricPiano', note: 'A4', steps: hits(16, [0, 6, 10], 88) },
      { instrument: 'electricPiano', note: 'C5', steps: hits(16, [0, 6, 10], 85) },
    ],
  },
  {
    id: 'chord-synthwave',
    name: 'Synthwave Pad',
    category: 'chords',
    genre: 'edm',
    bpm: 100,
    key: 'Cm',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'pad', note: 'C3', steps: hits(16, [0], 95) },
      { instrument: 'pad', note: 'D#3', steps: hits(16, [0], 90) },
      { instrument: 'pad', note: 'G3', steps: hits(16, [0], 90) },
    ],
  },
]

// — MELODY / LEAD —
const melody: LoopDef[] = [
  {
    id: 'melody-chillhop',
    name: 'Chillhop Melody',
    category: 'melody',
    genre: 'lofi',
    bpm: 75,
    key: 'Am',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'piano', note: 'A4', steps: hits(16, [0, 8], 95) },
      { instrument: 'piano', note: 'C5', steps: hits(16, [4], 90) },
      { instrument: 'piano', note: 'E5', steps: hits(16, [10, 12], 90) },
      { instrument: 'piano', note: 'D5', steps: hits(16, [14], 88) },
    ],
  },
  {
    id: 'melody-trance',
    name: 'Trance Lead',
    category: 'melody',
    genre: 'edm',
    bpm: 138,
    key: 'Am',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'lead', note: 'A4', steps: hits(16, [0, 4], 100) },
      { instrument: 'lead', note: 'C5', steps: hits(16, [2, 6], 95) },
      { instrument: 'lead', note: 'E5', steps: hits(16, [8, 10], 100) },
      { instrument: 'lead', note: 'D5', steps: hits(16, [12, 14], 95) },
    ],
  },
  {
    id: 'melody-pop-hook',
    name: 'Pop Hook',
    category: 'melody',
    genre: 'pop',
    bpm: 110,
    key: 'C',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'lead', note: 'C5', steps: hits(16, [0], 95) },
      { instrument: 'lead', note: 'E5', steps: hits(16, [2], 95) },
      { instrument: 'lead', note: 'G5', steps: hits(16, [4, 8], 100) },
      { instrument: 'lead', note: 'F5', steps: hits(16, [6], 95) },
      { instrument: 'lead', note: 'E5', steps: hits(16, [10], 95) },
      { instrument: 'lead', note: 'D5', steps: hits(16, [12], 95) },
      { instrument: 'lead', note: 'C5', steps: hits(16, [14], 95) },
    ],
  },
  {
    id: 'melody-phrygian',
    name: 'Phrygian Mystery',
    category: 'melody',
    genre: 'rock',
    bpm: 90,
    key: 'Em',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'organ', note: 'E4', steps: hits(16, [0], 100) },
      { instrument: 'organ', note: 'F4', steps: hits(16, [2], 95) },
      { instrument: 'organ', note: 'G4', steps: hits(16, [4], 95) },
      { instrument: 'organ', note: 'B4', steps: hits(16, [6, 8], 100) },
      { instrument: 'organ', note: 'A4', steps: hits(16, [10], 95) },
      { instrument: 'organ', note: 'G4', steps: hits(16, [12, 14], 95) },
    ],
  },
  {
    id: 'melody-pentatonic-riff',
    name: 'Pentatonic Riff',
    category: 'melody',
    genre: 'rock',
    bpm: 120,
    key: 'Am',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'guitar', note: 'A3', steps: hits(16, [0, 8], 105) },
      { instrument: 'guitar', note: 'C4', steps: hits(16, [2, 10], 100) },
      { instrument: 'guitar', note: 'D4', steps: hits(16, [4], 100) },
      { instrument: 'guitar', note: 'E4', steps: hits(16, [6, 12], 105) },
      { instrument: 'guitar', note: 'G4', steps: hits(16, [14], 100) },
    ],
  },
]

// — FX / ONE-SHOTS —
const fx: LoopDef[] = [
  {
    id: 'fx-glitch-burst',
    name: 'Glitch Burst',
    category: 'fx',
    genre: 'edm',
    bpm: 120,
    key: '—',
    bars: 1,
    stepCount: 16,
    tracks: [
      { instrument: 'glitch', note: 'C4', steps: hits(16, [0, 4, 6, 12, 14], 110) },
    ],
  },
  {
    id: 'fx-hihat-roll',
    name: 'Hi-Hat Roll',
    category: 'fx',
    genre: 'trap',
    bpm: 140,
    key: '—',
    bars: 1,
    stepCount: 32,
    tracks: [
      { instrument: 'drums', note: 'hihat', steps: hits(32, Array.from({ length: 32 }, (_, i) => i), 75) },
    ],
  },
]

export const LOOP_LIBRARY: LoopDef[] = [
  ...drums,
  ...bass,
  ...chords,
  ...melody,
  ...fx,
]

export const LOOP_GENRES: LoopGenre[] = [
  'hip-hop', 'lofi', 'trap', 'house', 'edm', 'jazz', 'rock', 'rnb', 'pop', 'ambient',
]

export const LOOP_CATEGORIES: LoopCategory[] = [
  'drums', 'bass', 'chords', 'melody', 'fx',
]
