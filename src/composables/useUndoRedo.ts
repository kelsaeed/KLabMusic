import { ref } from 'vue'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useArrangeStore } from '@/stores/arrange'
import type { Pattern, ArrangeTrack, StepCount } from '@/lib/types'

// Undo / redo stack for the editor surfaces musicians actually edit:
// beat-maker patterns + arrange tracks. Snapshots both stores into a
// single history entry per change, debounced so a 60Hz drag-paint or
// slider-sweep collapses into one undo step at gesture-end (matches
// every DAW's behaviour — you don't want twenty undos to walk through
// a single drag).
//
// Undo and redo restore the captured snapshot through the existing
// store mutation paths — applying via direct assignment to refs is
// fine because Pinia $subscribe fires AFTER the assignment, and the
// suppress flag prevents the restore from queuing a fresh snapshot.
//
// Audio engine state (master volume, FX knobs) is intentionally NOT
// undoable. DAW convention is that mixing controls live outside undo
// because they're "always-correct" and undoing them is rarely what
// the user intended (Logic, Pro Tools, Ableton all behave this way).

interface HistoryEntry {
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
  }
}

const MAX_HISTORY = 50
const SNAPSHOT_DEBOUNCE_MS = 350

const undoStack = ref<HistoryEntry[]>([])
const redoStack = ref<HistoryEntry[]>([])
let snapshotTimer: ReturnType<typeof setTimeout> | null = null
let watchersWired = false
let suppress = false

function snapshot(): HistoryEntry {
  const beat = useBeatMakerStore()
  const arrange = useArrangeStore()
  // JSON deep-clone — captures the moment-in-time data without
  // aliasing live reactive references that would mutate on the
  // next $subscribe tick.
  return JSON.parse(JSON.stringify({
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
    },
  }))
}

function applySnapshot(entry: HistoryEntry) {
  suppress = true
  const beat = useBeatMakerStore()
  const arrange = useArrangeStore()
  beat.patterns = entry.beatmaker.patterns
  beat.activePatternId = entry.beatmaker.activePatternId
  beat.bpm = entry.beatmaker.bpm
  beat.swing = entry.beatmaker.swing
  beat.stepCount = entry.beatmaker.stepCount
  beat.songMode = entry.beatmaker.songMode
  beat.songSequence = entry.beatmaker.songSequence
  arrange.tracks = entry.arrange.tracks
  arrange.bpm = entry.arrange.bpm
  arrange.snapDivision = entry.arrange.snapDivision
  // Release the suppress on the next macrotask — Pinia fires
  // $subscribe synchronously inside the mutation path, but a few
  // downstream watchers schedule micro/macro tasks of their own.
  // 50ms is comfortably past the synchronous + microtask window.
  setTimeout(() => { suppress = false }, 50)
}

export function useUndoRedo() {
  function init() {
    if (watchersWired) return
    watchersWired = true
    const beat = useBeatMakerStore()
    const arrange = useArrangeStore()
    // Seed the history with the current state so the first undo
    // immediately after a single edit returns to "before that edit"
    // rather than "no-op."
    undoStack.value = [snapshot()]
    const onChange = () => {
      if (suppress) return
      if (snapshotTimer) clearTimeout(snapshotTimer)
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null
        const entry = snapshot()
        // Only push if the snapshot meaningfully differs from the
        // last one — Pinia $subscribe fires for ANY mutation
        // including UI-local fields (automation lane open / closed)
        // that we already filter out of the snapshot. Without this
        // dedup, a user toggling an automation lane creates a no-op
        // undo step.
        const last = undoStack.value[undoStack.value.length - 1]
        if (last && JSON.stringify(last) === JSON.stringify(entry)) return
        undoStack.value.push(entry)
        // Cap depth so a long session doesn't unbound localStorage
        // pressure or memory growth. 50 entries is the historical
        // DAW sweet spot — enough to step back through a recent
        // edit cluster, small enough to stay light.
        if (undoStack.value.length > MAX_HISTORY) {
          undoStack.value = undoStack.value.slice(-MAX_HISTORY)
        }
        // Any new edit invalidates the redo stack — once you fork
        // from a historical state, the old "future" is gone.
        redoStack.value = []
      }, SNAPSHOT_DEBOUNCE_MS)
    }
    beat.$subscribe(onChange, { detached: true })
    arrange.$subscribe(onChange, { detached: true })
  }

  function undo(): boolean {
    // Need at least 2 entries: the current state, and a prior state
    // to step back to. The seed snapshot covers the "first undo
    // after a single edit" case — without it, the first edit pushes
    // a snapshot of POST-edit state and undo has nothing to revert
    // to. With seed, the stack is [pre-edit, post-edit] and undo
    // pops post-edit and applies pre-edit.
    if (undoStack.value.length < 2) return false
    // Flush any pending debounced snapshot so we don't lose the
    // current post-edit state when redo wants to come back to it.
    if (snapshotTimer) {
      clearTimeout(snapshotTimer)
      snapshotTimer = null
      const pending = snapshot()
      const last = undoStack.value[undoStack.value.length - 1]
      if (!last || JSON.stringify(last) !== JSON.stringify(pending)) {
        undoStack.value.push(pending)
      }
    }
    const current = undoStack.value.pop()!
    redoStack.value.push(current)
    const previous = undoStack.value[undoStack.value.length - 1]
    applySnapshot(previous)
    return true
  }

  function redo(): boolean {
    if (redoStack.value.length === 0) return false
    const next = redoStack.value.pop()!
    undoStack.value.push(next)
    applySnapshot(next)
    return true
  }

  function canUndo(): boolean { return undoStack.value.length >= 2 }
  function canRedo(): boolean { return redoStack.value.length > 0 }

  return {
    init,
    undo,
    redo,
    canUndo,
    canRedo,
    undoDepth: undoStack,
    redoDepth: redoStack,
  }
}
