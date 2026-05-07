import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BindingSet, KeyBinding } from '@/lib/types'
import { PRESETS, normalizeKey } from '@/lib/keybindings'

export const useKeyBindingsStore = defineStore('keybindings', () => {
  const sets = ref<BindingSet[]>(PRESETS.map((p) => ({ ...p, bindings: [...p.bindings] })))
  const activeSetId = ref<string>(PRESETS[0].id)
  const activeKey = ref<string | null>(null)
  const editingKey = ref<string | null>(null)

  const activeSet = computed(() => sets.value.find((s) => s.id === activeSetId.value) ?? sets.value[0])
  const bindingMap = computed(() => {
    const map = new Map<string, KeyBinding>()
    for (const b of activeSet.value.bindings) map.set(normalizeKey(b.key), b)
    return map
  })

  function getBinding(key: string): KeyBinding | undefined {
    return bindingMap.value.get(normalizeKey(key))
  }

  function setActiveSet(id: string) {
    if (sets.value.some((s) => s.id === id)) activeSetId.value = id
  }

  function upsertBinding(b: KeyBinding) {
    const set = activeSet.value
    const idx = set.bindings.findIndex((x) => normalizeKey(x.key) === normalizeKey(b.key))
    if (idx >= 0) set.bindings[idx] = b
    else set.bindings.push(b)
  }

  function clearBinding(key: string) {
    const set = activeSet.value
    set.bindings = set.bindings.filter((b) => normalizeKey(b.key) !== normalizeKey(key))
  }

  function addSet(set: BindingSet) {
    sets.value.push(set)
    activeSetId.value = set.id
  }

  function removeSet(id: string) {
    sets.value = sets.value.filter((s) => s.id !== id)
    if (activeSetId.value === id) activeSetId.value = sets.value[0]?.id ?? ''
  }

  function renameSet(id: string, name: string) {
    const s = sets.value.find((x) => x.id === id)
    if (s) s.name = name
  }

  function loadSets(next: BindingSet[]) {
    if (next.length === 0) return
    sets.value = next
    activeSetId.value = next[0].id
  }

  return {
    sets,
    activeSetId,
    activeSet,
    activeKey,
    editingKey,
    bindingMap,
    getBinding,
    setActiveSet,
    upsertBinding,
    clearBinding,
    addSet,
    removeSet,
    renameSet,
    loadSets,
  }
})
