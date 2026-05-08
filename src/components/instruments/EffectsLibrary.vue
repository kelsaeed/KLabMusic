<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import { useAudio } from '@/composables/useAudio'
import type { EffectId } from '@/lib/types'

// Browseable effects library — same shape as Soundtrap's right-hand "Effects
// library" sidebar. Each card represents one of the seven shaping effects we
// already build into every instrument's chain in useAudio. Clicking a card
// adds it (toggles its enabled flag on for the active instrument). Cards
// turn solid when active so the user gets a one-glance answer to "what's on
// this voice?".
//
// We don't dynamically allocate effect nodes — every instrument has the full
// chain wired up at construction time and effects are simply enabled/
// disabled. That keeps the engine deterministic (no node-graph mutations
// while audio is running) and means switching effects is gapless.

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAudioStore()
const { toggleEffect } = useAudio()
const { t } = useI18n()

// Tag taxonomy mirrors Soundtrap's: each effect can belong to multiple
// categories so a single search query like "vocals" surfaces every effect
// that's typically used on a vocal bus. Tag IDs are stable; their labels
// come from i18n at render time.
type TagId = 'all' | 'cleanUp' | 'glueMix' | 'enhance' | 'soundDesign' | 'drums' | 'bass' | 'guitar' | 'vocals' | 'movement' | 'brightness' | 'loudness' | 'echo'

const TAGS: TagId[] = ['all', 'cleanUp', 'glueMix', 'enhance', 'soundDesign', 'drums', 'bass', 'guitar', 'vocals', 'movement', 'brightness', 'loudness', 'echo']

interface EffectMeta {
  id: EffectId
  icon: string
  hueClass: string
  tags: TagId[]
}

const EFFECTS: EffectMeta[] = [
  {
    id: 'reverb',
    icon: '🌫',
    hueClass: 'hue-violet',
    tags: ['enhance', 'soundDesign', 'vocals', 'echo'],
  },
  {
    id: 'delay',
    icon: '🔁',
    hueClass: 'hue-cyan',
    tags: ['enhance', 'soundDesign', 'vocals', 'guitar', 'echo'],
  },
  {
    id: 'distortion',
    icon: '🔥',
    hueClass: 'hue-red',
    tags: ['soundDesign', 'guitar', 'drums', 'bass', 'loudness'],
  },
  {
    id: 'chorus',
    icon: '🌊',
    hueClass: 'hue-magenta',
    tags: ['enhance', 'movement', 'vocals', 'guitar'],
  },
  {
    id: 'filter',
    icon: '🎛',
    hueClass: 'hue-blue',
    tags: ['cleanUp', 'soundDesign', 'movement', 'brightness'],
  },
  {
    id: 'bitcrusher',
    icon: '📉',
    hueClass: 'hue-amber',
    tags: ['soundDesign', 'drums'],
  },
  {
    id: 'compressor',
    icon: '📦',
    hueClass: 'hue-green',
    tags: ['cleanUp', 'glueMix', 'loudness', 'vocals', 'drums', 'bass'],
  },
]

const search = ref('')
const activeTag = ref<TagId>('all')

const controls = computed(() => store.effects[store.activeInstrument])

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return EFFECTS.filter((fx) => {
    if (activeTag.value !== 'all' && !fx.tags.includes(activeTag.value)) return false
    if (!q) return true
    // Search matches the effect's translated name OR any of its tag labels
    // so the user can type either "comp" or "vocals" and get hits. Falling
    // back to the raw id keeps it working before translations load.
    const name = t(`audio.effect.${fx.id}`).toLowerCase()
    if (name.includes(q)) return true
    if (fx.id.includes(q)) return true
    for (const tag of fx.tags) {
      if (t(`fxlib.tag.${tag}`).toLowerCase().includes(q)) return true
    }
    return false
  })
})

function isActive(id: EffectId): boolean {
  return controls.value?.[id]?.enabled === true
}

function onCardClick(id: EffectId) {
  toggleEffect(id)
}
</script>

<template>
  <Transition name="slide">
    <aside v-if="open" class="lib" :aria-label="t('fxlib.title')">
      <header class="head">
        <div class="title-wrap">
          <h3>{{ t('fxlib.title') }}</h3>
          <span class="instrument mono">{{ t(`audio.instrument.${store.activeInstrument}`) }}</span>
        </div>
        <button class="close" :title="t('common.close')" @click="emit('close')">×</button>
      </header>

      <label class="search">
        <span class="search-ico" aria-hidden="true">🔍</span>
        <input
          v-model="search"
          type="text"
          :placeholder="t('fxlib.searchPlaceholder')"
        />
      </label>

      <div class="tags" role="tablist">
        <button
          v-for="tag in TAGS"
          :key="tag"
          type="button"
          class="tag mono"
          :class="{ on: activeTag === tag }"
          @click="activeTag = tag"
        >
          {{ t(`fxlib.tag.${tag}`) }}
        </button>
      </div>

      <div v-if="filtered.length === 0" class="empty mono">
        {{ t('fxlib.noResults') }}
      </div>
      <div v-else class="grid">
        <button
          v-for="fx in filtered"
          :key="fx.id"
          type="button"
          class="card"
          :class="[fx.hueClass, { on: isActive(fx.id) }]"
          @click="onCardClick(fx.id)"
        >
          <span class="card-ico" aria-hidden="true">{{ fx.icon }}</span>
          <span class="card-name">{{ t(`audio.effect.${fx.id}`) }}</span>
          <span class="card-desc">{{ t(`fxlib.desc.${fx.id}`) }}</span>
          <span v-if="isActive(fx.id)" class="card-badge mono">{{ t('fxlib.on') }}</span>
        </button>
      </div>

      <p class="footer-note mono">{{ t('fxlib.footerNote') }}</p>
    </aside>
  </Transition>
</template>

<style scoped>
.lib {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(420px, 92vw);
  z-index: 90;
  background: var(--bg-surface);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.45);
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem 0.6rem;
  gap: 0.7rem;
  overflow-y: auto;
}
.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.5rem; }
.title-wrap { display: flex; flex-direction: column; gap: 0.15rem; }
.head h3 {
  margin: 0;
  font-size: 1rem;
  color: var(--accent-primary);
  letter-spacing: 0.02em;
}
.instrument {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.07em;
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

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.tag {
  font-size: 0.65rem;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.tag:hover { border-color: var(--accent-primary); color: var(--text-primary); }
.tag.on {
  background: var(--accent-primary);
  border-color: var(--accent-primary);
  color: var(--text-inverse);
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
  align-content: start;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.25rem;
  padding: 0.7rem 0.75rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: start;
  overflow: hidden;
  transition: border-color var(--transition-fast), transform var(--transition-fast),
    box-shadow var(--transition-fast);
}
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--card-grad, transparent);
  opacity: 0.2;
  pointer-events: none;
  transition: opacity var(--transition-fast);
}
.card:hover { border-color: var(--accent-primary); transform: translateY(-2px); }
.card:hover::before { opacity: 0.32; }
.card.on {
  border-color: var(--accent-primary);
  box-shadow: 0 0 14px var(--accent-glow), inset 0 0 0 1px var(--accent-primary);
}
.card.on::before { opacity: 0.45; }
.card-ico { font-size: 1.4rem; line-height: 1; position: relative; }
.card-name {
  position: relative;
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--text-primary);
}
.card-desc {
  position: relative;
  font-size: 0.65rem;
  color: var(--text-muted);
  line-height: 1.35;
}
.card-badge {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: var(--accent-primary);
  color: var(--text-inverse);
}

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

/* Per-effect hue gradient — keeps cards visually differentiated like
   Soundtrap's library where colour codes the category at a glance. */
.hue-violet { --card-grad: linear-gradient(180deg, #7c3aed, #1e1b3b); }
.hue-cyan { --card-grad: linear-gradient(180deg, #22d3ee, #0e2a3a); }
.hue-blue { --card-grad: linear-gradient(180deg, #3b82f6, #14213d); }
.hue-magenta { --card-grad: linear-gradient(180deg, #ec4899, #2a0d2a); }
.hue-red { --card-grad: linear-gradient(180deg, #ef4444, #2a0d0d); }
.hue-amber { --card-grad: linear-gradient(180deg, #d97706, #2a1a08); }
.hue-green { --card-grad: linear-gradient(180deg, #22c55e, #052914); }

@media (max-width: 540px) {
  .lib { width: 100%; padding: 0.85rem 0.85rem 0.5rem; }
  .grid { grid-template-columns: 1fr; }
}
</style>
