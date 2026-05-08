export type ThemeName =
  | 'cyberpunk'
  | 'studio-pro'
  | 'acid-rave'
  | 'analog-tape'
  | 'midnight-jazz'
  | 'custom'

export type Locale = 'en' | 'ar'

export type ModuleTab = 'live' | 'beat' | 'loop' | 'chaos' | 'learn' | 'arrange'

/**
 * A single note triggered during a Live-Play recording. Captured by the
 * Live Play stage's "Record performance" button and replayed verbatim on
 * the arrangement when the resulting LiveTake clip plays.
 */
export interface LiveTakeEvent {
  /** Time in seconds from the start of the live-take clip. */
  time: number
  /** Length of the note in seconds — fed into voice.attackRelease. */
  duration: number
  instrument: InstrumentId
  note: string
  velocity: number
}

export interface ArrangeClip {
  id: string
  /** Absolute start time in seconds, on the arrangement timeline. */
  startSec: number
  /** Playback duration in seconds — clipped against the source's natural length. */
  durationSec: number
  /** Identifies what to play at this clip slot. Exactly one source field is set. */
  source:
    | { kind: 'audio'; recorderClipId: string; offsetSec: number }
    | { kind: 'pattern'; patternId: string }
    | { kind: 'liveTake'; events: LiveTakeEvent[]; name: string }
  color?: string
}

/**
 * Per-track FX rack. Today applies only to audio tracks (the engine
 * routes Tone.Player → per-track FX chain → master, so each audio track
 * truly has its own effects). Pattern tracks share the global per-
 * instrument chain — they'll get their own buses when synth instances
 * become per-track in a future phase.
 */
export interface ArrangeTrackFx {
  reverb: { enabled: boolean; amount: number }
  delay: { enabled: boolean; amount: number }
  filter: { enabled: boolean; amount: number }
}

/** Parameters automatable on a track. Volume works on every track type;
 *  the FX-amount params apply to audio tracks (whose FX chain is per-
 *  track) and are no-ops on pattern tracks. */
export type AutomationParam = 'volume' | 'reverb' | 'delay' | 'filter'

export interface AutomationPoint {
  /** Absolute time on the arrangement timeline, in seconds. */
  time: number
  /** Normalised parameter value [0, 1]. Volume → linear amplitude, FX
   *  amount → effect mix / drive amount, just like the static knobs. */
  value: number
}

export interface ArrangeTrack {
  id: string
  name: string
  /** 'audio' tracks hold recorder clips; 'pattern' tracks hold beat-maker patterns. */
  kind: 'audio' | 'pattern'
  color: string
  volume: number
  muted: boolean
  soloed: boolean
  clips: ArrangeClip[]
  fx: ArrangeTrackFx
  /** Per-parameter automation curves. Each parameter that has an entry is
   *  driven by its point list; missing entries leave the parameter at its
   *  static value. Stored as an object (not array) so we can edit one
   *  param without disturbing the others. */
  automation: Partial<Record<AutomationParam, AutomationPoint[]>>
  /** UI state — whether the automation lane is open in the timeline. */
  automationLaneOpen: boolean
  /** UI state — which parameter the lane is currently editing. */
  automationParam: AutomationParam
}

export interface CustomTheme {
  bgBase: string
  bgSurface: string
  accentPrimary: string
  accentSecondary: string
  textPrimary: string
  border: string
}

export interface UserProfile {
  id: string
  email: string
  displayName: string
  avatarUrl?: string
}

export type InstrumentId =
  | 'piano'
  | 'electricPiano'
  | 'guitar'
  | 'bass'
  | 'pad'
  | 'lead'
  | 'organ'
  | 'drums'
  | 'glitch'
  | 'meme'

export type InstrumentCategory = 'sampled' | 'synth' | 'percussion' | 'fx'
export type InstrumentPlayMode = 'note' | 'sample'

export interface InstrumentMeta {
  id: InstrumentId
  category: InstrumentCategory
  playMode: InstrumentPlayMode
  icon: string
  available: boolean
  samples?: readonly string[]
}

export type EffectId =
  | 'reverb'
  | 'delay'
  | 'distortion'
  | 'chorus'
  | 'filter'
  | 'bitcrusher'
  | 'compressor'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

export interface Clip {
  id: string
  name: string
  source: 'mic' | 'upload'
  buffer: AudioBuffer
  blob: Blob
  duration: number
  waveform: number[]
  trimStart: number
  trimEnd: number
  pitchSemitones: number
  speed: number
  reverse: boolean
  loop: boolean
  fadeIn: number
  fadeOut: number
  bpm: number | null
  remoteUrl?: string
  createdAt: number
}

export type ClipPatch = Partial<
  Pick<
    Clip,
    | 'name'
    | 'trimStart'
    | 'trimEnd'
    | 'pitchSemitones'
    | 'speed'
    | 'reverse'
    | 'loop'
    | 'fadeIn'
    | 'fadeOut'
    | 'bpm'
    | 'remoteUrl'
  >
>

export type BindingType = 'note' | 'sample' | 'chord' | 'clip' | 'action'

export type BindingActionId =
  | 'damp'
  | 'damp-instrument'
  | 'record'
  | 'play-stop'
  | 'tap-bpm'
  | 'loop-toggle'
  | 'octave-up'
  | 'octave-down'

export interface KeyBinding {
  key: string
  type: BindingType
  instrument?: InstrumentId
  note?: string
  chord?: string[]
  clipId?: string
  action?: BindingActionId
  color?: string
  label?: string
  velocity?: number
  sustainMode?: boolean
}

export interface BindingSet {
  id: string
  name: string
  bindings: KeyBinding[]
  isDefault?: boolean
  remoteId?: string
}

export type StepCount = 16 | 32

export interface Step {
  active: boolean
  velocity: number
  microShift: number
}

export interface BeatTrack {
  id: string
  instrument: InstrumentId
  note: string
  steps: Step[]
  volume: number
  muted: boolean
  soloed: boolean
  clipId?: string
  color?: string
}

export interface Pattern {
  id: string
  name: string
  tracks: BeatTrack[]
}

export interface RoomPlayer {
  id: string
  name: string
  instrument: InstrumentId
  color: string
  isHost: boolean
  joinedAt: number
}

export interface ChatMessage {
  id: string
  authorId: string
  authorName: string
  authorColor: string
  text: string
  isEmoji: boolean
  timestamp: number
}

export interface FloatingReaction {
  id: string
  emoji: string
  authorColor: string
  x: number
}

