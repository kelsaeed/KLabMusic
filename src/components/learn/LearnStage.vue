<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAudio } from '@/composables/useAudio'

interface Lesson {
  id: string
  titleKey: string
  icon: string
}

const LESSONS: Lesson[] = [
  { id: 'tour', titleKey: 'learn.tour.title', icon: '🧭' },
  { id: 'notes', titleKey: 'learn.notes.title', icon: '🎵' },
  { id: 'chords', titleKey: 'learn.chords.title', icon: '🎶' },
  { id: 'rhythm', titleKey: 'learn.rhythm.title', icon: '🥁' },
  { id: 'piece', titleKey: 'learn.piece.title', icon: '📜' },
  { id: 'playing', titleKey: 'learn.playing.title', icon: '🎹' },
  { id: 'next', titleKey: 'learn.next.title', icon: '🚀' },
  { id: 'about', titleKey: 'learn.about.title', icon: '✨' },
]

const { t } = useI18n()
const { playOn, stopAll } = useAudio()

const activeId = ref<Lesson['id']>('tour')

const TONE_SCALE = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'] as const
const OCTAVE_DEMO = ['C3', 'C4', 'C5'] as const

const CHORDS: Record<string, string[]> = {
  Cmaj7: ['C4', 'E4', 'G4', 'B4'],
  Am7: ['A3', 'C4', 'E4', 'G4'],
  Fmaj7: ['F3', 'A3', 'C4', 'E4'],
  G7: ['G3', 'B3', 'D4', 'F4'],
  Em7: ['E3', 'G3', 'B3', 'D4'],
}

const PROGRESSION = ['Cmaj7', 'Am7', 'Fmaj7', 'G7', 'Em7']
const MELODY = [
  'C4', 'E4', 'G4', 'C5', 'A4', 'G4', 'F4', 'E4',
  'D4', 'C4', 'E4', 'G4', 'A4', 'G4', 'F4', 'E4',
]
const RHYTHM = '■·■·■■·■·■·■·■■·'.split('')

let timer: number | null = null
const playing = ref(false)

function clearTimer() {
  if (timer !== null) {
    window.clearTimeout(timer)
    timer = null
  }
}

function stopAllPlayback() {
  clearTimer()
  stopAll()
  playing.value = false
}

onUnmounted(stopAllPlayback)

async function tapNote(note: string) {
  await playOn('piano', note, 100)
  window.setTimeout(() => stopAll(), 600)
}

async function tapChord(name: string) {
  const notes = CHORDS[name]
  if (!notes) return
  for (const n of notes) await playOn('piano', n, 80)
  window.setTimeout(() => stopAll(), 1200)
}

async function playProgression() {
  if (playing.value) {
    stopAllPlayback()
    return
  }
  playing.value = true
  const stepMs = 900
  for (let i = 0; i < PROGRESSION.length; i++) {
    if (!playing.value) return
    const name = PROGRESSION[i]
    const notes = CHORDS[name]
    if (notes) {
      stopAll()
      for (const n of notes) void playOn('piano', n, 80)
    }
    await new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, stepMs)
    })
  }
  stopAllPlayback()
}

async function playRhythm() {
  if (playing.value) {
    stopAllPlayback()
    return
  }
  playing.value = true
  const stepMs = 180
  for (let i = 0; i < RHYTHM.length; i++) {
    if (!playing.value) return
    if (RHYTHM[i] === '■') {
      void playOn('drums', i % 4 === 0 ? 'kick' : 'snare', 100)
    }
    await new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, stepMs)
    })
  }
  stopAllPlayback()
}

async function playMelody() {
  if (playing.value) {
    stopAllPlayback()
    return
  }
  playing.value = true
  const stepMs = 320
  for (let i = 0; i < MELODY.length; i++) {
    if (!playing.value) return
    stopAll()
    void playOn('piano', MELODY[i], 90)
    await new Promise<void>((resolve) => {
      timer = window.setTimeout(resolve, stepMs)
    })
  }
  stopAllPlayback()
}

function go(id: Lesson['id']) {
  stopAllPlayback()
  activeId.value = id
}

function goPrev() {
  const idx = LESSONS.findIndex((l) => l.id === activeId.value)
  if (idx > 0) go(LESSONS[idx - 1].id)
}

function goNext() {
  const idx = LESSONS.findIndex((l) => l.id === activeId.value)
  if (idx >= 0 && idx < LESSONS.length - 1) go(LESSONS[idx + 1].id)
}

const isFirst = computed(() => activeId.value === LESSONS[0].id)
const isLast = computed(() => activeId.value === LESSONS[LESSONS.length - 1].id)
</script>

<template>
  <section class="learn">
    <header class="learn-head">
      <div>
        <h2>{{ t('learn.title') }}</h2>
        <p class="sub">{{ t('learn.subtitle') }}</p>
      </div>
      <p class="tip mono">💡 {{ t('learn.noTheoryNeeded') }}</p>
    </header>

    <div class="learn-body">
      <aside class="lesson-list">
        <div class="list-label mono">{{ t('learn.lessons') }}</div>
        <button
          v-for="(lesson, i) in LESSONS"
          :key="lesson.id"
          class="lesson-item"
          :class="{ active: lesson.id === activeId }"
          @click="go(lesson.id)"
        >
          <span class="num mono">{{ i + 1 }}</span>
          <span class="ico">{{ lesson.icon }}</span>
          <span class="name">{{ t(lesson.titleKey) }}</span>
        </button>
      </aside>

      <article class="lesson">
        <!-- 1 · Tour -->
        <div v-if="activeId === 'tour'" class="content">
          <h3>{{ t('learn.tour.title') }}</h3>
          <p>{{ t('learn.tour.intro') }}</p>
          <ul class="tab-list">
            <li><strong>🎹</strong> {{ t('learn.tour.tabs.live') }}</li>
            <li><strong>🥁</strong> {{ t('learn.tour.tabs.beat') }}</li>
            <li><strong>🔁</strong> {{ t('learn.tour.tabs.loop') }}</li>
            <li><strong>🌀</strong> {{ t('learn.tour.tabs.chaos') }}</li>
            <li><strong>🎓</strong> {{ t('learn.tour.tabs.learn') }}</li>
          </ul>
          <p class="callout mono">⌨ {{ t('learn.tour.shortcuts') }}</p>
        </div>

        <!-- 2 · Notes -->
        <div v-else-if="activeId === 'notes'" class="content">
          <h3>{{ t('learn.notes.title') }}</h3>
          <p>{{ t('learn.notes.intro') }}</p>
          <p>{{ t('learn.notes.naming') }}</p>
          <p>{{ t('learn.notes.octave') }}</p>
          <h4>{{ t('learn.notes.tryTitle') }}</h4>
          <p class="muted">{{ t('learn.notes.tryHint') }}</p>
          <div class="note-row">
            <button v-for="n in TONE_SCALE" :key="n" class="note-btn mono" @click="tapNote(n)">
              {{ n }}
            </button>
          </div>
          <h4>{{ t('learn.notes.octaveDemo') }}</h4>
          <div class="note-row">
            <button v-for="n in OCTAVE_DEMO" :key="n" class="note-btn mono octave" @click="tapNote(n)">
              {{ n }}
            </button>
          </div>
        </div>

        <!-- 3 · Chords -->
        <div v-else-if="activeId === 'chords'" class="content">
          <h3>{{ t('learn.chords.title') }}</h3>
          <p>{{ t('learn.chords.intro') }}</p>
          <ol class="rules">
            <li>{{ t('learn.chords.rule1') }}</li>
            <li>{{ t('learn.chords.rule2') }}</li>
            <li>{{ t('learn.chords.rule3') }}</li>
            <li>{{ t('learn.chords.rule4') }}</li>
            <li>{{ t('learn.chords.rule5') }}</li>
          </ol>
          <h4>{{ t('learn.chords.decodeTitle') }}</h4>
          <p>{{ t('learn.chords.decode') }}</p>
          <h4>{{ t('learn.chords.tryTitle') }}</h4>
          <p class="muted">{{ t('learn.chords.tryHint') }}</p>
          <div class="chord-row">
            <button
              v-for="name in PROGRESSION"
              :key="name"
              class="chord-btn mono"
              @click="tapChord(name)"
            >
              {{ name }}
            </button>
          </div>
        </div>

        <!-- 4 · Rhythm -->
        <div v-else-if="activeId === 'rhythm'" class="content">
          <h3>{{ t('learn.rhythm.title') }}</h3>
          <p>{{ t('learn.rhythm.intro') }}</p>
          <p>{{ t('learn.rhythm.bar') }}</p>
          <p class="example mono">{{ t('learn.rhythm.example') }}</p>
          <p>{{ t('learn.rhythm.exampleBreakdown') }}</p>
          <h4>{{ t('learn.rhythm.tryTitle') }}</h4>
          <p class="muted">{{ t('learn.rhythm.tryHint') }}</p>
          <div class="grid-row">
            <span
              v-for="(slot, i) in RHYTHM"
              :key="i"
              class="slot mono"
              :class="{ hit: slot === '■', downbeat: i % 4 === 0 }"
            >{{ slot }}</span>
          </div>
          <button class="play-btn" @click="playRhythm">
            {{ playing ? '◼ ' + t('learn.stop') : '▶ ' + t('learn.playProgression') }}
          </button>
        </div>

        <!-- 5 · Piece -->
        <div v-else-if="activeId === 'piece'" class="content">
          <h3>{{ t('learn.piece.title') }}</h3>
          <p>{{ t('learn.piece.intro') }}</p>

          <div class="piece-block">
            <div class="piece-label mono">{{ t('learn.piece.chordsLabel') }}</div>
            <div class="piece-line mono">{{ t('learn.piece.chords') }}</div>
          </div>
          <div class="piece-block">
            <div class="piece-label mono">{{ t('learn.piece.melodyLabel') }}</div>
            <div class="piece-line mono">{{ t('learn.piece.melody') }}</div>
          </div>
          <div class="piece-block">
            <div class="piece-label mono">{{ t('learn.piece.rhythmLabel') }}</div>
            <div class="piece-line mono">{{ t('learn.piece.rhythm') }}</div>
          </div>

          <h4>{{ t('learn.piece.howToRead') }}</h4>
          <ol class="rules">
            <li>{{ t('learn.piece.step1') }}</li>
            <li>{{ t('learn.piece.step2') }}</li>
            <li>{{ t('learn.piece.step3') }}</li>
            <li>{{ t('learn.piece.step4') }}</li>
          </ol>

          <h4>{{ t('learn.piece.tryItTitle') }}</h4>
          <div class="play-row">
            <button class="play-btn" @click="playProgression">
              {{ playing ? '◼ ' + t('learn.stop') : '▶ ' + t('learn.playProgression') }}
            </button>
            <button class="play-btn ghost" :disabled="playing" @click="playMelody">
              ▶ {{ t('learn.piece.melodyLabel') }}
            </button>
          </div>
        </div>

        <!-- 6 · Playing -->
        <div v-else-if="activeId === 'playing'" class="content">
          <h3>{{ t('learn.playing.title') }}</h3>
          <p>{{ t('learn.playing.intro') }}</p>

          <div class="way">
            <h4>{{ t('learn.playing.wayA') }}</h4>
            <ol>
              <li>{{ t('learn.playing.wayAStep1') }}</li>
              <li>{{ t('learn.playing.wayAStep2') }}</li>
              <li>{{ t('learn.playing.wayAStep3') }}</li>
            </ol>
          </div>

          <div class="way">
            <h4>{{ t('learn.playing.wayB') }}</h4>
            <ol>
              <li>{{ t('learn.playing.wayBStep1') }}</li>
              <li>{{ t('learn.playing.wayBStep2') }}</li>
              <li>{{ t('learn.playing.wayBStep3') }}</li>
            </ol>
          </div>

          <div class="way">
            <h4>{{ t('learn.playing.wayC') }}</h4>
            <ol>
              <li>{{ t('learn.playing.wayCStep1') }}</li>
              <li>{{ t('learn.playing.wayCStep2') }}</li>
              <li>{{ t('learn.playing.wayCStep3') }}</li>
            </ol>
          </div>
        </div>

        <!-- 7 · Next -->
        <div v-else-if="activeId === 'next'" class="content">
          <h3>{{ t('learn.next.title') }}</h3>
          <ul class="bullet">
            <li>{{ t('learn.next.loopstation') }}</li>
            <li>{{ t('learn.next.chaos') }}</li>
            <li>{{ t('learn.next.multiplayer') }}</li>
            <li>{{ t('learn.next.share') }}</li>
          </ul>
        </div>

        <!-- 8 · About -->
        <div v-else-if="activeId === 'about'" class="content about">
          <h3>{{ t('learn.about.title') }}</h3>
          <p>{{ t('learn.about.p1') }}</p>
          <p class="creator-line">{{ t('learn.about.p2') }}</p>
          <p>{{ t('learn.about.p3') }}</p>
          <div class="credit-card">
            <div class="credit-name">Khaled Elsaeed</div>
            <div class="credit-role mono">{{ t('learn.about.creator') }}</div>
            <a class="credit-link mono" :href="'https://' + t('learn.about.github')" target="_blank" rel="noopener">
              {{ t('learn.about.github') }}
            </a>
          </div>
        </div>

        <footer class="lesson-foot">
          <button class="nav-btn" :disabled="isFirst" @click="goPrev">← {{ t('learn.previous') }}</button>
          <button class="nav-btn primary" :disabled="isLast" @click="goNext">{{ t('learn.next') }} →</button>
        </footer>
      </article>
    </div>
  </section>
</template>

<style scoped>
.learn {
  width: 100%;
  max-width: 1100px;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.learn-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.learn-head h2 {
  margin: 0 0 0.3rem 0;
  color: var(--accent-primary);
  font-size: 1.4rem;
}
.learn-head .sub {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.9rem;
  max-width: 60ch;
}
.tip {
  margin: 0;
  padding: 0.5rem 0.8rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-size: 0.7rem;
  color: var(--text-muted);
  max-width: 320px;
}

.learn-body {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 1rem;
  align-items: start;
}

.lesson-list {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  position: sticky;
  top: 1rem;
}
.list-label {
  font-size: 0.65rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-muted);
  padding: 0.5rem 0.6rem 0.3rem;
}
.lesson-item {
  display: grid;
  grid-template-columns: 22px 22px 1fr;
  align-items: center;
  gap: 0.4rem;
  padding: 0.55rem 0.6rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  text-align: start;
  font-size: 0.78rem;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--transition-fast), background var(--transition-fast), color var(--transition-fast);
}
.lesson-item:hover {
  border-color: var(--accent-primary);
}
.lesson-item.active {
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
  color: var(--accent-primary);
  box-shadow: 0 0 12px var(--accent-glow);
}
.lesson-item .num {
  font-size: 0.7rem;
  color: var(--text-muted);
}
.lesson-item .ico { font-size: 0.95rem; }

.lesson {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.25rem 1.4rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 60vh;
}
.content {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.content h3 {
  margin: 0;
  font-size: 1.05rem;
  color: var(--accent-primary);
}
.content h4 {
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
  color: var(--text-primary);
  letter-spacing: 0.02em;
}
.content p {
  margin: 0;
  color: var(--text-primary);
  line-height: 1.65;
  font-size: 0.92rem;
}
.content .muted { color: var(--text-muted); font-size: 0.82rem; }
.content .callout {
  padding: 0.7rem 0.9rem;
  background: var(--bg-elevated);
  border: 1px dashed var(--border);
  border-radius: var(--radius);
  font-size: 0.78rem;
  color: var(--text-muted);
}

.tab-list, .rules, .bullet {
  margin: 0;
  padding-inline-start: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-primary);
  font-size: 0.9rem;
  line-height: 1.6;
}
.tab-list { list-style: none; padding: 0; }
.tab-list li { display: flex; gap: 0.5rem; align-items: baseline; }
.tab-list li strong { font-size: 1rem; }

.note-row, .chord-row, .play-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.note-btn, .chord-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 0.9rem;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 0.85rem;
  transition: border-color var(--transition-fast), color var(--transition-fast), transform var(--transition-fast);
}
.note-btn:hover, .chord-btn:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.note-btn:active, .chord-btn:active { transform: translateY(1px); }
.note-btn.octave { background: var(--bg-surface); border-style: dashed; }

.example, .piece-line {
  font-size: 1.05rem;
  letter-spacing: 0.08em;
  padding: 0.7rem 0.9rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--accent-primary);
}
.piece-block { display: flex; flex-direction: column; gap: 0.3rem; }
.piece-label {
  font-size: 0.65rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.grid-row {
  display: grid;
  grid-template-columns: repeat(16, 1fr);
  gap: 2px;
  max-width: 480px;
}
.slot {
  text-align: center;
  padding: 0.4rem 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.slot.hit { color: var(--accent-primary); border-color: var(--accent-primary); }
.slot.downbeat { background: var(--bg-surface); }

.play-btn {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  padding: 0.55rem 1rem;
  border-radius: var(--radius);
  font-weight: 600;
  cursor: pointer;
  font-size: 0.85rem;
  letter-spacing: 0.04em;
  align-self: flex-start;
}
.play-btn.ghost {
  background: transparent;
  color: var(--accent-primary);
  border: 1px solid var(--accent-primary);
}
.play-btn:disabled { opacity: 0.45; cursor: not-allowed; }

.way {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.8rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.way h4 { color: var(--accent-primary); }
.way ol {
  margin: 0;
  padding-inline-start: 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.88rem;
  line-height: 1.55;
}

.about .creator-line { font-weight: 600; color: var(--accent-primary); }
.credit-card {
  margin-top: 0.6rem;
  padding: 1rem 1.2rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  align-self: flex-start;
  box-shadow: 0 0 14px var(--accent-glow);
}
.credit-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--accent-primary);
  letter-spacing: 0.02em;
}
.credit-role {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}
.credit-link {
  font-size: 0.78rem;
  color: var(--accent-secondary);
  text-decoration: none;
}
.credit-link:hover { text-decoration: underline; }

.lesson-foot {
  margin-top: auto;
  padding-top: 0.8rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}
.nav-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
  font-size: 0.8rem;
  color: var(--text-primary);
  cursor: pointer;
}
.nav-btn:hover:not(:disabled) { border-color: var(--accent-primary); color: var(--accent-primary); }
.nav-btn.primary { background: var(--accent-primary); color: var(--text-inverse); border-color: var(--accent-primary); }
.nav-btn:disabled { opacity: 0.35; cursor: not-allowed; }

@media (max-width: 760px) {
  .learn-body { grid-template-columns: 1fr; }
  .lesson-list { position: static; flex-direction: row; flex-wrap: wrap; }
  .lesson-list .list-label { width: 100%; padding-bottom: 0; }
  .lesson-item { flex: 1 1 140px; }
}
</style>
