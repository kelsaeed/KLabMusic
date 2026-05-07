import { ref } from 'vue'
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { useUserStore } from '@/stores/user'
import type { Session, User } from '@supabase/supabase-js'

const initialised = ref(false)

function profileFromUser(user: User) {
  const meta = (user.user_metadata ?? {}) as { display_name?: string; full_name?: string; avatar_url?: string }
  return {
    id: user.id,
    email: user.email ?? '',
    displayName: meta.display_name || meta.full_name || (user.email?.split('@')[0] ?? 'Player'),
    avatarUrl: meta.avatar_url,
  }
}

export function useAuth() {
  const userStore = useUserStore()

  function applySession(session: Session | null) {
    if (session?.user) userStore.setProfile(profileFromUser(session.user))
    else userStore.clear()
  }

  async function init() {
    if (initialised.value || !isSupabaseConfigured) return
    initialised.value = true
    const { data } = await supabase.auth.getSession()
    applySession(data.session)
    supabase.auth.onAuthStateChange((_event, session) => applySession(session))
  }

  async function signUp(email: string, password: string, displayName: string) {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    })
    if (error) return { ok: false, message: error.message }
    if (data.session) applySession(data.session)
    return {
      ok: true,
      message: data.session ? 'Signed in' : 'Check your email to confirm your account',
    }
  }

  async function signIn(email: string, password: string) {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { ok: false, message: error.message }
    applySession(data.session)
    return { ok: true, message: 'Signed in' }
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured) return { ok: false, message: 'Supabase not configured' }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + '/app' },
    })
    if (error) return { ok: false, message: error.message }
    return { ok: true, message: 'Redirecting…' }
  }

  async function signOut() {
    if (!isSupabaseConfigured) return
    await supabase.auth.signOut()
    userStore.clear()
  }

  return { init, signUp, signIn, signInWithGoogle, signOut }
}
