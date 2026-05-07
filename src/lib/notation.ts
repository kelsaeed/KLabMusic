export type Notation = 'solfege' | 'letters'

const SOLFEGE: Record<string, string> = {
  C: 'Do',
  D: 'Re',
  E: 'Mi',
  F: 'Fa',
  G: 'Sol',
  A: 'La',
  B: 'Si',
}

export function formatNote(note: string, notation: Notation): string {
  const m = /^([A-G])(#|b)?(-?\d+)?$/.exec(note)
  if (!m) return note
  const letter = m[1]
  const accidental = m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : ''
  const octave = m[3] ?? ''
  if (notation === 'solfege') {
    return `${SOLFEGE[letter]}${accidental}${octave}`
  }
  return `${letter}${accidental}${octave}`
}

export function formatChord(chord: string, notation: Notation): string {
  const m = /^([A-G])(#|b)?(.*)$/.exec(chord)
  if (!m) return chord
  const letter = m[1]
  const accidental = m[2] === '#' ? '♯' : m[2] === 'b' ? '♭' : ''
  const suffix = m[3] || ''
  if (notation === 'solfege') {
    return `${SOLFEGE[letter]}${accidental}${suffix}`
  }
  return `${letter}${accidental}${suffix}`
}
