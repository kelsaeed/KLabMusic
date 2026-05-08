import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
  },
  build: {
    chunkSizeWarningLimit: 800,
    // Strip the heavy audio/data chunks (tone ~277 KB, smplr, supabase) out
    // of the modulepreload list. Without this Vite emits <link rel="modulepreload">
    // for them in index.html and the browser fetches them on EVERY first paint
    // — even on the home page where audio isn't needed yet. They still load
    // when their owning lazy chunk is first imported (AudioStage/Beat Maker etc).
    modulePreload: {
      resolveDependencies(_filename, deps) {
        return deps.filter((dep) => {
          if (/\/tone-[^/]+\.js$/.test(dep)) return false
          if (/\/smplr-[^/]+\.js$/.test(dep)) return false
          if (/\/supabase-[^/]+\.js$/.test(dep)) return false
          if (/\/lamejs-[^/]+\.js$/.test(dep)) return false
          return true
        })
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          tone: ['tone'],
          smplr: ['smplr'],
          supabase: ['@supabase/supabase-js'],
          vue: ['vue', 'vue-router', 'pinia', 'vue-i18n'],
        },
      },
    },
  },
})
