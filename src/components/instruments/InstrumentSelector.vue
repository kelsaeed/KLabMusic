<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import { useToast } from '@/composables/useToast'
import { INSTRUMENTS, INSTRUMENT_ORDER } from '@/lib/instruments'
import type { InstrumentId } from '@/lib/types'

const store = useAudioStore()
const { setInstrument, ensureInstrument } = useAudio()
const { show, update } = useToast()
const { t } = useI18n()

// One in-flight loading toast per instrument. Without this, repeatedly
// clicking an instrument card while it's still loading produces a stack
// of identical "Loading Piano…" toasts that never dismiss because each
// individual show() returns a new id and the user is shown all of them.
const loadingToasts = new Map<InstrumentId, string>()

async function pick(id: InstrumentId) {
  if (!INSTRUMENTS[id].available) return
  // Already loaded → instant select, no toast.
  if (store.getLoadState(id) === 'ready') {
    await setInstrument(id)
    return
  }
  // Already loading from a previous click → just switch to the
  // instrument visually and let the existing toast announce completion.
  // Do NOT show another toast.
  store.activeInstrument = id
  store.ensureEffectsFor(id)
  if (loadingToasts.has(id)) {
    void ensureInstrument(id)
    return
  }
  const label = t(`audio.instrument.${id}`)
  const toastId = show({
    type: 'loading',
    title: t('audio.loading', { name: label }),
    subtitle: t('audio.loadingSubtitle'),
  })
  loadingToasts.set(id, toastId)
  const node = await ensureInstrument(id)
  loadingToasts.delete(id)
  if (node) {
    update(toastId, {
      type: 'success',
      title: t('audio.loaded', { name: label }),
      subtitle: undefined,
      duration: 1400,
    })
  } else {
    update(toastId, {
      type: 'error',
      title: t('audio.loadFailed', { name: label }),
      subtitle: undefined,
      duration: 3000,
    })
  }
}

function prefetch(id: InstrumentId) {
  if (!INSTRUMENTS[id].available) return
  const state = store.getLoadState(id)
  // Skip prefetch if the instrument is already loaded, errored, or
  // currently loading. Hover-prefetch should ONLY start a brand-new
  // download — it must never trigger a second concurrent load that
  // queues behind the first on slow connections.
  if (state === 'ready' || state === 'loading' || state === 'error') return
  // Fire-and-forget: start downloading samples on hover so they're ready by click.
  void ensureInstrument(id)
}
</script>

<template>
  <section class="selector">
    <header class="head">
      <h3>{{ t('audio.instruments') }}</h3>
      <span class="hint mono">{{ t('audio.activeNotes', { n: store.activeNotes.size }) }}</span>
    </header>

    <div class="grid">
      <button
        v-for="id in INSTRUMENT_ORDER"
        :key="id"
        class="card"
        :class="{
          active: store.activeInstrument === id,
          loading: store.getLoadState(id) === 'loading',
          ready: store.getLoadState(id) === 'ready',
          unavailable: !INSTRUMENTS[id].available,
        }"
        :disabled="!INSTRUMENTS[id].available"
        :title="!INSTRUMENTS[id].available ? t('audio.notAvailable') : ''"
        @click="pick(id)"
        @pointerenter="prefetch(id)"
      >
        <span class="icon" aria-hidden="true">{{ INSTRUMENTS[id].icon }}</span>
        <span class="name">{{ t(`audio.instrument.${id}`) }}</span>

        <span
          v-if="store.getLoadState(id) === 'loading'"
          class="overlay"
          aria-label="loading"
        >
          <span class="spinner" />
          <span class="overlay-label mono">{{ t('audio.loadingShort') }}</span>
        </span>

        <span v-if="store.getLoadState(id) === 'ready'" class="dot ready-dot" />
        <span v-if="store.getLoadState(id) === 'error'" class="dot error-dot">!</span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.selector {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}
.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 0.75rem;
}
.head h3 {
  margin: 0;
  font-size: 0.95rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.hint {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
  gap: 0.5rem;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 0.85rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  overflow: hidden;
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast),
    background var(--transition-fast);
}
.card:hover:not(:disabled) {
  border-color: var(--accent-primary);
  transform: translateY(-1px);
}
.card.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 16px var(--accent-glow);
}
.card.unavailable {
  opacity: 0.45;
  cursor: not-allowed;
}
.icon {
  font-size: 1.5rem;
  transition: opacity var(--transition-fast);
}
.name {
  font-size: 0.78rem;
  font-family: var(--font-mono);
  transition: opacity var(--transition-fast);
}
.card.loading .icon,
.card.loading .name {
  opacity: 0.25;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  align-items: center;
  justify-content: center;
  background: rgba(5, 5, 16, 0.6);
  backdrop-filter: blur(2px);
  border-radius: var(--radius);
}
.spinner {
  width: 22px;
  height: 22px;
  border: 2px solid var(--border);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.overlay-label {
  font-size: 0.6rem;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dot {
  position: absolute;
  top: 0.45rem;
  inset-inline-end: 0.45rem;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 0.55rem;
  font-weight: 700;
  line-height: 1;
}
.ready-dot {
  background: var(--accent-primary);
  box-shadow: 0 0 6px var(--accent-glow);
}
.error-dot {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  width: 14px;
  height: 14px;
}

@media (max-width: 480px) {
  .selector { padding: 0.7rem; }
  .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.35rem; }
  .card { padding: 0.6rem 0.3rem; gap: 0.25rem; }
  .icon { font-size: 1.2rem; }
  .name { font-size: 0.7rem; letter-spacing: -0.01em; }
}
</style>
