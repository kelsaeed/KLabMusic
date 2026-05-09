import { ref, watch } from 'vue'
import * as Tone from 'tone'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import type { InstrumentId } from '@/lib/types'

// Practice drone — sustained tonic that grounds the user's playing /
// singing. Essential for maqam practice (Arabic music is sung against
// a drone, and half-flat sika at +50¢ doesn't read as 'in tune'
// without the reference tone underneath). The drone uses the studio's
// own active instrument by default so a violinist hears a violin
// drone, but the user can also pin a fixed instrument so the drone
// stays put while they switch live voices.
//
// Module-scoped state because a drone is an inherently global thing
// — turning a second one on from a different component should toggle
// the existing one, not stack a parallel sustain.

const playing = ref(false)
const tonic = ref<string>('D3')   // Default Bayati tonic; common starting point
const detuneCents = ref(0)
/** When set, the drone always plays through this instrument instead of
 *  the active one. null = follow active instrument. */
const pinnedInstrument = ref<InstrumentId | null>(null)

let activeNote: { instrumentId: InstrumentId; note: string } | null = null

// Common drone tonic choices spanning the maqam tonic set + a few
// useful alternates. Octave is fixed to 3 so the drone stays low and
// out of the singing range without dipping into sub-bass territory
// where most synth voices lose pitch clarity.
export const DRONE_TONICS = [
  'C3', 'C#3', 'D3', 'D#3', 'E3', 'F3', 'F#3', 'G3', 'G#3', 'A3', 'A#3', 'B3',
] as const

export function useDrone() {
  const audio = useAudio()
  const audioStore = useAudioStore()

  function pickInstrument(): InstrumentId {
    return pinnedInstrument.value ?? audioStore.activeInstrument
  }

  async function play() {
    if (playing.value) return
    if (Tone.getContext().state !== 'running') await Tone.start()
    const instrumentId = pickInstrument()
    activeNote = { instrumentId, note: tonic.value }
    void audio.playOn(instrumentId, tonic.value, 90, true, detuneCents.value)
    playing.value = true
  }

  function stop() {
    if (!activeNote) {
      playing.value = false
      return
    }
    audio.stopOn(activeNote.instrumentId, activeNote.note)
    activeNote = null
    playing.value = false
  }

  function toggle() {
    if (playing.value) stop()
    else void play()
  }

  function setTonic(next: string) {
    tonic.value = next
    if (playing.value) {
      // Re-trigger so the new tonic plays immediately. Stop releases
      // the old note's voice; play attacks the new one.
      stop()
      void play()
    }
  }

  function setCents(cents: number) {
    detuneCents.value = Math.max(-50, Math.min(50, Math.round(cents)))
    if (playing.value) {
      stop()
      void play()
    }
  }

  function pinInstrument(id: InstrumentId | null) {
    if (pinnedInstrument.value === id) return
    pinnedInstrument.value = id
    if (playing.value) {
      stop()
      void play()
    }
  }

  // If the user changes the active instrument while the drone is
  // playing AND no instrument is pinned, swap the drone over to the
  // new instrument so the user's "play through whatever I'm using
  // right now" expectation holds.
  watch(
    () => audioStore.activeInstrument,
    (next) => {
      if (!playing.value || pinnedInstrument.value !== null) return
      if (activeNote && activeNote.instrumentId === next) return
      stop()
      void play()
      // play() rebuilds activeNote from pickInstrument() which now
      // reads the new active id, so the switch is atomic from the
      // user's perspective (one tonic, briefly two instruments
      // overlapping during the envelope crossfade).
    },
  )

  return {
    playing,
    tonic,
    detuneCents,
    pinnedInstrument,
    play,
    stop,
    toggle,
    setTonic,
    setCents,
    pinInstrument,
    tonics: DRONE_TONICS,
  }
}
