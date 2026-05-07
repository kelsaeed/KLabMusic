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
  </div>
</template>

<style scoped>
.home {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.hero {
  position: relative;
  padding: 5rem 1.5rem 4rem;
  display: flex;
  justify-content: center;
  overflow: hidden;
}
.hero-inner {
  max-width: 720px;
  text-align: center;
  position: relative;
  z-index: 2;
}
.title {
  font-size: clamp(2.5rem, 6vw, 4.5rem);
  margin: 0 0 0.4em;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.tagline {
  font-family: var(--font-display);
  font-size: clamp(1.1rem, 2vw, 1.5rem);
  color: var(--accent-primary);
  margin: 0 0 1.5rem;
  letter-spacing: 0.02em;
}
.blurb {
  font-size: 1.05rem;
  color: var(--text-muted);
  margin: 0 auto 2rem;
  max-width: 560px;
}
.cta-row {
  display: inline-flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: center;
}
.btn-primary,
.btn-ghost {
  padding: 0.85rem 1.6rem;
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
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow), transparent 70%);
  top: -120px;
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
  max-width: 880px;
  margin: 0 auto;
  padding: 2rem 1.5rem 5rem;
  width: 100%;
}
.features h2 {
  font-size: 1.5rem;
  margin-bottom: 1.5rem;
  color: var(--text-primary);
}
.features ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 0.75rem;
}
.features li {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.1rem;
  color: var(--text-primary);
  transition: border-color var(--transition-fast), transform var(--transition-fast);
}
.features li:hover {
  border-color: var(--accent-primary);
  transform: translateY(-2px);
}
</style>
