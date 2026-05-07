<script setup lang="ts">
import AppNav from '@/components/AppNav.vue'

defineProps<{ code: string }>()
</script>

<template>
  <div class="room">
    <AppNav />
    <main class="stage">
      <h2>Room {{ code }}</h2>
      <p>Multiplayer wiring lands in Phase 8.</p>
    </main>
  </div>
</template>

<style scoped>
.room {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.stage {
  flex: 1;
  display: grid;
  place-items: center;
  padding: 2rem;
  text-align: center;
}
.stage h2 {
  font-family: var(--font-mono);
  color: var(--accent-primary);
}
.stage p {
  color: var(--text-muted);
}
</style>
