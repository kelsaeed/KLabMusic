import { ref, shallowRef, onBeforeUnmount } from 'vue'
import * as Tone from 'tone'
import { useAudio } from '@/composables/useAudio'

/**
 * Audio watchdog — a live, DSP-level monitor that proves *what* the
 * output is doing the instant it goes wrong, so the "wshhhh / it
 * stops" can be root-caused instead of guessed at.
 *
 * It taps the master analyser nodes the engine already exposes
 * (`getMasterAnalyser` = 1024-sample time domain, `getMasterFft` =
 * 64-bin spectrum) and, every animation frame, measures the output
 * with real signal maths:
 *
 *  • peak / rms            — level. rms≈0 while notes are held ⇒ a
 *                            DROPOUT (the "sound disappears").
 *  • dcOffset              — mean sample. a large DC step is a node
 *                            blowing up.
 *  • clipFrac              — fraction of samples railed at ±1. high ⇒
 *                            CLIP (sum of voices past full scale).
 *  • spectralFlatness (SFM)— geometric-mean / arithmetic-mean of the
 *                            power spectrum. THE objective "is this
 *                            white noise?" measure: a pure tone →
 *                            SFM≈0, broadband hiss → SFM≈1. A high
 *                            SFM together with real level is exactly
 *                            the "wshhhh" — the audio thread feeding
 *                            the speakers garbage/repeated frames
 *                            because it underran.
 *  • highRatio             — share of spectral energy above ~6 kHz.
 *                            corroborates SFM (underrun hiss is
 *                            high-frequency-heavy).
 *
 * It also watches the things that make sound vanish:
 *  • AudioContext.state transitions (running → suspended/interrupted
 *    = the OS pulled the context out from under us).
 *  • Main-thread frame stalls. Tone schedules from the main thread;
 *    a long gap between animation frames is a stall, and a stall
 *    longer than the audio buffer is precisely what starves the
 *    audio thread into the wshhh. We measure every gap and flag the
 *    big ones with their exact millisecond length.
 *  • Engine polyphony (via getEngineDiagnostics) so an event can be
 *    correlated with "a chord / fast run was happening right then".
 *  • window error / unhandledrejection / console.error.
 *
 * Anomalies become timestamped events with a full metric snapshot,
 * kept in a ring buffer alongside a rolling metric history.
 * `buildReport()` serialises everything (environment + session stats
 * + timeline + recent samples) so a single copy-paste captures
 * exactly what happened.
 *
 * The monitor itself is cheap: it only *reads* analyser buffers the
 * engine fills anyway and does one O(1024) pass — it cannot itself
 * be the cause of the overload it is measuring.
 */

export interface WatchdogMetrics {
  /** performance.now() ms of this sample. */
  t: number
  peak: number
  rms: number
  dcOffset: number
  clipFrac: number
  /** Spectral flatness 0..1 (≈1 = white-noise-like = wshhh). */
  flatness: number
  /** Energy fraction above ~6 kHz, 0..1. */
  highRatio: number
  /** ms since the previous frame (main-thread health). */
  frameGapMs: number
  ctxState: string
  voices: number
}

export interface WatchdogEvent {
  /** performance.now() ms. */
  t: number
  /** Wall-clock ISO for the report. */
  iso: string
  type: 'WSHHH' | 'CLIP' | 'DROPOUT' | 'STALL' | 'CTX' | 'ERROR' | 'INFO'
  detail: string
  snapshot: WatchdogMetrics & {
    sampleRate: number
    baseLatencyMs: number
    outputLatencyMs: number
    instruments: string[]
    activeNotes: string[]
  }
}

const MAX_EVENTS = 300
const MAX_SAMPLES = 900 // ~15 s at 60 fps

export function useAudioWatchdog() {
  const { getMasterAnalyser, getMasterFft, getEngineDiagnostics } = useAudio()

  const running = ref(false)
  const live = ref<WatchdogMetrics | null>(null)
  const events = shallowRef<WatchdogEvent[]>([])
  const samples: WatchdogMetrics[] = []
  const counts = ref<Record<WatchdogEvent['type'], number>>({
    WSHHH: 0, CLIP: 0, DROPOUT: 0, STALL: 0, CTX: 0, ERROR: 0, INFO: 0,
  })

  let raf = 0
  let lastFrame = 0
  let startedAt = 0
  let lastCtxState = ''
  // Debounce accumulators (ms of continuous condition) so a single
  // transient block doesn't spam events; we want sustained faults.
  let wshhhMs = 0
  let dropoutMs = 0
  let lastWshhhEvent = 0
  let lastDropoutEvent = 0
  let maxFrameGap = 0
  let stallCount = 0
  let frameCount = 0

  // Saved console.error so we can restore it on stop.
  let origError: ((...a: unknown[]) => void) | null = null

  function snapshot(m: WatchdogMetrics): WatchdogEvent['snapshot'] {
    const ctx = Tone.getContext()
    const raw = ctx.rawContext as unknown as {
      baseLatency?: number
      outputLatency?: number
    }
    let instruments: string[] = []
    let activeNotes: string[] = []
    try {
      const d = getEngineDiagnostics()
      instruments = d.loadedInstruments as string[]
      activeNotes = d.activeNotes.map((n) => `${n.instrumentId}:${n.note}`)
    } catch {
      /* engine not ready */
    }
    return {
      ...m,
      sampleRate: ctx.sampleRate,
      baseLatencyMs: Math.round((raw.baseLatency ?? 0) * 1000),
      outputLatencyMs: Math.round((raw.outputLatency ?? 0) * 1000),
      instruments,
      activeNotes,
    }
  }

  function pushEvent(type: WatchdogEvent['type'], detail: string, m: WatchdogMetrics) {
    const ev: WatchdogEvent = {
      t: m.t,
      iso: new Date().toISOString(),
      type,
      detail,
      snapshot: snapshot(m),
    }
    const next = events.value.slice(-(MAX_EVENTS - 1))
    next.push(ev)
    events.value = next
    counts.value[type]++
  }

  function analyse(now: number) {
    const wave = getMasterAnalyser()
    const fft = getMasterFft()
    const gap = lastFrame === 0 ? 16.7 : now - lastFrame
    lastFrame = now
    frameCount++

    let peak = 0
    let sumSq = 0
    let sum = 0
    let clipped = 0
    let n = 0
    if (wave) {
      const w = wave.getValue() as Float32Array
      n = w.length
      for (let i = 0; i < n; i++) {
        const s = w[i]
        const a = s < 0 ? -s : s
        if (a > peak) peak = a
        sumSq += s * s
        sum += s
        if (a >= 0.999) clipped++
      }
    }
    const rms = n ? Math.sqrt(sumSq / n) : 0
    const dcOffset = n ? sum / n : 0
    const clipFrac = n ? clipped / n : 0

    // Spectral flatness + high-frequency ratio from the dB FFT.
    let flatness = 0
    let highRatio = 0
    if (fft) {
      const f = fft.getValue() as Float32Array
      const m = f.length
      const ctx = Tone.getContext()
      const nyquist = ctx.sampleRate / 2
      const binHz = nyquist / m
      let logSum = 0
      let arithSum = 0
      let totalE = 0
      let highE = 0
      let valid = 0
      for (let k = 0; k < m; k++) {
        // dB → linear power. Floor at -100 dB so silent bins don't
        // send the geometric mean to zero.
        const db = f[k] < -100 ? -100 : f[k]
        const p = Math.pow(10, db / 10)
        if (p > 0) {
          logSum += Math.log(p)
          arithSum += p
          valid++
        }
        totalE += p
        if (k * binHz >= 6000) highE += p
      }
      if (valid > 0 && arithSum > 0) {
        const geo = Math.exp(logSum / valid)
        const arith = arithSum / valid
        flatness = Math.min(1, geo / arith)
      }
      highRatio = totalE > 0 ? highE / totalE : 0
    }

    let voices = 0
    let ctxState = 'unknown'
    try {
      const d = getEngineDiagnostics()
      voices = d.polyphony.active
      ctxState = d.audioContextState
    } catch {
      ctxState = Tone.getContext().state
    }

    const m: WatchdogMetrics = {
      t: now,
      peak,
      rms,
      dcOffset,
      clipFrac,
      flatness,
      highRatio,
      frameGapMs: gap,
      ctxState,
      voices,
    }
    live.value = m
    samples.push(m)
    if (samples.length > MAX_SAMPLES) samples.shift()

    // — Classification —

    // Context left 'running' → the sound is gone because the OS / page
    // suspended the audio thread, not because of synthesis.
    if (ctxState !== lastCtxState) {
      if (lastCtxState && ctxState !== 'running') {
        pushEvent('CTX', `AudioContext: ${lastCtxState} → ${ctxState} (output halted)`, m)
      } else if (lastCtxState && ctxState === 'running') {
        pushEvent('INFO', `AudioContext resumed (${lastCtxState} → running)`, m)
      }
      lastCtxState = ctxState
    }

    // Main-thread stall. A gap well past one frame means the main
    // thread froze; if it froze longer than the audio buffer the
    // audio thread underran → that IS the wshhh trigger. Flag with
    // the exact length so the report shows how long the freeze was.
    if (gap > maxFrameGap) maxFrameGap = gap
    if (gap > 120) {
      stallCount++
      pushEvent('STALL', `main-thread stall ${Math.round(gap)} ms (audio-thread starve risk)`, m)
    }

    // WSHHH: broadband noise (flat spectrum) at real level. Require it
    // to persist ~100 ms and rate-limit to one event / 800 ms so a
    // burst is one entry, not fifty.
    if (flatness > 0.5 && rms > 0.02 && highRatio > 0.35) {
      wshhhMs += gap
      if (wshhhMs > 100 && now - lastWshhhEvent > 800) {
        lastWshhhEvent = now
        pushEvent(
          'WSHHH',
          `broadband noise burst — flatness ${flatness.toFixed(2)}, ` +
            `hi-freq ${(highRatio * 100) | 0}%, rms ${rms.toFixed(3)}, ` +
            `${voices} voices (buffer underrun / overload signature)`,
          m,
        )
      }
    } else {
      wshhhMs = 0
    }

    // CLIP: a meaningful fraction of samples railed — the summed
    // voices exceeded full scale before the limiter caught them.
    if (clipFrac > 0.02) {
      pushEvent(
        'CLIP',
        `hard clipping — ${(clipFrac * 100).toFixed(1)}% of samples at ±1, ` +
          `peak ${peak.toFixed(3)}, ${voices} voices`,
        m,
      )
    }

    // DROPOUT: voices are active but the output is essentially silent
    // for ≥180 ms — the "it just stops playing".
    if (voices > 0 && rms < 0.0009 && ctxState === 'running') {
      dropoutMs += gap
      if (dropoutMs > 180 && now - lastDropoutEvent > 800) {
        lastDropoutEvent = now
        pushEvent(
          'DROPOUT',
          `silent output with ${voices} voice(s) held for ` +
            `${Math.round(dropoutMs)} ms (sound disappeared mid-play)`,
          m,
        )
      }
    } else {
      dropoutMs = 0
    }
  }

  function loop() {
    raf = requestAnimationFrame(loop)
    if (!running.value) return
    try {
      analyse(performance.now())
    } catch {
      /* never let the monitor throw into rAF */
    }
  }

  function onWindowError(e: ErrorEvent) {
    if (!live.value) return
    pushEvent('ERROR', `window.onerror: ${e.message}`, live.value)
  }
  function onRejection(e: PromiseRejectionEvent) {
    if (!live.value) return
    const r = e.reason
    pushEvent('ERROR', `unhandledrejection: ${r instanceof Error ? r.message : String(r)}`, live.value)
  }

  function start() {
    if (running.value) return
    running.value = true
    startedAt = performance.now()
    lastFrame = 0
    frameCount = 0
    stallCount = 0
    maxFrameGap = 0
    lastCtxState = Tone.getContext().state
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onRejection)
    // Mirror console.error into the timeline without losing the real log.
    origError = console.error.bind(console)
    console.error = (...args: unknown[]) => {
      origError?.(...args)
      if (live.value) {
        const msg = args
          .map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
          .join(' ')
          .slice(0, 300)
        pushEvent('ERROR', `console.error: ${msg}`, live.value)
      }
    }
    if (!raf) raf = requestAnimationFrame(loop)
  }

  function stop() {
    running.value = false
    window.removeEventListener('error', onWindowError)
    window.removeEventListener('unhandledrejection', onRejection)
    if (origError) {
      console.error = origError
      origError = null
    }
  }

  function clear() {
    events.value = []
    samples.length = 0
    counts.value = { WSHHH: 0, CLIP: 0, DROPOUT: 0, STALL: 0, CTX: 0, ERROR: 0, INFO: 0 }
    startedAt = performance.now()
    frameCount = 0
    stallCount = 0
    maxFrameGap = 0
  }

  function buildReport(): string {
    const ctx = Tone.getContext()
    const raw = ctx.rawContext as unknown as {
      baseLatency?: number
      outputLatency?: number
    }
    const durSec = (performance.now() - startedAt) / 1000
    let peakRms = 0
    let peakLevel = 0
    let maxFlat = 0
    for (const s of samples) {
      if (s.rms > peakRms) peakRms = s.rms
      if (s.peak > peakLevel) peakLevel = s.peak
      if (s.flatness > maxFlat) maxFlat = s.flatness
    }
    const report = {
      generatedAt: new Date().toISOString(),
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGB: (navigator as unknown as { deviceMemory?: number }).deviceMemory ?? null,
        sampleRate: ctx.sampleRate,
        baseLatencyMs: Math.round((raw.baseLatency ?? 0) * 1000),
        outputLatencyMs: Math.round((raw.outputLatency ?? 0) * 1000),
        toneLookAheadSec: ctx.lookAhead,
        contextState: ctx.state,
      },
      session: {
        durationSec: Number(durSec.toFixed(1)),
        frames: frameCount,
        avgFps: durSec > 0 ? Math.round(frameCount / durSec) : 0,
        stalls: stallCount,
        maxFrameGapMs: Math.round(maxFrameGap),
        peakRms: Number(peakRms.toFixed(4)),
        peakLevel: Number(peakLevel.toFixed(4)),
        maxFlatness: Number(maxFlat.toFixed(3)),
        eventCounts: counts.value,
      },
      timeline: events.value.map((e) => ({
        atSec: Number(((e.t - startedAt) / 1000).toFixed(2)),
        iso: e.iso,
        type: e.type,
        detail: e.detail,
        ctx: e.snapshot.ctxState,
        voices: e.snapshot.voices,
        rms: Number(e.snapshot.rms.toFixed(4)),
        peak: Number(e.snapshot.peak.toFixed(4)),
        flatness: Number(e.snapshot.flatness.toFixed(3)),
        highRatio: Number(e.snapshot.highRatio.toFixed(3)),
        frameGapMs: Math.round(e.snapshot.frameGapMs),
        instruments: e.snapshot.instruments,
        activeNotes: e.snapshot.activeNotes,
      })),
      recentSamples: samples.slice(-180).map((s) => ({
        atSec: Number(((s.t - startedAt) / 1000).toFixed(2)),
        rms: Number(s.rms.toFixed(4)),
        peak: Number(s.peak.toFixed(4)),
        flat: Number(s.flatness.toFixed(3)),
        hi: Number(s.highRatio.toFixed(3)),
        gap: Math.round(s.frameGapMs),
        v: s.voices,
      })),
    }
    return JSON.stringify(report, null, 2)
  }

  onBeforeUnmount(() => {
    stop()
    if (raf) cancelAnimationFrame(raf)
    raf = 0
  })

  return {
    running,
    live,
    events,
    counts,
    start,
    stop,
    clear,
    buildReport,
  }
}
