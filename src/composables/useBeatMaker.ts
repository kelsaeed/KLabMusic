import * as Tone from 'tone'
import { watch } from 'vue'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useRecorderStore } from '@/stores/recorder'
import { useAudio } from '@/composables/useAudio'
import { useUserStore } from '@/stores/user'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type { BeatTrack } from '@/lib/types'

let loop: Tone.Loop | null = null
let watchersWired = false
const tapBuffer: number[] = []
const clipPlayers = new Map<string, Tone.Player>()

function subdivision(stepCount: number): string {
  return stepCount === 32 ? '32n' : '16n'
}

function ensureClipPlayer(clipId: string, buffer: AudioBuffer): Tone.Player {
  let player = clipPlayers.get(clipId)
  if (!player) {
    player = new Tone.Player(buffer).toDestination()
    clipPlayers.set(clipId, player)
  }
  return player
}

function disposeOrphanClipPlayers(activeClipIds: Set<string>) {
  for (const [id, p] of clipPlayers) {
    if (!activeClipIds.has(id)) {
      p.dispose()
      clipPlayers.delete(id)
    }
  }
}

export function useBeatMaker() {
  const store = useBeatMakerStore()
  const recorderStore = useRecorderStore()
  const userStore = useUserStore()
  const { playOn, ensureToneStarted, ensureInstrument } = useAudio()

  function buildLoop() {
    if (loop) {
      loop.stop()
      loop.dispose()
      loop = null
    }
    loop = new Tone.Loop((time) => {
      const pattern = store.activePattern
      const idx = store.currentStep
      const stepCount = store.stepCount

      for (const track of pattern.tracks) {
        if (!store.shouldPlayTrack(track)) continue
        const step = track.steps[idx]
        if (!step || !step.active) continue
        const offset = (step.microShift || 0) / 1000
        const velocity = Math.round(step.velocity * track.volume)
        triggerTrack(track, time + offset, velocity)
      }

      Tone.getDraw().schedule(() => {
        store.currentStep = idx
      }, time)

      const next = (idx + 1) % stepCount
      if (next === 0 && store.songMode && store.songSequence.length > 0) {
        const songNext = (store.songIndex + 1) % store.songSequence.length
        store.songIndex = songNext
        const targetId = store.songSequence[songNext]
        if (targetId) store.setActivePattern(targetId)
      }
      store.currentStep = next
    }, subdivision(store.stepCount))

    loop.start(0)
  }

  function triggerTrack(track: BeatTrack, time: number, velocity: number) {
    if (track.clipId) {
      const clip = recorderStore.clips.find((c) => c.id === track.clipId)
      if (!clip) return
      const player = ensureClipPlayer(track.clipId, clip.buffer)
      player.volume.value = Tone.gainToDb(Math.max(0.01, velocity / 127))
      player.start(time)
      return
    }
    void playOn(track.instrument, track.note, velocity)
    void time
  }

  function ensureWatchers() {
    if (watchersWired) return
    watchersWired = true
    watch(
      () => store.bpm,
      (v) => { Tone.getTransport().bpm.value = v },
      { immediate: true },
    )
    watch(
      () => store.swing,
      (v) => {
        Tone.getTransport().swing = v / 100
        Tone.getTransport().swingSubdivision = subdivision(store.stepCount) as Tone.Unit.Subdivision
      },
      { immediate: true },
    )
    watch(
      () => store.stepCount,
      () => {
        store.currentStep = 0
        if (store.playing) {
          buildLoop()
        }
      },
    )
    watch(
      () => store.activePatternId,
      () => { store.currentStep = 0 },
    )
    watch(
      () => recorderStore.clips.map((c) => c.id),
      () => {
        const used = new Set<string>()
        for (const p of store.patterns) {
          for (const t of p.tracks) if (t.clipId) used.add(t.clipId)
        }
        disposeOrphanClipPlayers(used)
      },
      { deep: true },
    )
  }

  async function play() {
    await ensureToneStarted()
    ensureWatchers()
    for (const t of store.activePattern.tracks) {
      if (!t.clipId) await ensureInstrument(t.instrument)
    }
    if (!loop) buildLoop()
    Tone.getTransport().start()
    store.playing = true
  }

  function stop() {
    Tone.getTransport().stop()
    store.playing = false
    store.currentStep = 0
  }

  function toggle() {
    if (store.playing) stop()
    else void play()
  }

  function tapTempo() {
    const now = performance.now()
    tapBuffer.push(now)
    while (tapBuffer.length > 6) tapBuffer.shift()
    if (tapBuffer.length < 2) return
    const intervals: number[] = []
    for (let i = 1; i < tapBuffer.length; i++) intervals.push(tapBuffer[i] - tapBuffer[i - 1])
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length
    const next = Math.round(60000 / avgMs)
    if (next >= 40 && next <= 240) store.bpm = next
  }

  function exportPatternsJson(): string {
    return JSON.stringify(
      {
        bpm: store.bpm,
        swing: store.swing,
        stepCount: store.stepCount,
        patterns: store.patterns,
        songSequence: store.songSequence,
      },
      null,
      2,
    )
  }

  function importPatternsJson(json: string): boolean {
    try {
      const data = JSON.parse(json) as {
        bpm: number
        swing: number
        stepCount: number
        patterns: typeof store.patterns
        songSequence: string[]
      }
      if (!Array.isArray(data.patterns) || data.patterns.length === 0) return false
      store.bpm = data.bpm
      store.swing = data.swing
      store.stepCount = data.stepCount === 32 ? 32 : 16
      store.patterns = data.patterns
      store.activePatternId = data.patterns[0].id
      store.songSequence = data.songSequence ?? [data.patterns[0].id]
      return true
    } catch {
      return false
    }
  }

  async function saveToCloud(): Promise<{ ok: boolean; message: string }> {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    if (!userStore.isLoggedIn || !userStore.profile) return { ok: false, message: 'Sign in to save' }
    try {
      const { error } = await supabase.from('projects').upsert({
        id: 'beatmaker-' + userStore.profile.id,
        user_id: userStore.profile.id,
        name: 'Beat Maker session',
        data: JSON.parse(exportPatternsJson()),
      })
      if (error) return { ok: false, message: error.message }
      return { ok: true, message: 'Saved' }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Save failed' }
    }
  }

  return {
    play,
    stop,
    toggle,
    tapTempo,
    exportPatternsJson,
    importPatternsJson,
    saveToCloud,
    ensureWatchers,
  }
}
