import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useAudio } from '@/composables/useAudio'
import { useToast } from '@/composables/useToast'
import type {
  RealtimeChannel,
  RealtimePresenceState,
} from '@supabase/supabase-js'
import type { ChatMessage, RoomPlayer, InstrumentId } from '@/lib/types'

let channel: RealtimeChannel | null = null
const isReceiving = ref(false)
let unsubscribeBeat: (() => void) | null = null

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
  const { playOn, stopOn } = useAudio()
  const { show, update } = useToast()

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
        const p = payload as { instrument: InstrumentId; note: string; velocity: number; player: string }
        if (p.player === store.localId) return
        isReceiving.value = true
        void playOn(p.instrument, p.note, p.velocity)
        isReceiving.value = false
      })
      .on('broadcast', { event: 'note:stop' }, ({ payload }) => {
        const p = payload as { instrument: InstrumentId; note: string; player: string }
        if (p.player === store.localId) return
        stopOn(p.instrument, p.note)
      })
      .on('broadcast', { event: 'beat:toggle' }, ({ payload }) => {
        const p = payload as { trackId: string; stepIndex: number; active: boolean; player: string }
        if (p.player === store.localId) return
        isReceiving.value = true
        beatStore.setStepActive(p.trackId, p.stepIndex, p.active)
        isReceiving.value = false
      })
      .on('broadcast', { event: 'bpm:change' }, ({ payload }) => {
        const p = payload as { bpm: number; player: string }
        if (p.player === store.localId) return
        isReceiving.value = true
        beatStore.bpm = p.bpm
        isReceiving.value = false
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
          wireBeatStore()
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

  function wireBeatStore() {
    if (unsubscribeBeat) unsubscribeBeat()
    unsubscribeBeat = beatStore.$onAction(({ name, args, after }) => {
      if (isReceiving.value) return
      if (name === 'setStepActive' || name === 'toggleStep') {
        after(() => {
          const [trackId, stepIndex] = args as [string, number]
          const track = beatStore.activePattern.tracks.find((t) => t.id === trackId)
          const active = track?.steps[stepIndex]?.active ?? false
          broadcast('beat:toggle', { trackId, stepIndex, active, player: store.localId })
        })
      }
    })
  }

  function broadcast(event: string, payload: Record<string, unknown>) {
    if (!channel) return
    void channel.send({ type: 'broadcast', event, payload })
  }

  function broadcastNote(instrument: InstrumentId, note: string, velocity: number) {
    if (!store.isConnected || isReceiving.value) return
    broadcast('note:play', { instrument, note, velocity, player: store.localId })
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
    if (unsubscribeBeat) {
      unsubscribeBeat()
      unsubscribeBeat = null
    }
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
  }
}
