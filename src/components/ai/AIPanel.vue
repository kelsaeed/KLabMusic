<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAI, type ChordSuggestion, type BackingTrack, type AnalysisResult } from '@/composables/useAI'
import { isSupabaseConfigured } from '@/lib/supabase'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const {
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
} = useAI()
const { t } = useI18n()

type Tab = 'chat' | 'suggest' | 'generate' | 'analyze'
const tab = ref<Tab>('chat')

const chatDraft = ref('')
const chatListRef = ref<HTMLDivElement | null>(null)

const suggestKey = ref('C')
const suggestMood = ref('happy')
const suggestResult = ref<ChordSuggestion | null>(null)

const genDescription = ref('lo-fi hip-hop beat at 90 bpm')
const genResult = ref<BackingTrack | null>(null)
const genStatus = ref('')

const analysisResult = ref<AnalysisResult | null>(null)
const analysisStatus = ref('')

const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const MOODS = ['happy', 'sad', 'epic', 'dreamy', 'jazzy', 'dark', 'tense', 'chill']

async function sendChat() {
  const text = chatDraft.value
  chatDraft.value = ''
  await chat(text)
}

async function runSuggest() {
  suggestResult.value = await suggestChords(suggestKey.value, suggestMood.value)
}

async function runGenerate() {
  genResult.value = await generateBackingTrack(genDescription.value)
  if (genResult.value) genStatus.value = t('ai.genReady')
  else genStatus.value = t('ai.genFailed')
  setTimeout(() => (genStatus.value = ''), 3000)
}

function applyGen() {
  if (genResult.value) {
    applyBackingTrackToBeatMaker(genResult.value)
    genStatus.value = t('ai.genApplied')
    setTimeout(() => (genStatus.value = ''), 3000)
  }
}

async function runAnalyze() {
  const notes = getRecentNotes(16)
  if (notes.length === 0) {
    analysisStatus.value = t('ai.noNotes')
    setTimeout(() => (analysisStatus.value = ''), 3000)
    return
  }
  analysisResult.value = await analyzeRecent(notes)
}

watch(
  () => messages.value.length,
  () => {
    nextTick(() => {
      if (chatListRef.value) chatListRef.value.scrollTop = chatListRef.value.scrollHeight
    })
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <aside v-if="open" class="ai-panel">
        <header class="head">
          <h3>
            <span class="dot" />
            {{ t('ai.title') }}
          </h3>
          <button class="close" @click="emit('close')">×</button>
        </header>

        <p v-if="!isSupabaseConfigured" class="warn">{{ t('ai.notConfigured') }}</p>

        <nav class="tabs">
          <button
            v-for="t in (['chat','suggest','generate','analyze'] as Tab[])"
            :key="t"
            class="tab mono"
            :class="{ on: tab === t }"
            @click="tab = t"
          >
            {{ $t(`ai.tab.${t}`) }}
          </button>
        </nav>

        <section v-if="tab === 'chat'" class="tab-body">
          <div ref="chatListRef" class="chat-list">
            <div v-if="messages.length === 0" class="empty">{{ t('ai.chatEmpty') }}</div>
            <div
              v-for="m in messages"
              :key="m.id"
              class="msg"
              :class="{ mine: m.role === 'user', bot: m.role === 'assistant' }"
            >
              <span class="who mono">{{ m.role === 'user' ? t('ai.you') : t('ai.bot') }}</span>
              <span class="txt">{{ m.content }}<span v-if="streaming && m.role === 'assistant' && m.id === messages[messages.length - 1].id" class="caret">▌</span></span>
            </div>
          </div>
          <form class="chat-input" @submit.prevent="sendChat">
            <input v-model="chatDraft" :placeholder="t('ai.chatPlaceholder')" :disabled="streaming" maxlength="500" />
            <button type="submit" class="send" :disabled="streaming || !chatDraft.trim()">↵</button>
          </form>
          <button v-if="messages.length" class="ghost mono small" @click="reset">{{ t('ai.clearChat') }}</button>
        </section>

        <section v-else-if="tab === 'suggest'" class="tab-body">
          <div class="row">
            <label>
              <span class="lbl mono">{{ t('chaos.key') }}</span>
              <select v-model="suggestKey">
                <option v-for="k in KEYS" :key="k" :value="k">{{ k }}</option>
              </select>
            </label>
            <label>
              <span class="lbl mono">{{ t('ai.mood') }}</span>
              <select v-model="suggestMood">
                <option v-for="m in MOODS" :key="m" :value="m">{{ m }}</option>
              </select>
            </label>
          </div>
          <button class="primary" :disabled="streaming" @click="runSuggest">
            {{ streaming ? t('ai.thinking') : t('ai.generate') }}
          </button>
          <div v-if="suggestResult" class="result">
            <div class="result-row">
              <span class="lbl mono">{{ t('ai.chords') }}</span>
              <span class="result-text mono">{{ suggestResult.chords.join(' · ') }}</span>
            </div>
            <div class="result-row">
              <span class="lbl mono">{{ t('ai.melody') }}</span>
              <span class="result-text mono">{{ suggestResult.melody.join(' ') }}</span>
            </div>
            <div class="result-row">
              <span class="lbl mono">{{ t('ai.rhythm') }}</span>
              <span class="result-text mono">{{ suggestResult.rhythm.map(r => r ? '■' : '·').join('') }}</span>
            </div>
          </div>
        </section>

        <section v-else-if="tab === 'generate'" class="tab-body">
          <label>
            <span class="lbl mono">{{ t('ai.describe') }}</span>
            <textarea v-model="genDescription" rows="3" :placeholder="t('ai.describePlaceholder')" />
          </label>
          <button class="primary" :disabled="streaming" @click="runGenerate">
            {{ streaming ? t('ai.thinking') : t('ai.generate') }}
          </button>
          <p v-if="genStatus" class="status mono">{{ genStatus }}</p>
          <div v-if="genResult" class="result">
            <div class="result-row mono">
              <span class="lbl">BPM</span> {{ genResult.bpm }} · <span class="lbl">{{ t('chaos.key') }}</span> {{ genResult.key }} {{ genResult.scale }}
            </div>
            <div class="result-row">
              <span class="lbl mono">{{ t('ai.chords') }}</span>
              <span class="result-text mono">{{ genResult.chords?.join(' · ') }}</span>
            </div>
            <button class="primary" @click="applyGen">{{ t('ai.applyToBeat') }}</button>
          </div>
        </section>

        <section v-else-if="tab === 'analyze'" class="tab-body">
          <p class="hint">{{ t('ai.analyzeHint') }}</p>
          <button class="primary" :disabled="streaming" @click="runAnalyze">
            {{ streaming ? t('ai.thinking') : t('ai.analyze') }}
          </button>
          <p v-if="analysisStatus" class="status mono">{{ analysisStatus }}</p>
          <div v-if="analysisResult" class="result">
            <div v-if="analysisResult.scale" class="result-row">
              <span class="lbl mono">{{ t('chaos.scale') }}</span>
              <span class="result-text">{{ analysisResult.scale }}</span>
            </div>
            <div v-if="analysisResult.genre" class="result-row">
              <span class="lbl mono">{{ t('ai.genre') }}</span>
              <span class="result-text">{{ analysisResult.genre }}</span>
            </div>
            <div v-if="analysisResult.mood" class="result-row">
              <span class="lbl mono">{{ t('ai.mood') }}</span>
              <span class="result-text">{{ analysisResult.mood }}</span>
            </div>
            <div v-if="analysisResult.chordNames?.length" class="result-row">
              <span class="lbl mono">{{ t('ai.chords') }}</span>
              <span class="result-text mono">{{ analysisResult.chordNames.join(' · ') }}</span>
            </div>
            <p v-if="analysisResult.notes" class="result-notes">{{ analysisResult.notes }}</p>
          </div>
        </section>

        <p v-if="error" class="error mono">{{ error }}</p>
      </aside>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-panel {
  position: fixed;
  inset-inline-end: 1rem;
  top: 80px;
  bottom: 80px;
  width: min(380px, calc(100vw - 2rem));
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  z-index: 150;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.85rem 1rem;
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border);
}
.head h3 {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-primary);
}
.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-glow);
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.5rem;
  line-height: 1;
}
.warn {
  margin: 0.5rem 0.75rem;
  padding: 0.5rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-secondary);
  border-radius: var(--radius);
  font-size: 0.78rem;
  color: var(--accent-secondary);
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elevated);
}
.tab {
  flex: 1;
  padding: 0.6rem 0.4rem;
  background: transparent;
  border: none;
  border-radius: 0;
  font-size: 0.7rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.tab.on {
  color: var(--accent-primary);
  border-bottom: 2px solid var(--accent-primary);
}
.tab-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.85rem;
  overflow: auto;
  min-height: 0;
}
.chat-list {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.2rem 0;
  min-height: 200px;
}
.empty {
  color: var(--text-muted);
  font-size: 0.85rem;
  text-align: center;
  padding: 2rem 1rem;
}
.msg {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.msg.mine { align-items: flex-end; }
.who {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.txt {
  background: var(--bg-elevated);
  padding: 0.45rem 0.65rem;
  border-radius: var(--radius);
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.mine .txt {
  background: var(--accent-primary);
  color: var(--text-inverse);
}
.caret {
  display: inline-block;
  margin-inline-start: 1px;
  color: var(--accent-primary);
  animation: blink 0.8s steps(2, start) infinite;
}
@keyframes blink {
  to { opacity: 0; }
}
.chat-input {
  display: flex;
  gap: 0.4rem;
}
.chat-input input { flex: 1; font-size: 0.85rem; }
.send {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  width: 36px;
}
.send:disabled { opacity: 0.4; }
.row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}
.row label, .tab-body > label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
textarea {
  font: inherit;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem;
  resize: vertical;
}
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.primary:disabled { opacity: 0.5; }
.ghost {
  background: transparent;
  font-size: 0.7rem;
  padding: 0.35rem 0.6rem;
}
.small { align-self: flex-start; }
.result {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  padding: 0.7rem 0.8rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
}
.result-row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  font-size: 0.85rem;
}
.result-text {
  word-break: break-word;
  color: var(--text-primary);
  font-size: 0.85rem;
}
.result-notes {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
  font-style: italic;
}
.status {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent-primary);
}
.hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--text-muted);
}
.error {
  margin: 0;
  padding: 0.5rem 0.7rem;
  border-top: 1px solid var(--accent-secondary);
  background: rgba(255, 0, 110, 0.08);
  color: var(--accent-secondary);
  font-size: 0.75rem;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
:global(html[dir='rtl']) .fade-enter-from,
:global(html[dir='rtl']) .fade-leave-to {
  transform: translateX(-20px);
}
@media (max-width: 720px) {
  .ai-panel {
    inset-inline-end: 0;
    top: 60px;
    bottom: 60px;
    width: 100vw;
  }
}
</style>
