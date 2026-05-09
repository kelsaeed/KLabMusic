// IndexedDB-backed AudioBuffer cache. The Service Worker handles
// encoded-byte caching at the network layer (instant fetch from disk
// on reload), but the AudioContext.decodeAudioData step still runs on
// every page load and adds 100-300 ms per instrument before sound is
// audible. This module persists the DECODED Float32 channel data per
// URL so a second visit skips decode entirely — Tone.Sampler /
// Tone.Player receive an already-built AudioBuffer the moment the
// instrument is requested.
//
// Storage shape: keyed by URL, value is { sampleRate, channels[],
// duration, cachedAt }. Float32Array is structured-cloneable so IDB
// stores the channel data directly without any custom serialisation.
//
// Best-effort everywhere: any IDB failure (private browsing, quota,
// disabled storage) degrades gracefully to fetch + decode, so the
// app always works even without the cache.

const DB_NAME = 'klabmusic-audio'
const STORE_NAME = 'buffers'
const DB_VERSION = 1

interface CachedBuffer {
  url: string
  sampleRate: number
  channels: Float32Array[]
  duration: number
  cachedAt: number
}

let dbPromise: Promise<IDBDatabase | null> | null = null

// iOS Safari's IndexedDB can hang indefinitely in private mode and
// occasionally under quota pressure — neither onsuccess nor onerror
// nor onblocked fires. Real-device QA caught this as 'instruments
// load forever' on phones because every instrument's load awaited
// an openDb call that never resolved. A 1-second budget is plenty
// for IDB to actually open (typical opens are <10 ms); past that we
// give up and treat the cache as unavailable, which makes
// loadCachedOrDecode fall straight through to fetch + decode.
const OPEN_DB_TIMEOUT_MS = 1000
// Per-URL fetch budget. The Service Worker's cache-first strategy
// turns a CDN miss into a network round-trip on first visit, and
// some regions (Egypt mobile, the user's environment) have CDN
// reachability problems where the round-trip can hang for tens of
// seconds. Without this timeout, buildSamplerVoice / build-from-
// manifest paths waited for Promise.all() of N URL fetches, any
// one of which could deadlock the whole instrument load. 8s is
// a comfortable upper bound for a successful fetch; past that the
// caller treats the URL as unreachable and falls back to the
// synth path.
const FETCH_TIMEOUT_MS = 8000

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.resolve(null)
    return dbPromise
  }
  dbPromise = new Promise((resolve) => {
    let settled = false
    const settle = (db: IDBDatabase | null) => {
      if (settled) return
      settled = true
      resolve(db)
    }
    const timer = setTimeout(() => settle(null), OPEN_DB_TIMEOUT_MS)
    let req: IDBOpenDBRequest
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION)
    } catch {
      clearTimeout(timer)
      settle(null)
      return
    }
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'url' })
      }
    }
    req.onsuccess = () => { clearTimeout(timer); settle(req.result) }
    req.onerror = () => { clearTimeout(timer); settle(null) }
    req.onblocked = () => { clearTimeout(timer); settle(null) }
  })
  return dbPromise
}

// fetch() with an AbortController-driven timeout. Native fetch has no
// per-request timeout option in the standard API, and a hung mobile
// connection waits forever otherwise.
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readFromCache(url: string): Promise<CachedBuffer | null> {
  const db = await openDb()
  if (!db) return null
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(url)
      req.onsuccess = () => resolve((req.result as CachedBuffer | undefined) ?? null)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function writeToCache(entry: CachedBuffer): Promise<void> {
  const db = await openDb()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(entry)
      req.onsuccess = () => resolve()
      req.onerror = () => resolve()
      tx.onerror = () => resolve()
    } catch {
      resolve()
    }
  })
}

function bufferToCached(url: string, buffer: AudioBuffer): CachedBuffer {
  const channels: Float32Array[] = []
  for (let i = 0; i < buffer.numberOfChannels; i++) {
    // .slice() detaches from the live AudioBuffer so a later GC of the
    // buffer doesn't free the data IDB still references.
    channels.push(buffer.getChannelData(i).slice())
  }
  return {
    url,
    sampleRate: buffer.sampleRate,
    channels,
    duration: buffer.duration,
    cachedAt: Date.now(),
  }
}

function cachedToBuffer(ctx: AudioContext, c: CachedBuffer): AudioBuffer | null {
  if (c.channels.length === 0 || c.channels[0].length === 0) return null
  // The cached sampleRate may differ from the current context's
  // sampleRate (mobile flips between 44.1 and 48 kHz across page
  // visibility events); creating the buffer at the cached rate keeps
  // pitch correct, the AudioContext resamples downstream automatically.
  const buffer = ctx.createBuffer(c.channels.length, c.channels[0].length, c.sampleRate)
  for (let i = 0; i < c.channels.length; i++) {
    buffer.copyToChannel(c.channels[i], i)
  }
  return buffer
}

/**
 * Load an audio file as an AudioBuffer, preferring the local IDB cache
 * over a network fetch. On cache miss, fetches the URL, decodes it,
 * stores the decoded buffer in IDB, and returns the buffer. On cache
 * hit, returns the buffer reconstructed from cached channel data.
 *
 * Throws on unrecoverable network / decode failures; callers should
 * catch and fall back to a synth voice or a different sample source.
 */
export async function loadCachedOrDecode(
  url: string,
  ctx: AudioContext,
): Promise<AudioBuffer> {
  try {
    const cached = await readFromCache(url)
    if (cached) {
      const buffer = cachedToBuffer(ctx, cached)
      if (buffer) return buffer
      // Bad entry (zero-length channel) — fall through to fresh fetch
      // and the writeToCache below will overwrite it.
    }
  } catch {
    /* IDB read failed — fall through to network */
  }
  const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  const arrayBuffer = await res.arrayBuffer()
  // decodeAudioData detaches its input ArrayBuffer; we slice() to
  // hand it a fresh copy so we could in theory still cache the
  // original bytes if we wanted — but here we cache the decoded
  // result instead, which is the slow part to skip on next reload.
  const buffer = await ctx.decodeAudioData(arrayBuffer.slice(0))
  // Fire-and-forget — write may take ~10 ms; the caller doesn't
  // wait for IDB to flush before getting the buffer back.
  void writeToCache(bufferToCached(url, buffer))
  return buffer
}

/**
 * Preload a list of URLs into the cache without consuming the
 * resulting AudioBuffers. Used to warm IDB during idle time so a
 * subsequent ensureInstrument() finds everything pre-decoded.
 *
 * Failures on individual URLs are swallowed — one bad URL doesn't
 * abort the rest of the prewarm.
 */
export async function prewarmUrls(
  urls: string[],
  ctx: AudioContext,
): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      try { await loadCachedOrDecode(url, ctx) } catch { /* swallow */ }
    }),
  )
}
