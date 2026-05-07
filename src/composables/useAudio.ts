import * as Tone from 'tone'
import { watch } from 'vue'
import type { InstrumentId, EffectId } from '@/lib/types'
import { useAudioStore } from '@/stores/audio'
import { INSTRUMENTS } from '@/lib/instruments'

interface VoiceAdapter {
  attack: (note: string, velocity: number) => void
  release: (note?: string) => void
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
  fx: FxChain
  channelVolume: Tone.Volume
}

const PIANO_BASE = 'https://tonejs.github.io/audio/salamander/'
const EP_BASE = 'https://tonejs.github.io/audio/electric-piano/'
const GUITAR_BASE = 'https://tonejs.github.io/audio/guitar-acoustic/'
const DRUM_BASE = 'https://tonejs.github.io/audio/drum-samples/'

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
const EP_URLS: Record<string, string> = { A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3', A5: 'A5.mp3' }
const GUITAR_URLS: Record<string, string> = { A1: 'A1.mp3', A2: 'A2.mp3', A3: 'A3.mp3', A4: 'A4.mp3' }
const DRUM_URLS: Record<string, string> = {
  kick: `${DRUM_BASE}kick.mp3`,
  snare: `${DRUM_BASE}snare.mp3`,
  hihat: `${DRUM_BASE}hihat.mp3`,
  hihatO: `${DRUM_BASE}hihat-open.mp3`,
  clap: `${DRUM_BASE}clap.mp3`,
  tom: `${DRUM_BASE}tom.mp3`,
  ride: `${DRUM_BASE}ride.mp3`,
}

const nodes = new Map<InstrumentId, InstrumentNode>()
const masterVolume = new Tone.Volume(-6)
const chaosFilter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 1 })
const chaosReverb = new Tone.Reverb({ decay: 4, wet: 0 })
const chaosCrush = new Tone.BitCrusher(16)
chaosCrush.wet.value = 0
const masterAnalyser = new Tone.Analyser('waveform', 1024)
const masterFft = new Tone.Analyser('fft', 64)
let masterReady = false
let toneStarted = false

function ensureMaster() {
  if (masterReady) return
  masterVolume.chain(chaosFilter, chaosReverb, chaosCrush, masterAnalyser, masterFft, Tone.getDestination())
  masterReady = true
}

async function ensureToneStarted() {
  if (toneStarted) return
  await Tone.start()
  toneStarted = true
}

function buildFx(): FxChain {
  const reverb = new Tone.Reverb({ decay: 3, wet: 0 })
  const delay = new Tone.FeedbackDelay({ delayTime: 0.25, feedback: 0.4, wet: 0 })
  const distortion = new Tone.Distortion({ distortion: 0, wet: 0 })
  const chorus = new Tone.Chorus({ frequency: 4, depth: 0.5, wet: 0 }).start()
  const filter = new Tone.Filter({ frequency: 20000, type: 'lowpass', Q: 1 })
  const bitcrusher = new Tone.BitCrusher(16)
  bitcrusher.wet.value = 0
  const compressor = new Tone.Compressor({ threshold: 0, ratio: 4 })
  return { reverb, delay, distortion, chorus, filter, bitcrusher, compressor }
}

function buildPiano(): VoiceAdapter {
  const s = new Tone.Sampler({ urls: PIANO_URLS, baseUrl: PIANO_BASE })
  return wrapPolyphonic(s)
}
function buildElectricPiano(): VoiceAdapter {
  const s = new Tone.Sampler({ urls: EP_URLS, baseUrl: EP_BASE })
  return wrapPolyphonic(s)
}
function buildGuitar(): VoiceAdapter {
  const s = new Tone.Sampler({ urls: GUITAR_URLS, baseUrl: GUITAR_BASE })
  return wrapPolyphonic(s)
}
function wrapPolyphonic(s: Tone.Sampler): VoiceAdapter {
  return {
    attack: (note, vel) => s.triggerAttack(note, undefined, Math.max(0.01, vel / 127)),
    release: (note) => (note ? s.triggerRelease(note) : s.releaseAll()),
    output: s,
    setVolumeDb: (db) => { s.volume.value = db },
    setBendCents: (c) => {
      const detune = (s as unknown as { detune?: { value: number } }).detune
      if (detune) detune.value = c
    },
    dispose: () => s.dispose(),
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
    output: synth,
    setVolumeDb: (db) => { synth.volume.value = db },
    setBendCents: (c) => synth.set({ detune: c }),
    dispose: () => synth.dispose(),
  }
}

function buildDrums(): VoiceAdapter {
  const players = new Tone.Players(DRUM_URLS)
  return {
    attack: (name, vel) => {
      if (!players.has(name)) return
      const p = players.player(name)
      p.volume.value = Tone.gainToDb(Math.max(0.01, vel / 127))
      p.start()
    },
    release: () => {},
    output: players,
    setVolumeDb: (db) => { players.volume.value = db },
    setBendCents: () => {},
    dispose: () => players.dispose(),
  }
}

function buildGlitch(): VoiceAdapter {
  const noise = new Tone.Noise('pink')
  const env = new Tone.AmplitudeEnvelope({ attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.4 })
  const crush = new Tone.BitCrusher(4)
  noise.connect(env).connect(crush)
  noise.start()
  return {
    attack: (_note, vel) => {
      env.triggerAttack(undefined, Math.max(0.01, vel / 127))
    },
    release: () => env.triggerRelease(),
    output: crush,
    setVolumeDb: (db) => { noise.volume.value = db },
    setBendCents: () => {},
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

function chainNode(voice: VoiceAdapter, fx: FxChain, channel: Tone.Volume) {
  voice.output.disconnect()
  voice.output.chain(
    fx.reverb,
    fx.delay,
    fx.distortion,
    fx.chorus,
    fx.filter,
    fx.bitcrusher,
    fx.compressor,
    channel,
  )
}

function applyEffect(fx: FxChain, id: EffectId, enabled: boolean, amount: number) {
  const v = enabled ? amount : 0
  switch (id) {
    case 'reverb':
      fx.reverb.wet.value = v
      fx.reverb.decay = 1 + amount * 6
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

async function ensureInstrument(id: InstrumentId): Promise<InstrumentNode | null> {
  ensureMaster()
  if (nodes.has(id)) return nodes.get(id)!
  const meta = INSTRUMENTS[id]
  if (!meta.available) return null

  const store = useAudioStore()
  store.setLoadState(id, 'loading')

  const voice = BUILDERS[id]()
  if (!voice) {
    store.setLoadState(id, 'error')
    return null
  }

  const fx = buildFx()
  const channel = new Tone.Volume(0).connect(masterVolume)
  chainNode(voice, fx, channel)

  if (meta.category === 'sampled' || meta.category === 'percussion') {
    await Tone.loaded()
  }

  const node: InstrumentNode = { voice, fx, channelVolume: channel }
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
    (db) => { masterVolume.volume.rampTo(db, 0.05) },
    { immediate: true },
  )
  watch(
    () => store.masterMuted,
    (muted) => { masterVolume.mute = muted },
    { immediate: true },
  )
  watch(
    () => store.effects,
    (effectsByInstrument) => {
      for (const [id, controls] of Object.entries(effectsByInstrument)) {
        const node = nodes.get(id as InstrumentId)
        if (!node) continue
        for (const [effectId, ctl] of Object.entries(controls)) {
          applyEffect(node.fx, effectId as EffectId, ctl.enabled, ctl.amount)
        }
      }
    },
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

  function stopAll() {
    for (const node of nodes.values()) node.voice.release()
    store.activeNotes = new Set()
  }

  function setMasterBend(cents: number) {
    for (const node of nodes.values()) node.voice.setBendCents(cents)
  }

  function setChaosX(value: number) {
    const clamped = Math.max(0, Math.min(1, value))
    const freq = 200 + (1 - clamped) * 19800
    chaosFilter.frequency.rampTo(freq, 0.05)
  }
  function setChaosY(value: number) {
    const clamped = Math.max(0, Math.min(1, value))
    chaosReverb.wet.rampTo(clamped, 0.05)
  }
  function glitchBurst(durationSec = 1) {
    chaosCrush.bits.value = 3
    chaosCrush.wet.rampTo(1, 0.02)
    setTimeout(() => {
      chaosCrush.wet.rampTo(0, 0.1)
      chaosCrush.bits.value = 16
    }, durationSec * 1000)
  }
  function getMasterAnalyser(): Tone.Analyser { return masterAnalyser }
  function getMasterFft(): Tone.Analyser { return masterFft }
  function getMasterOutput(): Tone.ToneAudioNode { return masterVolume }

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
