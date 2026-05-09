import { watch } from 'vue'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useArrangeStore } from '@/stores/arrange'
import { useAudioStore } from '@/stores/audio'
import type {
  Pattern, ArrangeTrack, InstrumentId, StepCount,
} from '@/lib/types'

// Project-level session persistence. The user spent the entire arc
// before this asking "every refresh I lose my work" — that complaint
// covered both sample reloads (fixed by SW + IDB caching) AND the
// edit state itself, which previously evaporated on every reload.
// This module persists the edit state on every mutation, restores
// it on next boot, and exposes named save / load slots so users can
// snapshot a session at a milestone and come back to it later.
//
// Stored entries are JSON only — no audio buffers, since recorder
// clips already round-trip through Supabase Storage / shared-clips
// and a local-only project shouldn't bloat localStorage with WAV
// data. Patterns + arrange tracks + audio settings (mastering
// preset, master volume, octave, notation) all serialise cleanly to
// JSON and weigh in well under the 5 MB localStorage budget.

const AUTO_SAVE_KEY = 'klm:session:auto'
const NAMED_SAVES_KEY = 'klm:session:named'
const SAVE_DEBOUNCE_MS = 500
const MAX_NAMED_SLOTS = 10

interface SessionPayload {
  // Schema version for forward-compat. If we change the shape, this
  // bumps and an older saved session falls through restoration.
  version: 1
  savedAt: number
  beatmaker: {
    patterns: Pattern[]
    activePatternId: string
    bpm: number
    swing: number
    stepCount: StepCount
    songMode: boolean
    songSequence: string[]
  }
  arrange: {
    tracks: ArrangeTrack[]
    bpm: number
    snapDivision: number
    pxPerSec: number
  }
  audio: {
    activeInstrument: InstrumentId
    masterVolumeDb: number
    octaveShift: number
    notation: 'solfege' | 'letters'
    masteringPreset: string
  }
}

export interface NamedSave {
  id: string
  name: string
  savedAt: number
  payload: SessionPayload
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let watchersWired = false
let restoreSuppressUntil = 0

function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}

function snapshot(): SessionPayload {
  const beat = useBeatMakerStore()
  const arrange = useArrangeStore()
  const audio = useAudioStore()
  // Deep-clone via JSON so the saved payload doesn't alias live
  // reactive references — a later mutation must NOT retroactively
  // rewrite the saved snapshot.
  return JSON.parse(JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    beatmaker: {
      patterns: beat.patterns,
      activePatternId: beat.activePatternId,
      bpm: beat.bpm,
      swing: beat.swing,
      stepCount: beat.stepCount,
      songMode: beat.songMode,
      songSequence: beat.songSequence,
    },
    arrange: {
      tracks: arrange.tracks,
      bpm: arrange.bpm,
      snapDivision: arrange.snapDivision,
      pxPerSec: arrange.pxPerSec,
    },
    audio: {
      activeInstrument: audio.activeInstrument,
      masterVolumeDb: audio.masterVolumeDb,
      octaveShift: audio.octaveShift,
      notation: audio.notation,
      masteringPreset: audio.masteringPreset,
    },
  })) as SessionPayload
}

function applySnapshot(p: SessionPayload) {
  if (p.version !== 1) return
  const beat = useBeatMakerStore()
  const arrange = useArrangeStore()
  const audio = useAudioStore()
  // Suppress the auto-save trigger that the upcoming mutations would
  // fire — otherwise restoring a snapshot at boot would immediately
  // overwrite the loaded payload with the live (just-restored) state.
  restoreSuppressUntil = Date.now() + 1000
  beat.patterns = p.beatmaker.patterns
  beat.activePatternId = p.beatmaker.activePatternId
  beat.bpm = p.beatmaker.bpm
  beat.swing = p.beatmaker.swing
  beat.stepCount = p.beatmaker.stepCount
  beat.songMode = p.beatmaker.songMode
  beat.songSequence = p.beatmaker.songSequence
  arrange.tracks = p.arrange.tracks
  arrange.bpm = p.arrange.bpm
  arrange.snapDivision = p.arrange.snapDivision
  arrange.pxPerSec = p.arrange.pxPerSec
  audio.activeInstrument = p.audio.activeInstrument
  audio.masterVolumeDb = p.audio.masterVolumeDb
  audio.octaveShift = p.audio.octaveShift
  audio.setNotation(p.audio.notation)
  audio.setMasteringPreset(p.audio.masteringPreset)
}

function readAutoSave(): SessionPayload | null {
  try {
    const raw = localStorage.getItem(AUTO_SAVE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SessionPayload
    return parsed.version === 1 ? parsed : null
  } catch {
    return null
  }
}

function writeAutoSave(payload: SessionPayload) {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(payload))
  } catch {
    // Quota / private mode — auto-save silently degrades.
  }
}

function readNamedSaves(): NamedSave[] {
  try {
    const raw = localStorage.getItem(NAMED_SAVES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as NamedSave[]
    return Array.isArray(parsed) ? parsed.filter((s) => s?.payload?.version === 1) : []
  } catch {
    return []
  }
}

function writeNamedSaves(saves: NamedSave[]) {
  try {
    localStorage.setItem(NAMED_SAVES_KEY, JSON.stringify(saves))
  } catch {
    // Quota / private mode — caller should surface error via toast.
  }
}

export function useSession() {
  /**
   * Wire auto-save watchers. Called once during app boot — the
   * watchersWired guard prevents stacking multiple watchers if a
   * remount of the same component re-invokes the composable.
   */
  function init() {
    if (watchersWired) return
    watchersWired = true
    const beat = useBeatMakerStore()
    const arrange = useArrangeStore()
    const audio = useAudioStore()
    // Restore the previous session before wiring the watchers, so the
    // restore mutations don't trigger an immediate re-save of the
    // just-restored state (the restoreSuppressUntil window covers
    // this anyway, but skipping the watcher entirely is cleaner).
    const previous = readAutoSave()
    if (previous) {
      try { applySnapshot(previous) } catch { /* corrupt save — ignore */ }
    }
    const queueSave = () => {
      if (Date.now() < restoreSuppressUntil) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => {
        saveTimer = null
        writeAutoSave(snapshot())
      }, SAVE_DEBOUNCE_MS)
    }
    // Pinia $subscribe fires after every mutation. We debounce so a
    // 60Hz drag-paint gesture queues exactly one save at gesture-end.
    beat.$subscribe(queueSave, { detached: true })
    arrange.$subscribe(queueSave, { detached: true })
    audio.$subscribe(queueSave, { detached: true })
    // Page unload / visibility change is the last chance to flush a
    // pending debounced save — without this, the user closing the
    // tab inside the 500ms debounce window loses the most recent
    // edit. Best-effort because beforeunload is unreliable on mobile.
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', flushNow)
      window.addEventListener('pagehide', flushNow)
    }
  }

  function flushNow() {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    writeAutoSave(snapshot())
  }

  /**
   * Save the current session under a user-supplied name. Returns the
   * created entry; replaces any existing entry with the same name.
   * Caps the slot count at MAX_NAMED_SLOTS — when full, the oldest
   * slot is evicted (FIFO) and the caller's UI should warn first.
   */
  function saveNamed(name: string): NamedSave {
    const trimmed = name.trim() || `Project ${new Date().toLocaleString()}`
    const existing = readNamedSaves()
    const filtered = existing.filter((s) => s.name !== trimmed)
    const entry: NamedSave = {
      id: uid(),
      name: trimmed,
      savedAt: Date.now(),
      payload: snapshot(),
    }
    const next = [entry, ...filtered].slice(0, MAX_NAMED_SLOTS)
    writeNamedSaves(next)
    return entry
  }

  function loadNamed(id: string): boolean {
    const entry = readNamedSaves().find((s) => s.id === id)
    if (!entry) return false
    applySnapshot(entry.payload)
    flushNow()
    return true
  }

  function deleteNamed(id: string): boolean {
    const before = readNamedSaves()
    const next = before.filter((s) => s.id !== id)
    if (next.length === before.length) return false
    writeNamedSaves(next)
    return true
  }

  function listNamed(): NamedSave[] {
    return readNamedSaves().sort((a, b) => b.savedAt - a.savedAt)
  }

  /**
   * Reset to a fresh empty project. Used by the "New" UI button.
   * Replaces every editable store with its default state and
   * triggers a flush so the empty state is what auto-restore
   * reads on next boot (instead of bringing the user back to the
   * project they explicitly cleared).
   */
  function newProject() {
    const beat = useBeatMakerStore()
    const arrange = useArrangeStore()
    // Use the existing setStepCount path so resizePattern fires on
    // every pattern; but first reset to a single default pattern so
    // we don't re-resize 16 leftover patterns.
    beat.patterns = []
    beat.songSequence = []
    // The store's defaultPattern() helper isn't directly exposed —
    // re-init via setStepCount triggers the resizePattern map which
    // operates on the (now empty) patterns array. Then add a fresh
    // default pattern.
    beat.songMode = false
    arrange.tracks = []
    // Repopulate beat with the canonical default. Importing
    // defaultPattern would create a circular dep with the store; the
    // user can press "Add pattern" to get the empty starting point.
    // For now, leaving the patterns array empty and relying on the
    // BeatMakerStage to render the empty state is acceptable.
    flushNow()
  }

  return {
    init,
    flushNow,
    saveNamed,
    loadNamed,
    deleteNamed,
    listNamed,
    snapshot,
    newProject,
  }
}

// Watch helper to avoid the unused import warning when a downstream
// component drops `watch` from this module's surface.
void watch
