import { ref, watch } from 'vue'
import * as Tone from 'tone'

// Standalone metronome — independent of the beat-maker so a user can
// run a click track while the beat-maker is stopped, or pre-record a
// take with count-in before the beat-maker even starts.
//
// The classic Western 4/4 / 3/4 / 6/8 are joined by three Arabic
// signatures the project's maqam focus needs:
//   7/8 Sama'i Thaqil — 3 + 2 + 2 grouping (slow Sama'i form)
//   10/8 Sama'i Aksak — 3 + 2 + 2 + 3 grouping (fast Sama'i)
//   5/8 Aksak         — 3 + 2 grouping (Turkish/folk, also Tito Puente)
//
// Each signature carries a `groups` array so the click pattern can
// accent the START of each group (not just beat 1) — that's how an
// Arabic 10/8 actually feels in practice. Beat 1 gets the accented
// click, group starts get a softer accent, the rest are plain.

export interface TimeSignature {
  id: string
  beats: number
  /** Beat-grouping for accenting. Sum must equal `beats`. */
  groups: readonly number[]
  label: string
}

export const TIME_SIGNATURES: readonly TimeSignature[] = [
  { id: '4-4',  beats: 4,  groups: [4],            label: '4/4' },
  { id: '3-4',  beats: 3,  groups: [3],            label: '3/4 Waltz' },
  { id: '6-8',  beats: 6,  groups: [3, 3],         label: '6/8' },
  { id: '5-8',  beats: 5,  groups: [3, 2],         label: '5/8 Aksak' },
  { id: '7-8',  beats: 7,  groups: [3, 2, 2],      label: '7/8 Sama’i Thaqil' },
  { id: '9-8',  beats: 9,  groups: [2, 2, 2, 3],   label: '9/8' },
  { id: '10-8', beats: 10, groups: [3, 2, 2, 3],   label: '10/8 Sama’i Aksak' },
] as const

export type TimeSignatureId = TimeSignature['id']

const bpm = ref(100)
const sigId = ref<TimeSignatureId>('4-4')
const playing = ref(false)
const currentBeat = ref(0)
const volumeDb = ref(-6)
// "Count-in then start the recorder" mode. When true, hitting Play
// counts down a full bar before either firing onCountInComplete or
// looping into normal play. Hooked by the recorder UI when the user
// arms a take.
const countInPending = ref(false)
let onCountInComplete: (() => void) | null = null
let countInRemaining = 0

// Tone nodes are lazy — building them at module init would ping the
// suspended AudioContext and produce the autoplay-warning flood the
// rest of the engine carefully avoids. Defer until the first start().
let click: Tone.MetalSynth | null = null
let accent: Tone.MetalSynth | null = null
let group: Tone.MetalSynth | null = null
let loop: Tone.Loop | null = null
let cursor = 0

function ensureNodes() {
  if (click && accent && group) return
  // Three sound layers — accent is brighter, group is slightly
  // brighter than click but quieter than accent. Players hear the
  // hierarchy without thinking about it.
  click = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.05, release: 0.05 },
    harmonicity: 5.1,
    modulationIndex: 24,
    resonance: 4500,
    octaves: 1,
  }).toDestination()
  click.volume.value = volumeDb.value - 8
  accent = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.07, release: 0.05 },
    harmonicity: 6.5,
    modulationIndex: 26,
    resonance: 6000,
    octaves: 1,
  }).toDestination()
  accent.volume.value = volumeDb.value
  group = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.06, release: 0.05 },
    harmonicity: 5.7,
    modulationIndex: 25,
    resonance: 5000,
    octaves: 1,
  }).toDestination()
  group.volume.value = volumeDb.value - 4
}

function applyVolume() {
  if (!click || !accent || !group) return
  click.volume.rampTo(volumeDb.value - 8, 0.05)
  accent.volume.rampTo(volumeDb.value, 0.05)
  group.volume.rampTo(volumeDb.value - 4, 0.05)
}

function currentSignature(): TimeSignature {
  return TIME_SIGNATURES.find((s) => s.id === sigId.value) ?? TIME_SIGNATURES[0]
}

/**
 * Build a flat array of "what kind of click is each beat" for the
 * current signature. Beat 0 is always 'accent', subsequent group
 * starts are 'group', and the rest are 'click'. Pre-computing this
 * once per signature change avoids per-tick group-position math.
 */
function buildClickPattern(sig: TimeSignature): Array<'accent' | 'group' | 'click'> {
  const out: Array<'accent' | 'group' | 'click'> = []
  let cursor = 0
  for (const groupSize of sig.groups) {
    for (let i = 0; i < groupSize; i++) {
      if (cursor === 0) out.push('accent')
      else if (i === 0) out.push('group')
      else out.push('click')
      cursor++
    }
  }
  return out
}

let cachedPattern: Array<'accent' | 'group' | 'click'> = buildClickPattern(currentSignature())
watch(sigId, () => {
  cachedPattern = buildClickPattern(currentSignature())
  cursor = 0
  currentBeat.value = 0
})
watch(volumeDb, applyVolume)
watch(bpm, (v) => {
  Tone.getTransport().bpm.value = v
})

function fireClick(time: number, kind: 'accent' | 'group' | 'click') {
  // MetalSynth's frequency is set per-trigger via the note arg; we
  // shift up for the accent so the ear immediately reads it as "1."
  if (kind === 'accent') {
    accent!.triggerAttackRelease('C6', '64n', time, 1.0)
  } else if (kind === 'group') {
    group!.triggerAttackRelease('A5', '64n', time, 0.7)
  } else {
    click!.triggerAttackRelease('E5', '64n', time, 0.5)
  }
}

export function useMetronome() {
  async function start(opts: { countIn?: boolean; onAfterCountIn?: () => void } = {}) {
    if (playing.value) return
    if (Tone.getContext().state !== 'running') {
      await Tone.start()
    }
    ensureNodes()
    Tone.getTransport().bpm.value = bpm.value
    cursor = 0
    currentBeat.value = 0
    countInPending.value = opts.countIn === true
    countInRemaining = opts.countIn ? currentSignature().beats : 0
    onCountInComplete = opts.onAfterCountIn ?? null

    if (loop) { loop.stop(); loop.dispose(); loop = null }
    loop = new Tone.Loop((time) => {
      const sig = currentSignature()
      const kind = cachedPattern[cursor % cachedPattern.length]
      fireClick(time, kind)
      // Update the visible beat counter on the next animation frame so
      // the visual flash lines up with the audio click instead of
      // landing a frame ahead of it.
      const beatToShow = cursor % sig.beats
      Tone.getDraw().schedule(() => {
        currentBeat.value = beatToShow
      }, time)
      cursor++
      if (countInPending.value) {
        countInRemaining--
        if (countInRemaining <= 0) {
          countInPending.value = false
          // The callback is invoked synchronously here (we're already
          // inside the Tone scheduler thread). Caller is responsible
          // for any async work — e.g. the recorder kicks off
          // startRecording in a microtask so this thread returns
          // promptly.
          if (onCountInComplete) {
            const cb = onCountInComplete
            onCountInComplete = null
            cb()
          }
        }
      }
    }, '4n')
    loop.start(0)
    if (Tone.getTransport().state !== 'started') Tone.getTransport().start()
    playing.value = true
  }

  function stop() {
    if (loop) { loop.stop(); loop.dispose(); loop = null }
    playing.value = false
    countInPending.value = false
    countInRemaining = 0
    onCountInComplete = null
    cursor = 0
    currentBeat.value = 0
  }

  function setBpm(v: number) {
    bpm.value = Math.max(20, Math.min(300, Math.round(v)))
  }
  function setSignature(id: TimeSignatureId) { sigId.value = id }
  function setVolumeDb(db: number) { volumeDb.value = Math.max(-40, Math.min(0, db)) }

  return {
    bpm,
    sigId,
    playing,
    currentBeat,
    volumeDb,
    countInPending,
    start,
    stop,
    setBpm,
    setSignature,
    setVolumeDb,
    signatures: TIME_SIGNATURES,
    currentSignature,
  }
}
