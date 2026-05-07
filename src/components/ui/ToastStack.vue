<script setup lang="ts">
import { useToast } from '@/composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <Teleport to="body">
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      <TransitionGroup name="toast">
        <div
          v-for="t in toasts"
          :key="t.id"
          class="toast"
          :class="[`type-${t.type}`]"
          role="status"
        >
          <span class="icon" aria-hidden="true">
            <span v-if="t.type === 'loading'" class="spinner" />
            <span v-else-if="t.type === 'success'" class="glyph">✓</span>
            <span v-else-if="t.type === 'error'" class="glyph">!</span>
            <span v-else class="glyph">i</span>
          </span>
          <div class="body">
            <span class="title">{{ t.title }}</span>
            <span v-if="t.subtitle" class="subtitle mono">{{ t.subtitle }}</span>
          </div>
          <button
            v-if="t.type !== 'loading'"
            class="close"
            aria-label="dismiss"
            @click="dismiss(t.id)"
          >×</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: 72px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  z-index: 300;
  pointer-events: none;
  width: min(420px, calc(100vw - 2rem));
}
html[dir='rtl'] .toast-stack {
  /* still center horizontally */
}

.toast {
  pointer-events: auto;
  display: grid;
  grid-template-columns: 28px 1fr auto;
  align-items: center;
  gap: 0.65rem;
  padding: 0.55rem 0.75rem;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4);
}
.toast.type-loading { border-color: var(--accent-primary); }
.toast.type-success { border-color: #06ffa5; }
.toast.type-error { border-color: var(--accent-secondary); }

.icon { display: grid; place-items: center; }
.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.glyph {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 700;
}
.toast.type-success .glyph {
  background: #06ffa5;
  color: var(--bg-base);
}
.toast.type-error .glyph {
  background: var(--accent-secondary);
  color: var(--text-inverse);
}
.toast.type-info .glyph {
  background: var(--bg-elevated);
  border: 1px solid var(--accent-primary);
  color: var(--accent-primary);
}

.body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.title {
  font-size: 0.85rem;
  font-weight: 600;
}
.subtitle {
  font-size: 0.7rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.1rem 0.4rem;
}
.close:hover { color: var(--accent-primary); }

.toast-enter-active,
.toast-leave-active {
  transition: opacity var(--transition-base), transform var(--transition-base);
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.toast-leave-active {
  position: absolute;
  width: 100%;
}
</style>
