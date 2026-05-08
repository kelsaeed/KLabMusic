import * as Tone from 'tone'
import { useArrangeStore } from '@/stores/arrange'
import { useRecorderStore } from '@/stores/recorder'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useAudio } from '@/composables/useAudio'
import type { ArrangeClip, ArrangeTrack } from '@/lib/types'

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
    if (node.patternEvents) {
      for (const id of node.patternEvents) Tone.getTransport().clear(id)
    }
  }
  scheduled = []
}

export function useArrange() {
  const store = useArrangeStore()
  const recorderStore = useRecorderStore()
  const beatStore = useBeatMakerStore()
  const { ensureToneStarted, ensureInstrument, playOnTimed, getMasterInput } = useAudio()

  function scheduleAudioClip(track: ArrangeTrack, clip: ArrangeClip) {
    if (clip.source.kind !== 'audio') return
    // Alias the narrowed source into a const so subsequent reads inside
    // arrow callbacks keep the narrowed type — TS doesn't carry the
    // .source narrowing through a fresh closure.
    const src = clip.source
    const recClip = recorderStore.clips.find((c) => c.id === src.recorderClipId)
    if (!recClip) return
    const masterIn = getMasterInput()
    if (!masterIn) return

    // Apply the recorder clip's existing pitch-shift so a clip the user
    // tuned in the recorder still plays in the right key on the timeline.
    const pitch = new Tone.PitchShift({ pitch: recClip.pitchSemitones, wet: 1 })
    pitch.connect(masterIn)
    const player = new Tone.Player(recClip.buffer)
    player.connect(pitch)
    player.volume.value = Tone.gainToDb(Math.max(0.001, track.volume))
    player.playbackRate = recClip.speed

    // Tone.Player.start(time, offset, duration). Both 'time' and 'duration'
    // are at audio-rate so they run on Tone.Transport's clock — even if the
    // user pauses, the schedule resumes with the correct offset.
    player.start(`+${clip.startSec}`, src.offsetSec, clip.durationSec)
    scheduled.push({ player, pitch })
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
          for (const t of pattern.tracks) {
            if (t.muted) continue
            const step = t.steps[idx]
            if (!step || !step.active) continue
            const vel = Math.round(step.velocity * t.volume * track.volume)
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
        else schedulePatternClip(track, clip)
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

  return {
    play,
    stop,
    toggle,
    addRecorderClipToTrack,
    addPatternClipToTrack,
  }
}
