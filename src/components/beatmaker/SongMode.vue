<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'

const store = useBeatMakerStore()
const { t } = useI18n()

const sequence = computed(() =>
  store.songSequence.map((id) => store.patterns.find((p) => p.id === id)),
)

function add(patternId: string) {
  store.setSongSequence([...store.songSequence, patternId])
}
function removeAt(index: number) {
  store.setSongSequence(store.songSequence.filter((_, i) => i !== index))
}
function clear() {
  store.setSongSequence([store.activePatternId])
}
</script>

<template>
  <section v-if="store.songMode" class="song">
    <header class="head">
      <h4 class="mono">{{ t('beat.songMode') }}</h4>
      <button class="ghost mono" @click="clear">{{ t('beat.clearSong') }}</button>
    </header>

    <div class="timeline">
      <div
        v-for="(item, i) in sequence"
        :key="i"
        class="bar-cell"
        :class="{ playing: store.songIndex === i && store.playing }"
      >
        <span class="bar-label mono">{{ i + 1 }}</span>
        <span class="pat-label mono">{{ item?.name ?? '?' }}</span>
        <button class="del" @click="removeAt(i)">×</button>
      </div>
    </div>

    <div class="adders">
      <span class="hint mono">{{ t('beat.appendPattern') }}:</span>
      <button v-for="p in store.patterns" :key="p.id" class="add-btn mono" @click="add(p.id)">
        {{ p.name }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.song {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.head { display: flex; align-items: center; justify-content: space-between; }
.head h4 {
  margin: 0;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
}
.ghost {
  background: transparent;
  font-size: 0.7rem;
  padding: 0.3rem 0.6rem;
}
.timeline {
  display: flex;
  gap: 0.3rem;
  overflow-x: auto;
  padding-bottom: 0.3rem;
  min-height: 50px;
}
.bar-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.4rem 0.5rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  min-width: 60px;
  position: relative;
}
.bar-cell.playing {
  border-color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}
.bar-label { font-size: 0.6rem; color: var(--text-muted); }
.pat-label { font-size: 0.85rem; font-weight: 700; color: var(--accent-primary); }
.del {
  position: absolute;
  top: 2px;
  right: 4px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 0.85rem;
  padding: 0;
  line-height: 1;
}
.del:hover { color: var(--accent-secondary); }
.adders { display: flex; flex-wrap: wrap; gap: 0.3rem; align-items: center; }
.hint { font-size: 0.7rem; color: var(--text-muted); }
.add-btn {
  font-size: 0.7rem;
  padding: 0.3rem 0.6rem;
}
</style>
