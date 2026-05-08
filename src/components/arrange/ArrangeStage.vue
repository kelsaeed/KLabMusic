<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArrangeStore } from '@/stores/arrange'
import { useArrange } from '@/composables/useArrange'
import { useRecorderStore } from '@/stores/recorder'
import { useBeatMakerStore } from '@/stores/beatmaker'
import AddArrangeTrackDialog from './AddArrangeTrackDialog.vue'
import TrackFxPopover from './TrackFxPopover.vue'
import AutomationLane from './AutomationLane.vue'
import { useToast } from '@/composables/useToast'
import type { ArrangeTrack, ArrangeClip } from '@/lib/types'

// Multitrack arrangement timeline. Layout is:
//
//   [ TIMELINE RULER (bars) ]
//   [ TRACK HEADER ][ CLIP LANE                                ]
//   [ TRACK HEADER ][ CLIP LANE                                ]
//   ...
//   [             playhead vertical line spans all lanes      ]
//
// Both header column and lane column scroll vertically together; the lane
// column scrolls horizontally for arrangements longer than the viewport.
// Clip drag is implemented at the clip-block level — pointerdown / move /
// up — and converts pixels to seconds via store.pxPerSec, with snap to
// every (60 / bpm / snapDivision) seconds when the user holds no modifier.

const store = useArrangeStore()
const recorderStore = useRecorderStore()
const beatStore = useBeatMakerStore()
const arrange = useArrange()
const { t } = useI18n()

const addOpen = ref(false)
const laneRef = ref<HTMLDivElement | null>(null)
const openFxTrackId = ref<string | null>(null)
const { show, update } = useToast()

const widthPx = computed(() => Math.max(800, store.totalDurationSec * store.pxPerSec))

// Bar grid — at the current BPM, one bar = 4 beats = 240 / bpm seconds.
const barWidthPx = computed(() => (60 / store.bpm) * 4 * store.pxPerSec)
const totalBars = computed(() => Math.ceil(store.totalDurationSec / ((60 / store.bpm) * 4)) + 1)

const playheadX = computed(() => store.playheadSec * store.pxPerSec)

// Drag state for clip blocks. Tracking deltaX rather than absolute positions
// lets us add the delta to the clip's original startSec on drop, which is
// more numerically stable than recomputing from clientX every frame.
const drag = ref<{
  trackId: string
  clipId: string
  startMouseX: number
  startClipSec: number
} | null>(null)

function snapSec(sec: number): number {
  if (store.snapDivision <= 0) return Math.max(0, sec)
  const beatSec = 60 / store.bpm
  const stepSec = beatSec / store.snapDivision
  return Math.max(0, Math.round(sec / stepSec) * stepSec)
}

function onClipPointerDown(track: ArrangeTrack, clip: ArrangeClip, e: PointerEvent) {
  if (e.button !== 0) return
  e.preventDefault()
  ;(e.target as Element).setPointerCapture?.(e.pointerId)
  drag.value = {
    trackId: track.id,
    clipId: clip.id,
    startMouseX: e.clientX,
    startClipSec: clip.startSec,
  }
}

function onClipPointerMove(e: PointerEvent) {
  if (!drag.value) return
  const dx = e.clientX - drag.value.startMouseX
  const newSec = drag.value.startClipSec + dx / store.pxPerSec
  store.moveClip(drag.value.trackId, drag.value.clipId, snapSec(newSec))
}

function onClipPointerUp() {
  drag.value = null
}

function onTrackVolume(t: ArrangeTrack, v: number) {
  store.updateTrack(t.id, { volume: v })
}
function toggleMute(t: ArrangeTrack) { store.updateTrack(t.id, { muted: !t.muted }) }
function toggleSolo(t: ArrangeTrack) { store.updateTrack(t.id, { soloed: !t.soloed }) }
function removeTrack(t: ArrangeTrack) {
  if (store.isPlaying) arrange.stop()
  store.removeTrack(t.id)
}
function removeClip(track: ArrangeTrack, clip: ArrangeClip) {
  store.removeClip(track.id, clip.id)
}

function clipLabel(clip: ArrangeClip): string {
  // Pull the discriminated-union variant into a local so TS's narrowing
  // survives through the .find() callback closure.
  const src = clip.source
  if (src.kind === 'audio') {
    const c = recorderStore.clips.find((x) => x.id === src.recorderClipId)
    return c?.name ?? '—'
  }
  const p = beatStore.patterns.find((x) => x.id === src.patternId)
  return p?.name ?? 'Pattern'
}

function zoomIn() { store.pxPerSec = Math.min(240, store.pxPerSec * 1.4) }
function zoomOut() { store.pxPerSec = Math.max(20, store.pxPerSec / 1.4) }

function toggleFxPopover(trackId: string) {
  openFxTrackId.value = openFxTrackId.value === trackId ? null : trackId
}

async function exportStems() {
  if (arrange.stemExportProgress.value.active) return
  const toastId = show({
    type: 'loading',
    title: t('arrange.exportingStems', { i: 0, n: store.tracks.length, name: '' }),
  })
  // Push live progress into the toast so users see "1/4 — Drums" → "2/4
  // — Bass" while the real-time render runs. The watcher reads from the
  // exposed reactive ref the composable hands back.
  const stop = (() => {
    let last = -1
    const id = setInterval(() => {
      const p = arrange.stemExportProgress.value
      if (!p.active) return
      if (p.trackIndex !== last) {
        last = p.trackIndex
        update(toastId, {
          type: 'loading',
          title: t('arrange.exportingStems', {
            i: p.trackIndex,
            n: p.trackTotal,
            name: p.trackName,
          }),
        })
      }
    }, 250)
    return () => clearInterval(id)
  })()
  const result = await arrange.exportStems()
  stop()
  update(toastId, {
    type: result.ok ? 'success' : 'error',
    title: result.message,
    duration: result.ok ? 2400 : 4000,
  })
}

onMounted(() => {
  window.addEventListener('pointermove', onClipPointerMove)
  window.addEventListener('pointerup', onClipPointerUp)
  window.addEventListener('pointercancel', onClipPointerUp)
})
onBeforeUnmount(() => {
  arrange.stop()
  window.removeEventListener('pointermove', onClipPointerMove)
  window.removeEventListener('pointerup', onClipPointerUp)
  window.removeEventListener('pointercancel', onClipPointerUp)
})
</script>

<template>
  <div class="arrange">
    <!-- Toolbar -->
    <header class="bar">
      <button class="play-btn" :class="{ on: store.isPlaying }" @click="arrange.toggle()">
        {{ store.isPlaying ? '◼ ' + t('arrange.stop') : '▶ ' + t('arrange.play') }}
      </button>

      <div class="time-pill mono">
        {{ store.playheadSec.toFixed(1) }}s / {{ store.totalDurationSec.toFixed(1) }}s
      </div>

      <label class="bpm-field mono">
        <span>{{ t('arrange.bpm') }}</span>
        <input
          v-model.number="store.bpm" type="number" min="40" max="240" step="1"
        />
      </label>

      <label class="snap-field mono">
        <span>{{ t('arrange.snap') }}</span>
        <select v-model.number="store.snapDivision">
          <option :value="0">{{ t('arrange.snapOff') }}</option>
          <option :value="1">1/4</option>
          <option :value="2">1/8</option>
          <option :value="4">1/16</option>
          <option :value="8">1/32</option>
        </select>
      </label>

      <div class="zoom">
        <button class="zoom-btn" @click="zoomOut">−</button>
        <button class="zoom-btn" @click="zoomIn">+</button>
      </div>

      <button class="add-track-btn mono" @click="addOpen = true">
        + {{ t('arrange.addTrack') }}
      </button>
      <button
        class="export-stems-btn mono"
        :disabled="store.tracks.length === 0 || arrange.stemExportProgress.value.active"
        :title="t('arrange.exportStemsTooltip')"
        @click="exportStems"
      >
        ⤓ {{ t('arrange.exportStems') }}
      </button>
    </header>

    <div class="grid">
      <!-- Sticky track-header column -->
      <div class="headers">
        <div class="ruler-spacer" aria-hidden="true" />
        <template v-for="track in store.tracks" :key="`h-${track.id}`">
        <div
          class="header-row"
          :class="{ muted: track.muted, soloed: track.soloed }"
          :style="{ '--track-color': track.color }"
        >
          <div class="header-name">
            <span class="dot" />
            <span class="name">{{ track.name }}</span>
            <span class="kind mono">{{ t(`arrange.kind.${track.kind}`) }}</span>
          </div>
          <div class="header-controls">
            <input
              type="range" min="0" max="1" step="0.01"
              :value="track.volume"
              @input="onTrackVolume(track, Number(($event.target as HTMLInputElement).value))"
            />
            <button
              class="ctl-btn fx"
              :class="{ on: openFxTrackId === track.id }"
              :title="t('arrange.trackFxButton')"
              @click="toggleFxPopover(track.id)"
            >FX</button>
            <button
              class="ctl-btn auto"
              :class="{ on: track.automationLaneOpen }"
              :title="t('arrange.automationToggle')"
              @click="store.setTrackAutomationOpen(track.id, !track.automationLaneOpen)"
            >A</button>
            <button class="ctl-btn" :class="{ on: track.muted }" :title="t('arrange.mute')" @click="toggleMute(track)">M</button>
            <button class="ctl-btn" :class="{ on: track.soloed }" :title="t('arrange.solo')" @click="toggleSolo(track)">S</button>
            <button class="ctl-btn x" :title="t('arrange.removeTrack')" @click="removeTrack(track)">×</button>
          </div>
          <TrackFxPopover
            v-if="openFxTrackId === track.id"
            :track="track"
            @close="openFxTrackId = null"
          />
          <!-- Automation lane label — sits in the header column to keep
               vertical alignment with the SVG lane in the lanes column. -->
        </div>
        <div
          v-if="track.automationLaneOpen"
          class="auto-header"
          :style="{ '--track-color': track.color }"
        >
          <span class="auto-label mono">{{ t('arrange.automationLane') }}</span>
          <span class="auto-param-tag mono">{{ t(`arrange.autoParam.${track.automationParam}`) }}</span>
        </div>
        </template>
        <div v-if="store.tracks.length === 0" class="empty-headers">
          {{ t('arrange.empty') }}
        </div>
      </div>

      <!-- Scrollable lane column -->
      <div ref="laneRef" class="lanes-wrap">
        <div class="lanes" :style="{ width: widthPx + 'px' }">
          <!-- Ruler -->
          <div class="ruler" :style="{ width: widthPx + 'px' }">
            <div
              v-for="b in totalBars"
              :key="`bar-${b}`"
              class="bar-tick"
              :class="{ accent: (b - 1) % 4 === 0 }"
              :style="{ left: ((b - 1) * barWidthPx) + 'px' }"
            >
              <span class="bar-num mono">{{ b }}</span>
            </div>
          </div>

          <!-- Track lanes -->
          <template v-for="track in store.tracks" :key="`l-${track.id}`">
          <div
            class="lane"
            :class="{ muted: track.muted }"
            :style="{ '--track-color': track.color }"
          >
            <!-- Bar grid lines for this lane -->
            <div
              v-for="b in totalBars"
              :key="`g-${track.id}-${b}`"
              class="grid-line"
              :class="{ accent: (b - 1) % 4 === 0 }"
              :style="{ left: ((b - 1) * barWidthPx) + 'px' }"
            />

            <!-- Clips -->
            <div
              v-for="clip in track.clips"
              :key="clip.id"
              class="clip"
              :style="{
                left: (clip.startSec * store.pxPerSec) + 'px',
                width: (clip.durationSec * store.pxPerSec) + 'px',
                background: track.color,
              }"
              @pointerdown="onClipPointerDown(track, clip, $event)"
            >
              <span class="clip-label mono">{{ clipLabel(clip) }}</span>
              <button class="clip-x" :title="t('arrange.removeClip')" @click.stop="removeClip(track, clip)">×</button>
            </div>
          </div>
          <AutomationLane
            v-if="track.automationLaneOpen"
            :track="track"
            :width-px="widthPx"
          />
          </template>

          <!-- Playhead spans all lanes -->
          <div
            v-if="store.tracks.length > 0"
            class="playhead"
            :class="{ on: store.isPlaying }"
            :style="{ left: playheadX + 'px' }"
          />
        </div>
      </div>
    </div>

    <AddArrangeTrackDialog :open="addOpen" @close="addOpen = false" />
  </div>
</template>

<style scoped>
.arrange {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  min-height: 0;
}

.bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.6rem 0.8rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.play-btn {
  padding: 0.5rem 1rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  font-weight: 700;
  font-size: 0.82rem;
  letter-spacing: 0.04em;
}
.play-btn.on { background: var(--accent-secondary); }
.time-pill {
  font-size: 0.8rem;
  color: var(--text-muted);
  padding: 0.4rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  letter-spacing: 0.04em;
}
.bpm-field, .snap-field {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.bpm-field input, .snap-field select {
  padding: 0.35rem 0.5rem;
  font-size: 0.78rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  width: 70px;
}
.snap-field select { width: auto; min-width: 80px; }
.zoom { display: inline-flex; gap: 0.25rem; }
.zoom-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  font-weight: 700;
  font-size: 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.add-track-btn {
  margin-inline-start: auto;
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  letter-spacing: 0.05em;
}
.add-track-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.export-stems-btn {
  padding: 0.45rem 0.85rem;
  font-size: 0.78rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius);
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.export-stems-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 14px var(--accent-glow);
}
.export-stems-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* — Two-column timeline grid — */
.grid {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-base);
  overflow: hidden;
  min-height: 320px;
}
.headers {
  display: flex;
  flex-direction: column;
  background: var(--bg-surface);
  border-right: 1px solid var(--border);
}
.ruler-spacer { height: 28px; border-bottom: 1px solid var(--border); }
.header-row {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border);
  border-left: 4px solid var(--track-color);
  height: 76px;
  box-sizing: border-box;
  transition: opacity var(--transition-fast);
}
.header-row.muted { opacity: 0.5; }
.header-row.soloed { background: var(--bg-elevated); }
.header-name {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--track-color);
  flex-shrink: 0;
}
.header-name .name {
  font-size: 0.82rem;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}
.header-name .kind {
  font-size: 0.6rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.header-controls {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}
.header-controls input[type='range'] {
  flex: 1;
  appearance: none;
  height: 3px;
  background: var(--bg-elevated);
  border-radius: 2px;
  border: 1px solid var(--border);
  padding: 0;
}
.header-controls input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.ctl-btn {
  width: 22px;
  height: 22px;
  padding: 0;
  font-size: 0.62rem;
  font-family: var(--font-mono);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
}
.ctl-btn.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.ctl-btn.fx { font-weight: 700; }
.ctl-btn.x { color: var(--accent-secondary); }
.ctl-btn.x:hover {
  background: var(--accent-secondary);
  color: var(--text-inverse);
}
.empty-headers {
  padding: 1.5rem 0.8rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.5;
}
.auto-header {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.2rem;
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--border);
  border-left: 4px solid var(--track-color);
  background: var(--bg-elevated);
  /* Heights match AutomationLane: 33 (own header) + 56 (svg) + 1 border = 90 */
  min-height: 90px;
  box-sizing: border-box;
}
.auto-label {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.auto-param-tag {
  font-size: 0.78rem;
  color: var(--accent-primary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.lanes-wrap {
  overflow-x: auto;
  overflow-y: hidden;
  background: var(--bg-base);
}
.lanes {
  position: relative;
  display: flex;
  flex-direction: column;
}
.ruler {
  position: relative;
  height: 28px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-surface);
}
.bar-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
}
.bar-tick.accent { background: var(--accent-primary); opacity: 0.4; }
.bar-num {
  position: absolute;
  top: 4px;
  left: 4px;
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.bar-tick.accent .bar-num { color: var(--accent-primary); font-weight: 700; }

.lane {
  position: relative;
  height: 76px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-base);
  overflow: hidden;
  /* Block native touch behaviours so a finger drag on a clip is captured
     by our pointer handlers instead of being eaten as a horizontal scroll. */
  touch-action: pan-x;
}
.lane.muted { opacity: 0.45; }
.grid-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  opacity: 0.5;
}
.grid-line.accent { background: var(--accent-primary); opacity: 0.18; }

.clip {
  position: absolute;
  top: 8px;
  bottom: 8px;
  border-radius: 6px;
  cursor: grab;
  display: flex;
  align-items: center;
  padding: 0 0.5rem;
  gap: 0.4rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
  user-select: none;
  /* The colour comes from the track via inline style; soften it with a
     dark inset so text stays readable on light track colours. */
  background-image: linear-gradient(180deg, rgba(255,255,255,0.05), rgba(0,0,0,0.25));
  background-blend-mode: overlay;
  transition: box-shadow var(--transition-fast), transform var(--transition-fast);
}
.clip:active { cursor: grabbing; transform: scale(0.98); }
.clip:hover { box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); }
.clip-label {
  flex: 1;
  font-size: 0.7rem;
  color: var(--text-inverse);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  letter-spacing: 0.02em;
  pointer-events: none;
}
.clip-x {
  background: rgba(0, 0, 0, 0.35);
  color: var(--text-inverse);
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 50%;
  font-size: 0.75rem;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
}
.clip-x:hover { background: var(--accent-secondary); }

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--accent-secondary);
  pointer-events: none;
  box-shadow: 0 0 12px var(--accent-secondary);
  z-index: 10;
  opacity: 0.85;
}
.playhead.on { opacity: 1; }

@media (max-width: 720px) {
  .grid { grid-template-columns: 160px minmax(0, 1fr); }
  .header-row { padding: 0.4rem; height: 80px; }
  .header-name .name { font-size: 0.72rem; }
}
</style>
