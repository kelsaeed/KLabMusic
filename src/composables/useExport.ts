import * as Tone from 'tone'
import { ref } from 'vue'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useAudio } from '@/composables/useAudio'
import { useBeatMaker } from '@/composables/useBeatMaker'
import type { Pattern } from '@/lib/types'

const recording = ref(false)
const exporting = ref(false)
const lastShareUrl = ref('')

function rawContext(): AudioContext {
  return Tone.getContext().rawContext as AudioContext
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

async function bufferToMp3Blob(buffer: AudioBuffer, kbps = 192): Promise<Blob> {
  interface LameModule {
    Mp3Encoder: new (channels: number, sampleRate: number, kbps: number) => {
      encodeBuffer: (left: Int16Array, right?: Int16Array) => Int8Array
      flush: () => Int8Array
    }
  }
  const mod = (await import('@breezystack/lamejs')) as unknown as LameModule
  const channels = Math.min(2, buffer.numberOfChannels)
  const encoder = new mod.Mp3Encoder(channels, buffer.sampleRate, kbps)
  const samples: Int8Array[] = []
  const left = floatToInt16(buffer.getChannelData(0))
  const right = channels === 2 ? floatToInt16(buffer.getChannelData(1)) : undefined
  const blockSize = 1152
  for (let i = 0; i < left.length; i += blockSize) {
    const l = left.subarray(i, i + blockSize)
    const r = right ? right.subarray(i, i + blockSize) : undefined
    const out = encoder.encodeBuffer(l, r)
    if (out.length > 0) samples.push(out)
  }
  const tail = encoder.flush()
  if (tail.length > 0) samples.push(tail)
  return new Blob(samples as BlobPart[], { type: 'audio/mpeg' })
}

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function noteToMidi(note: string): number {
  const m = /^([A-G])(#|b)?(-?\d+)$/.exec(note)
  if (!m) return 60
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
  const accidental = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  const octave = parseInt(m[3], 10)
  return (octave + 1) * 12 + base[m[1]] + accidental
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function safeBase64Encode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function safeBase64Decode(s: string): string {
  let normalised = s.replace(/-/g, '+').replace(/_/g, '/')
  while (normalised.length % 4) normalised += '='
  return decodeURIComponent(escape(atob(normalised)))
}

export function useExport() {
  const beatStore = useBeatMakerStore()
  const { getMasterOutput, ensureToneStarted } = useAudio()
  const { play, stop, ensureWatchers } = useBeatMaker()

  async function recordMasterRealtime(durationSec: number): Promise<Blob | null> {
    await ensureToneStarted()
    const master = getMasterOutput()
    if (!master) return null
    const recorder = new Tone.Recorder()
    master.connect(recorder)
    ensureWatchers()
    const wasPlaying = beatStore.playing
    if (!wasPlaying) await play()
    recording.value = true
    await recorder.start()
    await new Promise((resolve) => setTimeout(resolve, Math.max(500, durationSec * 1000)))
    const blob = await recorder.stop()
    recording.value = false
    if (!wasPlaying) stop()
    master.disconnect(recorder)
    recorder.dispose()
    return blob
  }

  function defaultDurationSeconds(): number {
    const stepDur = 60 / beatStore.bpm / 4
    return stepDur * beatStore.stepCount
  }

  async function exportWav() {
    if (exporting.value) return
    exporting.value = true
    try {
      const blob = await recordMasterRealtime(defaultDurationSeconds() + 0.5)
      if (!blob) return
      const buffer = await blobToBuffer(blob)
      downloadBlob(bufferToWavBlob(buffer), `klabmusic-${Date.now()}.wav`)
    } finally {
      exporting.value = false
    }
  }

  async function exportMp3() {
    if (exporting.value) return
    exporting.value = true
    try {
      const blob = await recordMasterRealtime(defaultDurationSeconds() + 0.5)
      if (!blob) return
      const buffer = await blobToBuffer(blob)
      const mp3 = await bufferToMp3Blob(buffer)
      downloadBlob(mp3, `klabmusic-${Date.now()}.mp3`)
    } finally {
      exporting.value = false
    }
  }

  async function exportMidi() {
    interface MidiModule {
      default?: {
        Track: new () => MidiTrack
        Writer: new (tracks: MidiTrack[]) => MidiWriter
        NoteEvent: new (opts: { pitch: string[] | number[]; duration: string; startTick?: number; velocity?: number }) => unknown
      }
      Track?: new () => MidiTrack
      Writer?: new (tracks: MidiTrack[]) => MidiWriter
      NoteEvent?: new (opts: { pitch: string[] | number[]; duration: string; startTick?: number; velocity?: number }) => unknown
    }
    interface MidiTrack {
      setTempo: (bpm: number) => void
      addEvent: (event: unknown) => void
    }
    interface MidiWriter {
      buildFile: () => Uint8Array
      base64: () => string
    }
    const mod = (await import('midi-writer-js')) as unknown as MidiModule
    const Lib = mod.default ?? mod
    if (!Lib.Track || !Lib.Writer || !Lib.NoteEvent) return

    const stepCount = beatStore.stepCount
    const ticksPerStep = stepCount === 32 ? 64 : 128
    const track = new Lib.Track()
    track.setTempo(beatStore.bpm)
    for (const t of beatStore.activePattern.tracks) {
      if (t.instrument === 'drums') continue
      for (let i = 0; i < t.steps.length; i++) {
        const step = t.steps[i]
        if (!step.active) continue
        const pitch = noteToMidi(t.note)
        track.addEvent(
          new Lib.NoteEvent({
            pitch: [pitch],
            duration: '8',
            startTick: i * ticksPerStep,
            velocity: Math.min(127, Math.max(1, step.velocity)),
          }),
        )
      }
    }
    const writer = new Lib.Writer([track])
    const bytes = writer.buildFile()
    const blob = new Blob([bytes as BlobPart], { type: 'audio/midi' })
    downloadBlob(blob, `klabmusic-${beatStore.activePattern.name}-${Date.now()}.mid`)
  }

  function buildShareUrl(pattern: Pattern): string {
    const payload = {
      v: 1,
      bpm: beatStore.bpm,
      swing: beatStore.swing,
      stepCount: beatStore.stepCount,
      pattern,
    }
    const encoded = safeBase64Encode(JSON.stringify(payload))
    const url = `${window.location.origin}/s/${encoded}`
    lastShareUrl.value = url
    return url
  }

  function tryDecodeShare(encoded: string): { bpm: number; swing: number; stepCount: 16 | 32; pattern: Pattern } | null {
    try {
      const json = safeBase64Decode(encoded)
      const data = JSON.parse(json) as {
        bpm?: number
        swing?: number
        stepCount?: number
        pattern?: Pattern
      }
      if (!data.pattern || !Array.isArray(data.pattern.tracks)) return null
      return {
        bpm: data.bpm ?? 120,
        swing: data.swing ?? 0,
        stepCount: data.stepCount === 32 ? 32 : 16,
        pattern: data.pattern,
      }
    } catch {
      return null
    }
  }

  function importSharedPattern(encoded: string): boolean {
    const data = tryDecodeShare(encoded)
    if (!data) return false
    beatStore.bpm = data.bpm
    beatStore.swing = data.swing
    beatStore.stepCount = data.stepCount
    const newPattern = { ...data.pattern, id: 'shared-' + Math.random().toString(36).slice(2, 8) }
    beatStore.patterns.push(newPattern)
    beatStore.activePatternId = newPattern.id
    return true
  }

  async function generateQrDataUrl(text: string): Promise<string> {
    const mod = (await import('qrcode')) as unknown as {
      toDataURL: (text: string, options?: { width?: number; margin?: number; color?: { dark?: string; light?: string } }) => Promise<string>
    }
    return mod.toDataURL(text, {
      width: 320,
      margin: 2,
      color: { dark: '#050510', light: '#f5a623' },
    })
  }

  async function copyShareLinkToClipboard(): Promise<boolean> {
    if (!lastShareUrl.value) return false
    try {
      await navigator.clipboard.writeText(lastShareUrl.value)
      return true
    } catch {
      return false
    }
  }

  return {
    recording,
    exporting,
    lastShareUrl,
    exportWav,
    exportMp3,
    exportMidi,
    buildShareUrl,
    importSharedPattern,
    generateQrDataUrl,
    copyShareLinkToClipboard,
  }
}
