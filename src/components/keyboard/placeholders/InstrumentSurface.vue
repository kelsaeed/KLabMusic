<script setup lang="ts">
// TODO(visual-asset): each variant below is a CSS-gradient placeholder
// standing in for a real instrument visual. When the asset pack lands
// in Phase 11+, replace the per-variant background gradients with the
// matching SVG / PNG / Lottie / Canvas resource. The parent pads only
// see the `variant` prop and the default slot — they don't depend on
// the specific markup here, so swapping artwork is a one-file change.
defineProps<{
  /** Which instrument body to render. Maps to a CSS class below. */
  variant:
    | 'violin'
    | 'cello'
    | 'oud'
    | 'harp'
    | 'harmonica'
    | 'trumpet'
    | 'tambourine'
    | 'clarinet'
    | 'flute'
    | 'realDrums'
  /** When true the placeholder takes a circular/oval shape (drumheads,
   *  tambourine), otherwise a rounded rectangle. */
  shape?: 'round' | 'rect'
}>()
</script>

<template>
  <div class="surface" :class="[variant, shape ?? 'rect']">
    <slot />
  </div>
</template>

<style scoped>
.surface {
  position: relative;
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  /* Touch-action goes on the gesture layer the parent renders inside —
     it's not enforced here so non-gesture surfaces still scroll. */
}
.surface.rect { border-radius: var(--radius); }
.surface.round { border-radius: 50%; }

/* Wood-grained variants: violin, cello, oud, harp, harmonica use
   warm-tone gradients, dimming for the lower-pitched bodies. */
.surface.violin {
  background:
    linear-gradient(180deg, rgba(120, 80, 40, 0.18) 0%, rgba(60, 30, 10, 0.32) 100%),
    var(--bg-elevated);
}
.surface.cello {
  background:
    linear-gradient(180deg, rgba(80, 40, 20, 0.32) 0%, rgba(40, 18, 6, 0.45) 100%),
    var(--bg-elevated);
}
.surface.oud {
  background:
    linear-gradient(180deg, rgba(120, 70, 30, 0.32) 0%, rgba(50, 25, 10, 0.5) 100%),
    var(--bg-elevated);
}
.surface.harp {
  background:
    linear-gradient(180deg, rgba(180, 140, 80, 0.18) 0%, rgba(60, 40, 20, 0.4) 100%),
    var(--bg-elevated);
}
.surface.harmonica {
  background:
    linear-gradient(180deg, rgba(120, 120, 140, 0.25) 0%, rgba(40, 40, 60, 0.45) 100%),
    var(--bg-elevated);
}

/* Brass / metal / synth variants — cooler tones. */
.surface.trumpet {
  background:
    linear-gradient(180deg, rgba(220, 170, 60, 0.18) 0%, rgba(80, 50, 20, 0.4) 100%),
    var(--bg-elevated);
}
.surface.tambourine {
  background: var(--bg-elevated);
}
.surface.clarinet {
  background: linear-gradient(180deg, rgba(20, 16, 28, 0.4) 0%, rgba(10, 8, 16, 0.6) 100%);
}
.surface.flute {
  background: linear-gradient(90deg, rgba(140, 140, 160, 0.18) 0%, rgba(60, 60, 80, 0.32) 100%);
}
.surface.realDrums {
  background: var(--bg-elevated);
}
</style>
