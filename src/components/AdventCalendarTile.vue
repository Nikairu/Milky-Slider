<script setup lang="ts">
import { computed } from "vue";
import CachedImg from "./CachedImg.vue";

const props = defineProps<{
  data: { id: number; title: string; image?: { id: number; url: string } };
  eager?: boolean;
}>();

const hasImage = computed(() => {
  const url = props.data.image?.url;
  return typeof url === "string" && url.trim().length > 0;
});
</script>

<template>
  <div class="tile">
    <CachedImg
      v-if="hasImage"
      :src="data.image!.url"
      :alt="data.title"
      :eager="eager ?? false"
      :style="{ pointerEvents: 'none' }"
    />
    <div class="label">{{ data.title }}</div>
  </div>
</template>

<style scoped>
.tile {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  border-radius: 12px;
}

.label {
  position: absolute;
  left: 12px;
  bottom: 12px;
  font-weight: 600;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}
</style>
