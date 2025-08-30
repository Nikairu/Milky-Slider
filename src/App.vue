<!-- In App.vue -->
<script setup lang="ts">
import { ref } from "vue";
import MilkySlider from "./components/MilkySlider.vue";
import AdventCalendarTile from "./components/AdventCalendarTile.vue";
import AdventCalendarTile2 from "./components/AdventCalendarTile2.vue";
import data from "./assets/data.json";

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

const slider1 = ref<SliderApi | null>(null);
const nextSlide1 = () => slider1.value?.next();
const prevSlide1 = () => slider1.value?.prev();

const currentIdx = ref(0);
const currentIdx1 = ref(0);

const items = ref<Slide[]>([
  {
    id: 0,
    title: "One 1",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    id: 1,
    title: "Two 1",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { id: 2, title: "Four 1" },
  {
    id: 3,
    title: "Three 1",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { id: 4, title: "Five 1" },
  { id: 5, title: "Seven 1" },
  { id: 6, title: "Eight 1" },
  { id: 7, title: "Nine 1" },
  { id: 8, title: "Six 1", image: { url: "https://" } },
  {
    id: 9,
    title: "One 2",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    id: 10,
    title: "Two 2",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { id: 11, title: "Four 2" },
  {
    id: 12,
    title: "Three 2",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { id: 13, title: "Five 2" },
  { id: 14, title: "Seven 2" },
  { id: 15, title: "Eight 2" },
  { id: 16, title: "Nine 2" },
  { id: 17, title: "Six 2", image: { url: "https://" } },
  {
    id: 18,
    title: "One 3",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    id: 19,
    title: "Two 3",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { id: 20, title: "Four 3" },
  {
    id: 21,
    title: "Three 3",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { id: 22, title: "Five 3" },
  { id: 23, title: "Seven 3" },
  { id: 24, title: "Eight 3" },
  { id: 25, title: "Nine 3" },
  { id: 26, title: "Six 3", image: { url: "https://" } },
  {
    id: 27,
    title: "One 4",
    image: { url: "https://static.photos/nature/320x240/0" },
  },
  {
    id: 28,
    title: "Two 4",
    image: { url: "https://static.photos/nature/1024x576/96" },
  },
  { id: 29, title: "Four 4" },
  {
    id: 30,
    title: "Three 4",
    image: { url: "https://static.photos/nature/1200x630/176" },
  },
  { id: 31, title: "Five 4" },
  { id: 32, title: "Seven 4" },
  { id: 33, title: "Eight 4" },
  { id: 34, title: "Nine 4" },
  { id: 35, title: "Six 4", image: { url: "https://" } },
]);
</script>

<template>
  <!-- <div class="controls">
    <button type="button" @click="prevSlide">Prev</button>
    <button type="button" @click="nextSlide">Next</button>
  </div> -->

  <MilkySlider
    ref="slider"
    v-model="currentIdx"
    :items="items"
    :per-view="3.7"
    :loop="true"
    :spacing="15"
    :initial-width="600"
    :lazy-offscreen="true"
    :preload-neighbors="1"
  >
    <template #slide="{ item, shouldLoad }">
      <AdventCalendarTile :data="item" :eager="shouldLoad" />
    </template>
  </MilkySlider>

  <!-- <div class="controls">
    <button type="button" @click="prevSlide1">Prev</button>
    <button type="button" @click="nextSlide1">Next</button>
  </div> -->

  <!-- <MilkySlider
    ref="slider1"
    v-model="currentIdx1"
    :items="data.adventCalendarTeaserTabs"
    :per-view="3"
    :spacing="15"
    :initial-width="600"
    :lazy-offscreen="true"
    :preload-neighbors="1"
  >
    <template #slide="{ item, shouldLoad }">
      <AdventCalendarTile2 :data="item" :eager="shouldLoad" />
    </template>
  </MilkySlider> -->
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
