<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAuth } from '@/composables/useAuth'
import { isSupabaseConfigured } from '@/lib/supabase'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const { signUp, signIn, signInWithGoogle } = useAuth()
const { t } = useI18n()

const mode = ref<'signin' | 'signup'>('signin')
const email = ref('')
const password = ref('')
const name = ref('')
const busy = ref(false)
const status = ref('')

watch(() => props.open, (open) => {
  if (open) {
    status.value = ''
    busy.value = false
  }
})

async function submit() {
  if (busy.value) return
  busy.value = true
  status.value = ''
  const result =
    mode.value === 'signin'
      ? await signIn(email.value, password.value)
      : await signUp(email.value, password.value, name.value || email.value.split('@')[0])
  busy.value = false
  status.value = result.message
  if (result.ok && mode.value === 'signin') emit('close')
}

async function google() {
  if (busy.value) return
  busy.value = true
  status.value = ''
  const result = await signInWithGoogle()
  busy.value = false
  if (!result.ok) status.value = result.message
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="dialog">
          <header class="head">
            <h3>{{ mode === 'signin' ? t('auth.signIn') : t('auth.signUp') }}</h3>
            <button class="close" @click="emit('close')">×</button>
          </header>

          <p v-if="!isSupabaseConfigured" class="warn">{{ t('auth.notConfigured') }}</p>

          <button class="google" :disabled="busy || !isSupabaseConfigured" @click="google">
            <span class="g-icon">G</span>
            {{ t('auth.continueGoogle') }}
          </button>

          <div class="divider"><span class="mono">{{ t('mp.or') }}</span></div>

          <form class="form" @submit.prevent="submit">
            <label v-if="mode === 'signup'">
              <span class="lbl mono">{{ t('auth.displayName') }}</span>
              <input v-model="name" :placeholder="t('mp.namePlaceholder')" maxlength="40" />
            </label>
            <label>
              <span class="lbl mono">{{ t('auth.email') }}</span>
              <input v-model="email" type="email" required autocomplete="email" />
            </label>
            <label>
              <span class="lbl mono">{{ t('auth.password') }}</span>
              <input
                v-model="password"
                type="password"
                required
                minlength="6"
                :autocomplete="mode === 'signin' ? 'current-password' : 'new-password'"
              />
            </label>
            <button type="submit" class="primary" :disabled="busy || !isSupabaseConfigured">
              {{ busy ? '…' : mode === 'signin' ? t('auth.signIn') : t('auth.signUp') }}
            </button>
          </form>

          <p v-if="status" class="status mono">{{ status }}</p>

          <div class="switch">
            <span>{{ mode === 'signin' ? t('auth.noAccount') : t('auth.haveAccount') }}</span>
            <button class="link" type="button" @click="mode = mode === 'signin' ? 'signup' : 'signin'">
              {{ mode === 'signin' ? t('auth.signUp') : t('auth.signIn') }}
            </button>
          </div>
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
  backdrop-filter: blur(8px);
  display: grid;
  place-items: center;
  z-index: 220;
  padding: 1.5rem;
}
.dialog {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  box-shadow: var(--shadow);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head h3 {
  margin: 0;
  color: var(--accent-primary);
  font-size: 1.1rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 1.6rem;
  line-height: 1;
}
.warn {
  margin: 0;
  padding: 0.5rem 0.7rem;
  background: var(--bg-elevated);
  border: 1px solid var(--accent-secondary);
  border-radius: var(--radius);
  font-size: 0.8rem;
  color: var(--accent-secondary);
}
.google {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.6rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  font-weight: 600;
  font-size: 0.9rem;
}
.google:hover { border-color: var(--accent-primary); }
.g-icon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: linear-gradient(135deg, #ea4335 0%, #fbbc05 25%, #34a853 60%, #4285f4 100%);
  color: #fff;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 0.78rem;
}
.divider {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--text-muted);
  font-size: 0.7rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border);
}
.form {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.form label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.lbl {
  font-size: 0.65rem;
  text-transform: uppercase;
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  padding: 0.7rem 1rem;
  margin-top: 0.3rem;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.primary:disabled { opacity: 0.5; }
.status {
  margin: 0;
  font-size: 0.78rem;
  color: var(--accent-primary);
  text-align: center;
}
.switch {
  display: flex;
  gap: 0.4rem;
  justify-content: center;
  align-items: center;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.link {
  background: transparent;
  border: none;
  color: var(--accent-primary);
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0;
}
.fade-enter-active, .fade-leave-active {
  transition: opacity var(--transition-base);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
