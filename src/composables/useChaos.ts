import * as Tone from 'tone'
import { ref, watch } from 'vue'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'

export type ArpMode = 'up' | 'down' | 'random' | 'chord'
export type Scale = 'major' | 'minor' | 'pentatonic' | 'blues' | 'dorian'

const SCALES: Record<Scale, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
  blues: [0, 3, 5, 6, 7, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
}

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const

const chaosAmount = ref(0)
const arpRunning = ref(false)
const lastMelody = ref<string[]>([])
let chaosTimer: ReturnType<typeof setInterval> | null = null
let arpLoop: Tone.Loop | null = null
let watcherWired = false

export function useChaos() {
  const audioStore = useAudioStore()
  const { setMasterBend, glitchBurst, setChaosX, setChaosY, playOn, stopOn, ensureToneStarted } = useAudio()

  if (!watcherWired) {
    watcherWired = true
    watch(chaosAmount, (v) => {
      if (chaosTimer) {
        clearInterval(chaosTimer)
        chaosTimer = null
      }
      if (v <= 0) {
        setMasterBend(0)
        return
      }
      chaosTimer = setInterval(() => {
        const cents = (Math.random() * 2 - 1) * v * 80
        setMasterBend(cents)
      }, 80)
    })
  }

  function setChaosAmount(v: number) {
    chaosAmount.value = Math.max(0, Math.min(1, v))
  }

  async function startArp(chord: string[], mode: ArpMode, intervalSec: number, gate: number) {
    if (chord.length === 0) return
    await ensureToneStarted()
    stopArp()
    let i = 0
    let lastNote: string | null = null
    arpLoop = new Tone.Loop((time) => {
      let note: string
      if (mode === 'up') note = chord[i % chord.length]
      else if (mode === 'down') note = chord[chord.length - 1 - (i % chord.length)]
      else if (mode === 'random') note = chord[Math.floor(Math.random() * chord.length)]
      else note = chord[i % chord.length]
      i++
      const playNote = note
      Tone.getDraw().schedule(() => {
        void playOn(audioStore.activeInstrument, playNote, 100)
        if (lastNote && audioStore.activeInstrument !== 'drums') {
          stopOn(audioStore.activeInstrument, lastNote)
        }
        lastNote = playNote
      }, time)
      if (mode === 'chord') {
        for (let c = 1; c < chord.length; c++) {
          const otherNote = chord[c]
          Tone.getDraw().schedule(() => {
            void playOn(audioStore.activeInstrument, otherNote, 100)
          }, time)
        }
      }
      void gate
    }, intervalSec)
    arpLoop.start(0)
    if (Tone.getTransport().state !== 'started') Tone.getTransport().start()
    arpRunning.value = true
  }

  function stopArp() {
    if (arpLoop) {
      arpLoop.stop()
      arpLoop.dispose()
      arpLoop = null
    }
    arpRunning.value = false
  }

  function generateMelody(key: string, scale: Scale, length = 8, mood: 'calm' | 'wild' = 'calm'): string[] {
    const keyIdx = KEYS.indexOf(key as typeof KEYS[number])
    if (keyIdx < 0) return []
    const intervals = SCALES[scale]
    const notes: string[] = []
    let lastDeg = Math.floor(intervals.length / 2)
    for (let i = 0; i < length; i++) {
      const jumpRange = mood === 'calm' ? 2 : 4
      const deg = Math.max(0, Math.min(intervals.length - 1, lastDeg + Math.round((Math.random() - 0.5) * jumpRange * 2)))
      lastDeg = deg
      const semitones = intervals[deg]
      const octaveBoost = mood === 'wild' && Math.random() > 0.7 ? 12 : 0
      const noteIdx = (keyIdx + semitones) % 12
      const oct = 4 + Math.floor((keyIdx + semitones) / 12) + octaveBoost / 12
      notes.push(`${KEYS[noteIdx]}${oct}`)
    }
    lastMelody.value = notes
    return notes
  }

  async function playMelody(notes: string[], stepSec = 0.25) {
    await ensureToneStarted()
    notes.forEach((note, i) => {
      const t = Tone.now() + i * stepSec
      void Tone.getDraw().schedule(() => {
        void playOn(audioStore.activeInstrument, note, 100)
      }, t)
      void Tone.getDraw().schedule(() => {
        if (audioStore.activeInstrument !== 'drums') stopOn(audioStore.activeInstrument, note)
      }, t + stepSec * 0.85)
    })
  }

  return {
    chaosAmount,
    arpRunning,
    lastMelody,
    setChaosAmount,
    setChaosX,
    setChaosY,
    glitchBurst,
    startArp,
    stopArp,
    generateMelody,
    playMelody,
    KEYS,
    SCALES,
  }
}
