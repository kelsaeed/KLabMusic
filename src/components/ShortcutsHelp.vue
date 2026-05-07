<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { t } = useI18n()

interface Group {
  title: string
  items: { keys: string[]; desc: string }[]
}

const groups: Group[] = [
  {
    title: 'help.global',
    items: [
      { keys: ['?'], desc: 'help.toggleHelp' },
      { keys: ['Ctrl', 'A'], desc: 'help.toggleAi' },
    ],
  },
  {
    title: 'help.keyBindings',
    items: [
      { keys: ['Z', 'X'], desc: 'help.octave' },
      { keys: ['⇧'], desc: 'help.damp' },
      { keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K'], desc: 'help.pianoWhite' },
      { keys: ['W', 'E', 'T', 'Y', 'U', 'O'], desc: 'help.pianoBlack' },
      { keys: ['Space'], desc: 'help.playStop' },
    ],
  },
  {
    title: 'help.beatMaker',
    items: [
      { keys: ['L click'], desc: 'help.toggleStep' },
      { keys: ['R click'], desc: 'help.stepVelocity' },
      { keys: ['drag'], desc: 'help.paintSteps' },
    ],
  },
  {
    title: 'help.recorder',
    items: [{ keys: ['drag file'], desc: 'help.dropClip' }],
  },
]
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="panel">
          <header class="head">
            <h2>{{ t('help.title') }}</h2>
            <button class="close" @click="emit('close')">×</button>
          </header>
          <div class="grid">
            <section v-for="g in groups" :key="g.title" class="group">
              <h3 class="mono">{{ t(g.title) }}</h3>
              <dl>
                <template v-for="row in g.items" :key="row.desc">
                  <dt>
                    <kbd v-for="(k, i) in row.keys" :key="k + i" class="mono">{{ k }}</kbd>
                  </dt>
                  <dd>{{ t(row.desc) }}</dd>
                </template>
              </dl>
            </section>
          </div>
          <footer class="foot mono">{{ t('help.footer') }}</footer>
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
  backdrop-filter: blur(6px);
  display: grid;
  place-items: center;
  z-index: 220;
  padding: 1.5rem;
}
.panel {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  width: min(720px, 100%);
  max-height: 92vh;
  overflow: auto;
  padding: 1.5rem;
  box-shadow: var(--shadow);
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.head h2 {
  margin: 0;
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--accent-primary);
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.6rem;
  line-height: 1;
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}
.group {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem 1rem;
}
.group h3 {
  margin: 0 0 0.6rem;
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-muted);
}
dl {
  margin: 0;
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.4rem 0.85rem;
  align-items: center;
}
dt {
  display: inline-flex;
  gap: 0.25rem;
  flex-wrap: wrap;
}
dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 0.85rem;
}
kbd {
  display: inline-block;
  padding: 0.15rem 0.45rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 4px;
  font-size: 0.7rem;
  color: var(--accent-primary);
  min-width: 22px;
  text-align: center;
}
.foot {
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity var(--transition-base);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
