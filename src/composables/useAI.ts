import { ref } from 'vue'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useAudioStore } from '@/stores/audio'
import { useToast } from '@/composables/useToast'
import { makeTrack } from '@/lib/beatmaker'
import type { Pattern, BeatTrack, StepCount } from '@/lib/types'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ChordSuggestion {
  chords: string[]
  melody: string[]
  rhythm: number[]
}

export interface BackingTrack {
  bpm: number
  key: string
  scale: string
  chords: string[]
  drumPattern: { kick?: number[]; snare?: number[]; hihat?: number[]; clap?: number[] }
  bassline: string[]
}

export interface AnalysisResult {
  scale?: string
  genre?: string
  mood?: string
  chordNames?: string[]
  notes?: string
}

const messages = ref<AIMessage[]>([])
const streaming = ref(false)
const error = ref('')
const open = ref(false)

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

async function* streamCompletion(
  messageList: AIMessage[],
  system?: string,
  maxTokens = 1024,
): AsyncGenerator<string, void, unknown> {
  if (!isSupabaseConfigured) throw new Error('Supabase not configured')
  const url = `${SUPABASE_URL}/functions/v1/ai-music`
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      messages: messageList.map(({ role, content }) => ({ role, content })),
      system,
      max_tokens: maxTokens,
    }),
  })
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '')
    throw new Error(`AI service ${response.status}: ${text || 'no body'}`)
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue
      const data = line.slice(6).trim()
      if (!data || data === '[DONE]') continue
      let event: { text?: string; done?: boolean; error?: string }
      try {
        event = JSON.parse(data) as { text?: string; done?: boolean; error?: string }
      } catch {
        continue
      }
      if (event.error) throw new Error(event.error)
      if (event.done) return
      if (event.text) yield event.text
    }
  }
}

async function collect(generator: AsyncGenerator<string>): Promise<string> {
  let text = ''
  for await (const delta of generator) text += delta
  return text
}

function extractJson<T>(text: string): T | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as T
  } catch {
    return null
  }
}

const SYSTEM_CHAT =
  'You are a friendly, terse music assistant for KLabMusic, a free browser DAW with piano, ' +
  'classical guitar, bass, drums, synths, beat maker, loop station, key bindings, and multiplayer. ' +
  'Help with theory, sound design, and songwriting. Keep replies under 120 words unless asked.'

export function useAI() {
  const beatStore = useBeatMakerStore()
  const audioStore = useAudioStore()
  const { show, update } = useToast()

  function reset() {
    messages.value = []
    error.value = ''
  }

  async function chat(text: string): Promise<void> {
    if (!text.trim() || streaming.value) return
    error.value = ''
    const userMsg: AIMessage = { id: uid(), role: 'user', content: text.trim() }
    const assistantMsg: AIMessage = { id: uid(), role: 'assistant', content: '' }
    messages.value.push(userMsg, assistantMsg)
    const idx = messages.value.length - 1
    streaming.value = true
    try {
      for await (const delta of streamCompletion(
        messages.value.slice(0, -1),
        SYSTEM_CHAT,
      )) {
        messages.value[idx].content += delta
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Stream failed'
      messages.value[idx].content += `\n\n[error: ${error.value}]`
    } finally {
      streaming.value = false
    }
  }

  async function suggestChords(key: string, mood: string): Promise<ChordSuggestion | null> {
    error.value = ''
    streaming.value = true
    const toastId = show({
      type: 'loading',
      title: 'Suggesting chords…',
      subtitle: `${mood} progression in ${key}`,
    })
    try {
      const prompt =
        `Return ONLY a JSON object, no markdown fences, no commentary. ` +
        `Generate a ${mood} chord progression with a short melody in the key of ${key}. ` +
        `Schema: {"chords": ["Cmaj7","Am7","Dm7","G7"], "melody": ["C4","E4","G4",...], "rhythm": [1,0,1,0,...]} ` +
        `chords: 4-8 chord names. melody: 8-16 notes with octave. rhythm: 16 ints (0 or 1).`
      const text = await collect(streamCompletion([{ id: uid(), role: 'user', content: prompt }]))
      const parsed = extractJson<ChordSuggestion>(text)
      if (!parsed) {
        update(toastId, { type: 'error', title: 'Could not parse AI response', duration: 3500 })
      } else {
        update(toastId, {
          type: 'success',
          title: 'Chord suggestion ready',
          subtitle: parsed.chords.slice(0, 4).join(' · '),
          duration: 1800,
        })
      }
      return parsed
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed'
      update(toastId, { type: 'error', title: 'AI request failed', subtitle: error.value, duration: 3500 })
      return null
    } finally {
      streaming.value = false
    }
  }

  async function generateBackingTrack(description: string): Promise<BackingTrack | null> {
    error.value = ''
    streaming.value = true
    const toastId = show({
      type: 'loading',
      title: 'Building backing track…',
      subtitle: description.slice(0, 60),
    })
    try {
      const prompt =
        `Return ONLY a JSON object, no markdown fences, no commentary. ` +
        `Generate a 16-step backing track based on: "${description}". ` +
        `Schema: {"bpm":120,"key":"C","scale":"major","chords":["C","Am","F","G"],` +
        `"drumPattern":{"kick":[0,4,8,12],"snare":[4,12],"hihat":[0,2,4,6,8,10,12,14],"clap":[]},` +
        `"bassline":["C2","C2","A1","A1","F1","F1","G1","G1"]}. ` +
        `Step indices are 0-15. bassline has 8-16 notes.`
      const text = await collect(streamCompletion([{ id: uid(), role: 'user', content: prompt }]))
      const parsed = extractJson<BackingTrack>(text)
      if (!parsed) {
        update(toastId, { type: 'error', title: 'Could not parse AI response', duration: 3500 })
      } else {
        update(toastId, {
          type: 'success',
          title: 'Backing track ready',
          subtitle: `${parsed.bpm ?? '?'} BPM · ${parsed.key ?? ''} ${parsed.scale ?? ''}`.trim(),
          duration: 1800,
        })
      }
      return parsed
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed'
      update(toastId, { type: 'error', title: 'AI request failed', subtitle: error.value, duration: 3500 })
      return null
    } finally {
      streaming.value = false
    }
  }

  async function analyzeRecent(notes: string[]): Promise<AnalysisResult | null> {
    if (notes.length === 0) return null
    error.value = ''
    streaming.value = true
    const toastId = show({
      type: 'loading',
      title: 'Analyzing your notes…',
      subtitle: `${notes.length} note${notes.length === 1 ? '' : 's'}`,
    })
    try {
      const prompt =
        `Return ONLY a JSON object, no markdown fences. ` +
        `Analyze these recent notes: [${notes.join(', ')}]. ` +
        `Schema: {"scale":"C major","genre":"jazz","mood":"melancholy","chordNames":["Cmaj7","Am7"],"notes":"short observation"}.`
      const text = await collect(streamCompletion([{ id: uid(), role: 'user', content: prompt }]))
      const parsed = extractJson<AnalysisResult>(text)
      if (!parsed) {
        update(toastId, { type: 'error', title: 'Could not parse AI response', duration: 3500 })
      } else {
        const summary = [parsed.scale, parsed.genre, parsed.mood].filter(Boolean).join(' · ')
        update(toastId, {
          type: 'success',
          title: 'Analysis ready',
          subtitle: summary || undefined,
          duration: 1800,
        })
      }
      return parsed
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed'
      update(toastId, { type: 'error', title: 'AI request failed', subtitle: error.value, duration: 3500 })
      return null
    } finally {
      streaming.value = false
    }
  }

  function applyBackingTrackToBeatMaker(track: BackingTrack): void {
    if (!track) return
    if (typeof track.bpm === 'number') beatStore.bpm = Math.max(40, Math.min(220, track.bpm))
    const stepCount: StepCount = beatStore.stepCount
    const tracks: BeatTrack[] = []
    if (track.drumPattern?.kick) tracks.push(makeTrack('drums', 'kick', stepCount, track.drumPattern.kick))
    if (track.drumPattern?.snare) tracks.push(makeTrack('drums', 'snare', stepCount, track.drumPattern.snare))
    if (track.drumPattern?.hihat) tracks.push(makeTrack('drums', 'hihat', stepCount, track.drumPattern.hihat))
    if (track.drumPattern?.clap?.length) tracks.push(makeTrack('drums', 'clap', stepCount, track.drumPattern.clap))
    if (track.bassline?.length) {
      const bassTrack = makeTrack('bass', track.bassline[0] || 'C2', stepCount, [])
      track.bassline.forEach((_, i) => {
        if (i < stepCount) bassTrack.steps[i].active = true
      })
      tracks.push(bassTrack)
    }
    const newPattern: Pattern = {
      id: 'ai-' + uid(),
      name: 'AI',
      tracks,
    }
    beatStore.patterns.push(newPattern)
    beatStore.activePatternId = newPattern.id
  }

  function getRecentNotes(limit = 16): string[] {
    return Array.from(audioStore.activeNotes).slice(-limit)
  }

  return {
    open,
    messages,
    streaming,
    error,
    chat,
    reset,
    suggestChords,
    generateBackingTrack,
    analyzeRecent,
    applyBackingTrackToBeatMaker,
    getRecentNotes,
  }
}
