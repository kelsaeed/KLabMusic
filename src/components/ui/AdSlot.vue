<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * A single ad unit. SAFE BY DEFAULT: with no AdSense client configured
 * it renders only a neutral, labelled placeholder box — it never loads
 * any third-party script or makes a network request. Real ads light up
 * ONLY when the site operator sets `VITE_ADSENSE_CLIENT` (their
 * `ca-pub-…` id) at build time AND passes a `slot` id.
 *
 * CONTENT POLICY — the operator's responsibility, enforced in the
 * Google AdSense dashboard, NOT in code (Google serves the creatives):
 * before going live, in AdSense → Brand safety / Blocking controls,
 * block the sensitive categories so nothing adult (18+), dating,
 * alcohol, drugs/supplements, gambling, or otherwise illegal can ever
 * be served. This component deliberately requests only `data-ad-*`
 * attributes and injects no arbitrary markup, so it cannot itself be a
 * spam/malware vector. Until those controls are set, leave
 * VITE_ADSENSE_CLIENT unset and the app just shows the placeholder.
 */

const props = withDefaults(
  defineProps<{
    /** Shape of the unit. 'rail' = tall sidebar skyscraper. */
    format?: 'rail' | 'horizontal' | 'square'
    /** AdSense ad-unit slot id (data-ad-slot). Omit → placeholder. */
    slot?: string
  }>(),
  { format: 'rail' },
)

const { t } = useI18n()

// Read at build time; Vite inlines it. Empty string when unset.
const adClient = (import.meta.env.VITE_ADSENSE_CLIENT as string | undefined) ?? ''
const live = adClient.length > 0 && !!props.slot

const insRef = ref<HTMLModElement | null>(null)

let scriptLoaded = false
function ensureAdScript(client: string): Promise<void> {
  if (scriptLoaded) return Promise.resolve()
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-adsbygoogle]')
    if (existing) { scriptLoaded = true; resolve(); return }
    const s = document.createElement('script')
    s.async = true
    s.crossOrigin = 'anonymous'
    s.src =
      'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' +
      encodeURIComponent(client)
    s.setAttribute('data-adsbygoogle', '')
    s.onload = () => { scriptLoaded = true; resolve() }
    s.onerror = () => resolve() // network/adblock — fall back silently
    document.head.appendChild(s)
  })
}

onMounted(async () => {
  if (!live) return
  await ensureAdScript(adClient)
  try {
    const w = window as unknown as { adsbygoogle?: unknown[] }
    ;(w.adsbygoogle = w.adsbygoogle || []).push({})
  } catch {
    /* push can throw if the unit is 0-width or the script was blocked;
       harmless — the slot just stays empty. */
  }
})
</script>

<template>
  <aside class="ad-slot" :class="`fmt-${format}`" :aria-label="t('ads.advertisement')">
    <span class="ad-tag mono">{{ t('ads.advertisement') }}</span>

    <!-- Live AdSense unit (only when configured + safe). -->
    <ins
      v-if="live"
      ref="insRef"
      class="adsbygoogle ad-ins"
      :data-ad-client="adClient"
      :data-ad-slot="slot"
      :data-ad-format="format === 'rail' ? 'vertical' : 'auto'"
      data-full-width-responsive="true"
    />

    <!-- Default placeholder — what ships until the operator opts in. -->
    <div v-else class="ad-ph">
      <span class="ad-ph-ico" aria-hidden="true">▦</span>
      <span class="ad-ph-txt mono">{{ t('ads.placeholder') }}</span>
    </div>
  </aside>
</template>

<style scoped>
.ad-slot {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: stretch;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.45rem;
  box-sizing: border-box;
}
.ad-tag {
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
  text-align: center;
  opacity: 0.7;
}
.ad-ins { display: block; width: 100%; height: 100%; }

.ad-ph {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  border: 1px dashed var(--border);
  border-radius: calc(var(--radius) - 2px);
  color: var(--text-muted);
  background:
    repeating-linear-gradient(
      45deg,
      transparent,
      transparent 9px,
      var(--bg-elevated) 9px,
      var(--bg-elevated) 18px
    );
}
.ad-ph-ico { font-size: 1.5rem; opacity: 0.45; }
.ad-ph-txt { font-size: 0.6rem; letter-spacing: 0.06em; opacity: 0.7; }

/* Standard-ish unit footprints. Kept fluid so they never overflow a
   narrow rail. Logical sizing only — no physical left/right — so RTL
   needs no special-casing. */
.fmt-rail { width: 168px; min-height: 600px; }
.fmt-square { width: 100%; max-width: 320px; min-height: 260px; }
.fmt-horizontal { width: 100%; min-height: 96px; }
.fmt-horizontal { flex-direction: row; align-items: center; }
.fmt-horizontal .ad-tag { writing-mode: vertical-rl; transform: rotate(180deg); }
.fmt-horizontal .ad-ph { flex: 1; min-height: 72px; }
</style>
