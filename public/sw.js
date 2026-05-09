// KLabMusic — service worker
// Caches every audio sample fetched from the third-party Soundfont/sample CDNs
// so each user only downloads the kit once. Subsequent visits are instant.
//
// To bust the cache after pointing at new sample sources, bump CACHE_VERSION.

// Bump on any change to the cached host set or sample sources — bumping
// triggers the cleanup branch in `activate` to drop the old cache so
// the user picks up the new content on next visit.
// v6 — drops the destructive activate-time cache flush that v5
// shipped with. Real-device feedback after v5 deployed: 'every
// instrument again loading forever.' Root cause was the activate
// handler deleting every klabmusic-audio-* cache that wasn't the
// current version, which on every code change forced the user to
// re-download every sample they had previously cached. Sample
// bytes are immutable (jsDelivr serves frozen per-version files),
// so old caches are always valid; flushing them was punishing
// users for SW updates instead of helping. v6 keeps every old
// cache around AND searches every klabmusic-audio-* cache on
// fetch, so a leftover v4 / v5 entry is a hit rather than a miss.
const CACHE_VERSION = 'v6'
const CACHE_NAME = `klabmusic-audio-${CACHE_VERSION}`

const CACHED_HOSTS = new Set([
  'tonejs.github.io',          // Salamander piano
  'gleitz.github.io',          // midi-js-soundfonts (smplr Soundfont)
  'smpldsnds.github.io',       // smplr drum machines + sfz instruments
  'cdn.jsdelivr.net',          // nbrosowsky tonejs-instruments via jsDelivr
  'nbrosowsky.github.io',      // direct GitHub Pages fallback for the same lib
])

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', (event) => {
  // Claim active clients so the new SW takes over without a reload,
  // but DO NOT flush old caches. Browser quota management evicts
  // them eventually under storage pressure — well after the user
  // has actually used the app — and keeping them around means the
  // cross-version fetch handler below can still serve hits from
  // older versions when a sample URL hasn't changed between bumps.
  event.waitUntil(self.clients.claim())
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
    (async () => {
      // Cross-version cache lookup. A 'klabmusic-audio-v4' hit is
      // just as valid as 'klabmusic-audio-v6' for serving the same
      // URL — the bytes don't change between SW versions, only the
      // SW handler logic does. This lets users keep the speed of a
      // populated cache across version bumps. Search current first
      // (fastest path on the common case where the cache is already
      // populated for this version), then any older klabmusic-audio
      // caches the user still has.
      const current = await caches.open(CACHE_NAME)
      const currentHit = await current.match(req)
      if (currentHit) return currentHit
      const allKeys = await caches.keys()
      for (const key of allKeys) {
        if (key === CACHE_NAME) continue
        if (!key.startsWith('klabmusic-audio-')) continue
        const c = await caches.open(key)
        const old = await c.match(req)
        if (old) {
          // Promote to current cache for faster lookup next time —
          // best-effort; failures don't matter, the older cache
          // will still serve on the next request.
          current.put(req, old.clone()).catch(() => {})
          return old
        }
      }
      try {
        const response = await fetch(req)
        if (response && response.ok && response.status === 200) {
          // Clone before consuming — response bodies are single-use streams.
          current.put(req, response.clone()).catch(() => {})
        }
        return response
      } catch {
        // Offline and not in any cache — let the upstream code handle
        // the failure (Tone.Sampler will surface the load error and
        // the engine's 12 s timeout fall through to the synth).
        return new Response('Audio fetch failed', {
          status: 504,
          statusText: 'Gateway timeout',
        })
      }
    })(),
  )
})
