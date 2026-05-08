import * as Tone from 'tone'
import { ref } from 'vue'
import { useArrangeStore } from '@/stores/arrange'
import { useRecorderStore } from '@/stores/recorder'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useAudio } from '@/composables/useAudio'
import { bufferToWavBlob, downloadBlob, sanitizeFilename } from '@/lib/wav'
import type { ArrangeClip, ArrangeTrack, LiveTakeEvent } from '@/lib/types'

// Stem export state, exposed to the UI for progress feedback.
export interface StemExportProgress {
  active: boolean
  trackIndex: number
  trackTotal: number
  trackName: string
}
const stemExportProgress = ref<StemExportProgress>({
  active: false,
  trackIndex: 0,
  trackTotal: 0,
  trackName: '',
})

// Arrangement playback engine. Schedules every clip on Tone.Transport at its
// absolute startSec — audio clips through Tone.Player, pattern clips by
// stepping through the beat-maker pattern's tracks for the duration of the
// clip. Multiple clips on the same track play sequentially in calendar
// order; multiple tracks play in parallel.
//
// MVP scope: scheduling + transport + playhead reporting. Not yet here:
// per-track FX (will live on the track once Phase 4's per-track audio bus
// lands), automation lanes, time-stretching to match clip durationSec to
// arrangement BPM. The current design keeps audio clips at their recorded
// tempo and lets the user drag them visually to wherever they fit.

interface ScheduledNode {
  player?: Tone.Player
  pitch?: Tone.PitchShift
  fxNodes?: Tone.ToneAudioNode[]  // per-track FX chain to dispose
  patternEvents?: number[]  // Tone.Transport event IDs for pattern triggers
}

let scheduled: ScheduledNode[] = []
let positionTimer: ReturnType<typeof setInterval> | null = null

function clearScheduled() {
  for (const node of scheduled) {
    if (node.player) {
      node.player.stop()
      node.player.dispose()
    }
    if (node.pitch) node.pitch.dispose()
    if (node.fxNodes) for (const n of node.fxNodes) n.dispose()
    if (node.patternEvents) {
      for (const id of node.patternEvents) Tone.getTransport().clear(id)
    }
  }
  scheduled = []
}

/**
 * Build the per-track FX chain for an audio track. Returns an entry node
 * (connect the source here), the list of nodes to dispose afterwards,
 * and individual references to reverb / delay / filter so the automation
 * scheduler can ramp their AudioParams while the clip plays.
 *
 * Today's chain: Reverb (wet/dry mix) → FeedbackDelay → Lowpass Filter.
 * Each effect is bypassed when its `enabled` flag is false (wet/feedback
 * pinned to 0, filter cutoff lifted to 20 kHz).
 */
function buildTrackFxChain(
  fx: import('@/lib/types').ArrangeTrackFx,
  destination: Tone.ToneAudioNode,
): {
  entry: Tone.ToneAudioNode
  nodes: Tone.ToneAudioNode[]
  reverb: Tone.Reverb
  delay: Tone.FeedbackDelay
  filter: Tone.Filter
} {
  const reverb = new Tone.Reverb({
    decay: 1 + fx.reverb.amount * 4,
    wet: fx.reverb.enabled ? fx.reverb.amount : 0,
  })
  const delay = new Tone.FeedbackDelay({
    delayTime: 0.25,
    feedback: fx.delay.enabled ? fx.delay.amount * 0.7 : 0,
    wet: fx.delay.enabled ? fx.delay.amount : 0,
  })
  const filter = new Tone.Filter({
    frequency: fx.filter.enabled ? 200 + (1 - fx.filter.amount) * 19800 : 20000,
    type: 'lowpass',
    Q: 1,
  })
  reverb.chain(delay, filter, destination)
  return { entry: reverb, nodes: [reverb, delay, filter], reverb, delay, filter }
}

export function useArrange() {
  const store = useArrangeStore()
  const recorderStore = useRecorderStore()
  const beatStore = useBeatMakerStore()
  const { ensureToneStarted, ensureInstrument, playOnTimed, getMasterInput } = useAudio()

  function scheduleAudioClip(track: ArrangeTrack, clip: ArrangeClip, destination?: Tone.ToneAudioNode) {
    if (clip.source.kind !== 'audio') return
    // Alias the narrowed source into a const so subsequent reads inside
    // arrow callbacks keep the narrowed type — TS doesn't carry the
    // .source narrowing through a fresh closure.
    const src = clip.source
    const recClip = recorderStore.clips.find((c) => c.id === src.recorderClipId)
    if (!recClip) return
    const dest = destination ?? getMasterInput()
    if (!dest) return

    // Per-track FX chain — each clip on this track gets its own private
    // chain. We don't share one chain across the track's clips because
    // the chain's disposal lifecycle ties to the scheduled-clip cleanup,
    // and overlapping clips on the same track each want their own
    // delay/reverb tail. Cheap enough — ~3 nodes per scheduled clip.
    const fx = buildTrackFxChain(track.fx, dest)
    const { entry: fxEntry, nodes: fxNodes, reverb, delay, filter } = fx

    // Apply the recorder clip's existing pitch-shift so a clip the user
    // tuned in the recorder still plays in the right key on the timeline.
    const pitch = new Tone.PitchShift({ pitch: recClip.pitchSemitones, wet: 1 })
    pitch.connect(fxEntry)
    const player = new Tone.Player(recClip.buffer)
    player.connect(pitch)
    player.playbackRate = recClip.speed

    // — Schedule volume and FX automation ramps over this clip's range —
    // We use Tone's own AudioParam scheduling so all ramps run at audio-
    // rate and stay sample-accurate even under heavy CPU pressure.
    // Pre-clip "anchor" points at clip.startSec snap the parameter to its
    // sampled curve value before any in-clip ramps fire; without that, a
    // very first point that lies AFTER the clip start would never be
    // honored (the AudioParam would stay at its construction default).
    scheduleParamRamps(
      player.volume,
      track,
      'volume',
      clip.startSec,
      clip.durationSec,
      track.volume,
      // Volume curve [0..1] → dB. Floor at 0.001 to avoid -Infinity that
      // would freeze the ramp when the curve dips to silence.
      (v) => Tone.gainToDb(Math.max(0.001, v)),
    )
    if (track.fx.reverb.enabled) {
      scheduleParamRamps(reverb.wet, track, 'reverb', clip.startSec, clip.durationSec, track.fx.reverb.amount, (v) => v)
    }
    if (track.fx.delay.enabled) {
      scheduleParamRamps(delay.wet, track, 'delay', clip.startSec, clip.durationSec, track.fx.delay.amount, (v) => v)
    }
    if (track.fx.filter.enabled) {
      // Filter cutoff: amount 0 = bright (20 kHz), amount 1 = dark (200 Hz)
      // — same mapping the static FX panel uses. Mapped here per-ramp so
      // the curve's 0..1 range stays intuitive ("100% closed" = dark).
      scheduleParamRamps(
        filter.frequency,
        track,
        'filter',
        clip.startSec,
        clip.durationSec,
        track.fx.filter.amount,
        (v) => 200 + (1 - v) * 19800,
      )
    }

    // Tone.Player.start(time, offset, duration). Both 'time' and 'duration'
    // are at audio-rate so they run on Tone.Transport's clock — even if the
    // user pauses, the schedule resumes with the correct offset.
    player.start(`+${clip.startSec}`, src.offsetSec, clip.durationSec)
    scheduled.push({ player, pitch, fxNodes })
  }

  /**
   * Pre-schedule a ramp sequence on any AudioParam-like Tone target from
   * automation points falling inside [startSec, startSec + durationSec].
   * Duck-typed because Tone exposes the same scheduling methods on both
   * Param<T> and Signal<T> but the two are not assignable to one
   * another in the public types.
   */
  type RampableParam = {
    setValueAtTime(value: number, time: Tone.Unit.Time): unknown
    cancelScheduledValues(time: Tone.Unit.Time): unknown
    linearRampToValueAtTime(value: number, time: Tone.Unit.Time): unknown
  }
  function scheduleParamRamps(
    param: RampableParam,
    track: ArrangeTrack,
    paramId: import('@/lib/types').AutomationParam,
    startSec: number,
    durationSec: number,
    fallback: number,
    map: (v: number) => number,
  ) {
    const lane = track.automation[paramId]
    if (!lane || lane.length === 0) {
      param.setValueAtTime(map(fallback), `+${startSec}`)
      return
    }
    // Anchor at startSec by sampling the curve so ramps inside the clip
    // depart from the right value even if the first lane point is later.
    const startVal = store.sampleAutomation(track, paramId, startSec) ?? fallback
    param.cancelScheduledValues(`+${startSec}`)
    param.setValueAtTime(map(startVal), `+${startSec}`)
    const endSec = startSec + durationSec
    for (const point of lane) {
      if (point.time <= startSec) continue
      if (point.time >= endSec) break
      // 0.005 s ramps land just below the threshold of perceivable steps
      // for synth/percussion material — we use linearRampTo for both
      // freq and gain because exponential ramps require strictly-positive
      // values which automation can't guarantee.
      param.linearRampToValueAtTime(map(point.value), `+${point.time}`)
    }
    // Hold the final value at clip end so the param doesn't decay during
    // the FX tail captured by stem export.
    const tailVal = store.sampleAutomation(track, paramId, endSec) ?? fallback
    param.linearRampToValueAtTime(map(tailVal), `+${endSec}`)
  }

  function schedulePatternClip(track: ArrangeTrack, clip: ArrangeClip) {
    if (clip.source.kind !== 'pattern') return
    const src = clip.source
    const pattern = beatStore.patterns.find((p) => p.id === src.patternId)
    if (!pattern) return

    // Pattern length depends on the beat-maker store's current step count
    // and bpm — we schedule the pattern to repeat for the clip's
    // durationSec, then stop. Each step gets a Tone.Transport event.
    const stepCount = beatStore.stepCount
    const stepDur = 60 / beatStore.bpm / (stepCount === 32 ? 8 : 4)
    const patternDur = stepDur * stepCount
    const repetitions = Math.ceil(clip.durationSec / patternDur)
    const eventIds: number[] = []

    for (let rep = 0; rep < repetitions; rep++) {
      for (let stepIdx = 0; stepIdx < stepCount; stepIdx++) {
        const tWithinClip = rep * patternDur + stepIdx * stepDur
        if (tWithinClip >= clip.durationSec) break
        const absoluteT = clip.startSec + tWithinClip
        // Capture the index by closure so each event reads its own step.
        const idx = stepIdx
        const id = Tone.getTransport().schedule((time) => {
          // Pattern tracks only support volume automation today (their FX
          // live on the global per-instrument chain). Sample the curve at
          // step-trigger time and fold it into the velocity multiplier.
          const automatedVol = store.sampleAutomation(track, 'volume', absoluteT)
          const trackVol = automatedVol !== null ? automatedVol : track.volume
          for (const t of pattern.tracks) {
            if (t.muted) continue
            const step = t.steps[idx]
            if (!step || !step.active) continue
            const vel = Math.round(step.velocity * t.volume * trackVol)
            Tone.getDraw().schedule(() => {
              void playOnTimed(t.instrument, t.note, stepDur, vel)
            }, time)
          }
        }, absoluteT)
        eventIds.push(id)
      }
    }
    scheduled.push({ patternEvents: eventIds })
  }

  async function play() {
    await ensureToneStarted()
    if (store.isPlaying) return
    // Pre-warm every instrument any pattern clip uses so the first scheduled
    // step can fire instantly — no race against soundfont/sample load.
    const instruments = new Set<import('@/lib/types').InstrumentId>()
    for (const t of store.tracks) {
      for (const c of t.clips) {
        if (c.source.kind !== 'pattern') continue
        const src = c.source
        const p = beatStore.patterns.find((pp) => pp.id === src.patternId)
        if (p) for (const tr of p.tracks) instruments.add(tr.instrument)
      }
    }
    await Promise.all(Array.from(instruments).map((id) => ensureInstrument(id)))

    clearScheduled()
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    Tone.getTransport().bpm.value = store.bpm

    for (const track of store.tracks) {
      if (!store.shouldPlayTrack(track)) continue
      for (const clip of track.clips) {
        if (clip.source.kind === 'audio') scheduleAudioClip(track, clip)
        else if (clip.source.kind === 'pattern') schedulePatternClip(track, clip)
        else if (clip.source.kind === 'liveTake') scheduleLiveTakeClip(track, clip)
      }
    }

    Tone.getTransport().start()
    store.isPlaying = true
    store.playheadSec = 0

    if (positionTimer) clearInterval(positionTimer)
    positionTimer = setInterval(() => {
      const t = Tone.getTransport().seconds
      store.playheadSec = t
      if (t >= store.totalDurationSec) {
        stop()
      }
    }, 33)
  }

  function stop() {
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    clearScheduled()
    if (positionTimer) {
      clearInterval(positionTimer)
      positionTimer = null
    }
    store.isPlaying = false
    store.playheadSec = 0
  }

  function toggle() {
    if (store.isPlaying) stop()
    else void play()
  }

  /**
   * Add an audio clip from the recorder onto the given track, snapped to
   * the nearest beat division at startSec. Defaults to the natural
   * duration of the source clip, trimmed by its trimStart/trimEnd.
   */
  function addRecorderClipToTrack(trackId: string, recorderClipId: string, startSec: number) {
    const recClip = recorderStore.clips.find((c) => c.id === recorderClipId)
    if (!recClip) return null
    const start = Math.max(0, startSec)
    const trimStartSec = recClip.trimStart * recClip.duration
    const trimEndSec = recClip.trimEnd * recClip.duration
    const dur = Math.max(0.05, (trimEndSec - trimStartSec) / Math.max(0.05, recClip.speed))
    return store.addClip(trackId, {
      startSec: start,
      durationSec: dur,
      source: {
        kind: 'audio',
        recorderClipId,
        offsetSec: trimStartSec,
      },
    })
  }

  /**
   * Add a beat-maker pattern as a clip on the given track, defaulting to
   * 4 bars of the pattern at the arrangement's BPM.
   */
  function addPatternClipToTrack(trackId: string, patternId: string, startSec: number, bars = 4) {
    const stepCount = beatStore.stepCount
    const stepDur = 60 / beatStore.bpm / (stepCount === 32 ? 8 : 4)
    const patternDur = stepDur * stepCount
    return store.addClip(trackId, {
      startSec: Math.max(0, startSec),
      durationSec: patternDur * bars,
      source: { kind: 'pattern', patternId },
    })
  }

  /**
   * Schedule a live-take clip — replays each captured note at its
   * relative time, offset by the clip's startSec on the timeline.
   * Uses playOnTimed so the per-event duration the user "performed" is
   * honoured even if they held a key longer than the clip's bounds.
   */
  function scheduleLiveTakeClip(track: ArrangeTrack, clip: ArrangeClip) {
    if (clip.source.kind !== 'liveTake') return
    const events = clip.source.events
    const eventIds: number[] = []
    const trackVolMul = track.volume
    for (const ev of events) {
      const absoluteT = clip.startSec + ev.time
      // Cap to clip end so editing the clip's durationSec down truncates
      // its tail, matching audio clip behaviour.
      if (ev.time >= clip.durationSec) continue
      const remaining = Math.min(ev.duration, clip.durationSec - ev.time)
      const id = Tone.getTransport().schedule((time) => {
        // Sample the volume curve at trigger time so live takes pick up
        // automation just like pattern clips do.
        const automatedVol = store.sampleAutomation(track, 'volume', absoluteT)
        const vol = automatedVol !== null ? automatedVol : trackVolMul
        Tone.getDraw().schedule(() => {
          void playOnTimed(ev.instrument, ev.note, remaining, Math.round(ev.velocity * vol))
        }, time)
      }, absoluteT)
      eventIds.push(id)
    }
    scheduled.push({ patternEvents: eventIds })
  }

  /**
   * Take a freshly-finished live-take recording from the Live Play stage
   * and drop it onto the timeline. Creates a new pattern-kind track
   * named after the user's chosen take name (or "Live take N"), with the
   * clip starting at the current playhead.
   */
  function addLiveTakeToTimeline(events: LiveTakeEvent[], durationSec: number, name: string) {
    if (events.length === 0 || durationSec <= 0) {
      return { ok: false as const, message: 'Empty take.' }
    }
    const track = store.addPatternTrack(name)
    store.addClip(track.id, {
      startSec: store.playheadSec,
      durationSec,
      source: { kind: 'liveTake', events, name },
    })
    return { ok: true as const, trackId: track.id }
  }

  /**
   * Render every track in the arrangement to a separate WAV file and trigger
   * a browser download for each. The export is real-time — we play the
   * arrangement once per track with everything except that track muted, and
   * record the master output via a MediaStream tap. Real-time keeps the
   * audio graph identical to what the user hears (per-track FX, mastering
   * preset, every Tone routing decision); offline rendering would require
   * reconstructing the entire engine inside Tone.Offline's context.
   *
   * Audio nodes are shared with live playback, so we restore the original
   * mute state for every track once we're done — no surprise side effects
   * on the UI after export finishes.
   */
  async function exportStems(): Promise<{ ok: boolean; message: string }> {
    if (store.isPlaying) stop()
    if (store.tracks.length === 0) {
      return { ok: false, message: 'No tracks to export.' }
    }
    await ensureToneStarted()

    const masterIn = getMasterInput()
    if (!masterIn) return { ok: false, message: 'Master chain unavailable.' }

    // Snapshot mute state so we can restore the arrangement to whatever the
    // user had configured once export wraps. This matters because we mutate
    // every track's `muted` flag during the loop to solo each track.
    const originalMute = store.tracks.map((t) => t.muted)
    const totalDur = store.totalDurationSec
    if (totalDur <= 0.5) {
      return { ok: false, message: 'Arrangement is too short.' }
    }

    stemExportProgress.value = {
      active: true,
      trackIndex: 0,
      trackTotal: store.tracks.length,
      trackName: '',
    }

    try {
      for (let i = 0; i < store.tracks.length; i++) {
        const target = store.tracks[i]
        stemExportProgress.value = {
          active: true,
          trackIndex: i + 1,
          trackTotal: store.tracks.length,
          trackName: target.name,
        }

        // Solo this track by muting every other one. Synchronous mutation
        // before scheduling so the play() call below sees the new state.
        for (let j = 0; j < store.tracks.length; j++) {
          store.tracks[j].muted = j !== i
        }

        await renderTrackToFile(target, totalDur, masterIn)
      }
      return { ok: true, message: `Exported ${store.tracks.length} stems.` }
    } finally {
      // Restore original mute state regardless of success or thrown error
      // — the user shouldn't have to manually un-mute every track if a
      // single render fails halfway through.
      for (let i = 0; i < store.tracks.length; i++) {
        store.tracks[i].muted = originalMute[i] ?? false
      }
      stemExportProgress.value = { active: false, trackIndex: 0, trackTotal: 0, trackName: '' }
    }
  }

  /**
   * Helper for exportStems: schedule + record one track for `durationSec`.
   * Connects a MediaStreamDestination to the master so we capture exactly
   * what the speakers would play, runs the arrangement, then encodes the
   * recorded blob into a WAV via decodeAudioData → bufferToWavBlob.
   */
  async function renderTrackToFile(
    target: ArrangeTrack,
    durationSec: number,
    masterIn: Tone.ToneAudioNode,
  ): Promise<void> {
    const ctx = Tone.getContext().rawContext as AudioContext
    const destNode = ctx.createMediaStreamDestination()
    // Tone's master output node lives at Tone.getDestination() — tap that
    // to capture the post-mastering, post-analyser signal. We route a copy
    // to destNode in addition to the speakers so the user can hear the
    // export progressing (mute-everything-but-target = quiet enough not to
    // be disruptive but audible feedback that something's happening).
    Tone.getDestination().connect(destNode)

    let chunks: BlobPart[] = []
    const recorder = new MediaRecorder(destNode.stream)
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    const finished = new Promise<void>((resolve) => {
      recorder.onstop = () => resolve()
    })
    recorder.start()

    clearScheduled()
    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    Tone.getTransport().bpm.value = store.bpm

    for (const track of store.tracks) {
      if (!store.shouldPlayTrack(track)) continue
      for (const clip of track.clips) {
        if (clip.source.kind === 'audio') scheduleAudioClip(track, clip, masterIn)
        else schedulePatternClip(track, clip)
      }
    }

    Tone.getTransport().start()
    // 200 ms tail past the arrangement end so reverb / delay decays are
    // captured instead of cut at the bar line.
    await new Promise((r) => setTimeout(r, durationSec * 1000 + 200))

    Tone.getTransport().stop()
    Tone.getTransport().position = 0
    clearScheduled()
    recorder.stop()
    await finished
    Tone.getDestination().disconnect(destNode)

    const blob = new Blob(chunks, { type: 'audio/webm' })
    chunks = []
    // Decode the recorder's WebM/Opus → AudioBuffer → 16-bit WAV via the
    // shared encoder. Most DAWs prefer WAV; the user can always re-encode.
    try {
      const arr = await blob.arrayBuffer()
      const buffer = await ctx.decodeAudioData(arr.slice(0))
      const wav = bufferToWavBlob(buffer)
      const filename = `${sanitizeFilename(target.name)}.wav`
      downloadBlob(wav, filename)
    } catch {
      // Fallback: just download the WebM if decoding fails (Safari
      // sometimes refuses to decode its own MediaRecorder output).
      downloadBlob(blob, `${sanitizeFilename(target.name)}.webm`)
    }
  }

  return {
    play,
    stop,
    toggle,
    addRecorderClipToTrack,
    addPatternClipToTrack,
    addLiveTakeToTimeline,
    exportStems,
    stemExportProgress,
  }
}
