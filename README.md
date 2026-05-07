# 🎹 KLabMusic

> **Make Music. Break Rules.**
> A free, browser-based DAW. No paywalls, no freemium locks, every feature open to every visitor.

KLabMusic is a Vue 3 single-page app that turns the browser into a small studio: a multi-instrument piano, a 16/32-step Beat Maker, an 8-layer Loop Station, a Chaos Machine for experimental sound, an in-browser sample recorder + waveform editor, customizable QWERTY key bindings, real-time multiplayer rooms, and a free AI assistant for music theory help. EN + AR with full RTL support, five themes, and one-click deploy on Vercel + Supabase.

---

## ✨ Features

| | |
|---|---|
| 🎹 **Live Play** | On-screen piano (3 octaves, scrollable C1–C8). Velocity from mouse Y. Chord & strum modes. Pitch bend strip + mod wheel. Octave shift. |
| 🎻 **Instruments** | Sampled grand piano (Salamander), classical guitar (Karplus–Strong polyphony), Rhodes-style E-piano, FM pad, sawtooth lead, organ, MonoSynth bass, synthesized drum kit, glitch noise. Custom per-instrument FX chain (reverb, delay, drive, chorus, filter, crush, comp). |
| 🎙️ **Recorder** | Mic capture or drag-and-drop file upload. Canvas waveform with trim handles. Pitch shift ±12 st, time-stretch, reverse, normalize, fade in/out, BPM detect. WAV export. Cloud save to Supabase Storage. |
| ⌨️ **Key Bindings** | Assign any QWERTY key to any sound: notes, samples, chords, recorded clips, or actions (damp, tap-BPM, octave shift, transport play/stop). 5 default presets. JSON import/export + cloud save. |
| 🥁 **Beat Maker** | 16/32-step grid, BPM 40–220, swing, tap tempo, humanize, up to 16 patterns, song-mode arranger, custom-clip tracks. |
| 🔁 **Loop Station** | Mic or master capture. 8 transport-synced layers. Per-layer reverse, half-speed, volume, mute. Undo, clear, mix-export to WAV via OfflineAudioContext. |
| 🌀 **Chaos Machine** | Master XY pad (filter ↔ reverb), chaos knob (random pitch jitter), glitch button (1-bar bitcrush burst), live FFT + waveform visualizer, auto-arp, random melody generator (5 scales × 2 moods). |
| 👥 **Multiplayer** | Up to 8 players per room. Presence-based player list, broadcast notes, shared beat-grid edits, BPM sync, chat with floating emoji reactions. KLB-XXXX share-link rooms via Supabase Realtime. |
| 🤖 **AI Assistant** | Floating panel with chat, chord-suggester, backing-track generator (auto-fills the Beat Maker), and music analyzer. Powered by Groq's free Llama 3.3 70B via a Supabase Edge Function — no API key in the browser. |
| 🎨 **Themes** | Cyberpunk · Studio Pro · Acid Rave · Analog Tape · Midnight Jazz, plus a custom theme builder. |
| 🌐 **i18n + RTL** | English + Arabic. RTL layout flips automatically. All UI strings localised. |

---

## 🚀 Quick start

Full setup walkthrough (Supabase project + Vercel deploy + AI Edge Function): see **[SETUP.md](SETUP.md)**.

For local dev:
```bash
npm install
cp .env.example .env   # fill in your Supabase URL + anon key
npm run dev
```

Then open `http://localhost:5173`.

---

## ⌨️ Keyboard shortcuts

Press **`?`** anywhere to open the full shortcut overlay.

| Key | Action |
|---|---|
| `?` | Toggle this help |
| `Ctrl + A` (or `Cmd + A`) | Toggle AI assistant |
| `Z` / `X` | Octave down / up (Piano preset) |
| `A S D F G H J K` | Piano white keys (C4–C5) |
| `W E T Y U O` | Piano black keys |
| `Space` | Play / stop transport |
| `Shift` | Damp all ringing notes |

Custom bindings are saved per-user (cloud + localStorage).

---

## 🧱 Stack

- **Frontend** — Vue 3, TypeScript (strict), Vite, Pinia, vue-router, vue-i18n
- **Audio** — Tone.js (Karplus-Strong, FM, AM, MembraneSynth, MetalSynth), Web Audio AnalyserNode, MediaRecorder API
- **Backend** — Supabase (Postgres + Storage + Realtime + Edge Functions)
- **AI** — Groq's Llama 3.3 70B (free tier) via a Deno Edge Function that streams SSE
- **Hosting** — Vercel (auto-deploy on push to `main`)

Bundle is code-split: Tone (~280 KB), Supabase (~206 KB), Vue runtime (~167 KB), and per-stage chunks (~10 KB each) all load in parallel; initial JS to first paint is ~50 KB.

---

## 📁 Project structure

```
src/
├── assets/              ← static images / sounds
├── components/
│   ├── ai/              ← Groq-powered chat, chord suggester, generator, analyzer
│   ├── beatmaker/       ← 16/32-step grid, transport, song mode, add-track dialog
│   ├── chaos/           ← XY pad, chaos knob, glitch, visualizer, auto-arp
│   ├── instruments/     ← selector, effects panel, master controls
│   ├── keybindings/     ← QWERTY editor + assign dialog
│   ├── keyboard/        ← on-screen piano, pitch bend, mod wheel
│   ├── loopstation/     ← layer rows, transport, source toggle
│   ├── multiplayer/     ← lobby, room header, chat, reactions
│   ├── recorder/        ← waveform canvas, clip list, controls, drawer
│   ├── theme/           ← theme switcher
│   └── ui/              ← reusable Knob, etc.
├── composables/         ← useAudio, useRecorder, useKeyBindings, useLivePlay,
│                          useBeatMaker, useLoopStation, useChaos, useAI,
│                          useMultiplayer, useTheme
├── stores/              ← Pinia: audio, recorder, keybindings, beatmaker,
│                          loopstation, multiplayer, user
├── views/               ← HomeView, AppView, RoomView, NotFoundView
├── i18n/                ← en.json, ar.json
├── lib/                 ← supabase, types, instruments, beatmaker, keybindings
├── router/              ← vue-router config
└── styles/              ← themes.css (5 presets via CSS vars), base.css, rtl.css

supabase/
├── functions/ai-music/  ← Deno Edge Function proxying Groq → SSE
└── migrations/0001_init.sql   ← tables, RLS, storage buckets
```

---

## 🛠 Scripts

```
npm run dev          # Vite dev server, http://localhost:5173
npm run build        # type-check (vue-tsc) + production build to dist/
npm run preview      # serve the built dist/ locally
npm run type-check   # vue-tsc only, no build
```

---

## 📝 License

Free to use. No license declared yet — pick one when you're ready (MIT or Apache-2.0 are reasonable defaults).
