<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { useMultiplayerStore } from '@/stores/multiplayer'
import { useMultiplayer } from '@/composables/useMultiplayer'
import { isSupabaseConfigured } from '@/lib/supabase'
import { INSTRUMENTS, INSTRUMENT_ORDER } from '@/lib/instruments'

const props = defineProps<{ prefilledCode?: string }>()

const store = useMultiplayerStore()
const { createRoom, joinRoom } = useMultiplayer()
const { t } = useI18n()
const router = useRouter()

const name = ref(store.localName || '')
const code = ref(props.prefilledCode || '')
const status = ref('')
const busy = ref(false)

async function onCreate() {
  if (!name.value.trim()) {
    status.value = t('mp.namePrompt')
    return
  }
  busy.value = true
  status.value = ''
  const create = await createRoom(name.value)
  if (!create.ok || !create.code) {
    status.value = create.message ?? 'Failed'
    busy.value = false
    return
  }
  const join = await joinRoom(create.code, name.value)
  busy.value = false
  if (join.ok) {
    void router.push({ name: 'room', params: { code: create.code } })
  } else {
    status.value = join.message ?? 'Failed to join'
  }
}

async function onJoin() {
  if (!name.value.trim() || !code.value.trim()) {
    status.value = t('mp.fillBoth')
    return
  }
  busy.value = true
  status.value = ''
  const result = await joinRoom(code.value.trim().toUpperCase(), name.value)
  busy.value = false
  if (result.ok) {
    void router.push({ name: 'room', params: { code: code.value.trim().toUpperCase() } })
  } else {
    status.value = result.message ?? 'Failed'
  }
}
</script>

<template>
  <div class="lobby">
    <h2>{{ t('mp.lobby') }}</h2>
    <p v-if="!isSupabaseConfigured" class="warn">
      {{ t('mp.notConfigured') }}
    </p>

    <label class="row">
      <span class="lbl mono">{{ t('mp.yourName') }}</span>
      <input v-model="name" :placeholder="t('mp.namePlaceholder')" maxlength="20" />
    </label>

    <label class="row">
      <span class="lbl mono">{{ t('mp.instrument') }}</span>
      <select v-model="store.localInstrument">
        <option v-for="id in INSTRUMENT_ORDER" :key="id" :value="id" :disabled="!INSTRUMENTS[id].available">
          {{ INSTRUMENTS[id].icon }} {{ t(`audio.instrument.${id}`) }}
        </option>
      </select>
    </label>

    <hr />

    <button class="primary" :disabled="!isSupabaseConfigured || busy" @click="onCreate">
      {{ t('mp.createRoom') }}
    </button>

    <div class="or mono">{{ t('mp.or') }}</div>

    <label class="row">
      <span class="lbl mono">{{ t('mp.roomCode') }}</span>
      <input v-model="code" placeholder="KLB-1234" class="mono code-input" maxlength="9" />
    </label>
    <button class="secondary" :disabled="!isSupabaseConfigured || busy" @click="onJoin">
      {{ t('mp.joinRoom') }}
    </button>

    <p v-if="status" class="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.lobby {
  width: min(420px, 100%);
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}
h2 { margin: 0; color: var(--accent-primary); font-size: 1.15rem; }
.warn {
  margin: 0;
  padding: 0.5rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-secondary);
  border-radius: var(--radius);
  font-size: 0.78rem;
  color: var(--accent-secondary);
}
.row { display: flex; flex-direction: column; gap: 0.3rem; }
.lbl { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.05em; }
.code-input { letter-spacing: 0.1em; text-align: center; font-size: 1rem; }
hr { border: none; border-top: 1px solid var(--border); margin: 0.4rem 0; }
.primary {
  background: var(--accent-primary); color: var(--text-inverse);
  border: none; font-weight: 700; padding: 0.7rem 1rem;
  letter-spacing: 0.04em; text-transform: uppercase; font-size: 0.85rem;
}
.secondary {
  background: var(--bg-elevated); padding: 0.7rem 1rem;
  font-weight: 600; font-size: 0.85rem;
}
.or {
  text-align: center;
  color: var(--text-muted);
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.status {
  margin: 0;
  font-size: 0.8rem;
  text-align: center;
  color: var(--accent-secondary);
}
</style>
