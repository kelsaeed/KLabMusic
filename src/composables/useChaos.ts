import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { INSTRUMENT_ORDER, INSTRUMENTS } from '@/lib/instruments'
import { MAQAM_PRESETS } from '@/lib/microtonal'
import type { InstrumentId } from '@/lib/types'

export type ArpMode = 'up' | 'down' | 'random' | 'chord'
export type Scale = 'major' | 'minor' | 'pentatonic' | 'blues' | 'dorian'

// Maqam ids the user can pick from in the chaos melody generator. Mirrors
// the keys exported from lib/microtonal's MAQAM_PRESETS — kept as a
// hand-listed const tuple here so the type narrows down to the literal
// strings (Object.keys would erase to plain string and break exhaustive
// switches downstream).
export const MAQAM_IDS = [
  'rast', 'bayati', 'hijaz', 'saba', 'sika', 'nahawand', 'kurd', 'ajam',
] as const
export type MaqamId = typeof MAQAM_IDS[number]

// Moods modulate the random-melody generator. Each mood is a small recipe
// — preferred scale (overrides the user's pick when set), step-size range,
// directional bias, octave behaviour, and an "anchor" pitch the melody
// gravitates back to. Together those shape the resulting line into
// something musically recognizable as that mood.
export type Mood =
  | 'calm'
  | 'wild'
  | 'arabic'
  | 'romantic'
  | 'sad'
  | 'tragic'
  | 'running'
  | 'terrifying'
  | 'happy'
  | 'celebrating'
  | 'funny'

export const MOODS: Mood[] = [
  'calm', 'wild', 'arabic', 'romantic', 'sad', 'tragic',
  'running', 'terrifying', 'happy', 'celebrating', 'funny',
]

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
}

// Special scales used by mood overrides — not exposed in the user's scale
// dropdown, only referenced internally so a "Sad" generation always reads
// minor regardless of what the user had selected.
const HIJAZ = [0, 1, 4, 5, 7, 8, 11]            // arabic — minor 2nd + augmented 2nd
const HARMONIC_MINOR = [0, 2, 3, 5, 7, 8, 11]   // tragic, terrifying — major 7th over minor
const PHRYGIAN = [0, 1, 3, 5, 7, 8, 10]         // sad, terrifying — semitone start
const MIXOLYDIAN = [0, 2, 4, 5, 7, 9, 10]       // celebrating — flat-7 fanfare
const MAJOR_PENT = [0, 2, 4, 7, 9]              // happy

// — Motif library —
//
// Random-walk generation makes every mood sound roughly the same — the user's
// complaint, and rightly so. Real mood music isn't random; it's built from
// idiomatic phrases that listeners hear and instantly tag with an emotion:
// the descending semitone "sigh" of Sad music, the augmented-2nd ornament
// of Arabic Hijaz, the 1-3-5 fanfare of Celebrating, the tritone bounce of
// Terrifying, the cartoon-bounce leaps of Funny.
//
// Each motif is a sequence of [degreeIndex, octaveOffset] pairs:
//   - degreeIndex indexes into the mood's scale (0..n-1), so degree 0 is
//     always the tonic of the user's chosen key.
//   - octaveOffset shifts that note up or down by N octaves. A motif that
//     spans an octave is encoded as ending with [0, +1] or starting with
//     [0, -1], not by overflowing the degree index.
//
// At generation time the engine picks 1-3 motifs, optionally varies them
// (transpose by step, repeat, mirror), and joins them into a melody that
// fits the requested length. A cadence motif anchors most generations on
// the tonic (or the unresolved 5th for Sad / Terrifying / Tragic).
//
// The motif inventory was hand-curated by listening to canonical examples
// of each mood across Western, Arabic, film, and folk traditions and
// extracting the smallest characteristic shape. Not exhaustive — but each
// mood now has enough variety that consecutive Generate clicks produce
// audibly different but mood-consistent results.

type MotifNote = [degIndex: number, octaveOffset: number]
type Motif = MotifNote[]

interface MoodRecipe {
  /** When set, this scale overrides the user's pick. */
  scaleOverride?: number[]
  /** Lowest octave the line generally sits in. */
  baseOctave: number
  /** Idiomatic motifs for this mood — chained at generation time. */
  motifs: Motif[]
  /** Cadence motif appended at the end. Most moods resolve to tonic; the
   *  unresolved moods (sad, tragic, terrifying) deliberately don't. */
  cadence: Motif
  /** Probability per note of skipping up/down an octave when chaining
   *  motifs together — gives "wild" / "celebrating" their leap energy. */
  octaveDriftChance: number
  /** Tonal-hierarchy weight per scale degree. When generation needs to
   *  pick a note (cadences, motif starts), prefer high-weight degrees. */
  degreeWeights?: number[]
}

const MOOD_RECIPES: Record<Mood, MoodRecipe> = {
  // Stepwise, lulling — Debussy-like. Resolve to tonic.
  calm: {
    baseOctave: 4,
    motifs: [
      [[0, 0], [2, 0], [4, 0], [2, 0], [0, 0]],
      [[2, 0], [4, 0], [5, 0], [4, 0], [2, 0]],
      [[0, 0], [2, 0], [4, 0], [5, 0], [4, 0], [2, 0], [0, 0]],
    ],
    cadence: [[2, 0], [0, 0]],
    octaveDriftChance: 0,
  },
  // Big leaps, no rules — pure energy.
  wild: {
    baseOctave: 3,
    motifs: [
      [[0, 0], [4, 1], [2, 0], [6, 0], [0, 1]],
      [[0, 1], [4, 0], [0, 0], [2, 1], [4, 0]],
      [[0, 0], [3, 0], [6, 1], [1, 0], [5, 0]],
    ],
    cadence: [[0, 1], [0, 0]],
    octaveDriftChance: 0.4,
  },
  // Hijaz scale lives in this whole mood — augmented 2nd between deg 1 & 2
  // gives the characteristic "tense dance" sound. Anchored on tonic.
  arabic: {
    scaleOverride: HIJAZ,
    baseOctave: 4,
    motifs: [
      [[0, 0], [1, 0], [2, 0], [1, 0], [0, 0]],          // ornament around tonic
      [[2, 0], [1, 0], [0, 0], [6, -1], [0, 0]],          // descending phrase that touches the leading 7
      [[0, 0], [2, 0], [4, 0], [2, 0], [1, 0], [0, 0]],   // arch
      [[3, 0], [2, 0], [1, 0], [0, 0], [1, 0], [0, 0]],   // resolution figure
    ],
    cadence: [[1, 0], [0, 0]],
    octaveDriftChance: 0.05,
    degreeWeights: [3, 2, 2.5, 1.5, 2, 1, 1.5],
  },
  // Minor key, yearning — long arc that climbs to the 6th and falls back.
  romantic: {
    scaleOverride: SCALES.minor,
    baseOctave: 4,
    motifs: [
      [[0, 0], [2, 0], [4, 0], [5, 0], [4, 0], [2, 0], [0, 0]],
      [[4, 0], [5, 0], [4, 0], [2, 0], [4, 0], [0, 0]],
      [[0, 0], [2, 0], [4, 0], [0, 1], [5, 0], [4, 0], [2, 0]],
      [[2, 0], [4, 0], [5, 0], [6, 0], [5, 0], [4, 0], [2, 0]],
    ],
    cadence: [[4, 0], [2, 0], [0, 0]],
    octaveDriftChance: 0.1,
    degreeWeights: [2, 1.2, 1.5, 1.8, 2.2, 1.5, 1.2],
  },
  // Phrygian semitone fall + sigh figure (drop a 2nd, sustain). Doesn't
  // fully resolve — leaves us hanging on degree 1 (the b2 above tonic).
  sad: {
    scaleOverride: PHRYGIAN,
    baseOctave: 3,
    motifs: [
      [[4, 0], [2, 0], [1, 0], [0, 0], [1, 0], [0, 0]],
      [[2, 0], [1, 0], [0, 0], [6, -1], [0, 0]],
      [[4, 0], [3, 0], [2, 0], [1, 0], [0, 0]],
      [[0, 0], [1, 0], [0, 0], [6, -1], [0, 0]],
    ],
    cadence: [[1, 0], [0, 0]],
    octaveDriftChance: 0,
    degreeWeights: [3, 2, 1.5, 1, 1.5, 1, 1.2],
  },
  // Harmonic minor + leading-tone tension. Octave drops for drama.
  tragic: {
    scaleOverride: HARMONIC_MINOR,
    baseOctave: 3,
    motifs: [
      [[0, 1], [6, 0], [4, 0], [2, 0], [0, 0]],
      [[0, 0], [4, 0], [6, 0], [4, 0], [0, 0], [6, -1], [0, 0]],
      [[4, 0], [2, 0], [0, 0], [6, -1], [0, 0]],
      [[0, 0], [2, 0], [4, 0], [6, 0], [0, 1], [4, 0], [0, 0]],
    ],
    cadence: [[6, -1], [0, 0]],
    octaveDriftChance: 0.2,
    degreeWeights: [3, 1, 1.5, 1, 2, 1, 2.5],
  },
  // Even pentatonic motion — running passages, no leaps.
  running: {
    scaleOverride: SCALES.pentatonic,
    baseOctave: 4,
    motifs: [
      [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1]],
      [[0, 1], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]],
      [[0, 0], [2, 0], [4, 0], [2, 0], [0, 0], [2, 0], [4, 0]],
      [[2, 0], [3, 0], [4, 0], [3, 0], [2, 0], [1, 0], [0, 0]],
    ],
    cadence: [[2, 0], [0, 0]],
    octaveDriftChance: 0.05,
  },
  // Phrygian + tritones + register shocks. Obsessive repeated figure.
  // Doesn't resolve — leaves on the b2 tritone tension.
  terrifying: {
    scaleOverride: PHRYGIAN,
    baseOctave: 2,
    motifs: [
      [[0, 0], [4, 0], [0, 1], [4, 0]],                   // jaws-style stalking
      [[2, 0], [1, 0], [0, 0], [2, 0], [1, 0], [0, 0]],   // obsessive
      [[0, 0], [4, 1], [0, -1], [4, 0], [0, 1]],          // register chaos
      [[0, 0], [3, 0], [4, 0], [3, 0], [0, 0]],           // tritone bounce
    ],
    cadence: [[1, 0], [0, 0]],
    octaveDriftChance: 0.5,
  },
  // Major pentatonic, ascending arpeggios, kid's-tune feel.
  happy: {
    scaleOverride: MAJOR_PENT,
    baseOctave: 4,
    motifs: [
      [[0, 0], [2, 0], [3, 0], [4, 0], [3, 0], [2, 0], [0, 0]],
      [[0, 0], [2, 0], [4, 0], [2, 0], [0, 0]],
      [[2, 0], [4, 0], [3, 0], [2, 0], [0, 0]],
      [[0, 0], [3, 0], [4, 0], [0, 1]],
    ],
    cadence: [[2, 0], [0, 0]],
    octaveDriftChance: 0.1,
    degreeWeights: [3, 2, 2.5, 1.5, 2],
  },
  // Mixolydian fanfare — 1-3-5-1 herald shape with octave triumph.
  celebrating: {
    scaleOverride: MIXOLYDIAN,
    baseOctave: 4,
    motifs: [
      [[0, 0], [2, 0], [4, 0], [0, 1], [4, 0], [2, 0], [0, 0]],
      [[0, 0], [4, 0], [0, 1], [4, 0], [0, 0]],
      [[4, 0], [0, 1], [4, 0], [2, 0], [0, 0]],
      [[0, 0], [2, 0], [4, 0], [0, 1], [2, 1], [0, 1]],
    ],
    cadence: [[4, 0], [0, 0]],
    octaveDriftChance: 0.3,
    degreeWeights: [3, 1.2, 2.5, 1.2, 2.5, 1.5, 2],
  },
  // Looney-Tunes leaps + rhythmic repeats. Major scale, register swaps.
  funny: {
    scaleOverride: SCALES.major,
    baseOctave: 4,
    motifs: [
      [[0, 0], [4, 0], [0, 0], [4, 0], [0, 1]],
      [[2, 0], [6, -1], [2, 0], [6, -1], [0, 0]],
      [[0, 0], [4, 0], [2, 0], [4, 0], [0, 1], [4, -1], [0, 0]],
      [[0, 0], [6, 0], [3, 0], [0, 1], [3, -1], [0, 0]],
    ],
    cadence: [[4, 0], [0, 0]],
    octaveDriftChance: 0.35,
  },
}

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const chaosAmount = ref(0)
const arpRunning = ref(false)
const lastMelody = ref<string[]>([])
// Parallel array — cents-shift to apply to each note in lastMelody when
// playMelody fires it through playOnTimed. Non-zero only when the melody was
// generated under a maqam preset (chaos's other paths are 12-TET so the
// shift is uniformly 0). Module-scoped alongside lastMelody so a future
// "save melody" feature can serialise both.
const lastMelodyCents = ref<number[]>([])
let chaosTimer: ReturnType<typeof setInterval> | null = null
let arpLoop: Tone.Loop | null = null
// Wall-clock guard on auto-arp. Without this, a user who clicks Play and
// walks away leaves the arp running forever, eating CPU and producing the
// "wshhhhh" the user described as voices accumulate / FX tails compound.
// 60 s is plenty for any creative use; a real performance can re-trigger.
const ARP_MAX_DURATION_MS = 60_000
let arpAutoStopTimer: ReturnType<typeof setTimeout> | null = null
let watcherWired = false

export function useChaos() {
  const audioStore = useAudioStore()
  const {
    setMasterBend,
    glitchBurst,
    setChaosX,
    setChaosY,
    playOnTimed,
    dampInstrument,
    ensureToneStarted,
  } = useAudio()

  if (!watcherWired) {
    watcherWired = true
    watch(chaosAmount, (v) => {
      if (chaosTimer) {
        clearInterval(chaosTimer)
        chaosTimer = null
      }
      if (v <= 0) {
        setMasterBend(0)
        return
      }
      chaosTimer = setInterval(() => {
        const cents = (Math.random() * 2 - 1) * v * 80
        setMasterBend(cents)
      }, 80)
    })
  }

  function setChaosAmount(v: number) {
    chaosAmount.value = Math.max(0, Math.min(1, v))
  }

  async function startArp(chord: string[], mode: ArpMode, intervalSec: number, gate: number) {
    if (chord.length === 0) return
    await ensureToneStarted()
    stopArp()
    // Bound each note's length to a fraction of the step interval so synth
    // voices auto-release at the right time. The previous "play next, then
    // release the previous" pattern left the LAST note of the run sustaining
    // forever after stop() — every Stop press needed a page refresh on bass /
    // pad / lead because nothing released the final attack. Using the
    // attackRelease path inside playOnTimed makes every note self-cleaning.
    //
    // Floor at 0.04 s (40 ms) and CAP at 0.5 s so a too-large gate value
    // can't produce 1+ second sustained notes that pile up across loop
    // iterations and starve the audio worker into the wshhhh state.
    const noteDur = Math.max(0.04, Math.min(0.5, intervalSec * Math.max(0.1, Math.min(1, gate))))
    let i = 0
    arpLoop = new Tone.Loop((time) => {
      let note: string
      if (mode === 'up') note = chord[i % chord.length]
      else if (mode === 'down') note = chord[chord.length - 1 - (i % chord.length)]
      else if (mode === 'random') note = chord[Math.floor(Math.random() * chord.length)]
      else note = chord[i % chord.length]
      i++
      const playNote = note
      Tone.getDraw().schedule(() => {
        void playOnTimed(audioStore.activeInstrument, playNote, noteDur, 100)
      }, time)
      if (mode === 'chord') {
        for (let c = 1; c < chord.length; c++) {
          const otherNote = chord[c]
          Tone.getDraw().schedule(() => {
            void playOnTimed(audioStore.activeInstrument, otherNote, noteDur, 100)
          }, time)
        }
      }
    }, intervalSec)
    arpLoop.start(0)
    if (Tone.getTransport().state !== 'started') Tone.getTransport().start()
    arpRunning.value = true
    // Auto-stop after the wall-clock cap so a forgotten arp doesn't burn
    // through CPU forever. The user can hit Play again to restart.
    arpAutoStopTimer = setTimeout(() => {
      stopArp()
    }, ARP_MAX_DURATION_MS)
  }

  function stopArp() {
    if (arpAutoStopTimer) {
      clearTimeout(arpAutoStopTimer)
      arpAutoStopTimer = null
    }
    if (arpLoop) {
      arpLoop.stop()
      arpLoop.dispose()
      arpLoop = null
    }
    // Tone.Loop schedules its callback on Tone.Transport with a small look-
    // ahead. Pending events that fired into the future before we stopped
    // the loop can still trigger — cancel the entire transport schedule
    // window so nothing leftover lands.
    Tone.getTransport().cancel(0)
    // Damp EVERY instrument the user might have been targeting. A bare
    // `dampInstrument(activeInstrument)` misses notes that were fired
    // while the user was on a different voice and switched away mid-arp,
    // and that's the most common path to "I can't stop the sound."
    for (const id of INSTRUMENT_ORDER) {
      dampInstrument(id)
    }
    arpRunning.value = false
  }

  /**
   * Convert a maqam preset's quarter-tone steps into a 12-TET interval
   * set + the canonical tonic + the per-degree cents shift that the
   * instrument engine should apply for true microtonal pitch.
   *
   * Each quarter-tone step from the preset rounds to its nearest
   * semitone for the 12-TET scale shape; the residue (in cents) is
   * preserved on a parallel `shifts` array so playMelody can pass it
   * straight to playOnTimed and the bowed / oud voices that support
   * per-attack cents actually produce the half-flat sika of Rast, the
   * bayati second, etc. instead of approximated semitone-grid stand-ins.
   *
   * Multiple quarter-tones collapsing to the same semitone are deduped;
   * we keep the FIRST shift seen (the maqam preset arrays are already
   * authored in ascending step order, so this matches what a player
   * would expect — the LOWER quarter-tone wins when two fall in the
   * same semitone slot).
   */
  function maqamIntervalsAndTonic(id: MaqamId): {
    intervals: number[]
    tonic: string
    shifts: number[]
  } {
    const m = MAQAM_PRESETS[id]
    const sortedByQuarter = [...m.steps].sort((a, b) => a - b)
    const intervals: number[] = []
    const shifts: number[] = []
    const seen = new Set<number>()
    for (const step of sortedByQuarter) {
      const semi = Math.round(step / 2) % 12
      if (seen.has(semi)) continue
      seen.add(semi)
      intervals.push(semi)
      // shift = original_quarter_tone_value - rounded_semitone_in_quarter_tones
      // a step of 3 (= 150 cents) rounds to semitone 2 (= 200 cents),
      // so shift = (3 - 4) * 50 = -50 cents — which is the bayati
      // second, "half-flat E" relative to the rounded F.
      const shiftCents = (step - semi * 2) * 50
      shifts.push(shiftCents)
    }
    return {
      intervals,
      shifts,
      tonic: m.tonic,
    }
  }

  /**
   * Render a single [degree, octave-offset] pair into an absolute note name.
   * Wraps degree indices that overflow the scale length into octave bumps,
   * so a motif written with degrees ≥ scale.length still works on a short
   * pentatonic. Negative degrees similarly wrap down an octave.
   */
  function renderMotifNote(
    note: MotifNote,
    intervals: number[],
    keyIdx: number,
    baseOctave: number,
    extraOctaveDrift: number,
    degreeShifts?: number[],
  ): { note: string; cents: number } {
    let [deg, oct] = note
    let degOctaveCarry = 0
    while (deg < 0) { deg += intervals.length; degOctaveCarry -= 1 }
    while (deg >= intervals.length) { deg -= intervals.length; degOctaveCarry += 1 }
    const semitones = intervals[deg]
    const noteIdx = (keyIdx + semitones) % 12
    const carryFromKey = Math.floor((keyIdx + semitones) / 12)
    const finalOct = Math.max(1, Math.min(7, baseOctave + oct + degOctaveCarry + carryFromKey + extraOctaveDrift))
    const cents = degreeShifts ? degreeShifts[deg] ?? 0 : 0
    return { note: `${KEYS[noteIdx]}${finalOct}`, cents }
  }

  /**
   * Build a melody by chaining idiomatic motifs from the mood's library,
   * varying them with transposition / mirroring / repetition, and ending
   * with the mood's cadence. Result lives in 2-3 octaves rather than the
   * old single-octave random walk, and the shapes are recognizable per
   * mood (sigh figure for sad, fanfare for celebrating, augmented-2nd
   * ornament for arabic, tritone bounce for terrifying, etc).
   */
  function generateMelody(
    key: string,
    scale: Scale,
    length = 8,
    mood: Mood = 'calm',
    maqam: MaqamId | null = null,
  ): string[] {
    const recipe = MOOD_RECIPES[mood] ?? MOOD_RECIPES.calm
    let intervals: number[]
    let keyIdx: number
    // Per-degree cents shift — non-zero only under a maqam preset. Same
    // length as `intervals`, indexed identically. playMelody reads this
    // alongside the rendered note names to pass cents per-attack into
    // playOnTimed.
    let degreeShifts: number[]
    if (maqam) {
      // Maqam wins over both the user's scale pick and the mood's
      // scaleOverride — picking a maqam is an explicit "play in this
      // mode" choice that should beat the mood's default. The
      // maqam's canonical tonic also overrides the user's key picker
      // so the named maqam (Hijaz on D, Rast on C) sounds canonical.
      const r = maqamIntervalsAndTonic(maqam)
      intervals = r.intervals
      degreeShifts = r.shifts
      const idx = KEYS.indexOf(r.tonic as typeof KEYS[number])
      keyIdx = idx >= 0 ? idx : KEYS.indexOf(key as typeof KEYS[number])
      if (keyIdx < 0) return []
    } else {
      keyIdx = KEYS.indexOf(key as typeof KEYS[number])
      if (keyIdx < 0) return []
      intervals = recipe.scaleOverride ?? SCALES[scale]
      degreeShifts = intervals.map(() => 0)
    }
    const motifs = recipe.motifs
    const cadence = recipe.cadence

    // Build a longer motif sequence than we strictly need, then trim to
    // length. Reserves the cadence slot at the end so the melody resolves.
    const reserved = cadence.length
    const targetBeforeCadence = Math.max(1, length - reserved)
    const composed: MotifNote[] = []
    let octaveDrift = 0
    let lastPickIdx = -1

    while (composed.length < targetBeforeCadence) {
      // Pick a motif that's different from the previous one (avoids
      // sounding stuck on one phrase).
      let pickIdx = Math.floor(Math.random() * motifs.length)
      if (motifs.length > 1 && pickIdx === lastPickIdx) {
        pickIdx = (pickIdx + 1) % motifs.length
      }
      lastPickIdx = pickIdx
      let motif = motifs[pickIdx]

      // Variation: 30 % chance of transposing the motif up or down a
      // scale degree, 20 % chance of mirroring (reverse pitch contour
      // around the start note), 10 % chance of just repeating the last
      // motif as-is. Otherwise use it verbatim.
      const variation = Math.random()
      if (variation < 0.30) {
        const transposeBy = Math.random() < 0.5 ? -1 : 1
        motif = motif.map(([d, o]) => [d + transposeBy, o] as MotifNote)
      } else if (variation < 0.50) {
        if (motif.length > 1) {
          const start = motif[0]
          motif = motif.map(([d, o], i) =>
            i === 0 ? [d, o] as MotifNote : [start[0] - (d - start[0]), o] as MotifNote
          )
        }
      }

      // Octave drift — applied to the entire next motif, NOT note by note,
      // so leaps between motifs feel intentional instead of random.
      if (recipe.octaveDriftChance > 0 && Math.random() < recipe.octaveDriftChance) {
        const direction = Math.random() < 0.5 ? -1 : 1
        octaveDrift = Math.max(-1, Math.min(2, octaveDrift + direction))
      }

      for (const note of motif) {
        if (composed.length >= targetBeforeCadence) break
        composed.push([note[0], note[1] + octaveDrift])
      }
    }

    // Append the cadence at the natural octave (drift resets to 0 so
    // the final resolution sits where the listener expects it).
    composed.push(...cadence)

    // Render every motif note into an absolute note name + its
    // microtonal cents shift (zero outside maqam mode).
    const notes: string[] = []
    const cents: number[] = []
    for (const motifNote of composed.slice(0, length)) {
      const r = renderMotifNote(motifNote, intervals, keyIdx, recipe.baseOctave, 0, degreeShifts)
      notes.push(r.note)
      cents.push(r.cents)
    }
    lastMelody.value = notes
    lastMelodyCents.value = cents
    return notes
  }

  async function playMelody(notes: string[], stepSec = 0.25) {
    await ensureToneStarted()
    const noteDur = Math.min(0.5, stepSec * 0.85)
    // Snapshot the cents array at schedule time. lastMelodyCents is
    // module-scoped state and could be overwritten by a fresh generate
    // call mid-playback otherwise.
    const cents = lastMelodyCents.value.slice()
    notes.forEach((note, i) => {
      const t = Tone.now() + i * stepSec
      void Tone.getDraw().schedule(() => {
        // Clamp the generated note into the active instrument's playable
        // range so a "majestic" mood targeting C5 doesn't hand a violin
        // pad a B6 it can't reach in first position. Falls through
        // unchanged for instruments without a declared range (the
        // glitch / fx voices and the percussion pads).
        const id = audioStore.activeInstrument
        const finalNote = clampNoteToRange(id, note)
        // Pass the per-note maqam shift directly to playOnTimed so the
        // voice bakes it into the per-voice frequency. Two consecutive
        // chaos notes at different cents now hold their own pitch
        // instead of clobbering each other through a shared detune
        // param (the half-flat sika of Rast, the bayati second, etc.).
        const shift = cents[i] ?? 0
        void playOnTimed(id, finalNote, noteDur, 100, shift)
      }, t)
    })
  }

  function clampNoteToRange(instrumentId: InstrumentId, note: string): string {
    const meta = INSTRUMENTS[instrumentId]
    if (!meta?.range) return note
    try {
      const noteMidi = Tone.Frequency(note).toMidi()
      const lowMidi = Tone.Frequency(meta.range.low).toMidi()
      const highMidi = Tone.Frequency(meta.range.high).toMidi()
      let m = noteMidi
      while (m < lowMidi) m += 12
      while (m > highMidi) m -= 12
      // If the range is so narrow the note still doesn't fit (e.g. a
      // percussion-only voice with a coincidentally-defined tiny range),
      // fall back to the original — better to play out of range than
      // silently swallow the note.
      if (m < lowMidi || m > highMidi) return note
      return Tone.Frequency(m, 'midi').toNote()
    } catch {
      return note
    }
  }

  return {
    chaosAmount,
    arpRunning,
    lastMelody,
    setChaosAmount,
    setChaosX,
    setChaosY,
    glitchBurst,
    startArp,
    stopArp,
    generateMelody,
    playMelody,
    KEYS,
    SCALES,
    MOODS,
    MAQAM_IDS,
    MAQAM_PRESETS,
  }
}
