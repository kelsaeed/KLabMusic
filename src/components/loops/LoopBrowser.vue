<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useLoopLibrary } from '@/composables/useLoopLibrary'
import { useToast } from '@/composables/useToast'
import {
  LOOP_LIBRARY,
  LOOP_GENRES,
  LOOP_CATEGORIES,
  LOOP_MOODS,
  type LoopCategory,
  type LoopGenre,
  type LoopMood,
  type LoopDef,
} from '@/lib/loops'

// Sound library — Phase 3's headline feature. Mirrors Soundtrap's right-hand
// sidebar in spirit: cards for every loop, search, category + genre filters,
// instant preview play / stop, and a one-click "Add to Beat Maker" that
// turns the loop into a fresh editable pattern.

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()
const { preview, stop, isPlaying, addToBeatMaker } = useLoopLibrary()
const { show } = useToast()

const search = ref('')
const activeCategory = ref<LoopCategory | 'all'>('all')
const activeGenre = ref<LoopGenre | 'all'>('all')
const activeMood = ref<LoopMood | 'all'>('all')

const filtered = computed<LoopDef[]>(() => {
  const q = search.value.trim().toLowerCase()
  return LOOP_LIBRARY.filter((loop) => {
    if (activeCategory.value !== 'all' && loop.category !== activeCategory.value) return false
    if (activeGenre.value !== 'all' && loop.genre !== activeGenre.value) return false
    if (activeMood.value !== 'all' && loop.mood !== activeMood.value) return false
    if (!q) return true
    if (loop.name.toLowerCase().includes(q)) return true
    if (loop.key.toLowerCase().includes(q)) return true
    if (String(loop.bpm).includes(q)) return true
    if (loop.genre.includes(q)) return true
    if (loop.mood && loop.mood.includes(q)) return true
    return false
  })
})

function togglePreview(loop: LoopDef) {
  if (isPlaying(loop.id)) stop()
  else void preview(loop)
}

function onAdd(loop: LoopDef) {
  const result = addToBeatMaker(loop)
  show({
    type: result.ok ? 'success' : 'error',
    title: result.message,
    duration: 1800,
  })
}

// Always stop preview when the panel closes — leaving a loop running while
// the user navigates away is just confusing and burns CPU.
function emitClose() {
  stop()
  emit('close')
}
watch(
  () => null,
  () => {},
)

const categoryHues: Record<LoopCategory, string> = {
  drums: 'hue-orange',
  bass: 'hue-magenta',
  chords: 'hue-violet',
  melody: 'hue-cyan',
  fx: 'hue-amber',
  full: 'hue-emerald',
}
</script>

<template>
  <Transition name="slide">
    <aside v-if="open" class="lib" :aria-label="t('loops.title')">
      <header class="head">
        <div class="title-wrap">
          <h3>{{ t('loops.title') }}</h3>
          <span class="count mono">{{ filtered.length }} / {{ LOOP_LIBRARY.length }}</span>
        </div>
        <button class="close" :title="t('common.close')" @click="emitClose">×</button>
      </header>

      <label class="search">
        <span class="search-ico" aria-hidden="true">🔍</span>
        <input
          v-model="search"
          type="text"
          :placeholder="t('loops.searchPlaceholder')"
        />
      </label>

      <div class="filter-group">
        <span class="filter-label mono">{{ t('loops.category') }}</span>
        <div class="chips">
          <button
            type="button"
            class="chip mono"
            :class="{ on: activeCategory === 'all' }"
            @click="activeCategory = 'all'"
          >{{ t('loops.cat.all') }}</button>
          <button
            v-for="c in LOOP_CATEGORIES"
            :key="c"
            type="button"
            class="chip mono"
            :class="{ on: activeCategory === c }"
            @click="activeCategory = c"
          >{{ t(`loops.cat.${c}`) }}</button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label mono">{{ t('loops.genreLabel') }}</span>
        <div class="chips">
          <button
            type="button"
            class="chip mono"
            :class="{ on: activeGenre === 'all' }"
            @click="activeGenre = 'all'"
          >{{ t('loops.genreName.all') }}</button>
          <button
            v-for="g in LOOP_GENRES"
            :key="g"
            type="button"
            class="chip mono"
            :class="{ on: activeGenre === g }"
            @click="activeGenre = g"
          >{{ t(`loops.genreName.${g}`) }}</button>
        </div>
      </div>

      <div class="filter-group">
        <span class="filter-label mono">{{ t('loops.moodLabel') }}</span>
        <div class="chips">
          <button
            type="button"
            class="chip mono"
            :class="{ on: activeMood === 'all' }"
            @click="activeMood = 'all'"
          >{{ t('loops.moodName.all') }}</button>
          <button
            v-for="m in LOOP_MOODS"
            :key="m"
            type="button"
            class="chip mono"
            :class="{ on: activeMood === m }"
            @click="activeMood = m"
          >{{ t(`loops.moodName.${m}`) }}</button>
        </div>
      </div>

      <div v-if="filtered.length === 0" class="empty mono">
        {{ t('loops.noResults') }}
      </div>
      <div v-else class="grid">
        <article
          v-for="loop in filtered"
          :key="loop.id"
          class="card"
          :class="[categoryHues[loop.category], { playing: isPlaying(loop.id) }]"
        >
          <header class="card-head">
            <div class="card-title-wrap">
              <span class="card-name">{{ loop.name }}</span>
              <span class="card-tags mono">
                {{ t(`loops.cat.${loop.category}`) }} · {{ t(`loops.genreName.${loop.genre}`) }}
              </span>
            </div>
            <button
              class="play-btn"
              :class="{ on: isPlaying(loop.id) }"
              :title="isPlaying(loop.id) ? t('loops.stopPreview') : t('loops.preview')"
              @click="togglePreview(loop)"
            >
              {{ isPlaying(loop.id) ? '◼' : '▶' }}
            </button>
          </header>
          <div class="card-meta mono">
            <span class="meta">{{ loop.bpm }} {{ t('loops.bpm') }}</span>
            <span class="meta">{{ t('loops.key') }} {{ loop.key }}</span>
            <span class="meta">{{ loop.bars }}b · {{ loop.stepCount }} {{ t('loops.steps') }}</span>
          </div>
          <button class="add-btn mono" @click="onAdd(loop)">
            + {{ t('loops.addToBeat') }}
          </button>
        </article>
      </div>

      <p class="footer-note mono">{{ t('loops.footerNote') }}</p>
    </aside>
  </Transition>
</template>

<style scoped>
.lib {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(440px, 92vw);
  z-index: 90;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem 0.6rem;
  gap: 0.6rem;
  overflow-y: auto;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.title-wrap { display: flex; flex-direction: column; gap: 0.15rem; }
.head h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--accent-primary);
}
.count {
  font-size: 0.65rem;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}
.close:hover { color: var(--text-primary); }

.search {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.search-ico { font-size: 0.9rem; opacity: 0.7; }
.search input {
  flex: 1;
  background: transparent;
  border: none;
  padding: 0;
  font: inherit;
  color: var(--text-primary);
  outline: none;
}
.search input::placeholder { color: var(--text-muted); }

.filter-group { display: flex; flex-direction: column; gap: 0.3rem; }
.filter-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}
.chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.chip {
  font-size: 0.62rem;
  padding: 0.25rem 0.55rem;
  border-radius: 999px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.chip:hover { border-color: var(--accent-primary); color: var(--text-primary); }
.chip.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
}

.grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.45rem;
  align-content: start;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.7rem 0.85rem 0.85rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  transition: border-color var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
}
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--card-grad, transparent);
  opacity: 0.16;
  pointer-events: none;
  transition: opacity var(--transition-fast);
}
.card:hover { border-color: var(--accent-primary); transform: translateY(-1px); }
.card:hover::before { opacity: 0.28; }
.card.playing {
  border-color: var(--accent-primary);
  box-shadow: 0 0 18px var(--accent-glow);
}
.card.playing::before { opacity: 0.4; }

.card-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; position: relative; }
.card-title-wrap { display: flex; flex-direction: column; gap: 0.1rem; min-width: 0; }
.card-name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--text-primary);
}
.card-tags {
  font-size: 0.62rem;
  color: var(--text-muted);
  text-transform: capitalize;
  letter-spacing: 0.04em;
}
.play-btn {
  width: 36px;
  height: 36px;
  padding: 0;
  border-radius: 50%;
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-size: 0.85rem;
  cursor: pointer;
  flex-shrink: 0;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.play-btn:hover { transform: scale(1.06); box-shadow: 0 0 12px var(--accent-glow); }
.play-btn.on { background: var(--accent-secondary); }

.card-meta { display: flex; gap: 0.55rem; flex-wrap: wrap; position: relative; }
.meta {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.add-btn {
  font-size: 0.7rem;
  padding: 0.35rem 0.7rem;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-primary);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  cursor: pointer;
  align-self: flex-start;
  position: relative;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.add-btn:hover { border-color: var(--accent-primary); color: var(--accent-primary); }

.empty {
  padding: 1.5rem 0.5rem;
  text-align: center;
  color: var(--text-muted);
  font-size: 0.78rem;
  border: 1px dashed var(--border);
  border-radius: var(--radius);
}
.footer-note {
  margin: auto 0 0;
  padding-top: 0.4rem;
  border-top: 1px solid var(--border);
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 0.04em;
  text-align: center;
  line-height: 1.4;
}

.slide-enter-active, .slide-leave-active {
  transition: transform var(--transition-base), opacity var(--transition-base);
}
.slide-enter-from, .slide-leave-to {
  transform: translateX(20px);
  opacity: 0;
}

/* Per-category card hue gradient. Same idea as the FX library — colour
   codes the kind of loop at a glance. */
.hue-orange { --card-grad: linear-gradient(180deg, #f59e0b, #2a1e0a); }
.hue-magenta { --card-grad: linear-gradient(180deg, #ec4899, #2a0d2a); }
.hue-violet { --card-grad: linear-gradient(180deg, #7c3aed, #1e1b3b); }
.hue-cyan { --card-grad: linear-gradient(180deg, #22d3ee, #0e2a3a); }
.hue-amber { --card-grad: linear-gradient(180deg, #d97706, #2a1a08); }
</style>
