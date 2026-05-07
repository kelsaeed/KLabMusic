import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RoomPlayer, ChatMessage, FloatingReaction, InstrumentId } from '@/lib/types'

const PLAYER_COLORS = [
  '#00f5ff', '#ff00aa', '#ccff00', '#f5a623',
  '#d4a853', '#9d4edd', '#06ffa5', '#ff5e5e',
]

const STORAGE_KEY = 'klm:multiplayer:profile'

export const useMultiplayerStore = defineStore('multiplayer', () => {
  const localId = ref<string>(loadLocalId())
  const localName = ref<string>(loadLocalName())
  const localInstrument = ref<InstrumentId>('piano')
  const localColor = ref<string>(loadLocalColor())

  const roomCode = ref<string | null>(null)
  const isConnected = ref(false)
  const connecting = ref(false)
  const error = ref<string>('')
  const isHost = ref(false)
  const players = ref<RoomPlayer[]>([])
  const chat = ref<ChatMessage[]>([])
  const reactions = ref<FloatingReaction[]>([])
  const playerCount = computed(() => players.value.length)

  function loadLocalId(): string {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { id?: string }
      if (data.id) return data.id
    } catch {
      /* noop */
    }
    const id = `usr-${Math.random().toString(36).slice(2, 10)}`
    saveProfile({ id })
    return id
  }
  function loadLocalName(): string {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { name?: string }
      return data.name ?? ''
    } catch {
      return ''
    }
  }
  function loadLocalColor(): string {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { color?: string }
      if (data.color) return data.color
    } catch {
      /* noop */
    }
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)]
  }

  function saveProfile(patch: { id?: string; name?: string; color?: string }) {
    let current: Record<string, unknown> = {}
    try {
      current = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    } catch {
      /* noop */
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...patch }))
  }

  function setName(name: string) {
    localName.value = name
    saveProfile({ name })
  }

  function setInstrument(id: InstrumentId) {
    localInstrument.value = id
  }

  function pushChat(msg: ChatMessage) {
    chat.value.push(msg)
    if (chat.value.length > 200) chat.value.splice(0, chat.value.length - 200)
  }

  function pushReaction(reaction: FloatingReaction) {
    reactions.value.push(reaction)
    setTimeout(() => {
      reactions.value = reactions.value.filter((r) => r.id !== reaction.id)
    }, 2400)
  }

  function reset() {
    isConnected.value = false
    connecting.value = false
    isHost.value = false
    roomCode.value = null
    players.value = []
    chat.value = []
    reactions.value = []
    error.value = ''
  }

  return {
    localId,
    localName,
    localInstrument,
    localColor,
    roomCode,
    isConnected,
    connecting,
    isHost,
    players,
    chat,
    reactions,
    error,
    playerCount,
    setName,
    setInstrument,
    pushChat,
    pushReaction,
    reset,
  }
})
