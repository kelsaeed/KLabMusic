import * as Tone from 'tone'

/**
 * Real-time audio buffering fix — the actual cause of the "wshhhh"
 * under heavy / fast play.
 *
 * The browser runs the audio callback on a dedicated real-time thread.
 * Tone.js's default context is created with `latencyHint: 'interactive'`,
 * which asks the OS for the SMALLEST possible hardware buffer (~128–256
 * frames ≈ 3–6 ms at 48 kHz). Every ~5 ms the audio thread MUST be
 * handed a fresh block of samples or it has nothing to play and emits
 * whatever is in the buffer — repeated/garbage frames that sound like
 * white-noise hiss: "wshhhh".
 *
 * Tone schedules note events from the MAIN thread (a setInterval clock).
 * When you play a chord or a fast run, the main thread is busy (Vue
 * reactivity, voice allocation, param automation). A 3–6 ms buffer
 * gives the audio thread almost no cushion to ride out that main-thread
 * jank, so it starves and hisses. No amount of voice trimming fully
 * fixes this — the buffer is simply too small to absorb a scheduling
 * hiccup.
 *
 * The fix is the standard one for browser instruments:
 *
 *  1. `latencyHint: 'playback'` — tell the browser we prefer a large,
 *     glitch-proof buffer over minimum latency. The OS hands back a
 *     much bigger block (typically 1024–2048 frames ≈ 20–45 ms). That
 *     cushion absorbs main-thread stalls so the audio thread never
 *     starves. The added latency (tap → sound) is well under the ~50 ms
 *     a player perceives as "instant" for a pad/keyboard surface, and
 *     it is vastly better than hiss.
 *
 *  2. `lookAhead: 0.3` — Tone queues scheduled events 300 ms before
 *     they sound (default is 100 ms). Even if the main-thread clock
 *     tick lands late, the note's automation is already committed to
 *     the Web Audio timeline ahead of time, so timing stays tight and
 *     nothing arrives after the audio thread already needed it.
 *
 *  3. `updateInterval: 0.05` — the main-thread clock wakes slightly
 *     less often (50 ms vs 30 ms). Combined with the bigger lookAhead
 *     it schedules the same events in fewer, larger batches — less
 *     per-tick main-thread pressure, which is exactly the pressure
 *     that was causing the starvation.
 *
 * This MUST run before any Tone node (synth, effect, master chain) is
 * constructed — `latencyHint` is fixed at AudioContext construction and
 * cannot be changed later. main.ts imports this module first, before
 * the app (and any composable) mounts, so the tuned context is the one
 * every voice is built on.
 */

let installed = false

export function installTunedAudioContext(): void {
  if (installed) return
  if (typeof window === 'undefined') return
  installed = true
  try {
    const ctx = new Tone.Context({
      latencyHint: 'playback',
      lookAhead: 0.3,
      updateInterval: 0.05,
    })
    Tone.setContext(ctx)
  } catch {
    // If the environment rejects the options (very old browser), fall
    // back to nudging the existing context's lookAhead — still better
    // than the 0.1 default even though the hardware buffer stays small.
    try {
      Tone.getContext().lookAhead = 0.3
    } catch {
      /* nothing else we can safely do; default context remains */
    }
  }
}
