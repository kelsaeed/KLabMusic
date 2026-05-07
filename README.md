# KLabMusic

> Make Music. Break Rules.

A free, browser-based DAW built on Vue 3 + Tone.js + Supabase. No paywalls, no
freemium locks — every feature is open to every user.

## Stack

- Vue 3 + TypeScript + Vite
- Pinia · Vue Router · vue-i18n (EN + AR with full RTL)
- Tone.js + Web Audio API (audio engine)
- Supabase (auth, database, file storage, realtime)
- Vercel (frontend hosting)

## Getting started

```bash
npm install
cp .env.example .env   # fill in your Supabase keys
npm run dev
```

Full deployment walkthrough (Supabase project + Vercel) is in [SETUP.md](SETUP.md).

## Scripts

- `npm run dev` — Vite dev server on http://localhost:5173
- `npm run build` — type-check + production build to `dist/`
- `npm run preview` — preview the production build locally
- `npm run type-check` — run `vue-tsc` only

## Roadmap

| Phase | Module |
|-------|--------|
| 1 | Project scaffold, design system, i18n |
| 2 | Audio engine (Tone.js + effects) |
| 3 | Recorder + waveform editor |
| 4 | Custom key binding system |
| 5 | Live Play module |
| 6 | Beat Maker |
| 7 | Loop Station + Chaos Machine |
| 8 | Multiplayer (Supabase Realtime) |
| 9 | AI assistant (Claude via Edge Function) |
| 10 | Polish + Vercel deploy |
