<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecorderStore } from '@/stores/recorder'
import { useRecorder } from '@/composables/useRecorder'
import WaveformCanvas from './WaveformCanvas.vue'
import ClipList from './ClipList.vue'
import ClipControls from './ClipControls.vue'

const store = useRecorderStore()
const { startRecording, stopRecording, uploadFile } = useRecorder()
const { t } = useI18n()
const fileInput = ref<HTMLInputElement | null>(null)
const dragOver = ref(false)
const recordError = ref('')

async function toggleRecord() {
  recordError.value = ''
  if (store.isRecording) {
    await stopRecording()
    return
  }
  try {
    await startRecording()
  } catch (e) {
    recordError.value = e instanceof Error ? e.message : 'Mic access denied'
  }
}

async function onFiles(list: FileList | null) {
  if (!list) return
  for (const f of Array.from(list)) await uploadFile(f)
}

function onDrop(e: DragEvent) {
  e.preventDefault()
  dragOver.value = false
  onFiles(e.dataTransfer?.files ?? null)
}

function onTrim(payload: { trimStart: number; trimEnd: number }) {
  if (!store.activeClip) return
  store.patchClip(store.activeClip.id, payload)
}

function onScrub(ratio: number) {
  if (!store.activeClip) return
  store.playheadSeconds = ratio * store.activeClip.duration
}
</script>

<template>
  <section
    class="drawer"
    :class="{ open: store.drawerOpen, recording: store.isRecording }"
    @dragover.prevent="dragOver = true"
    @dragleave.prevent="dragOver = false"
    @drop="onDrop"
  >
    <header class="head">
      <button class="toggle-btn" @click="store.drawerOpen = !store.drawerOpen">
        <span class="chev" :class="{ flip: store.drawerOpen }">▾</span>
        <span class="head-label">{{ t('recorder.title') }}</span>
        <span v-if="store.clips.length" class="count mono">{{ store.clips.length }}</span>
      </button>

      <div class="head-actions">
        <button
          class="rec-btn"
          :class="{ live: store.isRecording }"
          @click="toggleRecord"
        >
          <span class="rec-dot" />
          {{ store.isRecording ? t('recorder.stopRec', { t: store.recordSeconds.toFixed(1) }) : t('recorder.record') }}
        </button>
        <button class="upload" @click="fileInput?.click()">{{ t('recorder.upload') }}</button>
        <input
          ref="fileInput"
          type="file"
          accept="audio/*,.wav,.mp3,.ogg,.m4a,.aiff,.aif"
          multiple
          hidden
          @change="onFiles(($event.target as HTMLInputElement).files)"
        />
      </div>
    </header>

    <p v-if="recordError" class="error">{{ recordError }}</p>

    <div v-if="store.drawerOpen" class="body" :class="{ 'drag-over': dragOver }">
      <ClipList />
      <div class="editor">
        <WaveformCanvas
          v-if="store.activeClip"
          :clip="store.activeClip"
          :playhead="store.playheadSeconds"
          :is-playing="store.isPlaying"
          @update-trim="onTrim"
          @scrub="onScrub"
        />
        <div v-else class="placeholder">
          {{ t('recorder.dropOrRecord') }}
        </div>
        <ClipControls v-if="store.activeClip" :clip="store.activeClip" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.drawer {
  position: fixed;
  inset-inline: 0;
  bottom: 0;
  background: var(--bg-surface);
  border-top: 1px solid var(--border);
  z-index: 40;
  transition: max-height var(--transition-base);
  max-height: 56px;
  overflow: hidden;
}
.drawer.open {
  max-height: 70vh;
}
.drawer.recording {
  border-top-color: var(--accent-secondary);
  box-shadow: 0 0 32px rgba(255, 0, 110, 0.25);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  height: 56px;
  gap: 1rem;
}
.toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: transparent;
  border: none;
  padding: 0.25rem 0.5rem;
}
.chev {
  display: inline-block;
  transition: transform var(--transition-base);
  color: var(--text-muted);
}
.chev.flip {
  transform: rotate(180deg);
}
.head-label {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-size: 0.85rem;
}
.count {
  background: var(--bg-elevated);
  padding: 0.1rem 0.5rem;
  border-radius: 8px;
  font-size: 0.75rem;
  color: var(--text-muted);
}
.head-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
.rec-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border: 1px solid var(--accent-secondary);
  color: var(--accent-secondary);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 0.8rem;
}
.rec-btn.live {
  background: var(--accent-secondary);
  color: var(--text-inverse);
  animation: pulse-rec 1s ease-in-out infinite;
}
.rec-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: currentColor;
}
.upload {
  font-size: 0.8rem;
  padding: 0.5rem 0.9rem;
}
@keyframes pulse-rec {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 0, 110, 0.4); }
  50% { box-shadow: 0 0 0 8px rgba(255, 0, 110, 0); }
}
.body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1rem;
  padding: 0 1rem 1rem;
  height: calc(70vh - 56px);
  overflow: auto;
}
.body.drag-over {
  background: var(--bg-elevated);
}
.editor {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  min-width: 0;
}
.placeholder {
  display: grid;
  place-items: center;
  height: 140px;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  color: var(--text-muted);
  font-size: 0.9rem;
}
.error {
  margin: 0 1rem;
  padding: 0.5rem 0.8rem;
  font-size: 0.8rem;
  color: var(--accent-secondary);
  background: var(--bg-elevated);
  border-radius: var(--radius);
}
@media (max-width: 720px) {
  .body {
    grid-template-columns: 1fr;
    height: auto;
  }
}
</style>
