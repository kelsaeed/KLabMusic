<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudioStore } from '@/stores/audio'
import type { MasteringPresetId } from '@/composables/useAudio'

// One-click mastering — same pattern as Soundtrap's "Mastering" modal:
// pick a style, the master signal path runs through a tuned EQ + compressor
// + limiter chain that the audio engine maintains, and the change is heard
// instantly across every module (live play, beat maker, loop station, chaos).
//
// The actual signal-shaping recipes live in MASTERING_PRESETS in useAudio.ts;
// this dialog is just a chooser. We keep the descriptions short and stylistic
// here because the chain itself does the heavy lifting and the user shouldn't
// need to read 200 words to pick a vibe.

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const store = useAudioStore()
const { t } = useI18n()

interface PresetCard {
  id: MasteringPresetId
  icon: string
  hueClass: string
}

// Visual variants kept here so the dialog can colour each card differently
// without piping every shade through i18n. Hue classes map to gradient stops
// at the bottom of the <style> block.
const PRESETS: PresetCard[] = [
  { id: 'off', icon: '◯', hueClass: 'hue-off' },
  { id: 'classic', icon: '🎚', hueClass: 'hue-violet' },
  { id: 'soft', icon: '🌙', hueClass: 'hue-cyan' },
  { id: 'podcast', icon: '🎙', hueClass: 'hue-blue' },
  { id: 'sub-boost', icon: '🔊', hueClass: 'hue-indigo' },
  { id: 'punchy', icon: '💥', hueClass: 'hue-magenta' },
  { id: 'louder', icon: '📢', hueClass: 'hue-orange' },
  { id: 'cranked', icon: '⚡', hueClass: 'hue-red' },
  { id: 'cassette', icon: '📼', hueClass: 'hue-amber' },
]

const active = computed(() => store.masteringPreset)

function pick(id: MasteringPresetId) {
  store.setMasteringPreset(id)
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="dialog">
          <header class="head">
            <div class="title-wrap">
              <h3>{{ t('mastering.title') }}</h3>
              <p class="sub mono">{{ t('mastering.subtitle') }}</p>
            </div>
            <button class="close" :title="t('common.close')" @click="emit('close')">×</button>
          </header>

          <div class="grid">
            <button
              v-for="p in PRESETS"
              :key="p.id"
              type="button"
              class="card"
              :class="[p.hueClass, { active: active === p.id, off: p.id === 'off' }]"
              @click="pick(p.id)"
            >
              <span class="ico" aria-hidden="true">{{ p.icon }}</span>
              <span class="name">{{ t(`mastering.preset.${p.id}.name`) }}</span>
              <span class="desc">{{ t(`mastering.preset.${p.id}.desc`) }}</span>
              <span v-if="active === p.id" class="badge mono">{{ t('mastering.applied') }}</span>
            </button>
          </div>

          <p class="note mono">{{ t('mastering.howItWorks') }}</p>
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
  backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
  z-index: 200;
  padding: 1.25rem;
}
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.4rem 1.4rem;
  width: min(720px, 100%);
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.5), 0 0 24px var(--accent-glow);
}
.head { display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem; }
.title-wrap { display: flex; flex-direction: column; gap: 0.15rem; }
.head h3 {
  margin: 0;
  color: var(--accent-primary);
  font-size: 1.05rem;
  letter-spacing: 0.02em;
}
.sub {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 0.4rem;
}
.close:hover { color: var(--text-primary); }

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 0.6rem;
}
.card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.35rem;
  padding: 0.85rem 0.9rem 0.95rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  text-align: start;
  overflow: hidden;
  transition:
    border-color var(--transition-fast),
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
  /* Each card shows a subtle vertical gradient based on its hue class — see
     bottom of this stylesheet — so the grid reads visually like Soundtrap's
     mastering grid without depending on per-card images. */
}
.card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: var(--card-grad, transparent);
  opacity: 0.18;
  pointer-events: none;
  transition: opacity var(--transition-fast);
}
.card:hover { border-color: var(--accent-primary); transform: translateY(-2px); }
.card:hover::before { opacity: 0.32; }
.card.active {
  border-color: var(--accent-primary);
  box-shadow: 0 0 18px var(--accent-glow), inset 0 0 0 1px var(--accent-primary);
}
.card.active::before { opacity: 0.45; }
.card.off::before { opacity: 0; }
.card.off { color: var(--text-muted); }
.ico {
  font-size: 1.6rem;
  line-height: 1;
  position: relative;
}
.name {
  font-family: var(--font-display);
  font-weight: 700;
  font-size: 0.92rem;
  position: relative;
  color: var(--text-primary);
}
.desc {
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.35;
  position: relative;
}
.badge {
  position: absolute;
  top: 0.5rem;
  inset-inline-end: 0.5rem;
  font-size: 0.55rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0.15rem 0.4rem;
  border-radius: 999px;
  background: var(--accent-primary);
  color: var(--text-inverse);
}

.note {
  margin: 0;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-align: center;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.fade-enter-active, .fade-leave-active { transition: opacity var(--transition-base); }
.fade-enter-from, .fade-leave-to { opacity: 0; }

/* Per-preset gradients. Set --card-grad on each hue class so .card::before
   renders a soft styled glow consistent with the preset's vibe. */
.hue-off { --card-grad: linear-gradient(180deg, #2a2a3a, #15151f); }
.hue-violet { --card-grad: linear-gradient(180deg, #7c3aed, #1e1b3b); }
.hue-cyan { --card-grad: linear-gradient(180deg, #22d3ee, #0e2a3a); }
.hue-blue { --card-grad: linear-gradient(180deg, #3b82f6, #14213d); }
.hue-indigo { --card-grad: linear-gradient(180deg, #6366f1, #1c1b3a); }
.hue-magenta { --card-grad: linear-gradient(180deg, #ec4899, #2a0d2a); }
.hue-orange { --card-grad: linear-gradient(180deg, #f59e0b, #2a1e0a); }
.hue-red { --card-grad: linear-gradient(180deg, #ef4444, #2a0d0d); }
.hue-amber { --card-grad: linear-gradient(180deg, #d97706, #2a1a08); }
</style>
