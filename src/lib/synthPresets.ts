// Synth presets — Phase 1 deliverable. Each preset captures the FX-chain
// state for one instrument so the user can flip between "Felt Lo-Fi Piano"
// and "Concert Hall Piano" without re-toggling seven knobs every time.
//
// Two tiers ship:
//   - FACTORY_PRESETS: bundled, read-only, one-click sound packs the user
//     can audition the moment they open the app.
//   - User presets: created via the EffectsPanel "Save Preset" button.
//     Persisted in localStorage so they survive a refresh.

import type { InstrumentId, EffectId } from './types'

export interface PresetEffectControl {
  enabled: boolean
  amount: number
}

export interface SynthPreset {
  id: string
  name: string
  instrumentId: InstrumentId
  effects: Record<EffectId, PresetEffectControl>
  isFactory: boolean
}

// Compact authoring helper. Effects not listed default to disabled at
// amount 0.4 (matches defaultEffects() in the audio store).
function fx(spec: Partial<Record<EffectId, [boolean, number]>>): Record<EffectId, PresetEffectControl> {
  const ids: EffectId[] = ['reverb', 'delay', 'distortion', 'chorus', 'filter', 'bitcrusher', 'compressor']
  const out = {} as Record<EffectId, PresetEffectControl>
  for (const id of ids) {
    const v = spec[id]
    out[id] = v ? { enabled: v[0], amount: v[1] } : { enabled: false, amount: 0.4 }
  }
  return out
}

function p(id: string, instrumentId: InstrumentId, name: string, spec: Parameters<typeof fx>[0]): SynthPreset {
  return { id, name, instrumentId, effects: fx(spec), isFactory: true }
}

export const FACTORY_PRESETS: SynthPreset[] = [
  // — Piano —
  p('piano-clean', 'piano', 'Salamander Clean', {}),
  p('piano-felt-lofi', 'piano', 'Felt Lo-Fi', {
    filter: [true, 0.6],
    reverb: [true, 0.3],
    bitcrusher: [true, 0.2],
  }),
  p('piano-concert-hall', 'piano', 'Concert Hall', {
    reverb: [true, 0.7],
    compressor: [true, 0.3],
  }),
  p('piano-vintage-tape', 'piano', 'Vintage Tape', {
    chorus: [true, 0.5],
    filter: [true, 0.5],
    bitcrusher: [true, 0.15],
  }),

  // — E-Piano —
  p('ep-wurli-clean', 'electricPiano', 'Wurli Clean', {}),
  p('ep-tape-wobble', 'electricPiano', 'Tape Wobble', {
    chorus: [true, 0.7],
    bitcrusher: [true, 0.2],
    reverb: [true, 0.25],
  }),
  p('ep-rhodes-spread', 'electricPiano', 'Rhodes Spread', {
    chorus: [true, 0.5],
    delay: [true, 0.35],
    reverb: [true, 0.4],
  }),

  // — Guitar —
  p('gtr-classical', 'guitar', 'Classical Clean', {}),
  p('gtr-cathedral', 'guitar', 'Cathedral', {
    reverb: [true, 0.85],
    delay: [true, 0.25],
  }),
  p('gtr-surf-slap', 'guitar', 'Surf Slap', {
    delay: [true, 0.45],
    reverb: [true, 0.4],
  }),
  p('gtr-overdriven', 'guitar', 'Overdriven', {
    distortion: [true, 0.55],
    compressor: [true, 0.4],
    reverb: [true, 0.3],
  }),

  // — Bass —
  p('bass-sub-round', 'bass', 'Sub Round', {
    compressor: [true, 0.4],
  }),
  p('bass-acid-squelch', 'bass', 'Acid Squelch', {
    filter: [true, 0.55],
    distortion: [true, 0.35],
    delay: [true, 0.2],
  }),
  p('bass-fat-stack', 'bass', 'Fat Stack', {
    chorus: [true, 0.5],
    compressor: [true, 0.5],
  }),

  // — Pad —
  p('pad-ambient-wash', 'pad', 'Ambient Wash', {
    reverb: [true, 0.8],
    chorus: [true, 0.45],
    filter: [true, 0.35],
  }),
  p('pad-synthwave', 'pad', 'Synthwave Stack', {
    chorus: [true, 0.6],
    delay: [true, 0.4],
    reverb: [true, 0.55],
  }),
  p('pad-glass', 'pad', 'Glass Pad', {
    reverb: [true, 0.6],
    bitcrusher: [true, 0.15],
  }),

  // — Lead —
  p('lead-trance-saw', 'lead', 'Trance Saw', {
    delay: [true, 0.5],
    reverb: [true, 0.5],
  }),
  p('lead-square-pop', 'lead', 'Square Pop', {
    chorus: [true, 0.4],
    compressor: [true, 0.4],
  }),
  p('lead-screamer', 'lead', 'Screamer', {
    distortion: [true, 0.6],
    delay: [true, 0.4],
    reverb: [true, 0.45],
  }),

  // — Organ —
  p('organ-church', 'organ', 'Church Hall', {
    reverb: [true, 0.75],
  }),
  p('organ-rock-drive', 'organ', 'Rock Drive', {
    distortion: [true, 0.4],
    chorus: [true, 0.45],
    reverb: [true, 0.35],
  }),

  // — Drums —
  p('drums-dry', 'drums', 'Dry Kit', {}),
  p('drums-room', 'drums', 'Room Kit', {
    reverb: [true, 0.4],
    compressor: [true, 0.45],
  }),
  p('drums-crushed', 'drums', 'Crushed Tape', {
    bitcrusher: [true, 0.4],
    distortion: [true, 0.3],
    compressor: [true, 0.5],
  }),

  // — Glitch —
  p('glitch-default', 'glitch', 'Glitch Default', {}),
  p('glitch-deep-space', 'glitch', 'Deep Space', {
    delay: [true, 0.6],
    reverb: [true, 0.7],
    bitcrusher: [true, 0.3],
  }),
]

const STORAGE_KEY = 'klm:userPresets'

export function loadUserPresets(): SynthPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as SynthPreset[]
    return Array.isArray(parsed) ? parsed.map((p) => ({ ...p, isFactory: false })) : []
  } catch {
    return []
  }
}

export function saveUserPresets(presets: SynthPreset[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(presets.filter((p) => !p.isFactory)))
  } catch {
    /* localStorage might be full / disabled — fail silently */
  }
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10)
}
