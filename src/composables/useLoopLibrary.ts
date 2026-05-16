import * as Tone from 'tone'
import { ref } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useBeatMakerStore } from '@/stores/beatmaker'
import type { LoopDef } from '@/lib/loops'
import type { Pattern, BeatTrack, Step } from '@/lib/types'

// Loop library composable. Plays a LoopDef in real time through our existing
// audio engine (so it picks up whatever theme / mastering preset / per-
// instrument FX the user has configured), and turns a LoopDef into a real
// Beat Maker pattern when the user wants to keep editing it.
//
// Preview uses a private Tone.Loop independent of the Beat Maker's transport
// state — you can audition loops while the Beat Maker is also playing
// without interfering. Stop() always halts the preview cleanly; switching
// to a new loop auto-stops the old one.

let activeLoop: Tone.Loop | null = null
let activeLoopId = ref<string | null>(null)

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

export function useLoopLibrary() {
  const { ensureToneStarted, ensureInstrument, playOnTimed, dampInstrument } = useAudio()
  const beatStore = useBeatMakerStore()

  function isPlaying(loopId: string): boolean {
    return activeLoopId.value === loopId
  }

  async function preview(loop: LoopDef) {
    await ensureToneStarted()
    // Pre-warm every instrument the loop uses so the very first step doesn't
    // race the soundfont / sample load. ensureInstrument is idempotent.
    const instruments = new Set(loop.tracks.map((t) => t.instrument))
    await Promise.all(Array.from(instruments).map((id) => ensureInstrument(id)))

    // Stop any other previewing loop first so two loops never play together
    // (overlapping renders quickly become an unpleasant mess).
    stop()

    // Tone.Transport is shared with the Beat Maker. We use a Tone.Loop with
    // its own subdivision so the two can coexist on the same Transport
    // tick — Tone schedules them independently. Time arg is the audio-time
    // of each tick; the playOnTimed call hands that tick a duration so synth
    // voices auto-release at the next step boundary instead of latching.
    const subdivision = loop.stepCount === 32 ? '32n' : '16n'
    let cursor = 0
    const totalSteps = loop.stepCount * loop.bars
    activeLoopId.value = loop.id

    Tone.getTransport().bpm.value = loop.bpm
    const stepDur = 60 / loop.bpm / (loop.stepCount === 32 ? 8 : 4)

    activeLoop = new Tone.Loop((time) => {
      const idx = cursor % totalSteps
      const stepIdx = idx % loop.stepCount
      for (const track of loop.tracks) {
        const v = track.steps[stepIdx]
        if (v == null) continue
        // Trigger directly in this Tone.Loop callback (worker-clock
        // driven, so it keeps firing when the Chrome window is
        // minimized / occluded). The previous Tone.getDraw() wrapper
        // was requestAnimationFrame-based, which Chrome FREEZES while
        // the window isn't focused — that's why loop preview cut out
        // until you brought Chrome back to front. Same direct-call
        // pattern the Beat Maker uses.
        void playOnTimed(track.instrument, track.note, stepDur, v)
      }
      void time
      cursor++
    }, subdivision)
    activeLoop.start(0)

    if (Tone.getTransport().state !== 'started') {
      Tone.getTransport().start()
    }
  }

  function stop() {
    if (activeLoop) {
      activeLoop.stop()
      activeLoop.dispose()
      activeLoop = null
    }
    if (activeLoopId.value) {
      // Damp every instrument the previously-playing loop used so a synth
      // voice can never ring out into silence after Stop. Cheap to over-damp.
      dampInstrument()
    }
    activeLoopId.value = null
  }

  /**
   * Convert a LoopDef into a brand-new Beat Maker pattern and append it.
   * The user lands on the new pattern with the loop's tracks ready to edit
   * step-by-step. We don't merge into the active pattern because that
   * could blow past the MAX_PATTERNS / track-count constraints.
   */
  function addToBeatMaker(loop: LoopDef): { ok: boolean; message: string } {
    if (beatStore.patterns.length >= 16) {
      return { ok: false, message: 'Pattern library is full (16). Remove one first.' }
    }
    // The existing beat-maker engine reads stepCount from the store, not
    // per-pattern. If the loop's stepCount differs from the current store
    // setting we switch the store — that resizes other patterns to match.
    if (beatStore.stepCount !== loop.stepCount) {
      beatStore.setStepCount(loop.stepCount)
    }
    const tracks: BeatTrack[] = loop.tracks.map((t) => {
      const steps: Step[] = t.steps.map((v) => ({
        active: v != null,
        velocity: v ?? 100,
        microShift: 0,
      }))
      return {
        id: uid(),
        instrument: t.instrument,
        note: t.note,
        steps,
        volume: 0.85,
        muted: false,
        soloed: false,
      }
    })
    const pattern: Pattern = {
      id: uid(),
      name: loop.name,
      tracks,
    }
    beatStore.patterns.push(pattern)
    beatStore.activePatternId = pattern.id
    beatStore.bpm = loop.bpm
    return { ok: true, message: `Added "${loop.name}"` }
  }

  return {
    preview,
    stop,
    isPlaying,
    addToBeatMaker,
    activeLoopId,
  }
}
