import { ref } from 'vue'
import * as Tone from 'tone'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useArrangeStore } from '@/stores/arrange'
import { useRecorderStore } from '@/stores/recorder'
import { useAudio } from '@/composables/useAudio'
import { useToast } from '@/composables/useToast'
import type {
  RealtimeChannel,
  RealtimePresenceState,
} from '@supabase/supabase-js'
import type {
  ChatMessage,
  RoomPlayer,
  InstrumentId,
  Pattern,
  StepCount,
  ArrangeTrack,
  Clip,
} from '@/lib/types'

let channel: RealtimeChannel | null = null
const isReceiving = ref(false)
let unsubscribeBeat: (() => void) | null = null
let unsubscribeBeatState: (() => void) | null = null
let unsubscribeArrangeState: (() => void) | null = null
// `Receiving` is held true for a short window after applying remote state
// so the ensuing $subscribe handler — which fires asynchronously — sees the
// flag and skips re-broadcasting what we just received. Without this hold
// time, debounced broadcasts would cause an echo loop: A → B → applies → B's
// $subscribe fires after isReceiving cleared → B broadcasts back → A applies
// its own change a second time, etc.
const RECEIVE_HOLD_MS = 350
function holdReceiving() {
  isReceiving.value = true
  setTimeout(() => { isReceiving.value = false }, RECEIVE_HOLD_MS)
}

interface BeatMakerSharedState {
  patterns: Pattern[]
  activePatternId: string
  bpm: number
  swing: number
  stepCount: StepCount
  songMode: boolean
  songSequence: string[]
  songIndex: number
}

interface ArrangeSharedState {
  // Tracks include their FX + automation curves; UI-local fields like
  // automationLaneOpen / automationParam are intentionally kept on the
  // wire (they're tiny) but receivers preserve their own values so each
  // user's open-panel state is independent.
  tracks: ArrangeTrack[]
  bpm: number
  snapDivision: number
}

interface SharedClipMeta {
  id: string
  name: string
  url: string
  duration: number
  pitchSemitones: number
  speed: number
  reverse: boolean
  loop: boolean
  fadeIn: number
  fadeOut: number
  bpm: number | null
  source: 'mic' | 'upload'
}

function genCode(): string {
  const n = Math.floor(1000 + Math.random() * 9000)
  return `KLB-${n}`
}

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

interface PresenceMeta {
  id: string
  name: string
  instrument: InstrumentId
  color: string
  joinedAt: number
}

function presenceToPlayers(state: RealtimePresenceState, hostId: string | null): RoomPlayer[] {
  const list: RoomPlayer[] = []
  for (const refs of Object.values(state)) {
    for (const meta of refs as unknown as PresenceMeta[]) {
      list.push({
        id: meta.id,
        name: meta.name,
        instrument: meta.instrument,
        color: meta.color,
        joinedAt: meta.joinedAt,
        isHost: hostId === meta.id,
      })
    }
  }
  return list.sort((a, b) => a.joinedAt - b.joinedAt)
}

export function useMultiplayer() {
  const store = useMultiplayerStore()
  const beatStore = useBeatMakerStore()
  const arrangeStore = useArrangeStore()
  const recorderStore = useRecorderStore()
  const { playOn, stopOn } = useAudio()
  const { show, update } = useToast()

  // — Shared-state snapshot / apply helpers —
  // Snapshot deep-clones via JSON so the broadcast payload can never alias
  // a live reactive object. Apply mirrors that pattern in reverse so we
  // don't accidentally mutate a peer's frozen broadcast.
  function snapshotBeatState(): BeatMakerSharedState {
    return JSON.parse(
      JSON.stringify({
        patterns: beatStore.patterns,
        activePatternId: beatStore.activePatternId,
        bpm: beatStore.bpm,
        swing: beatStore.swing,
        stepCount: beatStore.stepCount,
        songMode: beatStore.songMode,
        songSequence: beatStore.songSequence,
        songIndex: beatStore.songIndex,
      }),
    )
  }
  function applyBeatState(s: BeatMakerSharedState) {
    holdReceiving()
    beatStore.patterns = s.patterns
    beatStore.activePatternId = s.activePatternId
    beatStore.bpm = s.bpm
    beatStore.swing = s.swing
    beatStore.stepCount = s.stepCount
    beatStore.songMode = s.songMode
    beatStore.songSequence = s.songSequence
    beatStore.songIndex = s.songIndex
  }

  function snapshotArrangeState(): ArrangeSharedState {
    return JSON.parse(
      JSON.stringify({
        tracks: arrangeStore.tracks,
        bpm: arrangeStore.bpm,
        snapDivision: arrangeStore.snapDivision,
      }),
    )
  }
  function applyArrangeState(s: ArrangeSharedState) {
    holdReceiving()
    // Preserve each receiver's local UI state for tracks they already
    // know about — the panel-open flag and selected automation parameter
    // are personal preferences, not shared content.
    const localOpen = new Map<string, { open: boolean; param: ArrangeTrack['automationParam'] }>()
    for (const t of arrangeStore.tracks) {
      localOpen.set(t.id, { open: t.automationLaneOpen, param: t.automationParam })
    }
    arrangeStore.tracks = s.tracks.map((t) => {
      const local = localOpen.get(t.id)
      return {
        ...t,
        automationLaneOpen: local?.open ?? t.automationLaneOpen,
        automationParam: local?.param ?? t.automationParam,
      }
    })
    arrangeStore.bpm = s.bpm
    arrangeStore.snapDivision = s.snapDivision
  }

  // — Debouncers —
  // Bandwidth-friendly: 200 ms after the last edit we broadcast a single
  // full state snapshot. Heavy gestures (clip drag, knob sweep, draw
  // automation) collapse into one packet at gesture-end.
  let beatBroadcastTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleBeatBroadcast() {
    if (!store.isConnected) return
    if (isReceiving.value) return
    if (beatBroadcastTimer) clearTimeout(beatBroadcastTimer)
    beatBroadcastTimer = setTimeout(() => {
      beatBroadcastTimer = null
      if (!store.isConnected || isReceiving.value) return
      broadcast('beatmaker:state', { state: snapshotBeatState(), player: store.localId })
    }, 200)
  }
  let arrangeBroadcastTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleArrangeBroadcast() {
    if (!store.isConnected) return
    if (isReceiving.value) return
    if (arrangeBroadcastTimer) clearTimeout(arrangeBroadcastTimer)
    arrangeBroadcastTimer = setTimeout(() => {
      arrangeBroadcastTimer = null
      if (!store.isConnected || isReceiving.value) return
      broadcast('arrange:state', { state: snapshotArrangeState(), player: store.localId })
    }, 200)
  }

  async function createRoom(name: string): Promise<{ ok: boolean; code?: string; message?: string }> {
    if (!isSupabaseConfigured) {
      show({ type: 'error', title: 'Multiplayer unavailable', subtitle: 'Supabase not configured', duration: 3500 })
      return { ok: false, message: 'Supabase not configured' }
    }
    if (!name.trim()) {
      show({ type: 'error', title: 'Pick a name first', duration: 2500 })
      return { ok: false, message: 'Pick a name first' }
    }
    store.setName(name)
    const code = genCode()
    const toastId = show({ type: 'loading', title: 'Creating room…', subtitle: code })
    try {
      const { error } = await supabase.from('rooms').insert({
        code,
        host_id: store.localId,
        state: { bpm: beatStore.bpm },
      })
      if (error) {
        update(toastId, { type: 'error', title: 'Could not create room', subtitle: error.message, duration: 3500 })
        return { ok: false, message: error.message }
      }
      store.isHost = true
      update(toastId, { type: 'success', title: 'Room created', subtitle: code, duration: 1800 })
      return { ok: true, code }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to create room'
      update(toastId, { type: 'error', title: 'Could not create room', subtitle: msg, duration: 3500 })
      return { ok: false, message: msg }
    }
  }

  async function joinRoom(code: string, name: string): Promise<{ ok: boolean; message?: string }> {
    if (!isSupabaseConfigured) {
      show({ type: 'error', title: 'Multiplayer unavailable', subtitle: 'Supabase not configured', duration: 3500 })
      return { ok: false, message: 'Supabase not configured' }
    }
    if (!name.trim()) {
      show({ type: 'error', title: 'Pick a name first', duration: 2500 })
      return { ok: false, message: 'Pick a name first' }
    }
    store.setName(name)
    store.connecting = true
    store.error = ''
    leaveChannel()
    const toastId = show({ type: 'loading', title: `Joining ${code}…`, subtitle: 'Connecting to realtime channel' })

    let hostId: string | null = null
    try {
      const { data } = await supabase.from('rooms').select('host_id').eq('code', code).maybeSingle()
      hostId = data?.host_id ?? null
    } catch {
      /* room table may not exist; treat as ad-hoc */
    }
    store.isHost = hostId === store.localId

    channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: store.localId }, broadcast: { self: false, ack: false } },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        if (!channel) return
        const state = channel.presenceState()
        const players = presenceToPlayers(state, hostId)
        store.players = players
        if (players.length > 8) {
          const me = players.find((p) => p.id === store.localId)
          if (me && players.indexOf(me) >= 8) {
            store.error = 'Room is full (8 players max)'
            void leaveRoom()
          }
        }
      })
      .on('broadcast', { event: 'note:play' }, ({ payload }) => {
        const p = payload as {
          instrument: InstrumentId
          note: string
          velocity: number
          player: string
          // Optional microtonal pitch shift in cents — only the maqam-
          // capable pads (violin / cello / oud bow + pluck) populate
          // it. Older clients won't send this field, in which case it
          // reads as undefined and we treat it as 0.
          cents?: number
        }
        if (p.player === store.localId) return
        isReceiving.value = true
        // Pass cents straight to playOn so a remote bent note bakes its
        // microtone into its own voice. The previous `setBend → attack`
        // sequence wrote to a shared detune param, which dragged every
        // already-sustaining note on the same instrument off pitch each
        // time another peer fired a different cents value.
        void playOn(p.instrument, p.note, p.velocity, false, p.cents)
        isReceiving.value = false
      })
      .on('broadcast', { event: 'note:stop' }, ({ payload }) => {
        const p = payload as { instrument: InstrumentId; note: string; player: string }
        if (p.player === store.localId) return
        stopOn(p.instrument, p.note)
      })
      .on('broadcast', { event: 'beatmaker:state' }, ({ payload }) => {
        // Full beat-maker state replication — every pattern, track, step,
        // BPM, swing, song-mode flag in one packet, debounced 200 ms by
        // the sender. Replaces the older fine-grained beat:toggle event,
        // and also serves as the divergence-recovery backstop when a
        // beat:patch packet is dropped.
        const p = payload as { state: BeatMakerSharedState; player: string }
        if (p.player === store.localId) return
        applyBeatState(p.state)
      })
      .on('broadcast', { event: 'beat:patch' }, ({ payload }) => {
        // Lightweight per-action patch for the high-frequency edits
        // (step paint, velocity slider, cents slider). Sized in tens of
        // bytes vs the kilobytes of a full pattern snapshot, so a paint
        // drag at 60Hz no longer chokes Supabase realtime. We replay
        // the action on the same store API the local user calls, so
        // both peers end up with byte-identical state.
        const p = payload as
          | { op: 'setStepActive'; trackId: string; stepIndex: number; active: boolean; player: string }
          | { op: 'setStepVelocity'; trackId: string; stepIndex: number; velocity: number; player: string }
          | { op: 'setStepCents'; trackId: string; stepIndex: number; cents: number; player: string }
        if (p.player === store.localId) return
        // holdReceiving (not just isReceiving=true/false) because the
        // store action triggers $subscribe → scheduleBeatBroadcast,
        // which would queue a full-state echo back to the sender 200ms
        // later if the receiving flag had already cleared.
        holdReceiving()
        // The action call itself ALSO triggers $onAction inside our
        // patch sender — but isReceiving.value is held true for the
        // 350ms RECEIVE_HOLD_MS window, so the patch sender's
        // store.isConnected && !isReceiving guard skips the echo.
        if (p.op === 'setStepActive') {
          beatStore.setStepActive(p.trackId, p.stepIndex, p.active)
        } else if (p.op === 'setStepVelocity') {
          beatStore.setStepVelocity(p.trackId, p.stepIndex, p.velocity)
        } else if (p.op === 'setStepCents') {
          beatStore.setStepCents(p.trackId, p.stepIndex, p.cents)
        }
      })
      .on('broadcast', { event: 'arrange:state' }, ({ payload }) => {
        // Full arrangement state replication — tracks, clips, FX,
        // automation curves. Each peer keeps their own UI-local fields
        // (which lane is open, which param is selected) inside applyArrangeState.
        const p = payload as { state: ArrangeSharedState; player: string }
        if (p.player === store.localId) return
        applyArrangeState(p.state)
      })
      .on('broadcast', { event: 'state:request' }, ({ payload }) => {
        // A new joiner asks for the room's existing state. Anyone who has
        // a non-empty snapshot replies. The joiner uses the first reply
        // they get (handled below in the state:reply handler).
        const p = payload as { from: string }
        if (p.from === store.localId) return
        // Don't reply if our own state is empty — we'd just hand them
        // nothing. Let a peer with data reply instead.
        const beat = snapshotBeatState()
        const arrange = snapshotArrangeState()
        const hasBeat = beat.patterns.some((pat) => pat.tracks.length > 0)
        const hasArrange = arrange.tracks.length > 0
        if (!hasBeat && !hasArrange) return
        broadcast('state:reply', {
          to: p.from,
          beatmaker: beat,
          arrange,
          player: store.localId,
        })
      })
      .on('broadcast', { event: 'state:reply' }, ({ payload }) => {
        const p = payload as {
          to: string
          beatmaker: BeatMakerSharedState
          arrange: ArrangeSharedState
          player: string
        }
        // Only the user who asked should consume this; anyone else just
        // ignores the reply (it's broadcast on the same channel).
        if (p.to !== store.localId) return
        if (!stateRequestPending) return
        stateRequestPending = false
        applyBeatState(p.beatmaker)
        applyArrangeState(p.arrange)
        show({ type: 'info', title: 'Synced room state', duration: 1500 })
      })
      .on('broadcast', { event: 'clip:shared' }, ({ payload }) => {
        // Recording propagation: a peer recorded a clip, uploaded it to
        // Supabase Storage, and is broadcasting the public URL + metadata.
        // We download, decode, and add a local Clip so the user can drop
        // it onto the arrangement just like one of their own takes.
        const p = payload as { clip: SharedClipMeta; player: string }
        if (p.player === store.localId) return
        void receiveSharedClip(p.clip)
      })
      .on('broadcast', { event: 'chat:msg' }, ({ payload }) => {
        const p = payload as { message: ChatMessage }
        store.pushChat(p.message)
      })
      .on('broadcast', { event: 'reaction' }, ({ payload }) => {
        const p = payload as { emoji: string; color: string; x: number; player: string }
        store.pushReaction({ id: uid(), emoji: p.emoji, authorColor: p.color, x: p.x })
        void p.player
      })

    return new Promise((resolve) => {
      channel!.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel!.track({
            id: store.localId,
            name: store.localName,
            instrument: store.localInstrument,
            color: store.localColor,
            joinedAt: Date.now(),
          })
          store.roomCode = code
          store.isConnected = true
          store.connecting = false
          wireSyncSubscriptions()
          // Ask the room for its current state. If the joiner is the host
          // who just opened the room, no peer will reply and they keep
          // their existing state. If they're joining a room with peers,
          // the first peer to reply hands them the full beat-maker +
          // arrangement state.
          requestRoomState()
          update(toastId, { type: 'success', title: `Joined ${code}`, subtitle: undefined, duration: 1400 })
          resolve({ ok: true })
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          store.connecting = false
          store.error = `Connection ${status}`
          update(toastId, {
            type: 'error',
            title: `Could not join ${code}`,
            subtitle: status === 'TIMED_OUT' ? 'Connection timed out' : 'Channel error',
            duration: 3500,
          })
          resolve({ ok: false, message: status })
        }
      })
    })
  }

  function wireSyncSubscriptions() {
    unwireSyncSubscriptions()
    // Pinia's $subscribe fires after every state mutation that traverses
    // the store's own state. Debouncing inside scheduleBeatBroadcast /
    // scheduleArrangeBroadcast collapses rapid-fire edits (clip drag,
    // automation point drag) into one packet at gesture-end. Even with
    // patches enabled below, the full-state debounce stays — it's the
    // join-room sync target (state:reply) AND the divergence-recovery
    // backstop when a patch packet is dropped or arrives out of order.
    unsubscribeBeatState = beatStore.$subscribe(() => {
      scheduleBeatBroadcast()
    }, { detached: true })
    unsubscribeArrangeState = arrangeStore.$subscribe(() => {
      scheduleArrangeBroadcast()
    }, { detached: true })
    // High-frequency operation patches — much smaller than re-broadcasting
    // the entire pattern set every time the user paints a step or drags a
    // velocity / cents slider. Only the three step-level setters get
    // patched here (paint drag and slider drag are the bandwidth-heavy
    // gestures); structural edits like add/remove pattern or track stay
    // on the full-state path because they're rare and bundle additional
    // bookkeeping the receiver already gets right via apply-state.
    unsubscribeBeat = beatStore.$onAction(({ name, args, after }) => {
      after(() => {
        if (!store.isConnected || isReceiving.value) return
        if (name === 'setStepActive') {
          const [trackId, stepIndex, active] = args as [string, number, boolean]
          broadcast('beat:patch', {
            op: 'setStepActive',
            trackId,
            stepIndex,
            active,
            player: store.localId,
          })
        } else if (name === 'setStepVelocity') {
          const [trackId, stepIndex, velocity] = args as [string, number, number]
          broadcast('beat:patch', {
            op: 'setStepVelocity',
            trackId,
            stepIndex,
            velocity,
            player: store.localId,
          })
        } else if (name === 'setStepCents') {
          const [trackId, stepIndex, cents] = args as [string, number, number]
          broadcast('beat:patch', {
            op: 'setStepCents',
            trackId,
            stepIndex,
            cents,
            player: store.localId,
          })
        }
      })
    })
  }
  function unwireSyncSubscriptions() {
    if (unsubscribeBeatState) { unsubscribeBeatState(); unsubscribeBeatState = null }
    if (unsubscribeArrangeState) { unsubscribeArrangeState(); unsubscribeArrangeState = null }
    if (unsubscribeBeat) { unsubscribeBeat(); unsubscribeBeat = null }
  }

  // — Recording share —
  // Uploads a finished recording to the room's Supabase Storage bucket,
  // then broadcasts the URL so peers can fetch + decode + add to their
  // local recorder list. Each peer treats received clips as read-only-ish
  // (they can edit metadata but the underlying buffer comes from the
  // shared URL). Failure modes are surfaced via toast.
  async function shareClip(clipId: string): Promise<{ ok: boolean; message: string }> {
    if (!store.isConnected) return { ok: false, message: 'Join a room first' }
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    const clip = recorderStore.clips.find((c) => c.id === clipId)
    if (!clip) return { ok: false, message: 'Clip not found' }
    const code = store.roomCode
    if (!code) return { ok: false, message: 'No active room' }

    const toastId = show({ type: 'loading', title: `Sharing "${clip.name}"…` })
    try {
      // Always-WAV path so peers on Safari (which struggles to decode
      // its own MediaRecorder WebM/Opus) see a format they can handle.
      const { bufferToWavBlob } = await import('@/lib/wav')
      const wav = bufferToWavBlob(clip.buffer)
      const path = `rooms/${code}/${clip.id}.wav`
      const { error: upErr } = await supabase.storage
        .from('shared-clips')
        .upload(path, wav, { contentType: 'audio/wav', upsert: true })
      if (upErr) {
        update(toastId, { type: 'error', title: 'Share failed', subtitle: upErr.message, duration: 3500 })
        return { ok: false, message: upErr.message }
      }
      const { data } = supabase.storage.from('shared-clips').getPublicUrl(path)
      const meta: SharedClipMeta = {
        id: clip.id,
        name: clip.name,
        url: data.publicUrl,
        duration: clip.duration,
        pitchSemitones: clip.pitchSemitones,
        speed: clip.speed,
        reverse: clip.reverse,
        loop: clip.loop,
        fadeIn: clip.fadeIn,
        fadeOut: clip.fadeOut,
        bpm: clip.bpm,
        source: clip.source,
      }
      broadcast('clip:shared', { clip: meta, player: store.localId })
      update(toastId, { type: 'success', title: `Shared "${clip.name}"`, duration: 1800 })
      return { ok: true, message: 'Shared' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Share failed'
      update(toastId, { type: 'error', title: 'Share failed', subtitle: msg, duration: 3500 })
      return { ok: false, message: msg }
    }
  }

  async function receiveSharedClip(meta: SharedClipMeta): Promise<void> {
    // Idempotency — if we already have this clip locally (we shared it,
    // or a re-share of the same id), don't add a duplicate.
    if (recorderStore.clips.some((c) => c.id === meta.id)) return
    try {
      const res = await fetch(meta.url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const arr = await blob.arrayBuffer()
      const ctx = Tone.getContext().rawContext as AudioContext
      const buffer = await ctx.decodeAudioData(arr.slice(0))
      // Build a thumbnail waveform on receive — peers shouldn't have to
      // ship the full waveform array across the wire when the buffer is
      // already cheap to scan locally.
      const channel0 = buffer.getChannelData(0)
      const buckets = 600
      const bucketSize = Math.max(1, Math.floor(channel0.length / buckets))
      const waveform: number[] = []
      for (let i = 0; i < buckets; i++) {
        let peak = 0
        const start = i * bucketSize
        const end = Math.min(channel0.length, start + bucketSize)
        for (let j = start; j < end; j++) {
          const a = Math.abs(channel0[j])
          if (a > peak) peak = a
        }
        waveform.push(peak)
      }
      const clip: Clip = {
        id: meta.id,
        name: `${meta.name} · shared`,
        source: meta.source,
        buffer,
        blob,
        duration: meta.duration,
        waveform,
        trimStart: 0,
        trimEnd: 1,
        pitchSemitones: meta.pitchSemitones,
        speed: meta.speed,
        reverse: meta.reverse,
        loop: meta.loop,
        fadeIn: meta.fadeIn,
        fadeOut: meta.fadeOut,
        bpm: meta.bpm,
        remoteUrl: meta.url,
        createdAt: Date.now(),
      }
      recorderStore.addClip(clip)
      show({ type: 'info', title: `New clip from a peer: ${meta.name}`, duration: 2400 })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not download peer clip'
      show({ type: 'error', title: 'Clip share failed', subtitle: msg, duration: 3500 })
    }
  }

  let stateRequestPending = false
  function requestRoomState() {
    if (!channel) return
    stateRequestPending = true
    // If no peer answers within 1.5 s, give up — the user just landed
    // in an empty room. Clearing the flag prevents a much-later reply
    // from a peer that briefly disconnected from clobbering the user's
    // own work after they've started editing.
    setTimeout(() => { stateRequestPending = false }, 1500)
    broadcast('state:request', { from: store.localId })
  }

  function broadcast(event: string, payload: Record<string, unknown>) {
    if (!channel) return
    void channel.send({ type: 'broadcast', event, payload })
  }

  function broadcastNote(instrument: InstrumentId, note: string, velocity: number, cents = 0) {
    if (!store.isConnected || isReceiving.value) return
    const payload: Record<string, unknown> = { instrument, note, velocity, player: store.localId }
    // Only send cents when actually shifted — keeps non-microtonal
    // payloads compact and lets the receiver branch off `payload.cents`
    // truthiness without comparing to 0.
    if (cents !== 0) payload.cents = cents
    broadcast('note:play', payload)
  }
  function broadcastNoteStop(instrument: InstrumentId, note: string) {
    if (!store.isConnected || isReceiving.value) return
    broadcast('note:stop', { instrument, note, player: store.localId })
  }
  function broadcastBpm(bpm: number) {
    if (!store.isConnected) return
    broadcast('bpm:change', { bpm, player: store.localId })
  }
  function sendChat(text: string) {
    if (!store.isConnected || !text.trim()) return
    const isEmoji = /^\p{Emoji_Presentation}+$/u.test(text.trim())
    const msg: ChatMessage = {
      id: uid(),
      authorId: store.localId,
      authorName: store.localName,
      authorColor: store.localColor,
      text: text.trim(),
      isEmoji,
      timestamp: Date.now(),
    }
    store.pushChat(msg)
    broadcast('chat:msg', { message: msg })
  }
  function sendReaction(emoji: string) {
    if (!store.isConnected) return
    const x = Math.random() * 80 + 10
    store.pushReaction({ id: uid(), emoji, authorColor: store.localColor, x })
    broadcast('reaction', { emoji, color: store.localColor, x, player: store.localId })
  }

  function leaveChannel() {
    if (channel) {
      void channel.unsubscribe()
      void supabase.removeChannel(channel)
      channel = null
    }
    unwireSyncSubscriptions()
    // Drop any pending debounced broadcasts so a leftover timer can't
    // attempt to send on a torn-down channel.
    if (beatBroadcastTimer) { clearTimeout(beatBroadcastTimer); beatBroadcastTimer = null }
    if (arrangeBroadcastTimer) { clearTimeout(arrangeBroadcastTimer); arrangeBroadcastTimer = null }
    stateRequestPending = false
  }

  async function leaveRoom() {
    leaveChannel()
    store.reset()
  }

  return {
    createRoom,
    joinRoom,
    leaveRoom,
    broadcastNote,
    broadcastNoteStop,
    broadcastBpm,
    sendChat,
    sendReaction,
    shareClip,
  }
}
