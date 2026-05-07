<script setup lang="ts">
import XYPad from './XYPad.vue'
import Visualizer from './Visualizer.vue'
import ChaosKnob from './ChaosKnob.vue'
import AutoArp from './AutoArp.vue'
import RandomMelody from './RandomMelody.vue'
</script>

<template>
  <div class="stage">
    <div class="col">
      <XYPad />
      <ChaosKnob />
    </div>
    <div class="col">
      <Visualizer />
      <AutoArp />
    </div>
    <div class="col wide">
      <RandomMelody />
    </div>
  </div>
</template>

<style scoped>
.stage {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(280px, 1fr);
  gap: 1rem;
  width: 100%;
  max-width: 1100px;
  margin: 0 auto;
  align-items: start;
}
.col { display: flex; flex-direction: column; gap: 1rem; }
.col.wide { grid-column: 1 / -1; }
@media (max-width: 760px) {
  .stage { grid-template-columns: 1fr; }
  .col.wide { grid-column: auto; }
}
</style>
