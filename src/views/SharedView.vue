<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { useExport } from '@/composables/useExport'

const props = defineProps<{ data: string }>()
const { importSharedPattern } = useExport()
const router = useRouter()
const { t } = useI18n()
const status = ref<'loading' | 'ok' | 'fail'>('loading')

onMounted(() => {
  setTimeout(() => {
    const ok = importSharedPattern(props.data)
    status.value = ok ? 'ok' : 'fail'
    if (ok) {
      setTimeout(() => router.replace({ name: 'app' }), 800)
    }
  }, 250)
})
</script>

<template>
  <div class="shared">
    <div class="card">
      <div v-if="status === 'loading'" class="state">
        <div class="spinner" />
        <p class="mono">{{ t('share.loading') }}</p>
      </div>
      <div v-else-if="status === 'ok'" class="state">
        <span class="check">✓</span>
        <p>{{ t('share.imported') }}</p>
      </div>
      <div v-else class="state">
        <span class="x">✕</span>
        <p>{{ t('share.failed') }}</p>
        <button class="primary" @click="router.replace({ name: 'app' })">{{ t('nav.open') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shared {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 2rem 1.5rem;
}
.card {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 2.5rem 2rem;
  text-align: center;
  max-width: 420px;
}
.state {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  align-items: center;
}
.spinner {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 3px solid var(--border);
  border-top-color: var(--accent-primary);
  animation: spin 0.9s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.check {
  font-size: 2rem;
  color: var(--accent-primary);
}
.x {
  font-size: 2rem;
  color: var(--accent-secondary);
}
p { margin: 0; font-size: 0.9rem; color: var(--text-primary); }
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 600;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
}
</style>
