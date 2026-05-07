import * as Tone from 'tone'
import { watch } from 'vue'
import type { InstrumentId, EffectId } from '@/lib/types'
import { useAudioStore } from '@/stores/audio'
import { INSTRUMENTS, EFFECT_ORDER } from '@/lib/instruments'

interface VoiceAdapter {
  attack: (note: string, velocity: number) => void
  release: (note?: string) => void
  damp: () => void
  output: Tone.ToneAudioNode
  setVolumeDb: (db: number) => void
  setBendCents: (cents: number) => void
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
let masterReady = false
let toneStarted = false

async function ensureToneStarted() {
  if (toneStarted) return
  await Tone.start()
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
  masterVolume = new Tone.Volume(-6)
  chaosFilter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 1 })
  chaosReverb = new Tone.Reverb({ decay: 3, wet: 0 })
  chaosCrush = new Tone.BitCrusher(16)
  chaosCrush.wet.value = 0
  masterAnalyser = new Tone.Analyser('waveform', 1024)
  masterFft = new Tone.Analyser('fft', 64)
  globalFx = buildGlobalFx()
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
    masterAnalyser,
    masterFft,
    Tone.getDestination(),
  )
  masterReady = true
}

function wrapPolyphonic(s: Tone.Sampler): VoiceAdapter {
  return {
    attack: (note, vel) => s.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
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
  return wrapPolyphonic(new Tone.Sampler({ urls: PIANO_URLS, baseUrl: PIANO_BASE }))
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
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildGuitar(): VoiceAdapter {
  // Classical / nylon-string guitar: softer attack, warmer dampening, body resonance via low-pass.
  const POLYPHONY = 6
  const voices: Tone.PluckSynth[] = []
  const out = new Tone.Gain(1)
  const body = new Tone.Filter({ frequency: 3200, type: 'lowpass', Q: 0.8 }).connect(out)
  for (let i = 0; i < POLYPHONY; i++) {
    const p = new Tone.PluckSynth({ attackNoise: 0.55, dampening: 2400, resonance: 0.94 })
    p.connect(body)
    voices.push(p)
  }
  let next = 0
  const heldNotes = new Map<string, Tone.PluckSynth>()

  return {
    attack: (note, vel) => {
      const v = voices[next]
      next = (next + 1) % POLYPHONY
      v.volume.value = Tone.gainToDb(Math.max(0.05, vel / 127)) + 4
      v.triggerAttack(note)
      heldNotes.set(note, v)
    },
    release: () => { /* nylon strings decay naturally; no release needed */ },
    damp: () => {
      for (const v of voices) v.volume.rampTo(-60, 0.04)
      heldNotes.clear()
    },
    output: out,
    setVolumeDb: (db) => { out.gain.value = Tone.dbToGain(db) },
    setBendCents: () => { /* PluckSynth pitch is set per-trigger */ },
    dispose: () => {
      for (const v of voices) v.dispose()
      body.dispose()
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
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildLead(): VoiceAdapter {
  const vibrato = new Tone.Vibrato(4, 0.3)
  const synth = new Tone.Synth({
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.02, decay: 0.1, sustain: 0.6, release: 0.8 },
  }).connect(vibrato)
  return {
    attack: (note, vel) => synth.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
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
    release: (note) => (note ? synth.triggerRelease(note) : synth.releaseAll()),
    damp: () => synth.releaseAll(),
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildDrums(): VoiceAdapter {
  const out = new Tone.Gain(1)

  const kick = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 6,
    envelope: { attack: 0.001, decay: 0.45, sustain: 0, release: 0.1 },
  })
  kick.volume.value = 4
  kick.connect(out)

  const tom = new Tone.MembraneSynth({
    pitchDecay: 0.1,
    octaves: 3,
    envelope: { attack: 0.001, decay: 0.4, sustain: 0, release: 0.1 },
  })
  tom.connect(out)

  const snareNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
  })
  snareNoise.volume.value = -2
  const snareFilter = new Tone.Filter(1800, 'highpass')
  snareNoise.connect(snareFilter)
  snareFilter.connect(out)

  const hihatClosed = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.06, release: 0.02 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  })
  hihatClosed.volume.value = -22
  hihatClosed.connect(out)

  const hihatOpen = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.4, release: 0.2 },
    harmonicity: 5.1,
    modulationIndex: 32,
    resonance: 4000,
    octaves: 1.5,
  })
  hihatOpen.volume.value = -22
  hihatOpen.connect(out)

  const ride = new Tone.MetalSynth({
    envelope: { attack: 0.001, decay: 0.9, release: 0.4 },
    harmonicity: 8,
    modulationIndex: 18,
    resonance: 3000,
    octaves: 2,
  })
  ride.volume.value = -22
  ride.connect(out)

  const clap = new Tone.NoiseSynth({
    noise: { type: 'pink' },
    envelope: { attack: 0.001, decay: 0.13, sustain: 0 },
  })
  clap.volume.value = -2
  const clapFilter = new Tone.Filter(1100, 'bandpass')
  clap.connect(clapFilter)
  clapFilter.connect(out)

  return {
    attack: (name, vel) => {
      const v = Math.max(0.05, vel / 127)
      switch (name) {
        case 'kick':
          kick.triggerAttackRelease('C2', '8n', Tone.now(), v)
          return
        case 'snare':
          snareNoise.triggerAttackRelease('16n', Tone.now(), v)
          return
        case 'hihat':
          hihatClosed.triggerAttackRelease('32n', Tone.now(), v)
          return
        case 'hihatO':
          hihatOpen.triggerAttackRelease('8n', Tone.now(), v)
          return
        case 'tom':
          tom.triggerAttackRelease('A2', '8n', Tone.now(), v)
          return
        case 'ride':
          ride.triggerAttackRelease('4n', Tone.now(), v)
          return
        case 'clap':
          clap.triggerAttackRelease('16n', Tone.now(), v)
          return
      }
    },
    release: () => { /* one-shots */ },
    damp: () => { /* one-shots, nothing to damp */ },
    output: out,
    setVolumeDb: (db) => { out.gain.value = Tone.dbToGain(db) },
    setBendCents: () => { /* no pitch bend on drums */ },
    dispose: () => {
      kick.dispose(); tom.dispose()
      snareNoise.dispose(); snareFilter.dispose()
      hihatClosed.dispose(); hihatOpen.dispose(); ride.dispose()
      clap.dispose(); clapFilter.dispose()
      out.dispose()
    },
  }
}

function buildGlitch(): VoiceAdapter {
  const noise = new Tone.Noise('pink')
  const env = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 })
  const crush = new Tone.BitCrusher(4)
  noise.connect(env).connect(crush)
  noise.start()
  return {
    attack: (_note, vel) => env.triggerAttack(undefined, Math.max(0.01, vel / 127)),
    release: () => env.triggerRelease(),
    damp: () => env.triggerRelease(),
    output: crush,
    setVolumeDb: (db) => { noise.volume.value = db },
    setBendCents: () => { /* noise has no pitch */ },
    dispose: () => { noise.dispose(); env.dispose(); crush.dispose() },
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
  const v = enabled ? amount : 0
  switch (id) {
    case 'reverb':
      fx.reverb.wet.value = v
      fx.reverb.decay = 1 + amount * 4
      break
    case 'delay':
      fx.delay.wet.value = v
      fx.delay.feedback.value = amount * 0.7
      break
    case 'distortion':
      fx.distortion.wet.value = enabled ? 1 : 0
      fx.distortion.distortion = enabled ? amount : 0
      break
    case 'chorus':
      fx.chorus.wet.value = v
      fx.chorus.depth = amount
      if (enabled) fx.chorus.start()
      else fx.chorus.stop()
      break
    case 'filter': {
      const freq = enabled ? 200 + (1 - amount) * 19800 : 20000
      fx.filter.frequency.rampTo(freq, 0.05)
      break
    }
    case 'bitcrusher':
      fx.bitcrusher.wet.value = v
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
  ensureMaster()
  if (nodes.has(id)) return nodes.get(id)!
  const meta = INSTRUMENTS[id]
  if (!meta.available) return null

  const store = useAudioStore()
  store.setLoadState(id, 'loading')

  const voice = BUILDERS[id]()
  if (!voice || !masterVolume) {
    store.setLoadState(id, 'error')
    return null
  }

  const channel = new Tone.Volume(0).connect(masterVolume)
  voice.output.connect(channel)

  if (meta.category === 'sampled') {
    await Tone.loaded()
  }

  const node: InstrumentNode = { voice, channelVolume: channel }
  nodes.set(id, node)
  store.ensureEffectsFor(id)
  store.setLoadState(id, 'ready')
  return node
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
    { immediate: true },
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

  async function playOn(id: InstrumentId, note: string, velocity = 100) {
    await ensureToneStarted()
    const node = await ensureInstrument(id)
    if (!node) return
    node.voice.attack(note, velocity)
    if (INSTRUMENTS[id].playMode === 'note') store.noteOn(note)
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
  }
}
