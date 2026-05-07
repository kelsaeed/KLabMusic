<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useBeatMakerStore } from '@/stores/beatmaker'
import { useExport } from '@/composables/useExport'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const beatStore = useBeatMakerStore()
const {
  recording,
  exporting,
  lastShareUrl,
  exportWav,
  exportMp3,
  exportMidi,
  buildShareUrl,
  generateQrDataUrl,
  copyShareLinkToClipboard,
} = useExport()
const { t } = useI18n()

const qrDataUrl = ref('')
const copied = ref(false)

async function generateShare() {
  buildShareUrl(beatStore.activePattern)
  qrDataUrl.value = await generateQrDataUrl(lastShareUrl.value)
}

async function copyLink() {
  copied.value = await copyShareLinkToClipboard()
  setTimeout(() => (copied.value = false), 1800)
}

function downloadQr() {
  if (!qrDataUrl.value) return
  const a = document.createElement('a')
  a.href = qrDataUrl.value
  a.download = `klabmusic-${beatStore.activePattern.name}.png`
  a.click()
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      qrDataUrl.value = ''
      lastShareUrl.value = ''
    }
  },
)
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="overlay" @click.self="emit('close')">
        <div class="dialog">
          <header class="head">
            <h3>{{ t('export.title') }}</h3>
            <button class="close" @click="emit('close')">×</button>
          </header>

          <section class="block">
            <h4 class="mono">{{ t('export.audio') }}</h4>
            <p class="hint">{{ t('export.audioHint') }}</p>
            <div class="row">
              <button class="action" :disabled="exporting" @click="exportWav">
                {{ recording ? t('export.recording') : exporting ? t('export.encoding') : t('export.wav') }}
              </button>
              <button class="action" :disabled="exporting" @click="exportMp3">
                {{ exporting ? t('export.encoding') : t('export.mp3') }}
              </button>
            </div>
          </section>

          <section class="block">
            <h4 class="mono">{{ t('export.midi') }}</h4>
            <p class="hint">{{ t('export.midiHint') }}</p>
            <button class="action" @click="exportMidi">{{ t('export.exportMidi') }}</button>
          </section>

          <section class="block">
            <h4 class="mono">{{ t('export.share') }}</h4>
            <p class="hint">{{ t('export.shareHint') }}</p>
            <button v-if="!lastShareUrl" class="primary" @click="generateShare">
              {{ t('export.generateShare') }}
            </button>
            <div v-else class="share-out">
              <div class="link-row">
                <input :value="lastShareUrl" readonly class="link mono" @focus="($event.target as HTMLInputElement).select()" />
                <button class="action" @click="copyLink">
                  {{ copied ? t('export.copied') : t('export.copy') }}
                </button>
              </div>
              <div v-if="qrDataUrl" class="qr-wrap">
                <img :src="qrDataUrl" alt="QR" class="qr" />
                <button class="action small" @click="downloadQr">{{ t('export.downloadQr') }}</button>
              </div>
            </div>
          </section>
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
  width: min(520px, 100%);
  max-height: 92vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
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
.block {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.85rem 1rem;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.block h4 {
  margin: 0;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}
.hint {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.action {
  font-size: 0.8rem;
  padding: 0.5rem 0.9rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-family: var(--font-mono);
}
.action.small {
  font-size: 0.7rem;
  padding: 0.35rem 0.7rem;
}
.action:disabled { opacity: 0.5; }
.primary {
  background: var(--accent-primary);
  color: var(--text-inverse);
  border: none;
  font-weight: 700;
  padding: 0.55rem 1rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.share-out {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.link-row {
  display: flex;
  gap: 0.4rem;
}
.link {
  flex: 1;
  font-size: 0.75rem;
  background: var(--bg-base);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem;
  color: var(--accent-primary);
}
.qr-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}
.qr {
  width: 220px;
  height: 220px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-base);
}
.fade-enter-active, .fade-leave-active {
  transition: opacity var(--transition-base);
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
