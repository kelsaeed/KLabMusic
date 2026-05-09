import { ref, onBeforeUnmount } from 'vue'
import * as Tone from 'tone'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useMultiplayer } from '@/composables/useMultiplayer'

// Web MIDI integration. Listens to every connected input device's
// note-on / note-off / pitch-bend / control-change messages and routes
// them through the existing audio engine — so a hardware keyboard
// plays whatever the user has selected as the active instrument, with
// the exact same envelope / FX / mastering chain as the on-screen
// keyboard. Connect / disconnect events update the device list
// reactively so the UI can show "MIDI: 2 devices" without polling.
//
// Keyboard ranges and velocity scaling are honoured per-message:
// MIDI velocity 1-127 → playOn velocity 1-127 directly. Note numbers
// 0-127 → standard note names through Tone.Frequency. Pitch bend on
// channel 1 maps to the active instrument's setBend (continuous bend
// for sustained voices, baked into the cached cents for the next
// attack on Soundfont voices).
//
// Module-scoped state — Web MIDI access is global, multiple useMidi()
// callers share the same MIDIAccess object and listener set, and the
// last component to unmount tears them down.

interface MidiInputInfo {
  id: string
  name: string
  manufacturer: string
}

const access = ref<MIDIAccess | null>(null)
const inputs = ref<MidiInputInfo[]>([])
const enabled = ref(false)
const error = ref<string | null>(null)
let connectedListenerCount = 0
let stateChangeHandler: ((e: Event) => void) | null = null

// Per-channel bent value cache so the "bend wheel returns to 0" message
// (status 0xE0, value 0x40 0x00) properly clears the cached detune the
// last attack picked up. Without this, a held note sustains at the last
// non-zero bend after the wheel snaps back.
const channelBend = new Map<number, number>()

// Note tracking so we can route note-off events to the right
// instrument even after the user switched the active instrument
// mid-sustain. A naive "always release on active" loses notes when the
// user holds C2 on bass, switches to piano, releases C2 — without this
// map the bass voice would never get the release and the note would
// hang.
interface MidiNoteEntry {
  instrumentId: ReturnType<typeof useAudioStore>['activeInstrument']
  noteName: string
}
const heldNotes = new Map<string, MidiNoteEntry>()
function heldKey(channel: number, midiNote: number): string {
  return `${channel}:${midiNote}`
}

function midiToNoteName(midi: number): string {
  // Tone.Frequency handles the conversion identically to the rest of
  // the engine, so a MIDI C4 (60) becomes "C4" — exactly what playOn
  // expects. Wrap in try/catch since out-of-range values (negative
  // numbers from buggy controllers) would throw.
  try {
    return Tone.Frequency(midi, 'midi').toNote() as string
  } catch {
    return ''
  }
}

export function useMidi() {
  const audio = useAudio()
  const audioStore = useAudioStore()
  const { broadcastNote, broadcastNoteStop } = useMultiplayer()

  function snapshotInputs(midiAccess: MIDIAccess) {
    const list: MidiInputInfo[] = []
    midiAccess.inputs.forEach((input) => {
      list.push({
        id: input.id,
        name: input.name ?? 'MIDI input',
        manufacturer: input.manufacturer ?? '',
      })
    })
    inputs.value = list
  }

  function attachInputListeners(midiAccess: MIDIAccess) {
    midiAccess.inputs.forEach((input) => {
      // Re-attach is safe because MIDIInput.onmidimessage is a single-
      // setter slot — assigning replaces the previous listener rather
      // than stacking. Still, we only actually read messages when
      // enabled.value is true so a paranoid user can flip it off.
      input.onmidimessage = handleMidiMessage
    })
  }

  function handleMidiMessage(ev: MIDIMessageEvent) {
    if (!enabled.value) return
    if (!ev.data) return
    const status = ev.data[0]
    const channel = status & 0x0f
    const command = status & 0xf0
    if (command === 0x90 && ev.data[2] > 0) {
      // Note on with non-zero velocity. Some controllers send 0x90 with
      // velocity 0 as note-off — that's handled by the next branch.
      handleNoteOn(channel, ev.data[1], ev.data[2])
    } else if (command === 0x80 || (command === 0x90 && ev.data[2] === 0)) {
      handleNoteOff(channel, ev.data[1])
    } else if (command === 0xe0) {
      // Pitch bend. 14-bit value (LSB first), centre at 0x2000 (8192).
      // Map ±8191 to ±200 cents (a whole tone bend, the General-MIDI
      // default range).
      const value = (ev.data[2] << 7) | ev.data[1]
      const normalised = (value - 8192) / 8192
      const cents = Math.round(normalised * 200)
      channelBend.set(channel, cents)
      // setMasterBend writes to every loaded voice — for a single-
      // channel keyboard this is what the user expects (bend the thing
      // they're playing). A future per-channel-instrument routing
      // would call setBend(activeInstrumentForChannel, cents) instead.
      audio.setMasterBend(cents)
    }
  }

  function handleNoteOn(channel: number, midiNote: number, velocity: number) {
    const noteName = midiToNoteName(midiNote)
    if (!noteName) return
    const instrumentId = audioStore.activeInstrument
    heldNotes.set(heldKey(channel, midiNote), { instrumentId, noteName })
    const cents = channelBend.get(channel) ?? 0
    void audio.playOn(instrumentId, noteName, velocity, false, cents)
    broadcastNote(instrumentId, noteName, velocity, cents)
  }

  function handleNoteOff(channel: number, midiNote: number) {
    const key = heldKey(channel, midiNote)
    const entry = heldNotes.get(key)
    if (!entry) return
    heldNotes.delete(key)
    audio.stopOn(entry.instrumentId, entry.noteName)
    broadcastNoteStop(entry.instrumentId, entry.noteName)
  }

  /**
   * Request MIDI access from the browser and start listening. Resolves
   * with `{ ok: true }` on success, or `{ ok: false, message }` when
   * the browser blocks the request, the user denies permission, or
   * Web MIDI isn't supported (Safari pre-17, Firefox without flag).
   */
  async function init(): Promise<{ ok: boolean; message?: string }> {
    if (typeof navigator === 'undefined' || !navigator.requestMIDIAccess) {
      error.value = 'Web MIDI not supported in this browser'
      return { ok: false, message: error.value }
    }
    try {
      // sysex: false — we don't need system-exclusive messages and
      // requesting them prompts a scarier "this site can read your
      // device's settings" permission dialog.
      const ma = await navigator.requestMIDIAccess({ sysex: false })
      access.value = ma
      enabled.value = true
      error.value = null
      snapshotInputs(ma)
      attachInputListeners(ma)
      stateChangeHandler = () => {
        snapshotInputs(ma)
        attachInputListeners(ma)
      }
      ma.addEventListener('statechange', stateChangeHandler)
      connectedListenerCount += 1
      return { ok: true }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'MIDI access denied'
      error.value = msg
      return { ok: false, message: msg }
    }
  }

  function setEnabled(next: boolean) {
    enabled.value = next
    if (!next) {
      // Cancel any held notes — otherwise turning MIDI off mid-sustain
      // leaves the voices ringing forever.
      for (const entry of heldNotes.values()) {
        audio.stopOn(entry.instrumentId, entry.noteName)
        broadcastNoteStop(entry.instrumentId, entry.noteName)
      }
      heldNotes.clear()
      audio.setMasterBend(0)
      channelBend.clear()
    }
  }

  function disconnect() {
    if (!access.value) return
    if (stateChangeHandler) {
      access.value.removeEventListener('statechange', stateChangeHandler)
      stateChangeHandler = null
    }
    access.value.inputs.forEach((input) => {
      input.onmidimessage = null
    })
    setEnabled(false)
    inputs.value = []
    access.value = null
  }

  onBeforeUnmount(() => {
    connectedListenerCount = Math.max(0, connectedListenerCount - 1)
    if (connectedListenerCount === 0) disconnect()
  })

  return {
    access,
    inputs,
    enabled,
    error,
    init,
    setEnabled,
    disconnect,
  }
}
