<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { RouterLink } from 'vue-router'

const { t } = useI18n()
</script>

<template>
  <div class="not-found">
    <div class="orb" aria-hidden="true" />
    <div class="card">
      <h1 class="code">404</h1>
      <p class="msg">{{ t('notFound.title') }}</p>
      <p class="hint">{{ t('notFound.hint') }}</p>
      <div class="actions">
        <RouterLink to="/" class="btn-primary">{{ t('notFound.home') }}</RouterLink>
        <RouterLink to="/app" class="btn-ghost">{{ t('nav.open') }}</RouterLink>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found {
  flex: 1;
  display: grid;
  place-items: center;
  position: relative;
  padding: 2rem 1.5rem;
  overflow: hidden;
}
.orb {
  position: absolute;
  width: 480px;
  height: 480px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--accent-glow), transparent 70%);
  filter: blur(40px);
  opacity: 0.4;
  pointer-events: none;
  animation: drift 8s ease-in-out infinite;
}
@keyframes drift {
  0%, 100% { transform: translate(0, 0) scale(1); }
  50% { transform: translate(30px, -20px) scale(1.05); }
}
.card {
  position: relative;
  text-align: center;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 3rem 2rem;
  max-width: 480px;
  z-index: 1;
}
.code {
  font-family: var(--font-display);
  font-size: clamp(4rem, 12vw, 7rem);
  font-weight: 800;
  margin: 0;
  background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
}
.msg {
  font-family: var(--font-display);
  font-size: 1.2rem;
  margin: 0.5rem 0 0.4rem;
  color: var(--text-primary);
}
.hint {
  margin: 0 0 1.5rem;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.actions {
  display: inline-flex;
  gap: 0.6rem;
  flex-wrap: wrap;
  justify-content: center;
}
.btn-primary,
.btn-ghost {
  padding: 0.7rem 1.4rem;
  border-radius: var(--radius);
  font-weight: 600;
  transition: transform var(--transition-fast), box-shadow var(--transition-fast);
}
.btn-primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
}
.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px var(--accent-glow);
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
</style>
