import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { UserProfile } from '@/lib/types'

export const useUserStore = defineStore('user', () => {
  const profile = ref<UserProfile | null>(null)
  const isLoggedIn = computed(() => profile.value !== null)

  function setProfile(p: UserProfile | null) {
    profile.value = p
  }

  function clear() {
    profile.value = null
  }

  return { profile, isLoggedIn, setProfile, clear }
})
