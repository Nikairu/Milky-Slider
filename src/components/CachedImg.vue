<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{
  src?: string;
  alt?: string;
  eager?: boolean; // true → allow network now
  width?: number; // optional intrinsic size for CLS control
  height?: number; // optional intrinsic size for CLS control
}>();

const effectiveSrc = computed(() => (props.eager ? props.src : undefined));
</script>

<template>
  <img
    :src="effectiveSrc"
    :alt="alt"
    decoding="async"
    :loading="eager ? 'eager' : 'lazy'"
    :fetchpriority="eager ? 'high' : 'low'"
    :width="width || 0"
    :height="height || 0"
    style="width: 100%; height: 100%; object-fit: cover; aspect-ratio: auto 1/1"
  />
</template>
