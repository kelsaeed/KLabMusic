<script setup lang="ts">
import { useMultiplayerStore } from '@/stores/multiplayer'

const store = useMultiplayerStore()
</script>

<template>
  <div class="reactions-layer" aria-hidden="true">
    <span
      v-for="r in store.reactions"
      :key="r.id"
      class="floater"
      :style="{ left: r.x + '%', color: r.authorColor }"
    >
      {{ r.emoji }}
    </span>
  </div>
</template>

<style scoped>
.reactions-layer {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 90;
  overflow: hidden;
}
.floater {
  position: absolute;
  bottom: 5%;
  font-size: 2.5rem;
  animation: rise 2.4s ease-out forwards;
  text-shadow: 0 0 12px currentColor;
}
@keyframes rise {
  0% { transform: translate(-50%, 0) scale(0.6); opacity: 0; }
  20% { transform: translate(-50%, -40px) scale(1.1); opacity: 1; }
  100% { transform: translate(calc(-50% + 30px), -90vh) scale(0.8); opacity: 0; }
}
</style>
