import * as Tone from 'tone'
import { useRecorderStore } from '@/stores/recorder'
import { useAudio } from '@/composables/useAudio'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useUserStore } from '@/stores/user'
import {
  tuneClipToKey,
  detectPitchHz,
  frequencyToMidiFloat,
  midiFloatToPitchResult,
  KEY_NAMES,
  type Scale,
  type TuneResult,
  type PitchResult,
} from '@/lib/pitch'
import type { Clip } from '@/lib/types'

const WAVEFORM_BUCKETS = 600

let mediaRecorder: MediaRecorder | null = null
let recorderChunks: Blob[] = []
let micStream: MediaStream | null = null
let recordTimer: ReturnType<typeof setInterval> | null = null
let recordStartedAt = 0
let activePlayer: Tone.Player | null = null
let activePitchNode: Tone.PitchShift | null = null
let playbackTimer: ReturnType<typeof setInterval> | null = null
// Live mic monitor — tap the mic into the studio's master FX chain so the
// user hears themselves through whichever instrument's effects are active
// (sing through guitar's reverb, talk through Lo-Fi crusher, etc.). Kept
// at module scope so the monitor survives component remounts and we never
// accidentally end up with two source nodes pumping the same stream.
let monitorSource: MediaStreamAudioSourceNode | null = null
let monitorGain: Tone.Gain | null = null

function rawContext(): AudioContext {
  return Tone.getContext().rawContext as AudioContext
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function buildWaveform(buffer: AudioBuffer): number[] {
  const channel = buffer.getChannelData(0)
  const bucketSize = Math.max(1, Math.floor(channel.length / WAVEFORM_BUCKETS))
  const peaks: number[] = []
  for (let i = 0; i < WAVEFORM_BUCKETS; i++) {
    const start = i * bucketSize
    const end = Math.min(channel.length, start + bucketSize)
    let peak = 0
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channel[j])
      if (abs > peak) peak = abs
    }
    peaks.push(peak)
  }
  return peaks
}

function detectBpm(buffer: AudioBuffer): number | null {
  const sr = buffer.sampleRate
  const channel = buffer.getChannelData(0)
  const window = Math.floor(sr * 0.02)
  const energies: number[] = []
  for (let i = 0; i + window < channel.length; i += window) {
    let sum = 0
    for (let j = 0; j < window; j++) sum += channel[i + j] * channel[i + j]
    energies.push(sum / window)
  }
  const mean = energies.reduce((a, b) => a + b, 0) / energies.length
  const threshold = mean * 1.6
  const onsets: number[] = []
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] > energies[i - 1] && energies[i] > energies[i + 1]) {
      onsets.push((i * window) / sr)
    }
  }
  if (onsets.length < 4) return null
  const intervals: number[] = []
  for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1])
  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)]
  if (!median || median <= 0) return null
  let bpm = 60 / median
  while (bpm < 60) bpm *= 2
  while (bpm > 180) bpm /= 2
  return Math.round(bpm)
}

async function blobToBuffer(blob: Blob): Promise<AudioBuffer> {
  const arr = await blob.arrayBuffer()
  return rawContext().decodeAudioData(arr.slice(0))
}

function bufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels
  const sampleRate = buffer.sampleRate
  const length = buffer.length * numChannels * 2 + 44
  const view = new DataView(new ArrayBuffer(length))
  const writeStr = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  writeStr(0, 'RIFF')
  view.setUint32(4, length - 8, true)
  writeStr(8, 'WAVE')
  writeStr(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numChannels, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  view.setUint16(32, numChannels * 2, true)
  view.setUint16(34, 16, true)
  writeStr(36, 'data')
  view.setUint32(40, buffer.length * numChannels * 2, true)

  let offset = 44
  const channels: Float32Array[] = []
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c))
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]))
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true)
      offset += 2
    }
  }
  return new Blob([view], { type: 'audio/wav' })
}

async function clipFromBlob(blob: Blob, source: 'mic' | 'upload', name: string): Promise<Clip> {
  const buffer = await blobToBuffer(blob)
  return {
    id: uid(),
    name,
    source,
    buffer,
    blob,
    duration: buffer.duration,
    waveform: buildWaveform(buffer),
    trimStart: 0,
    trimEnd: 1,
    pitchSemitones: 0,
    speed: 1,
    reverse: false,
    loop: false,
    fadeIn: 0,
    fadeOut: 0,
    bpm: null,
    createdAt: Date.now(),
  }
}

function clearPlayback() {
  if (activePlayer) {
    activePlayer.stop()
    activePlayer.dispose()
    activePlayer = null
  }
  if (activePitchNode) {
    activePitchNode.dispose()
    activePitchNode = null
  }
  if (playbackTimer) {
    clearInterval(playbackTimer)
    playbackTimer = null
  }
}

export function useRecorder() {
  const store = useRecorderStore()
  const userStore = useUserStore()
  const { getMasterInput, ensureToneStarted } = useAudio()

  async function ensureMicStream(): Promise<MediaStream> {
    if (!micStream) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    return micStream
  }

  /**
   * Plug-and-play live mic monitoring. Routes the mic stream through the
   * studio's master FX chain so the user hears themselves with whatever
   * effects + mastering preset are active — perfect for vocalists who want
   * to perform with reverb on, or for line-in instruments to be processed
   * by the studio in real time. Caller is responsible for warning the user
   * about feedback (use headphones).
   */
  async function startMonitoring(): Promise<{ ok: boolean; message?: string }> {
    if (store.monitoring) return { ok: true }
    try {
      await ensureToneStarted()
      const stream = await ensureMicStream()
      const ctx = rawContext()
      // Tear down any leftover nodes from a previous monitoring session
      // before wiring up new ones — running the same stream through two
      // source nodes simultaneously doubles the gain on every voice.
      if (monitorSource) { monitorSource.disconnect(); monitorSource = null }
      if (monitorGain) { monitorGain.dispose(); monitorGain = null }
      monitorSource = ctx.createMediaStreamSource(stream)
      // -6 dB starting trim — mic levels through getUserMedia vary wildly by
      // device and browser; trimming below unity prevents accidental clip on
      // a hot mic and gives us headroom before the master compressor.
      monitorGain = new Tone.Gain(0.5)
      const masterIn = getMasterInput()
      if (!masterIn) return { ok: false, message: 'Master chain unavailable' }
      // Native AudioNode (createMediaStreamSource) → Tone node bridge: Tone
      // exposes input/output as raw AudioNodes too, so we can connect across
      // the two APIs without a wrapper.
      monitorSource.connect(monitorGain.input as unknown as AudioNode)
      monitorGain.connect(masterIn)
      store.monitoring = true
      return { ok: true }
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : 'Mic permission denied',
      }
    }
  }

  function stopMonitoring() {
    if (monitorSource) {
      monitorSource.disconnect()
      monitorSource = null
    }
    if (monitorGain) {
      monitorGain.dispose()
      monitorGain = null
    }
    store.monitoring = false
  }

  function setMonitorGain(linearGain: number) {
    if (monitorGain) monitorGain.gain.rampTo(linearGain, 0.05)
    store.monitorGain = linearGain
  }

  async function startRecording() {
    if (store.isRecording) return
    if (!micStream) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    }
    recorderChunks = []
    mediaRecorder = new MediaRecorder(micStream)
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) recorderChunks.push(e.data)
    }
    mediaRecorder.start()
    recordStartedAt = performance.now()
    store.isRecording = true
    store.recordSeconds = 0
    recordTimer = setInterval(() => {
      store.recordSeconds = (performance.now() - recordStartedAt) / 1000
    }, 100)
  }

  async function stopRecording(): Promise<Clip | null> {
    if (!mediaRecorder || !store.isRecording) return null
    return new Promise<Clip | null>((resolve) => {
      mediaRecorder!.onstop = async () => {
        if (recordTimer) {
          clearInterval(recordTimer)
          recordTimer = null
        }
        store.isRecording = false
        const blob = new Blob(recorderChunks, { type: 'audio/webm' })
        const clip = await clipFromBlob(blob, 'mic', `Take ${store.clips.length + 1}`)
        store.addClip(clip)
        resolve(clip)
      }
      mediaRecorder!.stop()
    })
  }

  async function uploadFile(file: File): Promise<Clip | null> {
    if (!file.type.startsWith('audio/') && !file.name.match(/\.(wav|mp3|ogg|m4a|aiff?)$/i)) {
      return null
    }
    const clip = await clipFromBlob(file, 'upload', file.name.replace(/\.[^.]+$/, ''))
    store.addClip(clip)
    return clip
  }

  async function playClip(clipId: string) {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return
    await Tone.start()
    clearPlayback()

    const buffer = clip.reverse ? reverseBuffer(clip.buffer) : clip.buffer
    activePitchNode = new Tone.PitchShift({ pitch: clip.pitchSemitones, wet: 1 }).toDestination()
    activePlayer = new Tone.Player(buffer)
    activePlayer.connect(activePitchNode)
    activePlayer.playbackRate = clip.speed
    activePlayer.loop = clip.loop
    activePlayer.fadeIn = clip.fadeIn
    activePlayer.fadeOut = clip.fadeOut

    const startSec = clip.trimStart * clip.duration
    const endSec = clip.trimEnd * clip.duration
    activePlayer.loopStart = startSec
    activePlayer.loopEnd = endSec
    activePlayer.start(undefined, startSec, clip.loop ? undefined : endSec - startSec)

    store.isPlaying = true
    store.playheadSeconds = startSec
    const t0 = performance.now()
    playbackTimer = setInterval(() => {
      const elapsed = ((performance.now() - t0) / 1000) * clip.speed
      let pos = startSec + elapsed
      if (clip.loop) {
        const len = endSec - startSec
        pos = startSec + (elapsed % len)
      } else if (pos >= endSec) {
        store.isPlaying = false
        store.playheadSeconds = endSec
        clearPlayback()
        return
      }
      store.playheadSeconds = pos
    }, 30)
  }

  function stopPlayback() {
    clearPlayback()
    store.isPlaying = false
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

  function normalize(clipId: string) {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return
    const buf = clip.buffer
    let peak = 0
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const data = buf.getChannelData(c)
      for (let i = 0; i < data.length; i++) {
        const abs = Math.abs(data[i])
        if (abs > peak) peak = abs
      }
    }
    if (peak === 0 || peak >= 0.99) return
    const gain = 0.99 / peak
    const ctx = rawContext()
    const next = ctx.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate)
    for (let c = 0; c < buf.numberOfChannels; c++) {
      const src = buf.getChannelData(c)
      const dst = next.getChannelData(c)
      for (let i = 0; i < src.length; i++) dst[i] = src[i] * gain
    }
    const blob = bufferToWavBlob(next)
    store.replaceClipBuffer(clip.id, next, buildWaveform(next), blob)
  }

  function detectClipBpm(clipId: string) {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return
    const bpm = detectBpm(clip.buffer)
    store.patchClip(clip.id, { bpm })
  }

  /**
   * Identify the dominant pitch in the trimmed range of a clip without
   * applying any correction — used by the UI to show "We hear D♯4 ± 12¢"
   * before the user commits to tuning. Returns null if no confident pitch
   * was found (silence, polyphonic mix, breath noise).
   */
  function detectClipPitch(clipId: string): PitchResult | null {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return null
    const buffer = clip.buffer
    const start = Math.floor(clip.trimStart * buffer.length)
    const end = Math.floor(clip.trimEnd * buffer.length)
    const len = end - start
    if (len < 4096) return null
    const winLen = Math.min(4096, len)
    const winStart = start + Math.floor((len - winLen) / 2)
    const window = buffer.getChannelData(0).subarray(winStart, winStart + winLen)
    const hz = detectPitchHz(window, buffer.sampleRate)
    if (hz === null) return null
    return midiFloatToPitchResult(frequencyToMidiFloat(hz))
  }

  /**
   * Snap a clip's pitch to the nearest in-key scale tone. We update the
   * clip's pitchSemitones field — playback and export already route through
   * Tone.PitchShift, so the new value is heard immediately on the next
   * play and bakes into any future export. Idempotent: if the user calls
   * it twice with the same key, the second call uses the corrected pitch
   * as the new "detected" pitch (which should already match the scale, so
   * the second call is a no-op).
   */
  function tuneClipToKeyNow(
    clipId: string,
    key: typeof KEY_NAMES[number],
    scale: Scale,
  ): TuneResult | null {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return null
    const keyIndex = KEY_NAMES.indexOf(key)
    if (keyIndex < 0) return null
    const result = tuneClipToKey(clip.buffer, clip.trimStart, clip.trimEnd, keyIndex, scale)
    if (!result) return null
    // Combine with the existing pitchSemitones — if the user already shifted
    // the clip down 2 st by hand, we ADD our correction on top so a second
    // tune call still lands on the right tone. Clamp to the slider's range.
    const next = Math.max(-12, Math.min(12, clip.pitchSemitones + result.semitones))
    store.patchClip(clip.id, { pitchSemitones: next })
    return result
  }

  function exportClipWav(clipId: string) {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return
    const blob = bufferToWavBlob(clip.buffer)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${clip.name || 'clip'}.wav`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function saveToCloud(clipId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    if (!userStore.isLoggedIn || !userStore.profile) {
      return { ok: false, message: 'Sign in to save to cloud' }
    }
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return { ok: false, message: 'Clip not found' }
    try {
      const path = `${userStore.profile.id}/${clip.id}.wav`
      const wav = bufferToWavBlob(clip.buffer)
      const { error: upErr } = await supabase.storage.from('user-clips').upload(path, wav, {
        contentType: 'audio/wav',
        upsert: true,
      })
      if (upErr) return { ok: false, message: upErr.message }
      const { data } = supabase.storage.from('user-clips').getPublicUrl(path)
      const { error: dbErr } = await supabase.from('clips').upsert({
        id: clip.id,
        user_id: userStore.profile.id,
        name: clip.name,
        url: data.publicUrl,
        duration: clip.duration,
        metadata: {
          trimStart: clip.trimStart,
          trimEnd: clip.trimEnd,
          pitchSemitones: clip.pitchSemitones,
          speed: clip.speed,
          reverse: clip.reverse,
          loop: clip.loop,
          fadeIn: clip.fadeIn,
          fadeOut: clip.fadeOut,
          bpm: clip.bpm,
        },
      })
      if (dbErr) return { ok: false, message: dbErr.message }
      store.patchClip(clip.id, { remoteUrl: data.publicUrl })
      return { ok: true, message: 'Saved' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Upload failed' }
    }
  }

  return {
    startRecording,
    stopRecording,
    uploadFile,
    playClip,
    stopPlayback,
    normalize,
    detectClipBpm,
    detectClipPitch,
    tuneClipToKeyNow,
    startMonitoring,
    stopMonitoring,
    setMonitorGain,
    exportClipWav,
    saveToCloud,
  }
}
