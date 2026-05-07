<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { MAX_PATTERNS } from '@/lib/beatmaker'

const store = useBeatMakerStore()
const { t } = useI18n()

function rename(id: string, current: string) {
  const next = window.prompt(t('beat.renamePrompt'), current)
  if (next) store.renamePattern(id, next)
}
</script>

<template>
  <section class="slots-row">
    <h4 class="title mono">{{ t('beat.patterns') }}</h4>
    <div class="slots">
      <button
        v-for="(p, i) in store.patterns"
        :key="p.id"
        class="slot mono"
        :class="{ active: p.id === store.activePatternId }"
        :title="p.name"
        @click="store.setActivePattern(p.id)"
        @dblclick="rename(p.id, p.name)"
      >
        <span class="idx">{{ i + 1 }}</span>
        <span class="nm">{{ p.name }}</span>
        <span
          v-if="store.patterns.length > 1"
          class="del"
          :title="t('common.close')"
          @click.stop="store.removePattern(p.id)"
          >×</span
        >
      </button>
      <button
        v-if="store.patterns.length < MAX_PATTERNS"
        class="add"
        :title="t('beat.addPattern')"
        @click="store.addPattern()"
      >
        +
      </button>
      <button class="dup mono" :title="t('beat.duplicate')" @click="store.duplicateActivePattern()">
        {{ t('beat.duplicateShort') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.slots-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.5rem 1rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  flex-wrap: wrap;
}
.title { font-size: 0.7rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin: 0; }
.slots { display: flex; flex-wrap: wrap; gap: 0.3rem; flex: 1; }
.slot {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.55rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  font-size: 0.75rem;
}
.slot.active {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  box-shadow: 0 0 8px var(--accent-glow);
}
.idx { font-size: 0.6rem; color: var(--text-muted); }
.del {
  margin-left: 0.2rem;
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1;
  padding: 0 0.2rem;
}
.del:hover { color: var(--accent-secondary); }
.add {
  width: 30px;
  font-size: 0.95rem;
  font-weight: 700;
}
.dup { font-size: 0.7rem; padding: 0.3rem 0.6rem; }
</style>
