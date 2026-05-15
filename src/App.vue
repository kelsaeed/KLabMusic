<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import { useTheme } from '@/composables/useTheme'
import { useLocale } from '@/i18n'

// Debug overlay is hidden until ?debug=1 is present in the URL or the
// user taps 4× quickly anywhere on the page — opt-in only. Loaded
// async so the overlay's transitive useAudio import (which pulls in
// tone + smplr) doesn't bloat the entry chunk. The route into the
// overlay's own bundle happens after first paint, before tap-to-summon
// is realistic anyway.
const DebugOverlay = defineAsyncComponent(
  () => import('@/components/debug/DebugOverlay.vue'),
)
// Audio watchdog — same opt-in pattern (?watchdog=1). Async so its
// analyser/DSP loop + useAudio import never touches the entry chunk
// for users who aren't auditing.
const AudioWatchdog = defineAsyncComponent(
  () => import('@/components/debug/AudioWatchdog.vue'),
)

const { initTheme } = useTheme()
const { initLocale } = useLocale()

onMounted(() => {
  initTheme()
  initLocale()
  // Register the audio-sample service worker. The SW caches every fetch
  // to the third-party sample CDNs (jsDelivr, gleitz/midi-js-soundfonts,
  // tonejs.github.io, etc.) on first load, so subsequent reloads serve
  // instruments instantly from disk instead of re-downloading. Without
  // this the browser HTTP cache holds the bytes but Tone.Sampler /
  // smplr.Soundfont still go through their full validation and decode
  // path each reload, which is what the user perceived as 'every
  // refresh I have to load again sounds for each instrument.'
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // SW registration failures are best-effort — the app still works
      // without caching, just with slower reloads. We don't surface
      // this to the user because most failure modes (insecure origin
      // during local dev, browser quota exceeded) are not user-fixable.
    })
  }
  // Defer the heavy composables off the entry chunk. useKeyBindings transitively
  // imports tone + smplr + supabase, and useAuth pulls supabase — keeping them
  // in the entry chunk pushes ~120 KB onto the LCP critical path of every page.
  // Loading them after first paint makes /app's TTI noticeably faster.
  void import('@/composables/useKeyBindings').then(({ useKeyBindings }) => {
    useKeyBindings().init()
  })
  void import('@/composables/useAuth').then(({ useAuth }) => {
    void useAuth().init()
  })
  void import('@/composables/useAudio').then(({ useAudio }) => {
    useAudio().prefetchAvailableInstruments()
  })
  // Session auto-save / auto-restore. init() reads the previous
  // session from localStorage and re-applies it to the Pinia stores
  // before wiring the auto-save watchers, so a fresh page load lands
  // the user back exactly where they left off — no 'every refresh I
  // lose my work.' Loaded after the heavy composables so first paint
  // isn't delayed by a synchronous JSON parse of the saved payload.
  void import('@/composables/useSession').then(({ useSession }) => {
    useSession().init()
  })
  // Undo / redo init. Order matters — useSession restores the saved
  // session BEFORE undo/redo seeds its history, so the first undo
  // doesn't unwind back through a stale snapshot of the empty state.
  void import('@/composables/useUndoRedo').then(({ useUndoRedo }) => {
    const { init: initUndo, undo, redo } = useUndoRedo()
    initUndo()
    // Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z — every DAW + every text
    // editor on the planet uses these. Skip when the user is typing
    // in an input / textarea (those have native undo of their own
    // that we don't want to fight).
    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (e.key.toLowerCase() === 'y' && !e.shiftKey) {
        // Windows convention — Ctrl+Y as redo alongside Ctrl+Shift+Z.
        e.preventDefault()
        redo()
      }
    })
  })
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition name="page" mode="out-in">
      <component :is="Component" />
    </Transition>
  </RouterView>
  <DebugOverlay />
  <AudioWatchdog />
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}
.page-enter-from,
.page-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
