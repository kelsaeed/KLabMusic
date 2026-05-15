// Filter cosmetic Tone.js v15 console noise:
//   - "AudioContext was not allowed to start" — Tone creates internal nodes at
//     module-init that ping the suspended context until the first gesture
//   - "deprecated: use load instead" — Tone.loaded() is being phased out in
//     favour of Tone.load(); we use it intentionally for sample-pack waits and
//     the warning fires repeatedly as soundfonts arrive
// Both are non-actionable for the user and the page works correctly.
{
  const origWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string') {
      if (first.includes('AudioContext was not allowed to start')) return
      if (first.includes('deprecated: use load instead')) return
    }
    origWarn(...args)
  }
}

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'
import { installTunedAudioContext } from './lib/audioContext'

import './styles/base.css'
import './styles/themes.css'
import './styles/rtl.css'

// Swap Tone's default tiny-buffer context for a playback-latency one
// BEFORE anything builds an audio node. This is the real "wshhhh under
// heavy play" fix — see lib/audioContext.ts for the full reasoning.
installTunedAudioContext()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(i18n)
app.mount('#app')

// Register the audio-sample caching service worker.
// First load is the same as before; subsequent visits load every Soundfont
// from the local cache and become near-instant.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* registration failure shouldn't break the app */
    })
  })
}
