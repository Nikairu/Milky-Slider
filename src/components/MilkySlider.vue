<template>
  <div
    ref="rootEl"
    data-role="flat-carousel"
    :class="[
      'relative block w-full touch-pan-y overflow-hidden',
      `before:block before:pt-[calc(var(--slot-base-w)*var(--center-scale)*var(--ar-ratio))] before:content-['']`,
      { 'js-active': isJsModeActive },
    ]"
    :style="rootCssVars"
    @mousedown="onPointerDown"
    @touchstart="onPointerDown"
  >
    <div class="absolute inset-0 grid h-full w-full">
      <div
        v-for="vis in visibleItems"
        :key="itemKeyFor(vis)"
        data-role="flat-slot"
        :data-rel="vis.relSlot"
        :style="slotCssVars(vis.relSlot)"
        :class="[
          'pointer-events-auto absolute top-0 will-change-[transform] [contain:content]',
          'aspect-[var(--ar-w)_/_var(--ar-h)]',
          '[width:var(--slot-base-w)]',
          'z-[calc(1000_-_(var(--slot-abs,0)*10))]',
          !isJsModeActive
            ? [
                'left-1/2',
                '[margin-left:calc((var(--slot-base-w)*-0.5)_+_var(--x))]',
              ]
            : [
                'left-0',
                'ml-0',
                '[transform:var(--slot-transform,translate3d(-100000px,0,0))!important]',
              ],
        ]"
      >
        <div
          data-role="flat-inner"
          :class="[
            'h-full w-full origin-center rounded-[12px] shadow-[0_6px_18px_rgba(0,0,0,0.12)] [contain:content]',
            '[transform:scale(var(--scale))]',
            '[opacity:var(--opacity)]',
            isJsModeActive
              ? isDragging || !!rafHandle
                ? 'transition-none'
                : 'transition-opacity transition-transform duration-200 ease-out'
              : 'transition-none',
            defaultClass(vis),
          ]"
          :style="innerCssVars()"
        >
          <slot
            name="slide"
            v-bind="{
              item: items[vis.wrappedIndex],
              index: vis.wrappedIndex,
              relSlot: vis.relSlot,
              isActive: Math.round(slideOffset) === vis.absIndex,
              scale: isJsModeActive ? innerScale(vis.relSlot) : undefined,
              shouldLoad: shouldLoadSticky(vis.relSlot, vis.wrappedIndex),
            }"
          >
            {{ items[vis.wrappedIndex] }}
          </slot>
        </div>
      </div>
    </div>

    <div
      v-if="warmParked.length"
      aria-hidden="true"
      class="pointer-events-none absolute -left-[100000px] -top-[100000px] h-px w-px opacity-0"
    >
      <div
        v-for="idx in warmParked"
        :key="'warm-' + idx"
        class="h-px w-px overflow-hidden"
      >
        <slot
          name="slide"
          v-bind="{
            item: items[idx],
            index: idx,
            relSlot: 9999,
            isActive: false,
            scale: undefined,
            shouldLoad: true,
          }"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
import {
  ref,
  computed,
  toRef,
  watch,
  withDefaults,
  defineProps,
  defineEmits,
  defineExpose,
  nextTick,
  onBeforeUnmount,
} from "vue";

import { useLooping } from "../composables/useLooping";
import { useWarmCache } from "../composables/useWarmCache";
import { useGeometryVars } from "../composables/useGeometryVars";
import { useRenderer } from "../composables/useRenderer";
import { useGestures } from "../composables/useGestures";

/* ======================== Props ======================== */
const props = withDefaults(
  defineProps<{
    items?: (T | null | undefined)[] | undefined;
    perView?: number;
    spacing?: number;
    centerScale?: number;
    sideScale?: number;
    loop?: boolean;
    modelValue?: number;
    snapMs?: number;
    itemKey?: ((item: T | null | undefined, absIndex: number) => any) | null;
    lazyOffscreen?: boolean;
    preloadNeighbors?: number;
    overscanEachSide?: number;
    expandOnDrag?: boolean;
  }>(),
  {
    perView: 3.7,
    spacing: 15,
    centerScale: 1,
    sideScale: 0.7,
    loop: true,
    modelValue: 0,
    snapMs: 250,
    itemKey: null,
    lazyOffscreen: false,
    preloadNeighbors: 2,
    overscanEachSide: 20,
    expandOnDrag: true,
  }
);
const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "change", value: number): void;
}>();

/* ======================== State & prop refs ======================== */
const rootEl = ref<HTMLElement | null>(null);
const isJsModeActive = ref(false);
const slideOffset = ref(props.modelValue!);
const perViewRef = toRef(props, "perView");
const spacingRef = toRef(props, "spacing");
const centerScaleRef = toRef(props, "centerScale");
const sideScaleRef = toRef(props, "sideScale");
const loopRef = toRef(props, "loop");
const snapMsRef = toRef(props, "snapMs");
const itemsArr = computed<Readonly<(T | null | undefined)[]>>(
  () => props.items ?? []
);
const items = itemsArr;

/* ======================== Relative window ======================== */
const rawItemCount = computed(() => itemsArr.value.length);
const rawHasItems = computed(() => rawItemCount.value > 0);
const rawCopiesModeActive = computed(
  () =>
    loopRef.value &&
    rawHasItems.value &&
    (perViewRef.value ?? 0) >= rawItemCount.value
);

const relativeWindow = computed(() => {
  if (!rawHasItems.value) return [] as number[];
  const pv = Math.max(1, perViewRef.value!);
  const visibleCount = Math.ceil(pv);
  const interactive = props.expandOnDrag;
  const extraEachSide = Math.max(props.overscanEachSide!, interactive ? 2 : 0);
  let count = visibleCount + 2 * extraEachSide;

  if (rawCopiesModeActive.value) {
    const min = visibleCount + 2;
    if (count < min) count = min;
  } else if (loopRef.value) {
    count = Math.min(count, rawItemCount.value);
  }

  const leftCount = Math.floor((count - 1) / 2);
  const out: number[] = [];
  for (let k = -leftCount; k <= leftCount; k++) out.push(k);
  return out;
});

/* ======================== Looping & indices ======================== */
const looping = useLooping(
  loopRef,
  perViewRef,
  itemsArr,
  relativeWindow,
  props.itemKey
);
const itemKeyFor = (vis: { absIndex: number; wrappedIndex: number }) =>
  looping.itemKeyFor(vis);
const centerIndex = computed(() => Math.round(slideOffset.value));

/* ======================== Visible items ======================== */
type VisibleItem = { absIndex: number; wrappedIndex: number; relSlot: number };
const visibleItems = computed<VisibleItem[]>(() => {
  const out: VisibleItem[] = [];
  if (!looping.hasItems.value) return out;
  const centerAbs = centerIndex.value;
  for (const rel of relativeWindow.value) {
    const abs = centerAbs + rel;
    if (!loopRef.value && (abs < 0 || abs > looping.itemCount.value - 1))
      continue;
    const wrapped = looping.wrapIndexCircular(abs);
    out.push({ absIndex: abs, wrappedIndex: wrapped, relSlot: rel });
  }
  return out;
});

/* ======================== Geometry & Vars ======================== */
const {
  containerWidth,
  baseSlotWidth,
  rootCssVars,
  innerScale: _innerScale,
  slotCssVars,
  innerCssVars,
  measureGeometry,
} = useGeometryVars(
  rootEl,
  perViewRef,
  spacingRef,
  centerScaleRef,
  sideScaleRef,
  looping.hasItems,
  isJsModeActive
);

const fractionalOffset = () =>
  slideOffset.value - Math.round(slideOffset.value);
const innerScale = (rel: number) => _innerScale(rel, fractionalOffset());

/* ======================== Warm cache / sticky load ======================== */
const { warmParked, shouldLoadSticky } = useWarmCache(
  perViewRef,
  computed(() => props.preloadNeighbors ?? 0),
  computed(() =>
    visibleItems.value.map((v) => ({ wrappedIndex: v.wrappedIndex }))
  ),
  slideOffset
);

/* ======================== Renderer ======================== */
const { rebuildDomMap, renderFrame, scheduleRender } = useRenderer(
  rootEl,
  isJsModeActive,
  looping.hasItems,
  baseSlotWidth,
  () => spacingRef.value!,
  () => containerWidth.value,
  fractionalOffset,
  (rel, frac) => _innerScale(rel, frac)
);

/* ======================== Gestures & animation ======================== */
const emitUpdate = (v: number) => emit("update:modelValue", v);
const emitChange = (v: number) => emit("change", v);

const {
  isDragging,
  rafHandle,
  animateToIndex,
  onPointerDown,
  enterJsMode,
  teardown,
} = useGestures(
  rootEl, // NEW: pass the root element
  isJsModeActive,
  looping.hasItems,
  loopRef,
  looping.itemCount,
  snapMsRef,
  slideOffset,
  measureGeometry,
  rebuildDomMap,
  renderFrame,
  scheduleRender,
  (rel, frac) => _innerScale(rel, frac),
  baseSlotWidth,
  () => spacingRef.value!,
  emitUpdate,
  emitChange,
  looping.wrapIndexCircular
);

/* ======================== Watchers (flush DOM before remapping) ======================== */
watch(
  () => props.modelValue,
  (v) => {
    if (!looping.hasItems.value) {
      slideOffset.value = 0;
      return;
    }
    if (v == null) return;
    if (loopRef.value) {
      animateToIndex(
        looping.nearestEquivalentAbsoluteIndex(
          slideOffset.value,
          looping.wrapIndexCircular(v)
        )
      );
    } else {
      animateToIndex(Math.max(0, Math.min(looping.itemCount.value - 1, v)));
    }
  }
);

watch(centerIndex, async () => {
  await nextTick();
  rebuildDomMap();
  scheduleRender();
});
watch(relativeWindow, async () => {
  await nextTick();
  rebuildDomMap();
  scheduleRender();
});

watch([perViewRef, spacingRef, centerScaleRef, sideScaleRef], () => {
  if (isJsModeActive.value) {
    measureGeometry();
    scheduleRender();
  }
});
watch(looping.itemCount, () => {
  if (!loopRef.value && looping.hasItems.value)
    slideOffset.value = Math.max(
      0,
      Math.min(looping.itemCount.value - 1, Math.round(slideOffset.value))
    );
  if (isJsModeActive.value) {
    measureGeometry();
    scheduleRender();
  }
});

/* ======================== Public API ======================== */
const next = async () => {
  if (!isJsModeActive.value) await enterJsMode();
  animateToIndex(Math.round(slideOffset.value) + 1);
};
const prev = async () => {
  if (!isJsModeActive.value) await enterJsMode();
  animateToIndex(Math.round(slideOffset.value) - 1);
};
const goTo = async (i: number) => {
  if (!isJsModeActive.value) await enterJsMode();
  animateToIndex(i);
};
const recalculate = () => {
  if (!isJsModeActive.value) return;
  measureGeometry();
  scheduleRender();
};
defineExpose({ next, prev, goTo, recalculate });

onBeforeUnmount(() => {
  teardown(); // NEW: clean up observers and listeners
});

/* ======================== Slot helpers ======================== */
const numberClass = (idx: number) => {
  const k = (((idx % 6) + 6) % 6) + 1;
  return `number-slide${k}`;
};
const defaultClass = (vis: { absIndex: number; wrappedIndex: number }) => {
  if (!looping.hasItems.value) return "";
  const idx = loopRef.value ? vis.wrappedIndex : vis.absIndex;
  if (!loopRef.value && (idx < 0 || idx >= looping.itemCount.value)) return "";
  return numberClass(idx);
};
</script>
