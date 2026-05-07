<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRecorderStore } from '@/stores/recorder'
import { useRecorder } from '@/composables/useRecorder'
import { useToast } from '@/composables/useToast'
import type { Clip } from '@/lib/types'

defineProps<{ clip: Clip }>()
const store = useRecorderStore()
const { normalize, detectClipBpm, exportClipWav, saveToCloud, playClip, stopPlayback } = useRecorder()
const { show, update } = useToast()
const { t } = useI18n()
const saveStatus = ref('')

async function onSave(clipId: string) {
  const toastId = show({
    type: 'loading',
    title: t('recorder.cloudUploading'),
  })
  const result = await saveToCloud(clipId)
  saveStatus.value = result.message
  update(toastId, {
    type: result.ok ? 'success' : 'error',
    title: result.message,
    duration: result.ok ? 1800 : 3500,
  })
  setTimeout(() => (saveStatus.value = ''), 3000)
}

function patch(clipId: string, key: keyof Clip, value: Clip[keyof Clip]) {
  store.patchClip(clipId, { [key]: value } as Partial<Clip>)
}
</script>

<template>
  <div class="controls">
    <div class="row">
      <button class="btn" @click="store.isPlaying ? stopPlayback() : playClip(clip.id)">
        {{ store.isPlaying && store.activeClipId === clip.id ? t('recorder.stop') : t('recorder.play') }}
      </button>
      <input
        :value="clip.name"
        class="name-input"
        @input="patch(clip.id, 'name', ($event.target as HTMLInputElement).value)"
      />
    </div>

    <div class="grid">
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.pitch') }} {{ clip.pitchSemitones }}st</span>
        <input
          type="range" min="-12" max="12" step="1"
          :value="clip.pitchSemitones"
          @input="patch(clip.id, 'pitchSemitones', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.speed') }} {{ clip.speed.toFixed(2) }}×</span>
        <input
          type="range" min="0.5" max="2" step="0.05"
          :value="clip.speed"
          @input="patch(clip.id, 'speed', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.fadeIn') }} {{ clip.fadeIn.toFixed(2) }}s</span>
        <input
          type="range" min="0" max="2" step="0.05"
          :value="clip.fadeIn"
          @input="patch(clip.id, 'fadeIn', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
      <label class="ctl">
        <span class="lbl mono">{{ t('recorder.fadeOut') }} {{ clip.fadeOut.toFixed(2) }}s</span>
        <input
          type="range" min="0" max="2" step="0.05"
          :value="clip.fadeOut"
          @input="patch(clip.id, 'fadeOut', Number(($event.target as HTMLInputElement).value))"
        />
      </label>
    </div>

    <div class="row toggles">
      <button class="toggle" :class="{ on: clip.reverse }" @click="patch(clip.id, 'reverse', !clip.reverse)">
        {{ t('recorder.reverse') }}
      </button>
      <button class="toggle" :class="{ on: clip.loop }" @click="patch(clip.id, 'loop', !clip.loop)">
        {{ t('recorder.loop') }}
      </button>
      <button class="action" @click="normalize(clip.id)">{{ t('recorder.normalize') }}</button>
      <button class="action" @click="detectClipBpm(clip.id)">
        {{ t('recorder.detectBpm') }}<span v-if="clip.bpm" class="bpm-pill">{{ clip.bpm }}</span>
      </button>
      <button class="action" @click="exportClipWav(clip.id)">{{ t('recorder.exportWav') }}</button>
      <button class="action" @click="onSave(clip.id)">{{ t('recorder.saveCloud') }}</button>
      <span v-if="saveStatus" class="status">{{ saveStatus }}</span>
    </div>
  </div>
</template>

<style scoped>
.controls {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}
.btn {
  padding: 0.6rem 1.2rem;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
}
.btn:hover {
  opacity: 0.9;
}
.name-input {
  flex: 1;
  min-width: 200px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.6rem;
}
.ctl {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.lbl {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ctl input[type='range'] {
  width: 100%;
  appearance: none;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  border: 1px solid var(--border);
  padding: 0;
}
.ctl input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-primary);
}
.toggles {
  flex-wrap: wrap;
}
.toggle, .action {
  font-size: 0.75rem;
  padding: 0.4rem 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-family: var(--font-mono);
}
.toggle.on {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}
.bpm-pill {
  margin-inline-start: 0.4rem;
  padding: 0 0.4rem;
  border-radius: 8px;
  background: var(--accent-primary);
  color: var(--text-inverse);
  font-size: 0.7rem;
}
.status {
  font-size: 0.75rem;
  color: var(--accent-primary);
  font-family: var(--font-mono);
}
</style>
