import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { INSTRUMENT_ORDER } from '@/lib/instruments'

export type ArpMode = 'up' | 'down' | 'random' | 'chord'
export type Scale = 'major' | 'minor' | 'pentatonic' | 'blues' | 'dorian'

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

interface MoodRecipe {
  /** When set, this scale overrides the user's pick. */
  scaleOverride?: number[]
  /** Maximum step size in scale degrees between consecutive notes. */
  jumpRange: number
  /** Bias: -1 trends down, 0 random, +1 trends up. Applied as a small
   *  push to the random walk. */
  directionBias: number
  /** Probability per note of jumping a full octave. 0 = never. */
  octaveLeapChance: number
  /** Lowest octave the line can sit in. */
  baseOctave: number
  /** Highest extra octave to roam through above baseOctave. */
  octaveSpread: number
  /** Probability per note of repeating the previous degree (rhythmic feel). */
  repeatChance: number
  /** Optional bias toward a specific scale degree (the "anchor"). 0..n-1
   *  with `anchorPull` strength. */
  anchorDegree?: number
  anchorPull?: number
}

const MOOD_RECIPES: Record<Mood, MoodRecipe> = {
  calm:        { jumpRange: 2, directionBias: 0,    octaveLeapChance: 0,    baseOctave: 4, octaveSpread: 1, repeatChance: 0.15 },
  wild:        { jumpRange: 5, directionBias: 0,    octaveLeapChance: 0.3,  baseOctave: 3, octaveSpread: 3, repeatChance: 0 },
  arabic:      { scaleOverride: HIJAZ,           jumpRange: 2, directionBias: 0,   octaveLeapChance: 0,    baseOctave: 4, octaveSpread: 1, repeatChance: 0.25, anchorDegree: 0, anchorPull: 0.4 },
  romantic:    { scaleOverride: SCALES.minor,    jumpRange: 3, directionBias: 0.1, octaveLeapChance: 0,    baseOctave: 4, octaveSpread: 1, repeatChance: 0.1,  anchorDegree: 5, anchorPull: 0.25 },
  sad:         { scaleOverride: PHRYGIAN,        jumpRange: 1, directionBias: -0.4, octaveLeapChance: 0,   baseOctave: 3, octaveSpread: 1, repeatChance: 0.3,  anchorDegree: 0, anchorPull: 0.3 },
  tragic:      { scaleOverride: HARMONIC_MINOR,  jumpRange: 4, directionBias: -0.2, octaveLeapChance: 0.15, baseOctave: 3, octaveSpread: 2, repeatChance: 0.05, anchorDegree: 0, anchorPull: 0.2 },
  running:     { scaleOverride: SCALES.pentatonic, jumpRange: 1, directionBias: 0.2, octaveLeapChance: 0,  baseOctave: 4, octaveSpread: 1, repeatChance: 0 },
  terrifying:  { scaleOverride: PHRYGIAN,        jumpRange: 6, directionBias: 0,    octaveLeapChance: 0.4, baseOctave: 2, octaveSpread: 3, repeatChance: 0,    anchorDegree: 1, anchorPull: 0.15 },
  happy:       { scaleOverride: MAJOR_PENT,      jumpRange: 2, directionBias: 0.3,  octaveLeapChance: 0.05, baseOctave: 4, octaveSpread: 1, repeatChance: 0.1,  anchorDegree: 0, anchorPull: 0.2 },
  celebrating: { scaleOverride: MIXOLYDIAN,      jumpRange: 4, directionBias: 0.2,  octaveLeapChance: 0.25, baseOctave: 4, octaveSpread: 2, repeatChance: 0,    anchorDegree: 0, anchorPull: 0.25 },
  funny:       { scaleOverride: SCALES.major,    jumpRange: 5, directionBias: 0,    octaveLeapChance: 0.3, baseOctave: 4, octaveSpread: 2, repeatChance: 0.2 },
}

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const chaosAmount = ref(0)
const arpRunning = ref(false)
const lastMelody = ref<string[]>([])
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
   * Generate a melody under a mood recipe. The melody is a random walk
   * through the chosen scale's degrees, biased by direction + anchor pull,
   * occasionally taking octave leaps based on the mood's flavour.
   */
  function generateMelody(key: string, scale: Scale, length = 8, mood: Mood = 'calm'): string[] {
    const keyIdx = KEYS.indexOf(key as typeof KEYS[number])
    if (keyIdx < 0) return []
    const recipe = MOOD_RECIPES[mood] ?? MOOD_RECIPES.calm
    const intervals = recipe.scaleOverride ?? SCALES[scale]
    const notes: string[] = []
    let lastDeg = Math.floor(intervals.length / 2)
    let octShift = 0
    for (let i = 0; i < length; i++) {
      // Random walk with directional bias. Bias is folded into the random
      // step so positive bias trends up over time without making the line
      // monotone (the random component keeps it musical).
      const random = (Math.random() - 0.5 + recipe.directionBias * 0.5) * 2
      let nextDeg = lastDeg + Math.round(random * recipe.jumpRange)
      // Anchor pull — every few notes nudge back toward the anchor degree.
      if (recipe.anchorDegree !== undefined && recipe.anchorPull && Math.random() < recipe.anchorPull) {
        nextDeg = recipe.anchorDegree
      }
      // Occasional repeat for rhythmic interest.
      if (recipe.repeatChance > 0 && Math.random() < recipe.repeatChance) {
        nextDeg = lastDeg
      }
      const deg = Math.max(0, Math.min(intervals.length - 1, nextDeg))
      lastDeg = deg
      // Octave leaps — flips us up or down by a full octave and the next
      // note resolves from there. Adds drama on tragic/terrifying/funny.
      if (recipe.octaveLeapChance > 0 && Math.random() < recipe.octaveLeapChance) {
        octShift = Math.max(0, Math.min(recipe.octaveSpread, octShift + (Math.random() < 0.5 ? -1 : 1)))
      }
      const semitones = intervals[deg]
      const noteIdx = (keyIdx + semitones) % 12
      const oct = recipe.baseOctave + Math.floor((keyIdx + semitones) / 12) + octShift
      notes.push(`${KEYS[noteIdx]}${oct}`)
    }
    lastMelody.value = notes
    return notes
  }

  async function playMelody(notes: string[], stepSec = 0.25) {
    await ensureToneStarted()
    const noteDur = Math.min(0.5, stepSec * 0.85)
    notes.forEach((note, i) => {
      const t = Tone.now() + i * stepSec
      void Tone.getDraw().schedule(() => {
        void playOnTimed(audioStore.activeInstrument, note, noteDur, 100)
      }, t)
    })
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
  }
}
