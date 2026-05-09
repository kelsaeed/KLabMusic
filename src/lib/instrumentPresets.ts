// Shared chord / string / course presets per instrument. Lifted out of
// the individual pads so any UI that lets the user "pick a chord from
// the guitar" or "use the open strings of the violin" can read the same
// canonical list — no duplication, no chance of one place falling out
// of sync with another.
//
// Each entry is a list of note strings ordered low → high so
// strum-down iterates verbatim and strum-up iterates reversed,
// matching how the GuitarPad already plays them.

export interface ChordPreset {
  /** Stable id used by selectors. */
  id: string
  /** Display label — short, instrument-native (e.g. "Em", "Am"). */
  name: string
  /** Notes from lowest pitch to highest. */
  notes: readonly string[]
}

/**
 * Standard guitar chord cards — the eight first-position chords every
 * beginner learns. Sourced from the GuitarPad's existing chord list so
 * picking one from AutoArp produces the exact same voicing the player
 * would hear hitting that card on the guitar pad.
 */
export const GUITAR_CHORDS: readonly ChordPreset[] = [
  { id: 'guitar-em', name: 'Em', notes: ['E2', 'B2', 'E3', 'G3', 'B3', 'E4'] },
  { id: 'guitar-am', name: 'Am', notes: ['A2', 'E3', 'A3', 'C4', 'E4'] },
  { id: 'guitar-c',  name: 'C',  notes: ['C3', 'E3', 'G3', 'C4', 'E4'] },
  { id: 'guitar-g',  name: 'G',  notes: ['G2', 'B2', 'D3', 'G3', 'B3', 'D4'] },
  { id: 'guitar-d',  name: 'D',  notes: ['D3', 'A3', 'D4', 'F#4'] },
  { id: 'guitar-e',  name: 'E',  notes: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'] },
  { id: 'guitar-a',  name: 'A',  notes: ['A2', 'E3', 'A3', 'C#4', 'E4'] },
  { id: 'guitar-f',  name: 'F',  notes: ['F2', 'C3', 'F3', 'A3', 'C4', 'F4'] },
] as const

/**
 * Open strings for the bowed instruments + oud. Tunings match the
 * pads (low-to-high), so picking "Violin open strings" in AutoArp
 * produces a 4-note chord identical to the violin pad's open
 * fingerboard column.
 */
export const STRING_PRESETS: readonly ChordPreset[] = [
  { id: 'violin-open',   name: 'Violin', notes: ['G3', 'D4', 'A4', 'E5'] },
  { id: 'cello-open',    name: 'Cello',  notes: ['C2', 'G2', 'D3', 'A3'] },
  { id: 'oud-courses',   name: 'Oud',    notes: ['C2', 'F2', 'A2', 'D3', 'G3', 'C4'] },
] as const
