<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useArrangeStore } from '@/stores/arrange'
import { useArrange } from '@/composables/useArrange'
import { useRecorderStore } from '@/stores/recorder'
import { useBeatMakerStore } from '@/stores/beatmaker'

// Source picker for a new arrangement track. The user picks "Recorder clip"
// to bring an audio clip onto the timeline, or "Pattern" to drop a beat-
// maker pattern as a 4-bar block. The clip is dropped at startSec = the
// current playhead, so the user can scrub-then-add to compose.

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const arrangeStore = useArrangeStore()
const recorderStore = useRecorderStore()
const beatStore = useBeatMakerStore()
const { addRecorderClipToTrack, addPatternClipToTrack } = useArrange()

type SourceKind = 'audio' | 'pattern'
const kind = ref<SourceKind>('audio')
const selectedClipId = ref<string>('')
const selectedPatternId = ref<string>('')
const trackName = ref<string>('')
const bars = ref(4)

const audioClips = computed(() => recorderStore.clips)
const patterns = computed(() => beatStore.patterns)

function defaultName(): string {
  if (kind.value === 'audio') {
    const c = audioClips.value.find((x) => x.id === selectedClipId.value)
    return c?.name ?? `Audio ${arrangeStore.tracks.length + 1}`
  }
  const p = patterns.value.find((x) => x.id === selectedPatternId.value)
  return p ? p.name : `Pattern ${arrangeStore.tracks.length + 1}`
}

function add() {
  if (kind.value === 'audio') {
    if (!selectedClipId.value) return
    const track = arrangeStore.addAudioTrack(trackName.value || defaultName())
    addRecorderClipToTrack(track.id, selectedClipId.value, arrangeStore.playheadSec)
  } else {
    if (!selectedPatternId.value) return
    const track = arrangeStore.addPatternTrack(trackName.value || defaultName())
    addPatternClipToTrack(track.id, selectedPatternId.value, arrangeStore.playheadSec, bars.value)
  }
  trackName.value = ''
  selectedClipId.value = ''
  selectedPatternId.value = ''
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="dialog">
          <header class="head">
            <h3>{{ t('arrange.addTrackTitle') }}</h3>
            <button class="close" @click="emit('close')">×</button>
          </header>

          <fieldset class="kinds">
            <label :class="{ on: kind === 'audio' }">
              <input v-model="kind" type="radio" value="audio" />
              <span>{{ t('arrange.kind.audio') }}</span>
            </label>
            <label
              :class="{ on: kind === 'pattern', disabled: patterns.length === 0 }"
            >
              <input v-model="kind" type="radio" value="pattern" :disabled="patterns.length === 0" />
              <span>{{ t('arrange.kind.pattern') }}</span>
            </label>
          </fieldset>

          <div v-if="kind === 'audio'" class="picker">
            <p v-if="audioClips.length === 0" class="empty mono">{{ t('arrange.noAudio') }}</p>
            <label v-else class="field">
              <span class="lbl mono">{{ t('arrange.selectClip') }}</span>
              <select v-model="selectedClipId">
                <option value="">{{ t('arrange.pick') }}</option>
                <option v-for="c in audioClips" :key="c.id" :value="c.id">
                  {{ c.name }} ({{ c.duration.toFixed(1) }}s)
                </option>
              </select>
            </label>
          </div>

          <div v-else class="picker">
            <p v-if="patterns.length === 0" class="empty mono">{{ t('arrange.noPatterns') }}</p>
            <template v-else>
              <label class="field">
                <span class="lbl mono">{{ t('arrange.selectPattern') }}</span>
                <select v-model="selectedPatternId">
                  <option value="">{{ t('arrange.pick') }}</option>
                  <option v-for="p in patterns" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </label>
              <label class="field">
                <span class="lbl mono">{{ t('arrange.bars') }}: {{ bars }}</span>
                <input v-model.number="bars" type="range" min="1" max="16" step="1" />
              </label>
            </template>
          </div>

          <label class="field">
            <span class="lbl mono">{{ t('arrange.trackName') }}</span>
            <input
              v-model="trackName"
              type="text"
              :placeholder="defaultName()"
            />
          </label>

          <footer class="foot">
            <button class="ghost" @click="emit('close')">{{ t('common.cancel') }}</button>
            <button
              class="primary"
              :disabled="(kind === 'audio' && !selectedClipId) || (kind === 'pattern' && !selectedPatternId)"
              @click="add"
            >
              {{ t('arrange.addTrack') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 200;
  padding: 1.25rem;
}
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.2rem;
  width: min(480px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  max-height: 88vh;
  overflow: auto;
}
.head { display: flex; justify-content: space-between; align-items: center; }
.head h3 { margin: 0; color: var(--accent-primary); font-size: 1rem; }
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.kinds { border: none; padding: 0; margin: 0; display: flex; gap: 0.5rem; }
.kinds label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  font-size: 0.78rem;
}
.kinds input { display: none; }
.kinds label.on { border-color: var(--accent-primary); color: var(--accent-primary); }
.kinds label.disabled { opacity: 0.45; cursor: not-allowed; }

.picker { display: flex; flex-direction: column; gap: 0.6rem; }
.field { display: flex; flex-direction: column; gap: 0.3rem; }
.lbl {
  font-size: 0.65rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.field select,
.field input[type='text'] {
  padding: 0.5rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius);
  font-size: 0.82rem;
}
.field input[type='range'] {
  appearance: none;
  width: 100%;
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  border: 1px solid var(--border);
  padding: 0;
}
.field input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent-primary);
}

.empty {
  margin: 0;
  padding: 0.85rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  text-align: center;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}

.foot { display: flex; justify-content: flex-end; gap: 0.5rem; }
.ghost { background: transparent; }
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
  padding: 0.55rem 1rem;
}
.primary:disabled { opacity: 0.5; cursor: not-allowed; }

.fade-enter-active, .fade-leave-active { transition: opacity var(--transition-base); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
