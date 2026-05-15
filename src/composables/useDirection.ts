import { ref, onMounted, onUnmounted } from 'vue'

/**
 * Reactive `isRtl` flag that mirrors the current `html[dir]` attribute.
 *
 * The i18n switcher sets `document.documentElement.dir = 'rtl'` when the
 * user picks Arabic; CSS picks that up via the `html[dir='rtl']`
 * attribute selector, but components that compute `style="left: X%"` /
 * `transform: translateX(...)` inline from a numeric value (XY pad dot,
 * beat-maker playhead, pitch needles, pitch-bend indicator) need a
 * runtime check too — `left: 30%` is physical, so an RTL parent doesn't
 * flip it automatically.
 *
 * Watches the attribute via MutationObserver so a live locale switch
 * propagates without reload.
 */
export function useDirection() {
  const isRtl = ref(false)

  function read(): boolean {
    if (typeof document === 'undefined') return false
    return document.documentElement.dir === 'rtl'
  }

  let observer: MutationObserver | null = null

  onMounted(() => {
    isRtl.value = read()
    observer = new MutationObserver(() => {
      const next = read()
      if (next !== isRtl.value) isRtl.value = next
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['dir'] })
  })

  onUnmounted(() => {
    observer?.disconnect()
    observer = null
  })

  return { isRtl }
}
