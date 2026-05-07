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
