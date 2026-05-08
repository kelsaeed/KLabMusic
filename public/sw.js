// KLabMusic — service worker
// Caches every audio sample fetched from the third-party Soundfont/sample CDNs
// so each user only downloads the kit once. Subsequent visits are instant.
//
// To bust the cache after pointing at new sample sources, bump CACHE_VERSION.

const CACHE_VERSION = 'v1'
const CACHE_NAME = `klabmusic-audio-${CACHE_VERSION}`

const CACHED_HOSTS = new Set([
  'tonejs.github.io',          // Salamander piano
  'gleitz.github.io',          // midi-js-soundfonts (smplr Soundfont)
  'smpldsnds.github.io',       // smplr drum machines + sfz instruments
])

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith('klabmusic-audio-') && k !== CACHE_NAME)
            .map((k) => caches.delete(k)),
        ),
      ),
    ]),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  let url
  try {
    url = new URL(req.url)
  } catch {
    return
  }
  if (!CACHED_HOSTS.has(url.host)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req)
      if (cached) return cached
      try {
        const response = await fetch(req)
        if (response && response.ok && response.status === 200) {
          // Clone before consuming — response bodies are single-use streams.
          cache.put(req, response.clone()).catch(() => {})
        }
        return response
      } catch (err) {
        // Offline and not in cache — let the upstream code handle the failure.
        return new Response('Audio fetch failed', {
          status: 504,
          statusText: 'Gateway timeout',
        })
      }
    }),
  )
})
