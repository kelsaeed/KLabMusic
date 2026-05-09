# KLabMusic — Project State & Technical Reference

A snapshot of what's shipped, what's still queued, and how every piece of
the audio engine fits together. Companion to [README.md](README.md)
(marketing overview) and [SETUP.md](SETUP.md) (deploy walkthrough).

Last updated alongside the most recent maqam / chord-builder work.

---

## 1. Stack

| Layer | Choice |
|---|---|
| UI framework | Vue 3 (script-setup, single-file components) |
| Type system | TypeScript ~5.6, strict mode |
| State | Pinia (one store per domain) |
| Bundler | Vite 5 |
| Audio | Tone.js v15 + smplr 0.20 (GM Soundfonts) |
| Realtime | Supabase Realtime channels |
| Storage / Auth | Supabase (Postgres + Storage + Anon-key auth) |
| AI | Groq Llama 3.3 70B via Supabase Edge Function |
| Hosting | Vercel (static SPA + edge cache) |
| i18n | vue-i18n with EN + AR + auto-RTL |
| Repo | github.com/kelsaeed/KLabMusic |

`npm run build` runs `vue-tsc --noEmit && vite build`. Type errors fail
the build before bundling.

---

## 2. Stages (top-level surfaces)

| Stage | Purpose |
|---|---|
| **Live Play** | One-pad-per-instrument live performance (11 pads + piano fallback). Press / pointer / touch input. |
| **Beat Maker** | 16 / 32-step grid, BPM 40–220, swing + humanize, multiple patterns, song-mode chain, custom-clip tracks. |
| **Loop Station** | Mic or master capture, up to 8 transport-synced layers, per-layer reverse / half-speed / volume / mute. |
| **Chaos** | Master XY pad (filter ↔ reverb), chaos pitch-jitter knob, glitch burst, FFT + waveform visualizer, AutoArp (chord builder + arpeggiator), Random Melody (mood-driven motifs). |
| **Recorder** | Mic capture, drag-drop file upload, waveform editor (trim, pitch, time-stretch, reverse, normalize, fades, BPM detect), Smart Tune (key detection + bulk vocal tune), per-clip cloud save. |
| **Arrange** | DAW timeline. Three clip kinds: audio (recorder clips), pattern (beat-maker patterns), liveTake (live-play performances). Per-track FX (reverb / delay / filter), automation lanes (volume + FX). |
| **Multiplayer** | Up to 8 players per room. Note broadcast, beat-state sync, arrange-state sync, presence list, chat + emoji reactions. KLB-XXXX share links over Supabase Realtime. |
| **Effects Library** | Browseable FX inventory — click adds to the active instrument's FX chain. |
| **Sound Library** | Curated loops, tagged by genre + category, preview through the project's mastering chain. |
| **Mastering** | Preset chain: off / classic / soft / punchy / louder / cassette / sub-boost / podcast / cranked. Each is an EQ3 + Compressor + Makeup-gain + Limiter recipe. |
| **Stem Export** | Per-track WAV via `OfflineAudioContext`. |
| **MIDI Export** | Beat-maker patterns → standard MIDI file. |
| **AI Assistant** | Chat, chord suggester, backing-track generator, music analyzer. |

---

## 3. Instrument catalogue

20 registered instruments (`src/lib/instruments.ts`), grouped by realm:

### 3.1 Keyboard (3)

| Id | Voice | Source |
|---|---|---|
| `piano` | `Tone.Sampler` | Salamander grand piano (`tonejs.github.io/audio/salamander/`) |
| `electricPiano` | `Tone.PolySynth(Tone.AMSynth)` | Synth |
| `organ` | `Tone.PolySynth(Tone.FMSynth)` | Synth |

### 3.2 Strings — plucked (3)

| Id | Voice | Source |
|---|---|---|
| `guitar` | smplr Soundfont | GM `acoustic_guitar_nylon` |
| `oud` | smplr Soundfont | GM `sitar` (closest neighbour — no oud in GM) |
| `harp` | `Tone.Sampler` | nbrosowsky `samples/harp/` (via jsDelivr) |

### 3.3 Strings — bowed (2)

| Id | Voice | Source |
|---|---|---|
| `violin` | `Tone.Sampler` | nbrosowsky `samples/violin/` |
| `cello` | `Tone.Sampler` | nbrosowsky `samples/cello/` |

Both use the shared `useBowedString` engine — see §6.

### 3.4 Wind (4)

| Id | Voice | Source |
|---|---|---|
| `trumpet` | `Tone.Sampler` | nbrosowsky `samples/trumpet/` |
| `clarinet` | `Tone.Sampler` | nbrosowsky `samples/clarinet/` |
| `flute` | `Tone.Sampler` | nbrosowsky `samples/flute/` |
| `harmonica` | `Tone.Sampler` | nbrosowsky `samples/harmonium/` (closest free-reed substitute) |

### 3.5 Percussion (3)

| Id | Voice | Source |
|---|---|---|
| `drums` (Beats pad — TR-808 trigger box) | smplr DrumMachine | GM `TR-808` |
| `realDrums` (full acoustic kit) | Tone synth approximation | Synth (no acoustic GM kit available without uncertainty) |
| `tambourine` | Tone synth approximation | Synth |

### 3.6 Synth-only (4)

| Id | Voice |
|---|---|
| `bass` | `Tone.MonoSynth` saw + filter envelope |
| `pad` | `Tone.PolySynth(Tone.FMSynth)` |
| `lead` | `Tone.Synth` saw + vibrato |
| `glitch` | `Tone.NoiseSynth` + `Tone.BitCrusher` |

### 3.7 FX placeholders (1)

| Id | Voice |
|---|---|
| `meme` | unavailable — sample pack pending |

Every sampled instrument has a **synth fallback** registered in
`FALLBACK_BUILDERS`. `ensureInstrument` races sample loading against a
12 s timeout; on timeout the synth fallback takes over so the
instrument stays playable offline / on a flaky connection.

---

## 4. Maqam system (end-to-end microtonal pipeline)

8 maqam presets in `src/lib/microtonal.ts`:

| id | tonic | notes |
|---|---|---|
| rast | C | C, D, E (half-flat), F, G, A, B (half-flat) |
| bayati | D | D, E (half-flat), F, G, A, B (half-flat), C |
| hijaz | D | D, E♭, F♯, G, A, B♭, C |
| saba | D | D, E (half-flat), F, G♭, A, B♭, C |
| sika | E | E (half-flat), F, G, A (half-flat), B, C, D |
| nahawand | C | C, D, E♭, F, G, A♭, B♭ |
| kurd | D | D, E♭, F, G, A, B♭, C |
| ajam | C | C, D, E, F, G, A, B |

Each preset stores `{ tonic, steps[] }` where `steps` are quarter-tone
offsets from the tonic (1 step = 50 cents). The pipeline that flows
those microtones through the app:

1. **Pads** — `ViolinPad`, `CelloPad`, `OudPad` render fingerboard
   cells per quarter-step (max 12–14 from each open string). Cells in
   the active maqam are highlighted via `maqamHighlightMap`. Every
   cell cell carries `{ noteName, cents }`; tapping or bowing fires
   `setBend(instrumentId, cents)` then `playOn(...)` so the engine
   produces the correct microtonal pitch.
2. **Beat Maker** — `BeatNotePicker` shows maqam chips for instruments
   with `hasQuarterTones: true`. Selecting a maqam highlights in-scale
   keys on the picker keyboard and seeds the picked note with the
   maqam's tonic. The beat-maker stores 12-TET notes (the maqam
   chips inform the player; the engine still rounds steps to
   semitones).
3. **Chaos — Random Melody** — `useChaos.generateMelody` accepts an
   optional `maqam` arg. When set, intervals come from the maqam's
   semitone-rounded steps, the tonic overrides the user's key picker,
   and a parallel `cents[]` array carries the per-degree microtonal
   shift. `playMelody` calls `setBend` before each note so the bowed
   / oud / sampler voices that support detune produce real microtonal
   pitch — not a 12-TET approximation.
4. **AutoArp** — chord builder offers a Maqam override that derives the
   chord from the maqam's 1 / 3 / 5 / 7 scale degrees on its canonical
   tonic. Same semitone rounding as Random Melody.
5. **Live-take recording** — `LiveTakeEvent` has an optional `cents`
   field. `recordLivePlay` accepts cents; bow segments and oud plucks
   ship them. Replay in `useArrange.scheduleLiveTakeClip` calls
   `setBend(ev.instrument, ev.cents)` before each scheduled attack so
   maqam performances replay verbatim from the timeline.
6. **Multiplayer** — `broadcastNote` payload gains an optional `cents`
   field. The room channel receiver calls `setBend` before `playOn` so
   a remote violinist playing maqam comes through with their original
   quarter-tone fingering. Bow + oud pad plays now broadcast (they
   went through `audio.playOn` directly before, bypassing the
   broadcast funnel — silent gap, fixed).
7. **Recorder — Tune to key** — `tuneClipToKey` accepts an optional
   `customIntervals` argument. `useRecorder.tuneClipToKeyNow` /
   `tuneAllClipsToKey` accept an optional `maqamId`, derive intervals
   + tonic from `MAQAM_PRESETS`, and forward. The recorder store has
   a persisted `songMaqam` field (localStorage) so the per-clip and
   Smart Tune surfaces share the same target.

**Honest limitation:** the existing pitch-shift path uses integer
semitones (`pitchSemitones` clamped to ±12, applied via
`Tone.PitchShift`), so vocal tuning to a maqam preserves the **scale
shape** but not the half-flat tones. The bow / pluck / arp / live-take
paths all use real cents-level detune on voices that support it
(`Tone.Sampler.detune`, smplr Soundfont's `start({ detune })`,
`PolySynth.set({ detune })`).

---

## 5. Voice lifecycle (the panic / dedup / polyphony layer)

Lives in `src/composables/useAudio.ts`. The user's spec for "no buzzing
under any condition" required a complete lifecycle layer:

### 5.1 Active-note tracking + duplicate-start dedup

```ts
interface ActiveNote {
  instrumentId, note, startedAt, voice, autoCleanupTimer?
}
const activeNotes = new Map<string, ActiveNote>()
```

Keyed by `${id}:${note}`. Every melodic entry point
(`playNote`, `playOn`, `playOnTimed`) consults `trackNoteOn` first; a
duplicate returns `false` and the attack is skipped. Percussion bypasses
dedup (hi-hat patterns need to retrigger).

### 5.2 Polyphony cap with FIFO voice stealing

- **Mobile** (coarse-pointer matchMedia + UA fallback): 12 voices
- **Desktop**: 32 voices

Above the cap, `stealOldestVoice()` releases the oldest active voice via
`voice.release(note)` so the envelope shapes a smooth fade-out — no clicks.

### 5.3 panicAllNotesOff

Releases every tracked voice, damps every loaded instrument, clears the
audio store's notes set. Wired to:

- `blur` (window)
- `pagehide` (window)
- `visibilitychange` (document, when hidden)
- `pointercancel` (window — safety net for missed touch endings)
- `keydown` Escape (when target isn't an editable element)

Also exposed as `panic()` from the `useAudio()` return for explicit
invocation, and the existing `stopAll` now routes through it.

### 5.4 Master output protection

A permanent safety brick-wall limiter sits at the **end** of the master
chain:

```
masterVolume → globalFx → chaosFx → mastering(eq → comp → makeup → limiter)
            → safetyLimiter → analyser → fft → destination
```

Settings: threshold `-6 dB`, ratio `12:1`, 3 ms attack, 100 ms release,
hard knee. Catches anything the bypassable mastering preset misses (the
"off" preset has its ceiling at 0 dB — permissive).

### 5.5 Diagnostics

`debugAudio()` is `import.meta.env.DEV`-gated so production is silent.
Logs `dup-skip key`, `steal key count=N`, `panic count=N`.

---

## 6. Bow engine (`useBowedString`)

Shared by `ViolinPad` and `CelloPad`. The pad components handle the
gesture (pointer / touch tracking, where on the fingerboard the user
is, swipe direction); the engine maps those to attack / detune /
release events on the instrument's voice.

- **Segment tracking** — every "bow segment" is from one `bowAttack`
  until the next `bowMoveTo` or `bowRelease`. Segments record
  `{ note, velocity, cents, startedAt }`.
- **Direction articulation** — down-bow plays at full velocity;
  up-bow at 86 % so the direction reads as accent vs. understatement.
- **Quarter-tone routing** — `bowAttack` calls `setBend` BEFORE
  `playOn`. Tone.Sampler's runtime detune AudioParam picks up the bend
  per-segment.
- **Live-take capture** — `flushSegment` on each direction flip / lift
  calls `recordLivePlay` with note + velocity + cents + duration.
- **Multiplayer** — `bowAttack` calls `broadcastNote` with cents;
  segment boundaries call `broadcastNoteStop`.

---

## 7. Sample loading + caching

### 7.1 Sources

| Source | Used by | Domain |
|---|---|---|
| Salamander piano | `piano` | `tonejs.github.io/audio/salamander/` |
| smplr GM Soundfont | `guitar`, `oud`, `drums` | `gleitz.github.io/midi-js-soundfonts/` (via smplr) |
| smplr DrumMachine | `drums` (TR-808 kit) | `smpldsnds.github.io` |
| nbrosowsky tonejs-instruments | `violin`, `cello`, `harp`, `trumpet`, `clarinet`, `flute`, `harmonica` | `cdn.jsdelivr.net/gh/nbrosowsky/tonejs-instruments@master/samples/` |

The nbrosowsky samples are MIT-licensed, designed for Tone.Sampler, and
served through jsDelivr's GitHub CDN mirror (Cloudflare-edge cached
worldwide — the raw `nbrosowsky.github.io` host has no global CDN and
loads from outside the US sat in multi-second latency, which broke the
Tone.Sampler ready-state on slow connections).

### 7.2 Sparse anchor sets

Tone.Sampler interpolates pitch between supplied notes, so each
instrument needs only 4–6 anchor samples. Trimmed counts:

- violin: 5 (G3, C4, G4, C5, G5)
- cello: 5 (C2, G2, C3, G3, C4)
- harp: 4 (C3, C5, E5, C7)
- trumpet: 5 (F3, C4, F4, C5, F5)
- clarinet: 4 (D3, D4, A♯4, D5)
- flute: 5 (C4, A4, C5, A5, C6)
- harmonium: 4 (C2, C3, C4, C5)

About 60 % fewer HTTP requests per instrument vs. a chromatic set, with
no audible degradation. Total cold-load: ~3–5 MB across all 7
instruments, **once per device, lifetime** (see caching).

### 7.3 Caching layers

1. **HTTP cache** — jsDelivr sends `Cache-Control: public,
   max-age=31536000, immutable`. Browser caches each MP3 for a year.
2. **Service worker** — `public/sw.js` intercepts every audio fetch
   from the cached hosts (Salamander / smplr / nbrosowsky / jsDelivr)
   and stores it in CacheStorage. Persistent — survives HTTP-cache
   eviction. After first download, every subsequent visit / page load /
   tab is instant with zero network.

### 7.4 Sample manifest seam

`src/lib/sampleManifest.ts` defines a typed shape for future sample
packs:

```ts
SampleManifest = {
  [instrumentId]: {
    [noteOrSampleName]: {
      [articulation]: string | { url: string; gain?: number }
    }
  }
}
```

`tryBuildFromManifest(id)` is wired into `ensureInstrument` BEFORE the
synth builder runs. It checks `hasManifestEntries` and would build a
sampler from the manifest URLs — but currently always returns null
because the manifest ships empty (no concrete pack to load yet). The
seam is in place; lighting it up is a future PR.

---

## 8. Multiplayer architecture

Supabase Realtime channels, one per room. Channel name
`klabmusic:room-${code}`.

**Broadcast events:**

| Event | Payload | Purpose |
|---|---|---|
| `note:play` | `{ instrument, note, velocity, cents?, player }` | Live-play attacks (piano press + bow + oud pluck) |
| `note:stop` | `{ instrument, note, player }` | Note releases |
| `beatmaker:state` | `{ state, player }` | Full beat-maker state replication (debounced 200 ms) |
| `arrange:state` | `{ state, player }` | Full arrangement state replication |
| `chat:message` | `{ id, text, authorId, authorName, color, timestamp }` | Text + emoji chat |
| `chat:reaction` | `{ emoji, x }` | Floating emoji reactions |
| `clip:share` | `{ clipMetadata, url, player }` | Cloud-clip share into room |
| `bpm:change` | `{ bpm, player }` | Tempo sync |
| `instrument:change` | `{ instrument, player }` | Player instrument selection |

**Presence** tracks per-player `{ id, name, color, instrument, isHost,
joinedAt }` for the room sidebar.

`isReceiving` flag prevents broadcast loops — when applying a remote
event, the local handlers skip their own broadcast call.

---

## 9. Project structure

```
KLabMusic/
├── public/
│   ├── favicon.svg
│   ├── robots.txt
│   └── sw.js                         # service worker (audio cache)
├── src/
│   ├── App.vue
│   ├── main.ts
│   ├── router/                       # vue-router routes
│   ├── i18n/
│   │   ├── en.json                   # English strings
│   │   ├── ar.json                   # Arabic strings
│   │   └── index.ts
│   ├── styles/                       # base / themes / RTL CSS
│   ├── stores/                       # Pinia stores (one per domain)
│   │   ├── audio.ts
│   │   ├── beatmaker.ts
│   │   ├── arrange.ts
│   │   ├── recorder.ts
│   │   ├── loopstation.ts
│   │   ├── multiplayer.ts
│   │   ├── keybindings.ts
│   │   └── user.ts
│   ├── composables/                  # logic, no UI
│   │   ├── useAudio.ts               # voice engine, lifecycle, master chain
│   │   ├── useChaos.ts               # arp + random-melody + chaos FX
│   │   ├── useArrange.ts             # arrangement playback + scheduling
│   │   ├── useBowedString.ts         # bow physics shared by violin/cello
│   │   ├── useExport.ts              # WAV stems + MIDI export
│   │   ├── useLivePlay.ts            # live-play press/release + take recording
│   │   ├── useLoopStation.ts
│   │   ├── useMultiplayer.ts         # Supabase Realtime sync
│   │   ├── useRecorder.ts            # mic, clip ops, smart tune
│   │   ├── useToast.ts
│   │   └── useKeyBindings.ts
│   ├── lib/                          # pure utilities (no Vue, no Tone)
│   │   ├── instruments.ts            # INSTRUMENTS table + INSTRUMENT_ORDER
│   │   ├── instrumentPresets.ts      # GUITAR_CHORDS + STRING_PRESETS
│   │   ├── microtonal.ts             # MAQAM_PRESETS + cents helpers
│   │   ├── pitch.ts                  # YIN pitch detection + scale snap
│   │   ├── keyDetection.ts           # Krumhansl-Kessler key matcher
│   │   ├── notation.ts               # note formatting (Do Re Mi vs C D E)
│   │   ├── synthPresets.ts           # bundled FX presets
│   │   ├── sampleManifest.ts         # future sample-pack seam
│   │   ├── tone-helpers.ts
│   │   ├── wav.ts                    # WAV encoding for offline render
│   │   └── types.ts                  # shared interfaces
│   ├── components/
│   │   ├── keyboard/                 # one pad per instrument
│   │   │   ├── Piano.vue
│   │   │   ├── DrumPad.vue
│   │   │   ├── RealDrumsPad.vue
│   │   │   ├── GuitarPad.vue
│   │   │   ├── ViolinPad.vue
│   │   │   ├── CelloPad.vue
│   │   │   ├── OudPad.vue
│   │   │   ├── HarpPad.vue
│   │   │   ├── HarmonicaPad.vue
│   │   │   ├── TrumpetPad.vue
│   │   │   ├── TambourinePad.vue
│   │   │   ├── ClarinetPad.vue
│   │   │   ├── FlutePad.vue
│   │   │   ├── LivePlay.vue          # routes to the right pad per active instrument
│   │   │   ├── PitchBend.vue
│   │   │   ├── ModWheel.vue
│   │   │   └── placeholders/
│   │   │       └── InstrumentSurface.vue   # shared chrome placeholder
│   │   ├── beatmaker/
│   │   ├── arrange/
│   │   ├── chaos/                    # XYPad, AutoArp, RandomMelody, Visualizer
│   │   ├── recorder/                 # ClipControls, SmartTunePanel, etc.
│   │   ├── loops/                    # Loop Station + sound library
│   │   ├── multiplayer/
│   │   ├── instruments/              # InstrumentSelector, EffectsPanel, EffectsLibrary
│   │   ├── keybindings/
│   │   ├── auth/
│   │   ├── ai/                       # AI assistant panel
│   │   └── shared/
│   └── views/                        # router pages
├── supabase/                         # SQL migrations + edge function
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vercel.json
├── README.md
├── SETUP.md
└── PROJECT.md                        # ← this file
```

---

## 10. UI conventions

- **No typing in form inputs.** All instrument / note / chord / scale /
  maqam pickers use dropdowns or visual cards, never free-text. The
  remaining text inputs (chat, room name, room code, search boxes,
  label fields) are non-musical and typing is the right pattern.
- **Class fallthrough on placeholders.** `InstrumentSurface` is a
  variant-driven body wrapper that pads use as their visual chrome,
  so the artwork is swappable in one file when real assets land.
- **Touch-action: none on every gesture surface.** Required for
  swipe / drag patterns to bypass browser scroll / zoom hijacking.
  Enforced inside `InstrumentSurface` so a parent can't accidentally
  drop the rule.
- **`document.elementFromPoint` for cross-platform drag.** Per-cell
  `pointerenter` is unreliable on iOS Safari + older Android Chrome
  during touch drags. Container-level `pointermove` + `elementFromPoint`
  is the only pattern that works everywhere.

---

## 11. What's still missing

### 11.1 Real samples we don't have yet

- **Oud** — using GM `sitar` as substitute. Real oud sample pack
  pending an MIT-licensed source on GitHub (none verified yet).
- **Real drum kit (`realDrums`)** — synth approximation. nbrosowsky
  has no acoustic kit, smplr's bundled DrumMachine kits are all
  electronic (TR-808 / TR-909 / LM-2 / MFB-512). Real acoustic drum
  pack pending.
- **Tambourine** — synth approximation. No verified GitHub source.
- **Harmonica** — using `harmonium` from nbrosowsky as substitute.
  Acceptable but a real harmonica sample pack would distinguish
  blow / draw character that the harmonium can't.

### 11.2 Articulation samples

The bow engine and pluck engines treat down-bow / up-bow / staccato /
legato / pizzicato / risha / finger-pluck identically — they're encoded
in the engine but no per-articulation samples exist in the manifest.
Real samples would let the engine pick:

- Violin: down-bow / up-bow / spiccato / tremolo / sul ponticello
- Cello: same set
- Oud: risha plucked / finger plucked
- Trumpet: stopped / muted / open valve takes
- Clarinet: chalumeau (low) / clarion (upper) register

### 11.3 Sample manifest loader

`tryBuildFromManifest` is wired but always returns `null` because the
manifest ships empty. When the first concrete pack arrives, the loader
needs to:

1. Build a `Tone.Sampler` from the per-note URLs in the manifest
2. Fall back to the synth builder if loading fails
3. Pick the right articulation entry based on what the bow / pluck
   engine signals

### 11.4 Microtonal fidelity gaps

- **Vocal tune-to-key** rounds to integer semitones (`pitchSemitones`
  is clamped ±12 and applied via `Tone.PitchShift`). Maqam vocal
  tuning preserves scale shape but loses the half-flat tones. A full
  per-frame autotune via offline render is the path forward.
- **Auto-detect maqam** in Smart Tune. The detector uses Krumhansl-
  Kessler against Western 12-TET key profiles. A maqam-specific
  detector would need different profiles trained on maqam vocal data.
- **Beat-maker step microtones.** Steps are `{ active, velocity,
  microShift }` where `microShift` is timing, not pitch. Adding a
  `cents` field per step would let the player author maqam grooves
  in the step grid.

### 11.5 Multiplayer gaps

- **AutoArp doesn't broadcast.** Algorithmic arp output stays local
  by design (avoids spamming other players' headphones with
  algorithmic content), but a "share my arp" toggle would be nice.
- **Chaos random melody doesn't broadcast.** Same.

### 11.6 Voice tracking edge cases

- **Per-instrument bend collision.** `setBend(id, cents)` writes to a
  shared `detune` AudioParam on the instrument. If two notes overlap
  with different cents, the second's bend retroactively affects the
  first's tail. Practically inaudible because chaos / arp notes are
  short and bow notes are monophonic, but a per-call detune (smplr
  Soundfont's `start({ detune })` already does this) would be cleaner.

### 11.7 Interactive testing

The voice-lifecycle hardening, mobile polyphony cap, Escape-key panic,
and per-touch-device gesture quirks all need real-device testing.
Build is clean and dev-mode diagnostics are in place; nothing replaces
hands-on play sessions.

---

## 12. Recent commit timeline (most recent first)

The maqam-everywhere + voice-lifecycle thread, in order:

1. `be9d393` AutoArp — pick chords from instrument-native presets (Guitar / Violin / Cello / Oud)
2. `6d484df` AutoArp — replace free-text chord field with dropdown chord builder
3. `3e75faa` Smart Tune — respect songMaqam on bulk-tune + surface picker
4. `a9beab6` Escape key panics — universal "stop all sound"
5. `d4feba2` Recorder — tune-to-key supports maqam targets
6. `fc0cfbc` Multiplayer — broadcast bow + oud plays with cents shift
7. `a6ecf8f` Live-take — preserve quarter-tone bends across arrangement playback
8. `b8d2809` Chaos — per-note microtonal cents shift in playMelody
9. `65e0eb4` Chaos — maqam picker on the random melody generator
10. `bd60761` Voice lifecycle hardening — kill the long-held droning bug
11. `d9d6a77` Service worker — cache the new sample CDNs too
12. `cb9b33d` Fix slow sample loading — jsDelivr + trimmed sets
13. `34d0a3f` Swap melodic voices to GitHub-hosted real samples (nbrosowsky)
14. `f0375ef` Swap melodic voices to GM Soundfont samples (smplr)
15. `65ae3cf` Fix trumpet default note picker target (Bb3 → A#3)
16. `0edac78` Maqam preset chips on the beat-maker note picker

Earlier work (Phases 3-12 of the original instrument expansion):

17. `c01afc8` Phase 12 — polish + scalability check
18. `5519d25` Phase 11 — structured visual asset placeholders
19. `f3186fa` Phase 10 — sample manifest
20. `9fef625` Phase 9 — integration pass (selector / beat-maker / chaos / loop / recording)
21. `4a550a4` Phase 8 — harp / trumpet / tambourine / clarinet / flute
22. `77dc552` Phase 7 — real drum kit (realDrums)
23. `1cce6eb` Phase 6 — harmonica
24. `3625cb2` Phase 5 — oud
25. `4c3600f` Phase 4 — cello
26. `a0093d1` Phase 3 — violin (bow engine + ViolinPad + buildViolin)

Phases 1-2 (instrument metadata extension + microtonal lib) shipped
before this thread.

---

## 13. How to contribute / extend

- **New instrument** — add to `InstrumentId` union (`src/lib/types.ts`),
  `INSTRUMENTS` table + `INSTRUMENT_ORDER` + `NOTE_RANGES` +
  `DEFAULT_NOTE_FOR` (`src/lib/instruments.ts`), build the voice in
  `useAudio.ts`, register in `BUILDERS`, optionally add fallback to
  `FALLBACK_BUILDERS`. Build will fail with a TS error for any
  exhaustive Record you forget.
- **New maqam** — add to `MAQAM_PRESETS` in `src/lib/microtonal.ts`,
  add to `MAQAM_IDS` in `useChaos.ts` + `ClipControls.vue` +
  `SmartTunePanel.vue` (the literal-string tuples — sole reason it's
  hand-listed is so TS can narrow to the actual ids).
- **New stage** — add a route in `src/router`, a view in `src/views`,
  and a Pinia store in `src/stores` if it needs state.

Run `npm run build` before every commit — it's faster than waiting for
Vercel to fail.

---

## 14. Operating notes

- Commits in this project are **human-style**: short subject + 2–4 line
  body, lowercase mostly, no marketing prose. No `Co-Authored-By:
  Claude` trailer.
- The author identity is `kelsaeed` on GitHub
  (`khaledawad552002@gmail.com`).
- Service worker only registers in production builds — dev mode skips
  it so changes hot-reload without cache interference.
