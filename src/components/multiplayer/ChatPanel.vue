<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useMultiplayer } from '@/composables/useMultiplayer'

const store = useMultiplayerStore()
const { sendChat, sendReaction } = useMultiplayer()
const { t } = useI18n()

const draft = ref('')
const open = ref(true)
const listRef = ref<HTMLDivElement | null>(null)
const REACTIONS = ['🔥', '🎉', '🙌', '😂', '👏', '💀', '🎵', '🤘']

function send() {
  if (!draft.value.trim()) return
  sendChat(draft.value)
  draft.value = ''
}

function react(emoji: string) {
  sendReaction(emoji)
}

watch(
  () => store.chat.length,
  () => {
    nextTick(() => {
      if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight
    })
  },
)
</script>

<template>
  <aside class="chat" :class="{ open }">
    <button class="toggle" @click="open = !open">
      <span class="chev" :class="{ flip: open }">›</span>
      <span class="lbl mono">{{ t('mp.chat') }}</span>
      <span v-if="store.chat.length" class="count mono">{{ store.chat.length }}</span>
    </button>

    <div v-if="open" class="body">
      <div ref="listRef" class="list">
        <div v-if="store.chat.length === 0" class="empty">{{ t('mp.noMessages') }}</div>
        <div
          v-for="msg in store.chat"
          :key="msg.id"
          class="msg"
          :class="{ mine: msg.authorId === store.localId, big: msg.isEmoji }"
        >
          <span class="who" :style="{ color: msg.authorColor }">{{ msg.authorName }}</span>
          <span class="txt">{{ msg.text }}</span>
        </div>
      </div>

      <div class="reactions">
        <button v-for="r in REACTIONS" :key="r" class="r-btn" @click="react(r)">{{ r }}</button>
      </div>

      <form class="input" @submit.prevent="send">
        <input
          v-model="draft"
          :placeholder="t('mp.chatPlaceholder')"
          maxlength="240"
        />
        <button type="submit" class="send" :disabled="!draft.trim()">↵</button>
      </form>
    </div>
  </aside>
</template>

<style scoped>
.chat {
  position: fixed;
  inset-inline-end: 0;
  top: 56px;
  bottom: 0;
  width: 280px;
  background: var(--bg-surface);
  border-inline-start: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 30;
  transition: transform var(--transition-base);
  transform: translateX(calc(100% - 36px));
}
html[dir='rtl'] .chat { transform: translateX(calc(-100% + 36px)); }
.chat.open { transform: translateX(0); }
.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.85rem;
  background: var(--bg-elevated);
  border: none;
  border-bottom: 1px solid var(--border);
  border-radius: 0;
  text-align: start;
  font-size: 0.8rem;
}
.chev {
  display: inline-block;
  transition: transform var(--transition-base);
  color: var(--text-muted);
}
.chev.flip { transform: rotate(180deg); }
html[dir='rtl'] .chev { transform: rotate(180deg); }
html[dir='rtl'] .chev.flip { transform: rotate(0deg); }
.lbl {
  flex: 1;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.75rem;
}
.count {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
  font-size: 0.7rem;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.list {
  flex: 1;
  overflow: auto;
  padding: 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.empty { color: var(--text-muted); font-size: 0.8rem; text-align: center; padding: 1rem; }
.msg {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  font-size: 0.85rem;
  word-break: break-word;
}
.msg.mine { align-items: flex-end; }
.who {
  font-size: 0.65rem;
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.txt {
  background: var(--bg-elevated);
  padding: 0.35rem 0.55rem;
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.msg.big .txt { font-size: 1.6rem; padding: 0.2rem 0.5rem; }
.msg.mine .txt { background: var(--accent-primary); color: var(--text-inverse); border-color: var(--accent-primary); }
.reactions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.4rem 0.6rem;
  border-top: 1px solid var(--border);
}
.r-btn {
  font-size: 1rem;
  padding: 0.3rem 0.5rem;
  background: transparent;
  border: 1px solid var(--border);
}
.r-btn:hover { border-color: var(--accent-primary); transform: scale(1.1); }
.input {
  display: flex;
  gap: 0.3rem;
  padding: 0.5rem 0.6rem;
  border-top: 1px solid var(--border);
}
.input input { flex: 1; font-size: 0.85rem; }
.send {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  font-size: 1rem;
  width: 36px;
}
.send:disabled { opacity: 0.4; }

@media (max-width: 720px) {
  .chat { width: 100%; top: auto; height: 60vh; bottom: 56px; }
  .chat:not(.open) { transform: translateY(calc(100% - 36px)); }
}
</style>
