<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'
import AppNav from '@/components/AppNav.vue'

const { t, tm, rt } = useI18n()
const features = tm('home.features') as Record<string, string>
</script>

<template>
  <div class="home">
    <AppNav />

    <section class="hero">
      <div class="hero-inner">
        <h1 class="title">{{ t('app.name') }}</h1>
        <p class="tagline">{{ t('app.tagline') }}</p>
        <p class="blurb">{{ t('home.blurb') }}</p>
        <div class="cta-row">
          <RouterLink to="/app" class="btn-primary">{{ t('home.ctaPrimary') }}</RouterLink>
          <RouterLink to="/app" class="btn-ghost">{{ t('home.ctaSecondary') }}</RouterLink>
        </div>
      </div>
      <div class="orb" aria-hidden="true" />
    </section>

    <section class="features">
      <h2>{{ t('home.featuresTitle') }}</h2>
      <ul>
        <li v-for="(_, key) in features" :key="key">
          {{ rt(features[key]) }}
        </li>
      </ul>
    </section>

    <footer class="credit">
      <p class="credit-line mono">{{ t('learn.about.creator') }}</p>
      <a class="credit-link mono" href="https://github.com/kelsaeed/KLabMusic" target="_blank" rel="noopener">
        github.com/kelsaeed/KLabMusic
      </a>
    </footer>
  </div>
</template>

<style scoped>
.home {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.hero {
  flex: 1;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: clamp(1rem, 4vh, 3rem) clamp(1rem, 4vw, 1.5rem);
  overflow: hidden;
  min-height: 0;
}
.hero-inner {
  max-width: 720px;
  text-align: center;
  position: relative;
  z-index: 2;
}
.title {
  font-size: clamp(2rem, 7vmin, 4.5rem);
  margin: 0 0 0.4em;
  line-height: 1.05;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  font-family: var(--font-display);
  font-size: clamp(1rem, 2vmin, 1.5rem);
  color: var(--accent-primary);
  margin: 0 0 clamp(0.6rem, 1.4vh, 1.4rem);
  letter-spacing: 0.02em;
}
.blurb {
  font-size: clamp(0.85rem, 1.6vmin, 1.05rem);
  color: var(--text-muted);
  margin: 0 auto clamp(0.9rem, 2vh, 1.8rem);
  max-width: 560px;
  line-height: 1.55;
}
.cta-row {
  display: inline-flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}
.btn-primary,
.btn-ghost {
  padding: clamp(0.6rem, 1.4vmin, 0.85rem) clamp(1rem, 2.4vmin, 1.6rem);
  font-size: clamp(0.85rem, 1.4vmin, 1rem);
  border-radius: var(--radius);
  font-weight: 600;
  transition:
    transform var(--transition-fast),
    box-shadow var(--transition-fast);
}
.btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 24px var(--accent-glow);
  opacity: 1;
}
.btn-ghost {
  border: 1px solid var(--border);
  color: var(--text-primary);
}
.btn-ghost:hover {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
  opacity: 1;
}

.orb {
  position: absolute;
  width: clamp(280px, 55vmin, 480px);
  height: clamp(280px, 55vmin, 480px);
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow), transparent 70%);
  top: -10%;
  left: 50%;
  transform: translateX(-50%);
  filter: blur(20px);
  opacity: 0.5;
  pointer-events: none;
  z-index: 1;
  animation: drift 12s ease-in-out infinite;
}
@keyframes drift {
  0%, 100% { transform: translate(-50%, 0); }
  50% { transform: translate(-50%, 24px); }
}

.features {
  max-width: 1100px;
  margin: 0 auto;
  padding: clamp(0.6rem, 1.5vh, 1.2rem) clamp(1rem, 4vw, 1.5rem) clamp(0.4rem, 1vh, 0.8rem);
  width: 100%;
  flex-shrink: 0;
}
.features h2 {
  font-size: clamp(0.95rem, 2vmin, 1.3rem);
  margin: 0 0 clamp(0.5rem, 1.2vh, 0.9rem);
  color: var(--text-primary);
}
.features ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: clamp(0.4rem, 1vmin, 0.7rem);
}
.features li {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: clamp(0.5rem, 1vh, 0.8rem) clamp(0.7rem, 1.4vmin, 1rem);
  color: var(--text-primary);
  font-size: clamp(0.78rem, 1.3vmin, 0.92rem);
  line-height: 1.4;
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}
.features li:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
}

.credit {
  flex-shrink: 0;
  text-align: center;
  padding: clamp(0.5rem, 1vh, 0.9rem) 1rem clamp(0.7rem, 1.4vh, 1.2rem);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  border-top: 1px solid var(--border);
}
.credit-line {
  font-size: clamp(0.65rem, 1.1vmin, 0.78rem);
  letter-spacing: 0.06em;
  color: var(--accent-primary);
  margin: 0;
}
.credit-link {
  font-size: clamp(0.6rem, 1vmin, 0.72rem);
  color: var(--text-muted);
  text-decoration: none;
}
.credit-link:hover { color: var(--accent-secondary); text-decoration: underline; }

/* Tablet — 4 across becomes 2 across, still no scroll if tall enough */
@media (max-width: 900px) {
  .features ul { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

/* Mobile vertical — stack to single column, scrolling allowed */
@media (max-width: 480px) {
  .home { min-height: auto; }
  .hero { flex: 0 1 auto; padding: 2rem 1rem 1.4rem; }
  .features ul { grid-template-columns: 1fr; gap: 0.5rem; }
  .features li { padding: 0.7rem 0.9rem; font-size: 0.85rem; }
}

/* Mobile landscape — short height, hide non-essentials */
@media (max-height: 520px) and (orientation: landscape) {
  .blurb { display: none; }
  .features h2 { display: none; }
  .features ul { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .features li { padding: 0.4rem 0.6rem; font-size: 0.75rem; }
  .hero { padding: 0.8rem 1rem; }
  .tagline { margin-bottom: 0.6rem; }
  .credit { padding: 0.4rem 1rem 0.5rem; }
}
</style>
