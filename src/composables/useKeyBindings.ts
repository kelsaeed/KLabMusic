import * as Tone from 'tone'
import { ref } from 'vue'
import { useKeyBindingsStore } from '@/stores/keybindings'
import { useAudio } from '@/composables/useAudio'
import { useAudioStore } from '@/stores/audio'
import { useRecorder } from '@/composables/useRecorder'
import { useRecorderStore } from '@/stores/recorder'
import { useBeatMaker } from '@/composables/useBeatMaker'
import { useMultiplayer } from '@/composables/useMultiplayer'
import { useUserStore } from '@/stores/user'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { normalizeKey } from '@/lib/keybindings'
import type { KeyBinding, BindingSet } from '@/lib/types'

const STORAGE_KEY = 'klm:keybindings:sets'
const ACTIVE_KEY = 'klm:keybindings:active'

const pressedKeys = new Set<string>()
const heldNotes = new Map<string, { instrument: string; notes: string[] }>()
const tapBuffer: number[] = []
const lastTappedBpm = ref<number | null>(null)
let listenersWired = false

function shouldIgnore(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

function inStudio(): boolean {
  const path = window.location.pathname
  return path === '/app' || path.startsWith('/room')
}

export function useKeyBindings() {
  const store = useKeyBindingsStore()
  const audioStore = useAudioStore()
  const recorderStore = useRecorderStore()
  const userStore = useUserStore()
  const { playOn, stopOn, stopAll, dampInstrument } = useAudio()
  const { startRecording, stopRecording } = useRecorder()
  const { toggle: toggleBeatMaker } = useBeatMaker()
  const { broadcastNote, broadcastNoteStop } = useMultiplayer()

  function fireBinding(b: KeyBinding, eventKey: string) {
    if (b.type === 'note' || b.type === 'sample') {
      if (!b.instrument || !b.note) return
      const vel = b.velocity ?? 100
      void playOn(b.instrument, b.note, vel)
      broadcastNote(b.instrument, b.note, vel)
      heldNotes.set(eventKey, { instrument: b.instrument, notes: [b.note] })
      return
    }
    if (b.type === 'chord') {
      if (!b.instrument || !b.chord || b.chord.length === 0) return
      const vel = b.velocity ?? 100
      for (const n of b.chord) {
        void playOn(b.instrument, n, vel)
        broadcastNote(b.instrument, n, vel)
      }
      heldNotes.set(eventKey, { instrument: b.instrument, notes: [...b.chord] })
      return
    }
    if (b.type === 'clip') {
      if (!b.clipId) return
      const clip = recorderStore.clips.find((c) => c.id === b.clipId)
      if (clip) {
        recorderStore.setActive(clip.id)
        void useRecorder().playClip(clip.id)
      }
      return
    }
    if (b.type === 'action') runAction(b)
  }

  function releaseBinding(b: KeyBinding, eventKey: string) {
    if (b.sustainMode) return
    const held = heldNotes.get(eventKey)
    if (!held) return
    for (const n of held.notes) {
      stopOn(held.instrument as KeyBinding['instrument'], n)
      if (held.instrument) broadcastNoteStop(held.instrument as Parameters<typeof broadcastNoteStop>[0], n)
    }
    heldNotes.delete(eventKey)
  }

  function runAction(b: KeyBinding) {
    switch (b.action) {
      case 'damp':
        stopAll()
        heldNotes.clear()
        return
      case 'damp-instrument':
        if (b.instrument) dampInstrument(b.instrument)
        return
      case 'record':
        if (recorderStore.isRecording) void stopRecording()
        else void startRecording()
        return
      case 'play-stop':
        toggleBeatMaker()
        return
      case 'tap-bpm':
        return tapBpm()
      case 'octave-up':
        audioStore.octaveShift = Math.min(3, audioStore.octaveShift + 1)
        return
      case 'octave-down':
        audioStore.octaveShift = Math.max(-3, audioStore.octaveShift - 1)
        return
      case 'loop-toggle':
        Tone.getTransport().loop = !Tone.getTransport().loop
        return
    }
  }

  function tapBpm() {
    const now = performance.now()
    tapBuffer.push(now)
    while (tapBuffer.length > 6) tapBuffer.shift()
    if (tapBuffer.length < 2) return
    const intervals: number[] = []
    for (let i = 1; i < tapBuffer.length; i++) intervals.push(tapBuffer[i] - tapBuffer[i - 1])
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const bpm = Math.round(60000 / avgMs)
    if (bpm >= 40 && bpm <= 240) {
      lastTappedBpm.value = bpm
      Tone.getTransport().bpm.value = bpm
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (!inStudio()) return
    if (shouldIgnore(e.target)) return
    const k = normalizeKey(e.key)
    if (pressedKeys.has(k)) return
    const binding = store.getBinding(k)
    if (!binding) return
    e.preventDefault()
    pressedKeys.add(k)
    store.activeKey = k
    fireBinding(binding, k)
  }

  function onKeyUp(e: KeyboardEvent) {
    const k = normalizeKey(e.key)
    if (!pressedKeys.has(k)) return
    pressedKeys.delete(k)
    if (store.activeKey === k) store.activeKey = null
    const binding = store.getBinding(k)
    if (binding) releaseBinding(binding, k)
  }

  function init() {
    if (listenersWired) return
    listenersWired = true
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    loadFromLocal()
  }

  function dispose() {
    if (!listenersWired) return
    listenersWired = false
    window.removeEventListener('keydown', onKeyDown)
    window.removeEventListener('keyup', onKeyUp)
  }

  function persistLocal() {
    const userSets = store.sets.filter((s) => !s.isDefault)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(userSets))
    localStorage.setItem(ACTIVE_KEY, store.activeSetId)
  }

  function loadFromLocal() {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      try {
        const userSets = JSON.parse(raw) as BindingSet[]
        for (const s of userSets) {
          if (!store.sets.some((x) => x.id === s.id)) store.sets.push(s)
        }
      } catch {
        /* ignore corrupted */
      }
    }
    const active = localStorage.getItem(ACTIVE_KEY)
    if (active && store.sets.some((s) => s.id === active)) store.activeSetId = active
  }

  async function saveSetToCloud(setId: string): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    if (!userStore.isLoggedIn || !userStore.profile) return { ok: false, message: 'Sign in to save' }
    const set = store.sets.find((s) => s.id === setId)
    if (!set || set.isDefault) return { ok: false, message: 'Cannot save preset' }
    try {
      const { error } = await supabase.from('key_bindings').upsert({
        id: set.remoteId ?? set.id,
        user_id: userStore.profile.id,
        name: set.name,
        bindings: set.bindings,
      })
      if (error) return { ok: false, message: error.message }
      set.remoteId = set.id
      return { ok: true, message: 'Saved to cloud' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Save failed' }
    }
  }

  function exportJson(setId: string): string {
    const set = store.sets.find((s) => s.id === setId)
    return JSON.stringify(set, null, 2)
  }

  function importJson(json: string): boolean {
    try {
      const set = JSON.parse(json) as BindingSet
      if (!set.id || !Array.isArray(set.bindings)) return false
      const id = `${set.id}-${Date.now().toString(36)}`
      store.addSet({ ...set, id, isDefault: false })
      return true
    } catch {
      return false
    }
  }

  return {
    init,
    dispose,
    persistLocal,
    saveSetToCloud,
    exportJson,
    importJson,
    lastTappedBpm,
  }
}
