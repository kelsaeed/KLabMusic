<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useBeatMaker } from '@/composables/useBeatMaker'
import TransportBar from './TransportBar.vue'
import PatternSlots from './PatternSlots.vue'
import TrackRow from './TrackRow.vue'
import SongMode from './SongMode.vue'
import AddTrackDialog from './AddTrackDialog.vue'

const store = useBeatMakerStore()
const { ensureWatchers, exportPatternsJson, importPatternsJson, saveToCloud } = useBeatMaker()
const { t } = useI18n()

const addOpen = ref(false)
const status = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

function paint(payload: { trackId: string; stepIndex: number; active: boolean }) {
  store.setStepActive(payload.trackId, payload.stepIndex, payload.active)
}

function downloadJson() {
  const blob = new Blob([exportPatternsJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'beatmaker-session.json'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

async function loadJson(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const text = await file.text()
  status.value = importPatternsJson(text) ? t('beat.imported') : t('beat.importFailed')
  setTimeout(() => (status.value = ''), 2500)
}

async function onSaveCloud() {
  const r = await saveToCloud()
  status.value = r.message
  setTimeout(() => (status.value = ''), 2500)
}

onMounted(() => {
  ensureWatchers()
})
</script>

<template>
  <div class="bm">
    <TransportBar />
    <PatternSlots />

    <SongMode />

    <section class="grid-card">
      <header class="grid-head">
        <h3>{{ t('beat.tracks') }}</h3>
        <div class="grid-actions">
          <button class="ghost mono" @click="addOpen = true">+ {{ t('beat.addTrack') }}</button>
          <button class="ghost mono" @click="downloadJson">{{ t('binding.export') }}</button>
          <button class="ghost mono" @click="fileInput?.click()">{{ t('binding.import') }}</button>
          <input
            ref="fileInput"
            type="file"
            accept="application/json"
            hidden
            @change="loadJson"
          />
          <button class="primary mono" @click="onSaveCloud">{{ t('binding.saveCloud') }}</button>
        </div>
      </header>

      <p v-if="status" class="status mono">{{ status }}</p>

      <div v-if="store.activePattern.tracks.length === 0" class="empty">
        {{ t('beat.emptyPattern') }}
      </div>

      <div v-else class="rows">
        <TrackRow
          v-for="track in store.activePattern.tracks"
          :key="track.id"
          :track="track"
          @paint="paint"
        />
      </div>
    </section>

    <AddTrackDialog :open="addOpen" @close="addOpen = false" />
  </div>
</template>

<style scoped>
.bm {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}
.grid-card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.grid-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.grid-head h3 {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.grid-actions {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.ghost {
  background: transparent;
  font-size: 0.7rem;
  padding: 0.4rem 0.7rem;
}
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
  font-size: 0.7rem;
  padding: 0.4rem 0.85rem;
}
.status { font-size: 0.78rem; color: var(--accent-primary); margin: 0; }
.empty {
  border: 1px dashed var(--border);
  padding: 2rem 1rem;
  text-align: center;
  color: var(--text-muted);
  border-radius: var(--radius);
  font-size: 0.85rem;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
