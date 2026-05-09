import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { useMultiplayer } from '@/composables/useMultiplayer'
import type { InstrumentId, LiveTakeEvent } from '@/lib/types'

export type PlayMode = 'normal' | 'chord' | 'strum'

interface ChordHold {
  notes: string[]
  cancelled: boolean
}

const startOctave = ref(3)
const octaveCount = ref(3)
const showLabels = ref(true)
const playMode = ref<PlayMode>('normal')
const pitchBend = ref(0)
const modWheel = ref(0)
const activeKeyChords = new Map<string, ChordHold>()
let watchersWired = false

// — Live-take recording state —
// Capture every press / release while the user has "Record performance"
// armed in the Live Play stage. On stop, we hand back a list of
// LiveTakeEvents the arrangement engine can replay verbatim. State is
// module-scoped so the recording survives component remounts (the user
// can switch instruments while recording without losing their take).
const isRecordingLive = ref(false)
const liveTakeEvents = ref<LiveTakeEvent[]>([])
let liveTakeStartedAt = 0
const livePending = new Map<string, { instrument: InstrumentId; note: string; velocity: number; startedAt: number }>()

export function useLivePlay() {
  const audioStore = useAudioStore()
  const bindingStore = useKeyBindingsStore()
  const { playNote, stopNote, setMasterBend } = useAudio()
  const { broadcastNote, broadcastNoteStop } = useMultiplayer()

  if (!watchersWired) {
    watchersWired = true
    watch(pitchBend, (v) => setMasterBend(v * 200), { immediate: true })
    watch(
      () => audioStore.octaveShift,
      (v) => { startOctave.value = Math.max(0, Math.min(6, 3 + v)) },
    )
    // Clearing active notes on instrument switch prevents stale "lit" piano keys
    watch(
      () => audioStore.activeInstrument,
      () => {
        for (const hold of activeKeyChords.values()) hold.cancelled = true
        activeKeyChords.clear()
        audioStore.activeNotes = new Set()
      },
    )
  }

  function chordFor(root: string): string[] {
    const binding = bindingStore.getBinding(root)
    if (binding && binding.type === 'chord' && binding.chord && binding.chord.length > 0) {
      return [...binding.chord]
    }
    try {
      const f = Tone.Frequency(root)
      return [root, f.transpose(4).toNote(), f.transpose(7).toNote()]
    } catch {
      return [root]
    }
  }

  function captureNoteOn(note: string, velocity: number) {
    if (!isRecordingLive.value) return
    const key = `${audioStore.activeInstrument}:${note}`
    livePending.set(key, {
      instrument: audioStore.activeInstrument,
      note,
      velocity,
      startedAt: performance.now(),
    })
  }

  function captureNoteOff(note: string) {
    if (!isRecordingLive.value) return
    const key = `${audioStore.activeInstrument}:${note}`
    const pending = livePending.get(key)
    if (!pending) return
    livePending.delete(key)
    const time = (pending.startedAt - liveTakeStartedAt) / 1000
    const duration = (performance.now() - pending.startedAt) / 1000
    liveTakeEvents.value.push({
      time: Math.max(0, time),
      duration: Math.max(0.05, duration),
      instrument: pending.instrument,
      note: pending.note,
      velocity: pending.velocity,
    })
  }

  async function press(rootNote: string, velocity: number) {
    if (playMode.value === 'normal') {
      captureNoteOn(rootNote, velocity)
      await playNote(rootNote, velocity)
      broadcastNote(audioStore.activeInstrument, rootNote, velocity)
      return
    }
    const notes = chordFor(rootNote)
    const hold: ChordHold = { notes, cancelled: false }
    activeKeyChords.set(rootNote, hold)
    if (playMode.value === 'chord') {
      for (const n of notes) {
        captureNoteOn(n, velocity)
        await playNote(n, velocity)
      }
      for (const n of notes) broadcastNote(audioStore.activeInstrument, n, velocity)
    } else {
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        setTimeout(() => {
          if (hold.cancelled) return
          captureNoteOn(note, velocity)
          void playNote(note, velocity)
          broadcastNote(audioStore.activeInstrument, note, velocity)
        }, i * 70)
      }
    }
  }

  function release(rootNote: string) {
    const hold = activeKeyChords.get(rootNote)
    if (hold) {
      hold.cancelled = true
      for (const n of hold.notes) {
        captureNoteOff(n)
        stopNote(n)
        broadcastNoteStop(audioStore.activeInstrument, n)
      }
      activeKeyChords.delete(rootNote)
      return
    }
    captureNoteOff(rootNote)
    stopNote(rootNote)
    broadcastNoteStop(audioStore.activeInstrument, rootNote)
  }

  /**
   * Capture a single note event into the active live take, used by the
   * new instrument pads (violin, cello, oud, harmonica, harp, trumpet,
   * tambourine, clarinet, flute, real drums) which call useAudio
   * directly rather than going through this composable's `press` /
   * `release` funnel. Without this, gestures performed on those pads
   * during a live-take record would silently disappear from the
   * captured arrangement.
   *
   * Pads call this AFTER their playOn / playOnTimed call, with the same
   * note name + velocity + the duration they passed to playOnTimed
   * (or an estimate of how long the gesture sustained for).
   */
  function recordLivePlay(
    instrumentId: InstrumentId,
    note: string,
    velocity: number,
    durationSec: number,
    cents = 0,
  ) {
    if (!isRecordingLive.value) return
    const time = (performance.now() - liveTakeStartedAt) / 1000
    const event: LiveTakeEvent = {
      time: Math.max(0, time),
      duration: Math.max(0.05, durationSec),
      instrument: instrumentId,
      note,
      velocity,
    }
    // Only persist cents when there's actually a microtonal shift —
    // keeps non-maqam takes from carrying noise on every event.
    if (cents !== 0) event.cents = cents
    liveTakeEvents.value.push(event)
  }

  function startLiveTake() {
    liveTakeEvents.value = []
    livePending.clear()
    liveTakeStartedAt = performance.now()
    isRecordingLive.value = true
  }

  /**
   * Stop recording. Returns a snapshot of the captured events plus the
   * total duration (used to size the resulting arrangement clip). Any
   * note still being held when the user stops is closed out at "now"
   * so a long-held bell ring isn't truncated to zero length.
   */
  function stopLiveTake(): { events: LiveTakeEvent[]; durationSec: number } {
    isRecordingLive.value = false
    // Close out any held notes so an open press doesn't get dropped.
    const now = performance.now()
    for (const [, pending] of livePending) {
      const time = (pending.startedAt - liveTakeStartedAt) / 1000
      const duration = (now - pending.startedAt) / 1000
      liveTakeEvents.value.push({
        time: Math.max(0, time),
        duration: Math.max(0.05, duration),
        instrument: pending.instrument,
        note: pending.note,
        velocity: pending.velocity,
      })
    }
    livePending.clear()
    const events = [...liveTakeEvents.value].sort((a, b) => a.time - b.time)
    const durationSec = events.length === 0
      ? 0
      : Math.max(...events.map((e) => e.time + e.duration)) + 0.2
    return { events, durationSec }
  }

  function clearLiveTake() {
    liveTakeEvents.value = []
    livePending.clear()
  }

  function octaveUp() {
    if (startOctave.value < 6) startOctave.value += 1
  }
  function octaveDown() {
    if (startOctave.value > 0) startOctave.value -= 1
  }

  function setBend(v: number) {
    pitchBend.value = Math.max(-1, Math.min(1, v))
  }
  function releaseBend() {
    pitchBend.value = 0
  }
  function setMod(v: number) {
    modWheel.value = Math.max(0, Math.min(1, v))
  }

  return {
    startOctave,
    octaveCount,
    showLabels,
    playMode,
    pitchBend,
    modWheel,
    isRecordingLive,
    liveTakeEvents,
    press,
    release,
    octaveUp,
    octaveDown,
    setBend,
    releaseBend,
    setMod,
    startLiveTake,
    stopLiveTake,
    clearLiveTake,
    recordLivePlay,
  }
}
