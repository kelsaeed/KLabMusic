import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { useMultiplayer } from '@/composables/useMultiplayer'

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

  async function press(rootNote: string, velocity: number) {
    if (playMode.value === 'normal') {
      await playNote(rootNote, velocity)
      broadcastNote(audioStore.activeInstrument, rootNote, velocity)
      return
    }
    const notes = chordFor(rootNote)
    const hold: ChordHold = { notes, cancelled: false }
    activeKeyChords.set(rootNote, hold)
    if (playMode.value === 'chord') {
      for (const n of notes) await playNote(n, velocity)
      for (const n of notes) broadcastNote(audioStore.activeInstrument, n, velocity)
    } else {
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        setTimeout(() => {
          if (hold.cancelled) return
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
        stopNote(n)
        broadcastNoteStop(audioStore.activeInstrument, n)
      }
      activeKeyChords.delete(rootNote)
      return
    }
    stopNote(rootNote)
    broadcastNoteStop(audioStore.activeInstrument, rootNote)
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
    press,
    release,
    octaveUp,
    octaveDown,
    setBend,
    releaseBend,
    setMod,
  }
}
