<!-- In App.vue -->
<script setup lang="ts">
import { ref } from "vue";
import MilkySlider from "./components/MilkySlider.vue";
import AdventCalendarTile from "./components/AdventCalendarTile.vue";
// import AdventCalendarTile2 from "./components/AdventCalendarTile2.vue";
// import data from "./assets/data.json";

type Slide = {
  title: string;
  image?: {
    id?: number;
    url: string;
  };
};
type SliderApi = {
  next: () => void;
  prev: () => void;
  goTo: (i: number) => void;
  recalculate: () => void;
};

const slider = ref<SliderApi | null>(null); // <-- get access to MilkySlider API
const nextSlide = () => slider.value?.next();
const prevSlide = () => slider.value?.prev();

const currentIdx = ref(0);

const items = ref<Slide[]>([
  {
    title: "One 1",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    title: "Two 1",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { title: "Four 1" },
  {
    title: "Three 1",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { title: "Five 1" },
  { title: "Seven 1" },
  { title: "Eight 1" },
  { title: "Nine 1" },
  { title: "Six 1", image: { url: "https://" } },
  {
    title: "One 2",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    title: "Two 2",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { title: "Four 2" },
  {
    title: "Three 2",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { title: "Five 2" },
  { title: "Seven 2" },
  { title: "Eight 2" },
  { title: "Nine 2" },
  { title: "Six 2", image: { url: "https://" } },
  {
    title: "One 3",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    title: "Two 3",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { title: "Four 3" },
  {
    title: "Three 3",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
]);
</script>

<template>
  <div class="controls">
    <button type="button" @click="prevSlide">Prev</button>
    <button type="button" @click="nextSlide">Next</button>
  </div>

  <MilkySlider
    ref="slider"
    v-model="currentIdx"
    :items="items"
    :per-view="4"
    :loop="true"
    :spacing="15"
    :lazy-offscreen="true"
    :preload-neighbors="2"
    :overscanEachSide="2"
  >
    <template #slide="{ item, shouldLoad }">
      <AdventCalendarTile :data="item" :eager="shouldLoad" />
    </template>
  </MilkySlider>
</template>

<style scoped>
.controls {
  display: flex;
  gap: 8px;
  margin: 12px 0;
}

.controls > button {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid #bbb;
  background: #fff;
  cursor: pointer;
}

.controls > button:active {
  transform: translateY(1px);
}
</style>
