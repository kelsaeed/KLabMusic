import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useKeyBindingsStore } from '@/stores/keybindings'

export type PlayMode = 'normal' | 'chord' | 'strum'

const startOctave = ref(3)
const octaveCount = ref(3)
const showLabels = ref(true)
const playMode = ref<PlayMode>('normal')
const pitchBend = ref(0)
const modWheel = ref(0)
const activeKeyChords = new Map<string, string[]>()
let watchersWired = false

export function useLivePlay() {
  const audioStore = useAudioStore()
  const bindingStore = useKeyBindingsStore()
  const { playNote, stopNote, setMasterBend } = useAudio()

  if (!watchersWired) {
    watchersWired = true
    watch(pitchBend, (v) => setMasterBend(v * 200), { immediate: true })
    watch(
      () => audioStore.octaveShift,
      (v) => { startOctave.value = Math.max(0, Math.min(6, 3 + v)) },
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
      return
    }
    const notes = chordFor(rootNote)
    activeKeyChords.set(rootNote, notes)
    if (playMode.value === 'chord') {
      for (const n of notes) await playNote(n, velocity)
    } else {
      for (let i = 0; i < notes.length; i++) {
        const note = notes[i]
        setTimeout(() => void playNote(note, velocity), i * 70)
      }
    }
  }

  function release(rootNote: string) {
    const chord = activeKeyChords.get(rootNote)
    if (chord) {
      for (const n of chord) stopNote(n)
      activeKeyChords.delete(rootNote)
      return
    }
    stopNote(rootNote)
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
