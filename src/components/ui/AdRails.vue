<script setup lang="ts">
import AdSlot from './AdSlot.vue'

/**
 * Two fixed sidebar ad rails pinned to the viewport edges, vertically
 * centred below the nav. Fixed positioning means ZERO impact on the
 * app's existing flex/grid flow — no reflow risk to the DAW. They only
 * appear on screens wide enough to clearly have room beside the centred
 * content (≥1500px), so they never crowd the workspace on laptops,
 * tablets, or phones. Logical `inset-inline-*` keeps them correct in
 * Arabic RTL automatically. Slots ship empty → neutral placeholder
 * only (no script/network); the operator fills the `slot` ids and sets
 * VITE_ADSENSE_CLIENT to go live (see AdSlot.vue's policy note).
 */
</script>

<template>
  <div class="ad-rails" aria-hidden="false">
    <div class="rail rail-start">
      <AdSlot format="rail" slot="" />
    </div>
    <div class="rail rail-end">
      <AdSlot format="rail" slot="" />
    </div>
  </div>
</template>

<style scoped>
/* Hidden by default; only revealed when the viewport is wide enough
   that a 168px rail + gap fits beside the ~1200px max-width content
   without touching it. */
.rail {
  display: none;
}
.rail {
  position: fixed;
  top: 50%;
  transform: translateY(-50%);
  z-index: 90; /* under modals/drawers (≥300), over page content */
  /* Logical insets → start rail hugs the reading-start edge, end rail
     the reading-end edge; auto-mirrors in RTL. */
}
.rail-start { inset-inline-start: 12px; }
.rail-end { inset-inline-end: 12px; }

@media (min-width: 1500px) {
  .rail { display: block; }
}

/* Very tall content / short viewports: never let a 600px rail overflow
   the screen — cap it and let the unit scroll internally if needed. */
@media (max-height: 720px) {
  .rail { display: none; }
}
@media (min-width: 1500px) and (min-height: 721px) {
  .rail { display: block; }
}
</style>
