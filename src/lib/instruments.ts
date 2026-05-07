import type { InstrumentId, InstrumentMeta, EffectId } from './types'

export const INSTRUMENTS: Record<InstrumentId, InstrumentMeta> = {
  piano: {
    id: 'piano',
    category: 'sampled',
    playMode: 'note',
    icon: '🎹',
    available: true,
  },
  electricPiano: {
    id: 'electricPiano',
    category: 'synth',
    playMode: 'note',
    icon: '🎼',
    available: true,
  },
  guitar: {
    id: 'guitar',
    category: 'synth',
    playMode: 'note',
    icon: '🎸',
    available: true,
  },
  bass: {
    id: 'bass',
    category: 'synth',
    playMode: 'note',
    icon: '🎚️',
    available: true,
  },
  pad: {
    id: 'pad',
    category: 'synth',
    playMode: 'note',
    icon: '🌫️',
    available: true,
  },
  lead: {
    id: 'lead',
    category: 'synth',
    playMode: 'note',
    icon: '⚡',
    available: true,
  },
  organ: {
    id: 'organ',
    category: 'synth',
    playMode: 'note',
    icon: '⛪',
    available: true,
  },
  drums: {
    id: 'drums',
    category: 'percussion',
    playMode: 'sample',
    icon: '🥁',
    available: true,
    samples: ['kick', 'snare', 'hihat', 'hihatO', 'clap', 'tom', 'ride'],
  },
  glitch: {
    id: 'glitch',
    category: 'fx',
    playMode: 'note',
    icon: '🌀',
    available: true,
  },
  meme: {
    id: 'meme',
    category: 'fx',
    playMode: 'sample',
    icon: '📣',
    available: false,
    samples: ['airhorn', 'bruh', 'vine', 'trombone', 'windows', 'oof'],
  },
}

export const INSTRUMENT_ORDER: readonly InstrumentId[] = [
  'piano',
  'electricPiano',
  'guitar',
  'bass',
  'pad',
  'lead',
  'organ',
  'drums',
  'glitch',
  'meme',
]

export const EFFECT_ORDER: readonly EffectId[] = [
  'reverb',
  'delay',
  'distortion',
  'chorus',
  'filter',
  'bitcrusher',
  'compressor',
]

export const DEFAULT_TEST_NOTES = [
  'C4',
  'D4',
  'E4',
  'F4',
  'G4',
  'A4',
  'B4',
  'C5',
] as const

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

function noteRange(lowOctave: number, highOctave: number): string[] {
  const out: string[] = []
  for (let o = lowOctave; o <= highOctave; o++) {
    for (const n of CHROMATIC) out.push(`${n}${o}`)
  }
  return out
}

const NOTE_RANGES: Record<InstrumentId, readonly string[]> = {
  piano: noteRange(2, 6),
  electricPiano: noteRange(3, 5),
  guitar: noteRange(2, 5),
  bass: noteRange(1, 3),
  pad: noteRange(2, 5),
  lead: noteRange(4, 6),
  organ: noteRange(2, 5),
  drums: [],
  glitch: noteRange(3, 5),
  meme: [],
}

export function noteOptionsFor(id: InstrumentId): readonly string[] {
  return NOTE_RANGES[id]
}

export const DEFAULT_NOTE_FOR: Record<InstrumentId, string> = {
  piano: 'C4',
  electricPiano: 'C4',
  guitar: 'E3',
  bass: 'E2',
  pad: 'C3',
  lead: 'C5',
  organ: 'C4',
  drums: 'kick',
  glitch: 'C4',
  meme: 'airhorn',
}
