import * as Tone from 'tone'
import { useRecorderStore } from '@/stores/recorder'
import { useAudio } from '@/composables/useAudio'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useUserStore } from '@/stores/user'
import { bufferToWavBlob as wavEncode } from '@/lib/wav'
import {
  tuneClipToKey,
  detectPitchHz,
  frequencyToMidiFloat,
  midiFloatToPitchResult,
  KEY_NAMES,
  type Scale,
  type Key,
  type TuneResult,
  type PitchResult,
} from '@/lib/pitch'
import { detectKey, type KeyDetectionResult } from '@/lib/keyDetection'
import { MAQAM_PRESETS } from '@/lib/microtonal'
import type { Clip } from '@/lib/types'

/**
 * Convert a maqam preset id into the FRACTIONAL semitone interval set +
 * the canonical tonic. Maqam steps are quarter-tones (50 c each), so
 * dividing by 2 gives a value in semitones that may be half-integer
 * (sika of Rast at 1.5 st, half-flat second of Bayati at 1.5 st). Those
 * fractional offsets flow through snapMidiToScale into a non-integer
 * pitchSemitones, which Tone.PitchShift renders faithfully — the
 * earlier `Math.round(step/2)` collapsed every half-flat to its nearest
 * 12-TET semitone and made vocal Smart Tune's "maqam" mode equivalent
 * to "the closest Western scale," which is exactly what the audit
 * flagged. Dedupe on the rounded pitch class so genuinely-equal degrees
 * from different octaves don't double-count.
 */
function maqamToTuneIntervals(
  id: keyof typeof MAQAM_PRESETS,
): { intervals: number[]; tonic: string } | null {
  const m = MAQAM_PRESETS[id]
  if (!m) return null
  const seen = new Set<string>()
  const intervals: number[] = []
  for (const step of m.steps) {
    const semi = (step / 2) % 12
    // Use a fixed-precision key for dedupe — two intervals 1.5 vs 1.5
    // would otherwise insert twice through Set<number> if they came
    // from arithmetic with different rounding.
    const key = semi.toFixed(2)
    if (seen.has(key)) continue
    seen.add(key)
    intervals.push(semi)
  }
  intervals.sort((a, b) => a - b)
  return { intervals, tonic: m.tonic }
}

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

// Shared WAV encoder lives in lib/wav.ts so the arrange engine can use the
// same encoder for stem export. Local alias keeps the rest of the file
// readable.
const bufferToWavBlob = wavEncode

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
    maqamId?: keyof typeof MAQAM_PRESETS | null,
  ): TuneResult | null {
    const clip = store.clips.find((c) => c.id === clipId)
    if (!clip) return null
    let keyIndex = KEY_NAMES.indexOf(key)
    if (keyIndex < 0) return null
    let customIntervals: number[] | undefined
    if (maqamId) {
      const m = maqamToTuneIntervals(maqamId)
      if (m) {
        // Maqam wins over the user's key + scale picks: a maqam has a
        // canonical tonic and shape, and "tune to Hijaz on G" is a
        // different intent than "tune to G major", so we override
        // both. Falls back to the user's key when the maqam tonic
        // can't be resolved (shouldn't happen for the bundled set).
        customIntervals = m.intervals
        const tonicIdx = KEY_NAMES.indexOf(m.tonic as typeof KEY_NAMES[number])
        if (tonicIdx >= 0) keyIndex = tonicIdx
      }
    }
    const result = tuneClipToKey(
      clip.buffer, clip.trimStart, clip.trimEnd, keyIndex, scale, customIntervals,
    )
    if (!result) return null
    // Combine with the existing pitchSemitones — if the user already shifted
    // the clip down 2 st by hand, we ADD our correction on top so a second
    // tune call still lands on the right tone. Clamp to the slider's range.
    const next = Math.max(-12, Math.min(12, clip.pitchSemitones + result.semitones))
    store.patchClip(clip.id, { pitchSemitones: next })
    return result
  }

  /**
   * Smart Tune — analyse every clip in the library, build a combined
   * chromagram, match it against all 24 major/minor key profiles, and
   * return the best fit. Used by the SmartTunePanel to suggest a song
   * key before the user commits to bulk-tuning every clip.
   */
  function detectSongKey(): KeyDetectionResult | null {
    if (store.clips.length === 0) return null
    return detectKey(store.clips.map((c) => c.buffer))
  }

  /**
   * Apply tuneClipToKey to every clip in one shot. Returns counts for the
   * UI so the user sees how many clips were corrected vs. how many had no
   * detectable pitch (silence, polyphonic content, breath noise).
   */
  function tuneAllClipsToKey(
    key: Key,
    scale: Scale,
    maqamId?: keyof typeof MAQAM_PRESETS | null,
  ): { tuned: number; skipped: number } {
    let tuned = 0
    let skipped = 0
    for (const clip of store.clips) {
      const result = tuneClipToKeyNow(clip.id, key, scale, maqamId)
      if (result) tuned++
      else skipped++
    }
    return { tuned, skipped }
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
    detectSongKey,
    tuneAllClipsToKey,
    startMonitoring,
    stopMonitoring,
    setMonitorGain,
    exportClipWav,
    saveToCloud,
  }
}
