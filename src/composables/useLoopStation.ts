import * as Tone from 'tone'
import { markRaw } from 'vue'
import { useLoopStationStore, MAX_LOOP_LAYERS } from '@/stores/loopstation'
import { useAudio } from '@/composables/useAudio'
import type { LoopLayer } from '@/stores/loopstation'

let mediaRecorder: MediaRecorder | null = null
let chunks: Blob[] = []
let micStream: MediaStream | null = null
let masterStreamDest: MediaStreamAudioDestinationNode | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
let recordStartedAt = 0

function rawContext(): AudioContext {
  return Tone.getContext().rawContext as AudioContext
}

function uid(): string {
  return Math.random().toString(36).slice(2, 8)
}

async function blobToBuffer(blob: Blob): Promise<AudioBuffer> {
  const arr = await blob.arrayBuffer()
  return rawContext().decodeAudioData(arr.slice(0))
}

function reverseBuffer(buffer: AudioBuffer): AudioBuffer {
  const ctx = rawContext()
  const out = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const src = buffer.getChannelData(c)
    const dst = out.getChannelData(c)
    for (let i = 0; i < src.length; i++) dst[i] = src[src.length - 1 - i]
  }
  return out
}

function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length * numChannels * 2 + 44
  const view = new DataView(new ArrayBuffer(length))
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF'); view.setUint32(4, length - 8, true); writeStr(8, 'WAVE')
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true); view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true); view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true); writeStr(36, 'data')
  view.setUint32(40, buffer.length * numChannels * 2, true)
  let offset = 44
  const chans: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) chans.push(buffer.getChannelData(c))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, chans[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}

export function useLoopStation() {
  const store = useLoopStationStore()
  const { ensureToneStarted, getMasterOutput } = useAudio()

  function ensureMasterStream(): MediaStream {
    if (!masterStreamDest) {
      masterStreamDest = rawContext().createMediaStreamDestination()
      Tone.getDestination().connect(masterStreamDest)
    }
    return masterStreamDest.stream
  }

  async function startRecording() {
    if (store.isRecording || store.isFull) return
    await ensureToneStarted()
    chunks = []
    let stream: MediaStream
    if (store.recordSource === 'mic') {
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      }
      stream = micStream
    } else {
      stream = ensureMasterStream()
    }
    mediaRecorder = new MediaRecorder(stream)
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    mediaRecorder.start()
    recordStartedAt = performance.now()
    store.isRecording = true
    store.recordSeconds = 0
    recordTimer = setInterval(() => {
      store.recordSeconds = (performance.now() - recordStartedAt) / 1000
    }, 100)
  }

  async function stopRecording(): Promise<LoopLayer | null> {
    if (!mediaRecorder || !store.isRecording) return null
    return new Promise<LoopLayer | null>((resolve) => {
      mediaRecorder!.onstop = async () => {
        if (recordTimer) {
          clearInterval(recordTimer)
          recordTimer = null
        }
        store.isRecording = false
        const blob = new Blob(chunks, { type: 'audio/webm' })
        try {
          const buffer = await blobToBuffer(blob)
          const layer = addLayer(buffer)
          resolve(layer)
        } catch {
          resolve(null)
        }
      }
      mediaRecorder!.stop()
    })
  }

  function addLayer(buffer: AudioBuffer): LoopLayer {
    if (store.baseDuration === null) store.baseDuration = buffer.duration
    const player = new Tone.Player(buffer)
    player.loop = true
    player.loopStart = 0
    player.loopEnd = store.baseDuration
    player.connect(getMasterOutput())
    player.sync().start(0)
    if (Tone.getTransport().state !== 'started') {
      Tone.getTransport().start()
      store.transportPlaying = true
    }
    const layer: LoopLayer = {
      id: uid(),
      buffer: markRaw(buffer),
      player: markRaw(player),
      name: `Layer ${store.layers.length + 1}`,
      volume: 1,
      muted: false,
      reversed: false,
      halfSpeed: false,
    }
    store.layers.push(layer)
    return layer
  }

  async function toggleRecord() {
    if (store.isRecording) {
      await stopRecording()
    } else {
      await startRecording()
    }
  }

  function setVolume(id: string, volume: number) {
    const layer = store.layers.find((l) => l.id === id)
    if (!layer) return
    layer.volume = volume
    layer.player.volume.value = Tone.gainToDb(Math.max(0.001, volume))
  }

  function toggleMute(id: string) {
    const layer = store.layers.find((l) => l.id === id)
    if (!layer) return
    layer.muted = !layer.muted
    layer.player.mute = layer.muted
  }

  function toggleReverse(id: string) {
    const layer = store.layers.find((l) => l.id === id)
    if (!layer) return
    layer.reversed = !layer.reversed
    const newBuffer = layer.reversed ? reverseBuffer(layer.buffer) : layer.buffer
    const wasMuted = layer.muted
    layer.player.unsync()
    layer.player.stop()
    layer.player.dispose()
    const player = new Tone.Player(newBuffer)
    player.loop = true
    player.loopStart = 0
    player.loopEnd = store.baseDuration ?? newBuffer.duration
    player.playbackRate = layer.halfSpeed ? 0.5 : 1
    player.volume.value = Tone.gainToDb(Math.max(0.001, layer.volume))
    player.mute = wasMuted
    player.connect(getMasterOutput())
    player.sync().start(0)
    layer.player = markRaw(player)
  }

  function toggleHalfSpeed(id: string) {
    const layer = store.layers.find((l) => l.id === id)
    if (!layer) return
    layer.halfSpeed = !layer.halfSpeed
    layer.player.playbackRate = layer.halfSpeed ? 0.5 : 1
  }

  function stopAll() {
    Tone.getTransport().stop()
    store.transportPlaying = false
  }

  function startAll() {
    if (store.layers.length === 0) return
    Tone.getTransport().start()
    store.transportPlaying = true
  }

  async function exportMixWav() {
    if (store.layers.length === 0 || !store.baseDuration) return
    const sampleRate = 44100
    const seconds = store.baseDuration
    const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * seconds), sampleRate)
    for (const layer of store.layers) {
      if (layer.muted) continue
      const buf = layer.reversed ? reverseBuffer(layer.buffer) : layer.buffer
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.playbackRate.value = layer.halfSpeed ? 0.5 : 1
      src.loop = true
      src.loopEnd = seconds
      const gain = ctx.createGain()
      gain.gain.value = layer.volume
      src.connect(gain).connect(ctx.destination)
      src.start(0)
    }
    const rendered = await ctx.startRendering()
    const blob = bufferToWavBlob(rendered)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `loopstation-mix-${Date.now()}.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return {
    toggleRecord,
    startRecording,
    stopRecording,
    setVolume,
    toggleMute,
    toggleReverse,
    toggleHalfSpeed,
    stopAll,
    startAll,
    exportMixWav,
    MAX_LOOP_LAYERS,
  }
}
