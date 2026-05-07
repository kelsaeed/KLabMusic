import { ref } from 'vue'

export type ToastType = 'loading' | 'success' | 'error' | 'info'

export interface Toast {
  id: string
  type: ToastType
  title: string
  subtitle?: string
}

const toasts = ref<Toast[]>([])

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function useToast() {
  function show(input: Omit<Toast, 'id'> & { duration?: number }): string {
    const id = uid()
    toasts.value.push({ id, type: input.type, title: input.title, subtitle: input.subtitle })
    if (input.duration && input.duration > 0) {
      setTimeout(() => dismiss(id), input.duration)
    }
    return id
  }

  function update(id: string, patch: Partial<Omit<Toast, 'id'>> & { duration?: number }): void {
    const idx = toasts.value.findIndex((t) => t.id === id)
    if (idx < 0) return
    toasts.value[idx] = { ...toasts.value[idx], ...patch }
    if (patch.duration && patch.duration > 0) {
      setTimeout(() => dismiss(id), patch.duration)
    }
  }

  function dismiss(id: string): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  function clear(): void {
    toasts.value = []
  }

  return { toasts, show, update, dismiss, clear }
}
