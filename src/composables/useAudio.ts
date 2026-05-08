import * as Tone from 'tone'
import { watch } from 'vue'
import { Soundfont, DrumMachine } from 'smplr'
import type { InstrumentId, EffectId } from '@/lib/types'
import { useAudioStore } from '@/stores/audio'
import { INSTRUMENTS, EFFECT_ORDER } from '@/lib/instruments'

interface VoiceAdapter {
  attack: (note: string, velocity: number) => void
  // Beat maker uses this to fire a note with a defined duration so it auto-releases.
  // Sample-based one-shots (drums, glitch noise) ignore the duration since they
  // already auto-decay; synth voices use it to schedule the release.
  attackRelease: (note: string, durationSec: number, velocity: number) => void
  release: (note?: string) => void
  damp: () => void
  output: Tone.ToneAudioNode
  setVolumeDb: (db: number) => void
  setBendCents: (cents: number) => void
  loaded?: Promise<void>
  dispose: () => void
}

interface FxChain {
  reverb: Tone.Reverb
  delay: Tone.FeedbackDelay
  distortion: Tone.Distortion
  chorus: Tone.Chorus
  filter: Tone.Filter
  bitcrusher: Tone.BitCrusher
  compressor: Tone.Compressor
}

// Mastering chain — sits at the end of the master signal path right before
// the analyser nodes and Tone.getDestination. EQ3 gives broad tonal shaping
// (low shelf / mid peak / high shelf), the compressor evens the dynamics,
// and the limiter is a hard ceiling that prevents the master from clipping
// when a preset is loud or punchy. Each MasteringPreset (see below) is a
// pure-data description that we apply to these three nodes — no node
// rebuilding needed when the user switches presets.
interface MasteringChain {
  eq: Tone.EQ3
  compressor: Tone.Compressor
  limiter: Tone.Limiter
  // Pre-makeup gain before the limiter so "Louder" presets actually push the
  // signal into the ceiling instead of merely shaping it.
  makeup: Tone.Volume
}

export type MasteringPresetId =
  | 'off'
  | 'classic'
  | 'soft'
  | 'punchy'
  | 'louder'
  | 'cassette'
  | 'sub-boost'
  | 'podcast'
  | 'cranked'

interface MasteringPresetConfig {
  // EQ gains in dB at low/mid/high bands.
  eq: { low: number; mid: number; high: number }
  // Compressor: threshold (dB), ratio, attack (s), release (s).
  comp: { threshold: number; ratio: number; attack: number; release: number }
  // Limiter ceiling in dB. -0.3 is a transparent peak ceiling.
  limit: number
  // Makeup gain in dB applied before the limiter.
  makeup: number
}

// Each preset is a recipe Soundtrap-style — single click loads a polished
// chain. "off" passes signal through with neutral params so we can keep the
// chain wired permanently without coloring the sound.
export const MASTERING_PRESETS: Record<MasteringPresetId, MasteringPresetConfig> = {
  off: {
    eq: { low: 0, mid: 0, high: 0 },
    comp: { threshold: 0, ratio: 1, attack: 0.01, release: 0.2 },
    limit: 0,
    makeup: 0,
  },
  classic: {
    // Subtle smile EQ, gentle 2:1 comp, polite ceiling. The "default master".
    eq: { low: 1.5, mid: -0.5, high: 1.5 },
    comp: { threshold: -16, ratio: 2, attack: 0.01, release: 0.18 },
    limit: -0.5,
    makeup: 1.5,
  },
  soft: {
    // Warm low end, shaved high, slow comp — for ballads and acoustic mixes.
    eq: { low: 2, mid: 0, high: -2 },
    comp: { threshold: -18, ratio: 1.8, attack: 0.025, release: 0.3 },
    limit: -1,
    makeup: 1,
  },
  punchy: {
    // Mid push, fast comp attack so transients pop, +3 dB makeup.
    eq: { low: 1, mid: 2, high: 1 },
    comp: { threshold: -14, ratio: 3, attack: 0.003, release: 0.12 },
    limit: -0.5,
    makeup: 3,
  },
  louder: {
    // Heavy comp + brick-wall limiter. Trades transient detail for raw level.
    eq: { low: 1, mid: 0, high: 1 },
    comp: { threshold: -20, ratio: 4, attack: 0.005, release: 0.1 },
    limit: -0.3,
    makeup: 6,
  },
  cassette: {
    // Tilt EQ (lift low + roll high), slow comp — analog tape mid-fi colour.
    eq: { low: 3, mid: -1, high: -4 },
    comp: { threshold: -16, ratio: 2.5, attack: 0.02, release: 0.25 },
    limit: -1,
    makeup: 2,
  },
  'sub-boost': {
    // Big low shelf, conservative everywhere else — for trap / phonk masters.
    eq: { low: 5, mid: -1, high: 0 },
    comp: { threshold: -16, ratio: 2.5, attack: 0.01, release: 0.2 },
    limit: -0.5,
    makeup: 2,
  },
  podcast: {
    // Narrow vocal-friendly EQ, heavy comp to even out talk dynamics.
    eq: { low: -2, mid: 3, high: 1 },
    comp: { threshold: -22, ratio: 4, attack: 0.008, release: 0.15 },
    limit: -1,
    makeup: 4,
  },
  cranked: {
    // EDM master: scooped mids, lifted highs, hard squeeze.
    eq: { low: 3, mid: -2, high: 3 },
    comp: { threshold: -18, ratio: 4, attack: 0.004, release: 0.12 },
    limit: -0.3,
    makeup: 5,
  },
}

interface InstrumentNode {
  voice: VoiceAdapter
  channelVolume: Tone.Volume
}

const PIANO_BASE = 'https://tonejs.github.io/audio/salamander/'

const PIANO_URLS: Record<string, string> = {
  A0: 'A0.mp3', C1: 'C1.mp3', 'D#1': 'Ds1.mp3', 'F#1': 'Fs1.mp3',
  A1: 'A1.mp3', C2: 'C2.mp3', 'D#2': 'Ds2.mp3', 'F#2': 'Fs2.mp3',
  A2: 'A2.mp3', C3: 'C3.mp3', 'D#3': 'Ds3.mp3', 'F#3': 'Fs3.mp3',
  A3: 'A3.mp3', C4: 'C4.mp3', 'D#4': 'Ds4.mp3', 'F#4': 'Fs4.mp3',
  A4: 'A4.mp3', C5: 'C5.mp3', 'D#5': 'Ds5.mp3', 'F#5': 'Fs5.mp3',
  A5: 'A5.mp3', C6: 'C6.mp3', 'D#6': 'Ds6.mp3', 'F#6': 'Fs6.mp3',
  A6: 'A6.mp3', C7: 'C7.mp3', 'D#7': 'Ds7.mp3', 'F#7': 'Fs7.mp3',
  A7: 'A7.mp3', C8: 'C8.mp3',
}

const nodes = new Map<InstrumentId, InstrumentNode>()
let masterVolume: Tone.Volume | null = null
let chaosFilter: Tone.Filter | null = null
let chaosReverb: Tone.Reverb | null = null
let chaosCrush: Tone.BitCrusher | null = null
let masterAnalyser: Tone.Analyser | null = null
let masterFft: Tone.Analyser | null = null
let globalFx: FxChain | null = null
let mastering: MasteringChain | null = null
let masterReady = false
let toneStarted = false

let firstGesturePromise: Promise<void> | null = null
function waitForFirstGesture(): Promise<void> {
  if (firstGesturePromise) return firstGesturePromise
  firstGesturePromise = new Promise<void>((resolve) => {
    const done = () => {
      document.removeEventListener('pointerdown', done, true)
      document.removeEventListener('keydown', done, true)
      document.removeEventListener('touchstart', done, true)
      resolve()
    }
    document.addEventListener('pointerdown', done, { capture: true, once: true })
    document.addEventListener('keydown', done, { capture: true, once: true })
    document.addEventListener('touchstart', done, { capture: true, once: true })
  })
  return firstGesturePromise
}

function hasUserActivation(): boolean {
  // navigator.userActivation is the spec'd way to check. Available in Chrome
  // 90+, Firefox 99+, Safari 16.4+. Fall back to false on older browsers —
  // they'll just wait for the gesture listener.
  const ua = (navigator as unknown as { userActivation?: { isActive: boolean } }).userActivation
  return ua?.isActive === true
}

async function ensureToneStarted() {
  if (toneStarted && Tone.getContext().state === 'running') return
  // Only call Tone.start() when we actually have user activation. Calling
  // context.resume() without activation is what produces the Chrome
  // "AudioContext was not allowed to start" warning — even when we ignore
  // the result. So if there's no activation, skip straight to waiting.
  if (Tone.getContext().state !== 'running' && hasUserActivation()) {
    try {
      await Tone.start()
    } catch {
      /* swallow */
    }
  }
  if (Tone.getContext().state !== 'running') {
    await waitForFirstGesture()
    await Tone.start()
  }
  toneStarted = true
}

function buildGlobalFx(): FxChain {
  const reverb = new Tone.Reverb({ decay: 1.8, wet: 0 })
  const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.4, wet: 0 })
  const distortion = new Tone.Distortion({ distortion: 0, wet: 0 })
  const chorus = new Tone.Chorus({ frequency: 4, depth: 0.5, wet: 0 })
  const filter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 1 })
  const bitcrusher = new Tone.BitCrusher(16)
  bitcrusher.wet.value = 0
  const compressor = new Tone.Compressor({ threshold: 0, ratio: 4 })
  return { reverb, delay, distortion, chorus, filter, bitcrusher, compressor }
}

function ensureMaster() {
  if (masterReady) return
  // Boot well below audible (-60 dB) and schedule a fast linear ramp UP to the
  // user's target dB. Two things this protects against:
  //   1. The "click" produced when AudioContext.resume() lands on a non-zero
  //      buffer — without an upward fade you can hear that as a soft pop.
  //   2. The "wshhhhh" some mobile listeners describe when the very first
  //      sample plays into a fresh context — chrome's audio worker cold-starts
  //      and the first frames can carry buffer noise.
  //
  // The schedule is set on the AudioParam so it executes whenever the context
  // actually starts running — Tone.now() returns the correct context time and
  // schedules at audio-rate even if the context is currently suspended. We do
  // it INSIDE ensureMaster instead of ensureToneStarted because the previous
  // design ran the ramp before this function created masterVolume, leaving
  // master clamped at -100 dB and producing the silent-on-refresh bug.
  const targetDb = useAudioStore().masterVolumeDb
  masterVolume = new Tone.Volume(-60)
  const now = Tone.now()
  masterVolume.volume.cancelScheduledValues(now)
  masterVolume.volume.setValueAtTime(-60, now)
  masterVolume.volume.linearRampToValueAtTime(targetDb, now + 0.25)
  chaosFilter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 1 })
  chaosReverb = new Tone.Reverb({ decay: 3, wet: 0 })
  chaosCrush = new Tone.BitCrusher(16)
  chaosCrush.wet.value = 0
  masterAnalyser = new Tone.Analyser('waveform', 1024)
  masterFft = new Tone.Analyser('fft', 64)
  globalFx = buildGlobalFx()
  mastering = buildMasteringChain()
  masterVolume.chain(
    globalFx.reverb,
    globalFx.delay,
    globalFx.distortion,
    globalFx.chorus,
    globalFx.filter,
    globalFx.bitcrusher,
    globalFx.compressor,
    chaosFilter,
    chaosReverb,
    chaosCrush,
    // Mastering chain runs LAST so it shapes the final mix — EQ glue, then
    // compressor for cohesion, then limiter as a hard ceiling. Analyser/FFT
    // taps are after mastering so the visualizer reflects what the user
    // actually hears.
    mastering.eq,
    mastering.compressor,
    mastering.makeup,
    mastering.limiter,
    masterAnalyser,
    masterFft,
    Tone.getDestination(),
  )
  // Apply whatever preset the store currently has selected. The watcher in
  // wireWatchers picks up future changes; this initial call seeds the chain
  // so it isn't sitting at constructor defaults until the user opens the
  // mastering dialog.
  applyMasteringPreset(useAudioStore().masteringPreset as MasteringPresetId)
  masterReady = true
}

function buildMasteringChain(): MasteringChain {
  const eq = new Tone.EQ3({ low: 0, mid: 0, high: 0 })
  const compressor = new Tone.Compressor({
    threshold: 0,
    ratio: 1,
    attack: 0.01,
    release: 0.2,
    knee: 6,
  })
  const makeup = new Tone.Volume(0)
  const limiter = new Tone.Limiter(0)
  return { eq, compressor, makeup, limiter }
}

function applyMasteringPreset(id: MasteringPresetId) {
  if (!mastering) return
  const cfg = MASTERING_PRESETS[id] ?? MASTERING_PRESETS.off
  // EQ3 exposes low/mid/high as Tone Signals — rampTo so a preset switch
  // doesn't pop the dynamic listener with a hard parameter step.
  mastering.eq.low.rampTo(cfg.eq.low, 0.08)
  mastering.eq.mid.rampTo(cfg.eq.mid, 0.08)
  mastering.eq.high.rampTo(cfg.eq.high, 0.08)
  mastering.compressor.threshold.rampTo(cfg.comp.threshold, 0.08)
  mastering.compressor.ratio.rampTo(cfg.comp.ratio, 0.08)
  mastering.compressor.attack.rampTo(cfg.comp.attack, 0.08)
  mastering.compressor.release.rampTo(cfg.comp.release, 0.08)
  mastering.makeup.volume.rampTo(cfg.makeup, 0.08)
  mastering.limiter.threshold.rampTo(cfg.limit, 0.08)
}

function wrapPolyphonic(s: Tone.Sampler): VoiceAdapter {
  return {
    attack: (note, vel) => s.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      s.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: (note) => (note ? s.triggerRelease(note) : s.releaseAll()),
    damp: () => s.releaseAll(),
    output: s,
    setVolumeDb: (db) => { s.volume.value = db },
    setBendCents: (c) => {
      const detune = (s as unknown as { detune?: { value: number } }).detune
      if (detune) detune.value = c
    },
    dispose: () => s.dispose(),
  }
}

function buildPiano(): VoiceAdapter {
  // attack: 0.003 — 3 ms upward fade on every note start. This is below the
  // ear's perceptual threshold so the note still feels "instant", but it
  // guarantees the first sample frame isn't a hard step from silence —
  // which on mobile Chrome occasionally produces a faint "tss" / click that
  // listeners hear as a hiss on every keypress.
  // release: 0.18 — short downward fade on note end so a quick lift never
  // chops the sample off mid-cycle and produces a "wrrrk" tail.
  return wrapPolyphonic(
    new Tone.Sampler({
      urls: PIANO_URLS,
      baseUrl: PIANO_BASE,
      attack: 0.003,
      release: 0.18,
    }),
  )
}

function buildElectricPiano(): VoiceAdapter {
  const synth = new Tone.PolySynth(Tone.AMSynth, {
    harmonicity: 2.5,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.4, sustain: 0.2, release: 0.6 },
    modulation: { type: 'square' },
    modulationEnvelope: { attack: 0.01, decay: 0.6, sustain: 0.2, release: 0.5 },
  })
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      synth.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildGuitar(): VoiceAdapter {
  // Real classical / nylon-string guitar samples via smplr's Soundfont (General MIDI).
  // The nylon SF2 samples are mastered conservatively and many notes (especially
  // the higher register on strings 1 and 2) sit ~10 dB below piano/synth output
  // through the same chain. Boost the post-Soundfont gain by ~+8 dB so the
  // quietest notes are still clearly audible without making the loudest ones clip.
  const ctx = Tone.getContext().rawContext as unknown as AudioContext
  const out = new Tone.Gain(2.5)
  const guitar = new Soundfont(ctx, {
    instrument: 'acoustic_guitar_nylon',
    destination: out.input as unknown as AudioNode,
  })

  // Cap each pluck at this many seconds. The nylon SF2 samples have ~4 s of
  // natural decay/room ambience baked in, which listeners frequently misread
  // as global reverb they can't switch off (because it isn't reverb — it's
  // the recorded sample tail). A bounded duration keeps single plucks
  // musical but stops them from haunting the mix after every click.
  const PLUCK_DURATION = 1.6

  return {
    attack: (note, vel) => {
      void guitar.start({ note, velocity: Math.max(1, vel), duration: PLUCK_DURATION })
    },
    attackRelease: (note, dur, vel) => {
      void guitar.start({ note, velocity: Math.max(1, vel), duration: dur })
    },
    release: (note) => {
      if (note) guitar.stop({ stopId: note })
      else guitar.stop()
    },
    damp: () => guitar.stop(),
    output: out,
    setVolumeDb: (db) => { out.gain.value = 2.5 * Tone.dbToGain(db) },
    setBendCents: () => { /* sample-based; pitch baked in */ },
    loaded: guitar.loaded().then(() => undefined),
    dispose: () => {
      guitar.disconnect()
      out.dispose()
    },
  }
}

function buildBass(): VoiceAdapter {
  const synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.5 },
    filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.5, baseFrequency: 200, octaves: 4 },
  })
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      synth.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: () => synth.triggerRelease(),
    damp: () => synth.triggerRelease(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => { synth.detune.value = c },
    dispose: () => synth.dispose(),
  }
}

function buildPad(): VoiceAdapter {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 10,
    envelope: { attack: 0.4, decay: 0.1, sustain: 0.8, release: 2 },
  })
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      synth.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildLead(): VoiceAdapter {
  // Vibrato depth was 0.3 which produced an obvious 4 Hz pitch warble on
  // every sustained note — listeners on mobile often described this as a
  // "wshhhhh" or "weeoo" since at 0.3 the modulation is wider than the
  // ear's pitch-stability threshold. 0.08 is musically present (you still
  // hear the sustained note breathe) but no longer reads as a distortion.
  const vibrato = new Tone.Vibrato(5, 0.08)
  const synth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.8 },
  }).connect(vibrato)
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      synth.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: () => synth.triggerRelease(),
    damp: () => synth.triggerRelease(),
    output: vibrato,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => { synth.detune.value = c },
    dispose: () => { synth.dispose(); vibrato.dispose() },
  }
}

function buildOrgan(): VoiceAdapter {
  const synth = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 2,
    modulationIndex: 1.5,
    envelope: { attack: 0.01, decay: 0, sustain: 1, release: 0.05 },
  })
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    attackRelease: (note, dur, vel) =>
      synth.triggerAttackRelease(note, dur, undefined, Math.max(0.01, vel / 127)),
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildDrums(): VoiceAdapter {
  // TR-808 sample kit via smplr. Ride cymbal isn't in TR-808, so we synth it.
  const ctx = Tone.getContext().rawContext as unknown as AudioContext
  const out = new Tone.Gain(1)
  const drums = new DrumMachine(ctx, {
    instrument: 'TR-808',
    destination: out.input as unknown as AudioNode,
  })
  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.9, release: 0.4 },
    harmonicity: 8,
    modulationIndex: 18,
    resonance: 3000,
    octaves: 2,
  })
  ride.volume.value = -18
  ride.connect(out)

  // Use General-MIDI drum note numbers — universal across drum machines/kits.
  const SAMPLE_MIDI: Record<string, number> = {
    kick: 36,
    snare: 38,
    hihat: 42,
    hihatO: 46,
    clap: 39,
    tom: 47,
  }

  const fire = (name: string, vel: number) => {
    if (name === 'ride') {
      const v = Math.max(0.05, vel / 127)
      ride.triggerAttackRelease('C4', '4n', Tone.now(), v)
      return
    }
    const note = SAMPLE_MIDI[name]
    if (note === undefined) return
    drums.start({ note, velocity: vel })
  }

  return {
    attack: fire,
    // Drums are one-shot percussion samples — duration arg is ignored on purpose.
    attackRelease: (name, _dur, vel) => fire(name, vel),
    release: () => { /* one-shots */ },
    damp: () => { /* one-shots */ },
    output: out,
    setVolumeDb: (db) => { out.gain.value = Tone.dbToGain(db) },
    setBendCents: () => { /* no pitch bend on drums */ },
    loaded: drums.loaded().then(() => undefined),
    dispose: () => {
      drums.disconnect()
      ride.dispose()
      out.dispose()
    },
  }
}

function buildGlitch(): VoiceAdapter {
  // One-shot pink-noise burst through a bit-crusher. NoiseSynth auto-stops,
  // so this can never hang on the system if a release event is missed.
  const synth = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.005, decay: 0.18, sustain: 0 },
  })
  const crush = new Tone.BitCrusher(4)
  synth.connect(crush)
  return {
    attack: (_note, vel) =>
      synth.triggerAttackRelease('16n', Tone.now(), Math.max(0.01, vel / 127)),
    attackRelease: (_note, dur, vel) =>
      synth.triggerAttackRelease(dur, Tone.now(), Math.max(0.01, vel / 127)),
    release: () => { /* one-shot; nothing to release */ },
    damp: () => { /* one-shot; auto-decays */ },
    output: crush,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: () => { /* noise has no pitch */ },
    dispose: () => { synth.dispose(); crush.dispose() },
  }
}

const BUILDERS: Record<InstrumentId, () => VoiceAdapter | null> = {
  piano: buildPiano,
  electricPiano: buildElectricPiano,
  guitar: buildGuitar,
  bass: buildBass,
  pad: buildPad,
  lead: buildLead,
  organ: buildOrgan,
  drums: buildDrums,
  glitch: buildGlitch,
  meme: () => null,
}

function applyEffect(fx: FxChain, id: EffectId, enabled: boolean, amount: number) {
  // Each branch sets BOTH wet and the depth-shaping parameter. When disabled we
  // pin every depth/intensity field to its no-op value too, so a previously
  // cranked-up effect is guaranteed silent the moment its toggle goes off —
  // not just dialed back to wet=0 (which can still leave audible coloration on
  // some Tone nodes whose dry path is shaped by their parameters).
  switch (id) {
    case 'reverb':
      fx.reverb.wet.value = enabled ? amount : 0
      if (enabled && amount > 0) fx.reverb.decay = 1 + amount * 4
      break
    case 'delay':
      fx.delay.wet.value = enabled ? amount : 0
      fx.delay.feedback.value = enabled ? amount * 0.7 : 0
      break
    case 'distortion':
      fx.distortion.wet.value = enabled ? 1 : 0
      fx.distortion.distortion = enabled ? amount : 0
      break
    case 'chorus':
      fx.chorus.wet.value = enabled ? amount : 0
      fx.chorus.depth = enabled ? amount : 0
      if (enabled) fx.chorus.start()
      else fx.chorus.stop()
      break
    case 'filter': {
      const freq = enabled ? 200 + (1 - amount) * 19800 : 20000
      fx.filter.frequency.rampTo(freq, 0.05)
      break
    }
    case 'bitcrusher':
      fx.bitcrusher.wet.value = enabled ? amount : 0
      fx.bitcrusher.bits.value = enabled ? Math.max(1, Math.round(16 - amount * 12)) : 16
      break
    case 'compressor':
      fx.compressor.threshold.value = enabled ? -amount * 40 : 0
      break
  }
}

function applyAllEffectsForActive() {
  if (!globalFx) return
  const store = useAudioStore()
  const controls = store.effects[store.activeInstrument]
  if (!controls) return
  for (const id of EFFECT_ORDER) {
    const ctl = controls[id]
    if (ctl) applyEffect(globalFx, id, ctl.enabled, ctl.amount)
  }
}

async function ensureInstrument(id: InstrumentId): Promise<InstrumentNode | null> {
  if (nodes.has(id)) return nodes.get(id)!
  const meta = INSTRUMENTS[id]
  if (!meta.available) return null

  // Don't construct any Tone nodes (synths, effects, master chain) until the
  // AudioContext is actually running. Tone's constructors create
  // AudioBufferSourceNodes / ConstantSourceNodes that ping the context on
  // creation, and a suspended context floods the console with autoplay
  // warnings on every ping. Waiting here keeps page load and direct /app
  // navigation completely silent.
  if (Tone.getContext().state !== 'running') {
    await ensureToneStarted()
  }

  ensureMaster()

  const store = useAudioStore()
  store.setLoadState(id, 'loading')

  const voice = BUILDERS[id]()
  if (!voice || !masterVolume) {
    store.setLoadState(id, 'error')
    return null
  }

  const channel = new Tone.Volume(0).connect(masterVolume)
  voice.output.connect(channel)

  if (voice.loaded) {
    await voice.loaded
  } else if (meta.category === 'sampled') {
    await Tone.loaded()
  }

  const node: InstrumentNode = { voice, channelVolume: channel }
  nodes.set(id, node)
  store.ensureEffectsFor(id)
  store.setLoadState(id, 'ready')
  return node
}

let prefetchScheduled = false

function prefetchAvailableInstruments() {
  if (prefetchScheduled || typeof window === 'undefined') return
  prefetchScheduled = true

  // Defer until the first user gesture: Tone.js synth/effect construction
  // can ping the suspended AudioContext, and Chrome logs an autoplay warning
  // for each ping until the context is allowed to resume. Building these
  // nodes only after a click/keydown silences that flood and is also when
  // ensureToneStarted can legitimately resume the context.
  const start = () => {
    document.removeEventListener('pointerdown', start, true)
    document.removeEventListener('keydown', start, true)
    document.removeEventListener('touchstart', start, true)

    void ensureToneStarted()

    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number
    }).requestIdleCallback
    const schedule = (cb: () => void, delay: number) => {
      if (idle) {
        window.setTimeout(() => idle(() => cb(), { timeout: 4000 }), delay)
      } else {
        window.setTimeout(cb, delay)
      }
    }

    // Stagger by ~250 ms so we don't slam the network with parallel requests.
    // Skip 'meme' (unavailable) and instruments already loaded.
    const order: InstrumentId[] = [
      'piano', 'guitar', 'drums', 'bass', 'electricPiano',
      'pad', 'lead', 'organ', 'glitch',
    ]
    order.forEach((id, i) => {
      if (!INSTRUMENTS[id].available) return
      schedule(() => {
        if (nodes.has(id)) return
        void ensureInstrument(id)
      }, 600 + i * 250)
    })
  }

  document.addEventListener('pointerdown', start, { capture: true, once: true })
  document.addEventListener('keydown', start, { capture: true, once: true })
  document.addEventListener('touchstart', start, { capture: true, once: true })
}

let watchersWired = false
function wireWatchers() {
  if (watchersWired) return
  watchersWired = true
  const store = useAudioStore()
  watch(
    () => store.masterVolumeDb,
    (db) => {
      if (masterVolume) masterVolume.volume.rampTo(db, 0.05)
    },
  )
  watch(
    () => store.masterMuted,
    (muted) => {
      if (masterVolume) masterVolume.mute = muted
    },
    { immediate: true },
  )
  watch(
    () => [store.activeInstrument, store.effects],
    () => applyAllEffectsForActive(),
    { deep: true },
  )
  watch(
    () => store.masteringPreset,
    (id) => applyMasteringPreset(id as MasteringPresetId),
  )
}

export function useAudio() {
  const store = useAudioStore()
  wireWatchers()

  async function playNote(note: string, velocity = 100) {
    await ensureToneStarted()
    const id = store.activeInstrument
    const node = await ensureInstrument(id)
    if (!node) return
    node.voice.attack(note, velocity)
    if (INSTRUMENTS[id].playMode === 'note') store.noteOn(note)
  }

  function stopNote(note?: string) {
    const id = store.activeInstrument
    const node = nodes.get(id)
    if (!node) return
    node.voice.release(note)
    if (note) store.noteOff(note)
  }

  async function playOn(id: InstrumentId, note: string, velocity = 100, silent = false) {
    await ensureToneStarted()
    const node = await ensureInstrument(id)
    if (!node) return
    node.voice.attack(note, velocity)
    if (!silent && INSTRUMENTS[id].playMode === 'note') store.noteOn(note)
  }

  // Like playOn but auto-releases the note after `durationSec`. The beat maker
  // uses this so synth-based voices (bass MonoSynth, lead, pad, organ,
  // electricPiano) don't latch on indefinitely when their step isn't followed
  // by an explicit release. Sample-based voices (drums, glitch noise) ignore
  // the duration arg — they're already one-shots.
  async function playOnTimed(id: InstrumentId, note: string, durationSec: number, velocity = 100) {
    await ensureToneStarted()
    const node = await ensureInstrument(id)
    if (!node) return
    node.voice.attackRelease(note, durationSec, velocity)
  }

  function stopOn(id?: InstrumentId, note?: string) {
    if (!id) return
    const node = nodes.get(id)
    if (!node) return
    node.voice.release(note)
    if (note) store.noteOff(note)
  }

  function dampInstrument(id?: InstrumentId) {
    if (!id) {
      stopAll()
      return
    }
    const node = nodes.get(id)
    if (!node) return
    node.voice.damp()
    store.activeNotes = new Set()
  }

  function stopAll() {
    for (const node of nodes.values()) node.voice.damp()
    store.activeNotes = new Set()
  }

  function setMasterBend(cents: number) {
    for (const node of nodes.values()) node.voice.setBendCents(cents)
  }

  function setChaosX(value: number) {
    if (!chaosFilter) return
    const clamped = Math.max(0, Math.min(1, value))
    const freq = 200 + (1 - clamped) * 19800
    chaosFilter.frequency.rampTo(freq, 0.05)
  }
  function setChaosY(value: number) {
    if (!chaosReverb) return
    chaosReverb.wet.rampTo(Math.max(0, Math.min(1, value)), 0.05)
  }
  function glitchBurst(durationSec = 1) {
    if (!chaosCrush) return
    chaosCrush.bits.value = 3
    chaosCrush.wet.rampTo(1, 0.02)
    setTimeout(() => {
      if (!chaosCrush) return
      chaosCrush.wet.rampTo(0, 0.1)
      chaosCrush.bits.value = 16
    }, durationSec * 1000)
  }
  function getMasterAnalyser(): Tone.Analyser | null { return masterAnalyser }
  function getMasterFft(): Tone.Analyser | null { return masterFft }
  function getMasterOutput(): Tone.ToneAudioNode | null { return masterVolume }

  async function setInstrument(id: InstrumentId) {
    store.activeInstrument = id
    store.ensureEffectsFor(id)
    await ensureInstrument(id)
  }

  function setEffect(id: EffectId, patch: Partial<{ enabled: boolean; amount: number }>) {
    const ctl = store.effects[store.activeInstrument]?.[id]
    if (!ctl) return
    if (patch.enabled !== undefined) ctl.enabled = patch.enabled
    if (patch.amount !== undefined) ctl.amount = patch.amount
  }

  function toggleEffect(id: EffectId) {
    const ctl = store.effects[store.activeInstrument]?.[id]
    if (!ctl) return
    ctl.enabled = !ctl.enabled
  }

  return {
    playNote,
    stopNote,
    playOn,
    playOnTimed,
    stopOn,
    stopAll,
    dampInstrument,
    setMasterBend,
    setChaosX,
    setChaosY,
    glitchBurst,
    getMasterAnalyser,
    getMasterFft,
    getMasterOutput,
    setInstrument,
    setEffect,
    toggleEffect,
    ensureInstrument,
    ensureToneStarted,
    prefetchAvailableInstruments,
  }
}
