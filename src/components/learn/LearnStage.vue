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
        <div v-else-if="activeId === 'about'" class="content about-rich">
          <div class="float-bg" aria-hidden="true">
            <span class="float-note n0">♪</span>
            <span class="float-note n1">♫</span>
            <span class="float-note n2">♩</span>
            <span class="float-note n3">♬</span>
            <span class="float-note n4">♪</span>
            <span class="float-note n5">♫</span>
          </div>

          <header class="about-hero anim a-1">
            <span class="kicker mono">{{ t('learn.about.kicker') }}</span>
            <h2 class="about-title">KLabMusic</h2>
          </header>

          <section class="quote-card glass anim a-2">
            <span class="quote-mark" aria-hidden="true">"</span>
            <p>{{ t('learn.about.subtitle') }}</p>
          </section>

          <section class="bio-block anim a-3">
            <h3 class="bio-name">{{ t('learn.about.bioName') }}</h3>
            <p class="bio-role mono">{{ t('learn.about.bioRole') }}</p>
          </section>

          <section class="paragraphs">
            <p class="glass para anim a-4">{{ t('learn.about.bioP1') }}</p>
            <p class="glass para anim a-5">{{ t('learn.about.bioP2') }}</p>
            <p class="glass para anim a-6">{{ t('learn.about.bioP3') }}</p>
          </section>

          <section class="features-section anim a-7">
            <h4 class="features-title">{{ t('learn.about.featuresTitle') }}</h4>
            <div class="features-grid">
              <div class="feature-card glass">
                <span class="feature-ico">🎸</span>
                <span class="feature-label">{{ t('learn.about.feature1') }}</span>
              </div>
              <div class="feature-card glass">
                <span class="feature-ico">🥁</span>
                <span class="feature-label">{{ t('learn.about.feature2') }}</span>
              </div>
              <div class="feature-card glass">
                <span class="feature-ico">🎹</span>
                <span class="feature-label">{{ t('learn.about.feature3') }}</span>
              </div>
              <div class="feature-card glass">
                <span class="feature-ico">🎵</span>
                <span class="feature-label">{{ t('learn.about.feature4') }}</span>
              </div>
              <div class="feature-card glass span-2">
                <span class="feature-ico">🎧</span>
                <span class="feature-label">{{ t('learn.about.feature5') }}</span>
              </div>
            </div>
          </section>

          <p class="personal-note anim a-8">{{ t('learn.about.personal') }}</p>
          <p class="closing-note anim a-9">{{ t('learn.about.closing') }}</p>

          <section class="tagline-block anim a-10">
            <p class="tagline">{{ t('learn.about.tagline1') }}</p>
            <p class="tagline">{{ t('learn.about.tagline2') }}</p>
            <p class="tagline">{{ t('learn.about.tagline3') }}</p>
          </section>

          <p class="signature mono anim a-11">{{ t('learn.about.signature') }}</p>

          <section class="social-section anim a-12">
            <p class="social-title mono">{{ t('learn.about.socialTitle') }}</p>
            <div class="social-row">
              <a
                class="social-btn ig"
                href="https://www.instagram.com/k_elsaeed_"
                target="_blank"
                rel="noopener"
                aria-label="Instagram"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2.2c3.2 0 3.6 0 4.8.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.5 1 .5.5.8.9 1 1.5.2.4.3 1 .4 2.2.1 1.2.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 1.2-.2 1.8-.4 2.2-.2.6-.5 1-1 1.5-.5.5-.9.8-1.5 1-.4.2-1 .3-2.2.4-1.2.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2-.1-1.8-.2-2.2-.4-.6-.2-1-.5-1.5-1-.5-.5-.8-.9-1-1.5-.2-.4-.3-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8c.1-1.2.2-1.8.4-2.2.2-.6.5-1 1-1.5.5-.5.9-.8 1.5-1 .4-.2 1-.3 2.2-.4C8.4 2.2 8.8 2.2 12 2.2zm0 1.8c-3.1 0-3.5 0-4.7.1-1.1.1-1.7.2-2.1.3-.5.2-.9.4-1.3.8-.4.4-.6.8-.8 1.3-.1.4-.2 1-.3 2.1-.1 1.2-.1 1.6-.1 4.7s0 3.5.1 4.7c.1 1.1.2 1.7.3 2.1.2.5.4.9.8 1.3.4.4.8.6 1.3.8.4.1 1 .2 2.1.3 1.2.1 1.6.1 4.7.1s3.5 0 4.7-.1c1.1-.1 1.7-.2 2.1-.3.5-.2.9-.4 1.3-.8.4-.4.6-.8.8-1.3.1-.4.2-1 .3-2.1.1-1.2.1-1.6.1-4.7s0-3.5-.1-4.7c-.1-1.1-.2-1.7-.3-2.1-.2-.5-.4-.9-.8-1.3-.4-.4-.8-.6-1.3-.8-.4-.1-1-.2-2.1-.3-1.2-.1-1.6-.1-4.7-.1zm0 3.1a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 1.8a3.2 3.2 0 1 0 0 6.4 3.2 3.2 0 0 0 0-6.4zm5.2-3a1.2 1.2 0 1 1 0 2.4 1.2 1.2 0 0 1 0-2.4z" />
                </svg>
                <span class="sr">Instagram</span>
              </a>
              <a
                class="social-btn fb"
                href="https://facebook.com/khaled5502"
                target="_blank"
                rel="noopener"
                aria-label="Facebook"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.7-3.9 1.1 0 2.2.2 2.2.2v2.4h-1.2c-1.2 0-1.6.8-1.6 1.6V12h2.7l-.4 2.9h-2.3v7A10 10 0 0 0 22 12z" />
                </svg>
                <span class="sr">Facebook</span>
              </a>
              <a
                class="social-btn tt"
                href="https://www.tiktok.com/@k_elsaeed"
                target="_blank"
                rel="noopener"
                aria-label="TikTok"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M19.6 6.3a4.7 4.7 0 0 1-2.7-1 4.7 4.7 0 0 1-1.7-2.6h-3.1v12.4a2.8 2.8 0 1 1-2-2.7v-3.1a5.9 5.9 0 1 0 5.1 5.9V9.3a8 8 0 0 0 4.7 1.5V7.7a4.5 4.5 0 0 1-.3-1.4z" />
                </svg>
                <span class="sr">TikTok</span>
              </a>
              <a
                class="social-btn li"
                href="https://www.linkedin.com/in/khaled-el-saeed"
                target="_blank"
                rel="noopener"
                aria-label="LinkedIn"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3V9zm7 0h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.8-3-1.9 0-2.2 1.5-2.2 3V21h-4V9z" />
                </svg>
                <span class="sr">LinkedIn</span>
              </a>
            </div>
            <a class="github-link mono" :href="'https://' + t('learn.about.github')" target="_blank" rel="noopener">
              {{ t('learn.about.github') }}
            </a>
          </section>
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

/* === Rich About section === */
.about-rich {
  position: relative;
  padding: 0.5rem 0;
  isolation: isolate;
}

.float-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 0;
}
.float-note {
  position: absolute;
  font-size: 3.5rem;
  color: var(--accent-primary);
  opacity: 0.06;
  user-select: none;
  filter: drop-shadow(0 0 12px var(--accent-glow));
  animation: float 14s ease-in-out infinite;
}
.float-note.n0 { top: 4%; left: 6%; animation-delay: 0s; }
.float-note.n1 { top: 14%; right: 8%; font-size: 4.5rem; animation-delay: -2.5s; opacity: 0.05; }
.float-note.n2 { top: 38%; left: 10%; font-size: 3rem; animation-delay: -5s; }
.float-note.n3 { top: 56%; right: 12%; font-size: 5rem; animation-delay: -7.5s; opacity: 0.04; }
.float-note.n4 { top: 76%; left: 18%; font-size: 3.2rem; animation-delay: -10s; }
.float-note.n5 { top: 88%; right: 20%; font-size: 4rem; animation-delay: -12s; opacity: 0.05; }

@keyframes float {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-22px) rotate(4deg); }
}

.about-rich > *:not(.float-bg) {
  position: relative;
  z-index: 1;
}

@keyframes fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}
.anim {
  opacity: 0;
  animation: fadeUp 0.7s cubic-bezier(0.2, 0.7, 0.2, 1) both;
}
.a-1  { animation-delay: 0.00s; }
.a-2  { animation-delay: 0.10s; }
.a-3  { animation-delay: 0.20s; }
.a-4  { animation-delay: 0.30s; }
.a-5  { animation-delay: 0.40s; }
.a-6  { animation-delay: 0.50s; }
.a-7  { animation-delay: 0.60s; }
.a-8  { animation-delay: 0.75s; }
.a-9  { animation-delay: 0.85s; }
.a-10 { animation-delay: 0.95s; }
.a-11 { animation-delay: 1.10s; }
.a-12 { animation-delay: 1.20s; }

.glass {
  background: linear-gradient(
    140deg,
    color-mix(in srgb, var(--bg-elevated) 70%, transparent),
    color-mix(in srgb, var(--bg-surface) 50%, transparent)
  );
  border: 1px solid color-mix(in srgb, var(--accent-primary) 22%, transparent);
  border-radius: var(--radius);
  backdrop-filter: blur(14px) saturate(140%);
  -webkit-backdrop-filter: blur(14px) saturate(140%);
}

.about-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.4rem;
  padding: 0.6rem 0 0.8rem;
}
.kicker {
  font-size: 0.7rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: var(--accent-secondary);
  padding: 0.3rem 0.8rem;
  border: 1px solid color-mix(in srgb, var(--accent-secondary) 35%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--accent-secondary) 6%, transparent);
}
.about-title {
  margin: 0;
  font-size: clamp(2.4rem, 6vw, 4rem);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -0.02em;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  filter: drop-shadow(0 0 24px color-mix(in srgb, var(--accent-primary) 35%, transparent));
}
.quote-card {
  position: relative;
  margin: 0.6rem 0;
  padding: 1.4rem 1.6rem 1.4rem 2.4rem;
  font-size: 1.05rem;
  line-height: 1.7;
  color: var(--text-primary);
  border-inline-start: 3px solid var(--accent-primary);
  box-shadow: 0 0 32px color-mix(in srgb, var(--accent-primary) 10%, transparent);
}
.quote-card p { margin: 0; }
.quote-mark {
  position: absolute;
  top: -0.4rem;
  inset-inline-start: 0.6rem;
  font-size: 4rem;
  line-height: 1;
  color: var(--accent-primary);
  opacity: 0.35;
  font-family: serif;
  pointer-events: none;
}

.bio-block {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.4rem 0;
}
.bio-name {
  margin: 0;
  font-size: clamp(1.4rem, 3vw, 1.9rem);
  font-weight: 700;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.bio-role {
  margin: 0;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.paragraphs {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.para {
  margin: 0;
  padding: 1rem 1.2rem;
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--text-primary);
  transition: border-color var(--transition-base), transform var(--transition-base), box-shadow var(--transition-base);
}
.para:hover {
  border-color: color-mix(in srgb, var(--accent-primary) 55%, transparent);
  transform: translateY(-2px);
  box-shadow: 0 6px 28px color-mix(in srgb, var(--accent-primary) 14%, transparent);
}

.features-section {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding-top: 0.4rem;
}
.features-title {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--accent-secondary);
}
.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.6rem;
}
.feature-card {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1rem;
  font-size: 0.85rem;
  color: var(--text-primary);
  transition: transform var(--transition-base), border-color var(--transition-base), box-shadow var(--transition-base);
}
.feature-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--accent-primary) 60%, transparent);
  box-shadow: 0 6px 24px color-mix(in srgb, var(--accent-primary) 18%, transparent);
}
.feature-card.span-2 { grid-column: span 2; }
.feature-ico {
  font-size: 1.4rem;
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--accent-primary) 35%, transparent));
}
.feature-label { line-height: 1.35; }

.personal-note,
.closing-note {
  margin: 0;
  padding: 0 0.4rem;
  font-size: 0.95rem;
  line-height: 1.75;
  color: var(--text-primary);
}
.closing-note { color: var(--text-muted); font-style: italic; }

.tagline-block {
  text-align: center;
  padding: 1rem 0 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.tagline {
  margin: 0;
  font-size: clamp(1.1rem, 2.4vw, 1.6rem);
  font-weight: 700;
  letter-spacing: 0.01em;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.signature {
  text-align: center;
  font-size: 0.85rem;
  color: var(--accent-primary);
  letter-spacing: 0.12em;
  margin: 0.4rem 0 0.6rem;
}

.social-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.7rem;
  padding: 0.8rem 0 0.4rem;
}
.social-title {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-muted);
  margin: 0;
}
.social-row {
  display: flex;
  gap: 0.7rem;
  flex-wrap: wrap;
  justify-content: center;
}
.social-btn {
  width: 46px;
  height: 46px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-muted);
  text-decoration: none;
  transition:
    transform var(--transition-base),
    color var(--transition-base),
    background var(--transition-base),
    border-color var(--transition-base),
    box-shadow var(--transition-base);
  position: relative;
}
.social-btn svg { width: 20px; height: 20px; }
.social-btn:hover {
  transform: translateY(-3px) scale(1.06);
  color: var(--text-inverse);
  border-color: transparent;
}
.social-btn.ig:hover {
  background: linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888);
  box-shadow: 0 0 22px rgba(220, 39, 67, 0.55);
}
.social-btn.fb:hover {
  background: #1877f2;
  box-shadow: 0 0 22px rgba(24, 119, 242, 0.55);
}
.social-btn.tt:hover {
  background: linear-gradient(135deg, #ff0050, #00f2ea);
  box-shadow: 0 0 22px rgba(0, 242, 234, 0.55);
}
.social-btn.li:hover {
  background: #0a66c2;
  box-shadow: 0 0 22px rgba(10, 102, 194, 0.55);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
.github-link {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-decoration: none;
  letter-spacing: 0.04em;
  transition: color var(--transition-base);
}
.github-link:hover { color: var(--accent-secondary); }

@media (prefers-reduced-motion: reduce) {
  .anim { animation: none; opacity: 1; }
  .float-note { animation: none; }
}

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
