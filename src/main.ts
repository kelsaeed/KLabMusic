// Filter Chrome's "AudioContext was not allowed to start" warnings.
// Tone.js v15 creates internal nodes (Transport ConstantSourceNode, etc.) at
// module-init time which ping the suspended AudioContext, and Chrome warns
// once per ping. The page works correctly — context resumes properly on the
// first user gesture — so these are cosmetic noise. Done before any other
// imports so it catches Tone's eager-init logging too.
{
  const origWarn = console.warn.bind(console)
  console.warn = (...args: unknown[]) => {
    const first = args[0]
    if (typeof first === 'string' && first.includes('AudioContext was not allowed to start')) return
    origWarn(...args)
  }
}

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { i18n } from './i18n'

import './styles/base.css'
import './styles/themes.css'
import './styles/rtl.css'

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
