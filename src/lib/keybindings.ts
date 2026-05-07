import type { BindingSet, KeyBinding, BindingActionId } from './types'

const note = (key: string, instrument: KeyBinding['instrument'], n: string): KeyBinding => ({
  key,
  type: 'note',
  instrument,
  note: n,
  velocity: 100,
})

const sample = (key: string, instrument: KeyBinding['instrument'], n: string): KeyBinding => ({
  key,
  type: 'sample',
  instrument,
  note: n,
  velocity: 100,
})

const action = (key: string, id: BindingActionId): KeyBinding => ({
  key,
  type: 'action',
  action: id,
})

export const PRESET_PIANO: BindingSet = {
  id: 'preset-piano',
  name: 'preset.piano',
  isDefault: true,
  bindings: [
    note('a', 'piano', 'C4'),
    note('w', 'piano', 'C#4'),
    note('s', 'piano', 'D4'),
    note('e', 'piano', 'D#4'),
    note('d', 'piano', 'E4'),
    note('f', 'piano', 'F4'),
    note('t', 'piano', 'F#4'),
    note('g', 'piano', 'G4'),
    note('y', 'piano', 'G#4'),
    note('h', 'piano', 'A4'),
    note('u', 'piano', 'A#4'),
    note('j', 'piano', 'B4'),
    note('k', 'piano', 'C5'),
    note('o', 'piano', 'C#5'),
    note('l', 'piano', 'D5'),
    note('p', 'piano', 'D#5'),
    note(';', 'piano', 'E5'),
    action('z', 'octave-down'),
    action('x', 'octave-up'),
    action('shift', 'damp'),
  ],
}

export const PRESET_DRUMS: BindingSet = {
  id: 'preset-drums',
  name: 'preset.drums',
  bindings: [
    sample('q', 'drums', 'kick'),
    sample('w', 'drums', 'snare'),
    sample('e', 'drums', 'hihat'),
    sample('r', 'drums', 'hihatO'),
    sample('a', 'drums', 'clap'),
    sample('s', 'drums', 'tom'),
    sample('d', 'drums', 'ride'),
    action(' ', 'play-stop'),
    action('t', 'tap-bpm'),
  ],
}

export const PRESET_DJ: BindingSet = {
  id: 'preset-dj',
  name: 'preset.dj',
  bindings: [
    note('q', 'lead', 'C4'),
    note('w', 'lead', 'E4'),
    note('e', 'lead', 'G4'),
    note('r', 'lead', 'A4'),
    note('a', 'bass', 'C2'),
    note('s', 'bass', 'F2'),
    note('d', 'bass', 'G2'),
    note('f', 'bass', 'A#2'),
    sample('z', 'drums', 'kick'),
    sample('x', 'drums', 'snare'),
    sample('c', 'drums', 'hihat'),
    sample('v', 'drums', 'clap'),
    action(' ', 'play-stop'),
    action('shift', 'damp'),
  ],
}

export const PRESET_MEME: BindingSet = {
  id: 'preset-meme',
  name: 'preset.meme',
  bindings: [
    sample('1', 'meme', 'airhorn'),
    sample('2', 'meme', 'bruh'),
    sample('3', 'meme', 'vine'),
    sample('4', 'meme', 'trombone'),
    sample('5', 'meme', 'windows'),
    sample('6', 'meme', 'oof'),
  ],
}

export const PRESET_FREE: BindingSet = {
  id: 'preset-free',
  name: 'preset.free',
  bindings: [],
}

export const PRESETS: readonly BindingSet[] = [
  PRESET_PIANO,
  PRESET_DRUMS,
  PRESET_DJ,
  PRESET_MEME,
  PRESET_FREE,
]

export const BINDING_ACTIONS: readonly BindingActionId[] = [
  'damp',
  'damp-instrument',
  'record',
  'play-stop',
  'tap-bpm',
  'loop-toggle',
  'octave-up',
  'octave-down',
]

export const QWERTY_ROWS: readonly (readonly string[])[] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'"],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'],
  [' '],
]

export const RESERVED_KEYS: readonly string[] = ['tab', 'enter', 'escape', 'backspace']

export function normalizeKey(raw: string): string {
  if (raw === ' ') return ' '
  return raw.toLowerCase()
}

export function keyDisplay(key: string): string {
  if (key === ' ') return '␣'
  if (key === 'shift') return '⇧'
  return key.toUpperCase()
}
