import { ref, onBeforeUnmount } from 'vue'
import * as Tone from 'tone'
import { detectPitchHz, frequencyToMidiFloat, midiFloatToPitchResult } from '@/lib/pitch'

// Real-time instrument / vocal tuner. Reads the live mic stream
// independently of the recorder's monitoring chain — the tuner needs
// a CLEAN signal (no FX coloring the pitch) and the mic monitor
// intentionally routes through the studio's effect chain.
//
// Pulls 4096-sample windows off an AnalyserNode at 30 Hz, runs the
// existing YIN detector, and exposes the result as reactive refs the
// UI binds straight to. Auto-pauses when stop() is called or the
// component unmounts so we never burn cycles on YIN when the panel
// is hidden.
//
// Module-scoped state because the mic node graph is global to the
// tab — multiple useTuner() callers share the same source / analyser
// and the last unmount tears them down.

interface TunerReading {
  hz: number
  midi: number
  noteName: string
  cents: number
  /** When true, the reading came from a clean YIN dip — colour it
   *  green / call it 'in tune'. False means YIN found nothing
   *  (silence, breath noise, polyphonic) and the UI should clear. */
  confident: boolean
}

const reading = ref<TunerReading | null>(null)
const running = ref(false)
const error = ref<string | null>(null)

let micStream: MediaStream | null = null
let source: MediaStreamAudioSourceNode | null = null
let analyser: AnalyserNode | null = null
let tickHandle: number | null = null
const buffer = new Float32Array(4096)

function rawContext(): AudioContext {
  return Tone.getContext().rawContext as AudioContext
}

async function buildGraph(): Promise<{ ok: boolean; message?: string }> {
  if (analyser) return { ok: true }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return { ok: false, message: 'Mic not available' }
  }
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        // Disable the browser's auto-tuning DSP so YIN sees the raw
        // signal. echoCancellation can suppress sustained vocal
        // tones it mis-classifies as feedback; noiseSuppression
        // squashes breath; autoGainControl warps cents at low input
        // levels.
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    const ctx = rawContext()
    source = ctx.createMediaStreamSource(micStream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 4096
    analyser.smoothingTimeConstant = 0
    source.connect(analyser)
    return { ok: true }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Mic permission denied' }
  }
}

function teardownGraph() {
  if (analyser) { try { analyser.disconnect() } catch { /* idem */ } analyser = null }
  if (source) { try { source.disconnect() } catch { /* idem */ } source = null }
  if (micStream) {
    for (const track of micStream.getTracks()) track.stop()
    micStream = null
  }
}

function tick() {
  if (!running.value || !analyser) return
  // 30 Hz feels live without flickering. Higher rates show YIN's
  // jitter on a held vibrato note as visible needle bounce.
  analyser.getFloatTimeDomainData(buffer)
  const hz = detectPitchHz(buffer, analyser.context.sampleRate)
  if (hz === null) {
    // Hold the previous reading rather than clearing — a singer
    // taking a breath doesn't need the needle to spasm to centre
    // every two seconds.
    reading.value = reading.value ? { ...reading.value, confident: false } : null
  } else {
    const midi = frequencyToMidiFloat(hz)
    const r = midiFloatToPitchResult(midi)
    reading.value = {
      hz,
      midi,
      noteName: r.noteName,
      cents: r.cents,
      confident: true,
    }
  }
  tickHandle = window.setTimeout(tick, 33)
}

export function useTuner() {
  async function start(): Promise<{ ok: boolean; message?: string }> {
    if (running.value) return { ok: true }
    const built = await buildGraph()
    if (!built.ok) {
      error.value = built.message ?? null
      return built
    }
    error.value = null
    running.value = true
    tick()
    return { ok: true }
  }

  function stop() {
    running.value = false
    if (tickHandle !== null) {
      clearTimeout(tickHandle)
      tickHandle = null
    }
    reading.value = null
    teardownGraph()
  }

  onBeforeUnmount(() => {
    if (running.value) stop()
  })

  return {
    reading,
    running,
    error,
    start,
    stop,
  }
}
