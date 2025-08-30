<template>
  <div
    ref="root"
    class="flat-root"
    @mousedown="onPointerDown"
    @touchstart="onPointerDown"
  >
    <div class="flat-stage">
      <!-- Render by logical item; stable per-item keys (with copy index when needed) -->
      <div
        v-for="vis in visibleItems"
        :key="itemKeyFor(vis)"
        class="flat-slot"
        :style="slotStyle(vis.rel)"
      >
        <div
          class="flat-inner"
          :class="defaultClass(vis)"
          :style="slotInnerStyle(vis.rel)"
        >
          <slot
            name="slide"
            v-bind="{
              item: items[vis.wr],
              index: vis.wr,
              relSlot: vis.rel,
              isActive: Math.round(offset) === vis.abs, // TODO: REVIEW - rounding during animation may cause transient double-active state
              scale: innerScale(vis.rel),
              shouldLoad: shouldLoad(vis.rel),
            }"
          >
            {{ items[vis.wr] }}
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * FlatCarousel (script setup)
 * Touch/mouse draggable, center-scaled, overscanned, optionally looping carousel.
 * Public API: next, prev, goTo, recalculate.
 */

import {
  ref,
  computed,
  onMounted,
  onBeforeUnmount,
  toRef,
  watch,
  defineProps,
  defineEmits,
  defineExpose,
  nextTick,
} from "vue";

/* ========================
 * Props (public configuration)
 * ======================== */
const props = defineProps({
  items: { type: Array, default: () => [] },
  perView: { type: Number, default: 3 },
  spacing: { type: Number, default: 15 },
  centerScale: { type: Number, default: 1 },
  sideScale: { type: Number, default: 0.7 },
  loop: { type: Boolean, default: false },
  modelValue: { type: Number, default: 0 },
  snapMs: { type: Number, default: 250 },
  itemKey: { type: Function, default: null }, // (item, absIndex) => any
  initialWidth: { type: Number, default: 600 },

  // lazy + overscan
  lazyOffscreen: { type: Boolean, default: false },
  preloadNeighbors: { type: Number, default: 2 },
  overscanEachSide: { type: Number, default: 1 },

  // optional: grow DOM window while dragging (kept from previous iterations)
  expandOnDrag: { type: Boolean, default: true },
});

const emit = defineEmits(["update:modelValue", "change"]);

/* ========================
 * Member variables (state)
 * ======================== */
const root = ref<HTMLElement | null>(null);
const containerWidth = ref(0);
const slotBaseWidth = ref(0);
const offset = ref(props.modelValue);
const isDragging = ref(false);
const lastPointerX = ref(0);
const rafId = ref<number | null>(null);

/* ========================
 * Props as Refs
 * ======================== */
const itemsRef = toRef(props, "items");
const perViewRef = toRef(props, "perView");
const spacingRef = toRef(props, "spacing");
const centerScaleRef = toRef(props, "centerScale");
const sideScaleRef = toRef(props, "sideScale");
const loopRef = toRef(props, "loop");
const snapMsRef = toRef(props, "snapMs");

/* ========================
 * Derived state (computed)
 * ======================== */
const itemCount = computed(() => itemsRef.value.length);
const hasItems = computed(() => itemCount.value > 0);

// When looping and rendering copies because perView >= n
const copiesActive = computed(
  () => loopRef.value && hasItems.value && perViewRef.value >= itemCount.value
);

/* ========================
 * Internal helpers (pure or side-effect free)
 * ======================== */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapIndex = (i: number) => {
  if (!hasItems.value) return 0;
  const m = itemCount.value;
  return ((i % m) + m) % m;
};
const fracOffset = () => offset.value - Math.round(offset.value);

const nearestWrappedIndex = (currentAbs: number, targetWrapped: number) => {
  if (!hasItems.value) return 0;
  const m = itemCount.value;
  const base = Math.floor(currentAbs / m) * m + targetWrapped;
  const candidates = [base - m, base, base + m];
  let best = candidates[0];
  let bestDist = Math.abs(best - currentAbs);
  for (const cand of candidates) {
    const d = Math.abs(cand - currentAbs);
    if (d < bestDist) {
      best = cand;
      bestDist = d;
    }
  }
  return best;
};

/** Compute relative window of slots to render (symmetric around center). */
const relWindow = computed(() => {
  if (!hasItems.value) return [] as number[];

  const perViewVal = Math.max(1, perViewRef.value);
  const hasFraction = perViewVal % 1 !== 0;
  const visibleCount = Math.max(
    1,
    Math.ceil(perViewVal) + (hasFraction ? 1 : 0)
  );

  const interactive = props.expandOnDrag && (isDragging.value || !!rafId.value);
  const interactiveExtra = interactive ? 2 : 0;
  const extraEachSide = Math.max(props.overscanEachSide, interactiveExtra);

  let windowCount = visibleCount + 2 * extraEachSide;

  if (copiesActive.value) {
    const minCount = Math.ceil(perViewVal) + 2;
    if (windowCount < minCount) windowCount = minCount;
  } else if (loopRef.value) {
    windowCount = Math.min(windowCount, itemCount.value);
  }

  const leftCount = Math.floor((windowCount - 1) / 2);
  const out: number[] = [];
  for (let k = -leftCount; k <= leftCount; k++) out.push(k);
  return out;
});

const visibleItems = computed(() => {
  if (!hasItems.value)
    return [] as Array<{ abs: number; wr: number; rel: number }>;
  const centerAbs = Math.round(offset.value);
  const out: Array<{ abs: number; wr: number; rel: number }> = [];
  for (const rel of relWindow.value) {
    const abs = centerAbs + rel;
    if (!loopRef.value && (abs < 0 || abs > itemCount.value - 1)) continue;
    out.push({ abs, wr: wrapIndex(abs), rel });
  }
  return out;
});

// unique key per *copy* when needed
const copyIndex = (abs: number) =>
  hasItems.value ? Math.floor(abs / itemCount.value) : 0;

const itemKeyFor = (vis: { abs: number; wr: number }) => {
  if (!hasItems.value) return vis.abs;

  const obj = itemsRef.value[vis.wr];
  if (typeof props.itemKey === "function") {
    const base = props.itemKey(obj, vis.abs);
    if (
      loopRef.value &&
      (copiesActive.value || relWindow.value.length > itemCount.value)
    ) {
      return `${base}@${copyIndex(vis.abs)}`;
    }
    return base;
  }

  if (loopRef.value) {
    if (copiesActive.value || relWindow.value.length > itemCount.value) {
      return `${vis.wr}@${copyIndex(vis.abs)}`;
    }
    return vis.wr;
  }
  return vis.abs;
};

/* ========================
 * Non-public functions (imperative internals)
 * ======================== */
const cancelAnim = () => {
  if (rafId.value) {
    cancelAnimationFrame(rafId.value);
    rafId.value = null;
  }
};

const animateTo = (targetIndex: number) => {
  if (!hasItems.value) return;
  const maxIdx = itemCount.value - 1;
  const clampedTarget = loopRef.value
    ? targetIndex
    : clamp(targetIndex, 0, maxIdx);

  cancelAnim();
  const start = offset.value;
  const end = clampedTarget;
  const t0 = performance.now();
  const dur = snapMsRef.value;

  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    offset.value = start + (end - start) * easeOutCubic(t);
    if (t < 1) {
      rafId.value = requestAnimationFrame(tick);
      return;
    }
    rafId.value = null;
    const finalIdx = Math.round(offset.value);
    const viewIdx = loopRef.value
      ? wrapIndex(finalIdx)
      : clamp(finalIdx, 0, maxIdx);

    suppressModelWatch = true;
    emit("update:modelValue", viewIdx);
    emit("change", viewIdx);
    queueMicrotask(() => {
      suppressModelWatch = false;
    });
  };
  rafId.value = requestAnimationFrame(tick);
};

const numberClass = (idx: number) => {
  const k = (((idx % 6) + 6) % 6) + 1;
  return `number-slide${k}`;
};
const defaultClass = (vis: { abs: number; wr: number }) => {
  if (!hasItems.value) return "";
  const idx = loopRef.value ? vis.wr : vis.abs;
  if (!loopRef.value && (idx < 0 || idx >= itemCount.value)) return "";
  return numberClass(idx);
};

// Measurement and layout
const measure = () => {
  const el = root.value;
  const width = el
    ? el.clientWidth || el.getBoundingClientRect().width || 0
    : 0;
  containerWidth.value = width > 0 ? width : props.initialWidth;

  if (!hasItems.value) {
    slotBaseWidth.value = 0;
    return;
  }

  const perViewVal = Math.max(0, perViewRef.value);
  const totalGapsPx = spacingRef.value * Math.max(0, perViewVal - 1);

  const perViewInt = Math.floor(perViewVal);
  const perViewFrac = perViewVal - perViewInt;

  let scaleBudget = 0;
  if (perViewInt >= 1)
    scaleBudget = centerScaleRef.value + (perViewInt - 1) * sideScaleRef.value;
  scaleBudget += perViewFrac * sideScaleRef.value;

  const innerWidthPx = Math.max(0, containerWidth.value - totalGapsPx);
  slotBaseWidth.value = scaleBudget > 0 ? innerWidthPx / scaleBudget : 0;
};

const innerScale = (relSlot: number) => {
  const dist = Math.abs(relSlot - fracOffset());
  const t = clamp(1 - dist, 0, 1);
  const weight = smoothstep(t);
  return (
    sideScaleRef.value + (centerScaleRef.value - sideScaleRef.value) * weight
  );
};
const innerWidth = (relSlot: number) =>
  slotBaseWidth.value * innerScale(relSlot);
const pairDistance = (i: number, j: number) =>
  spacingRef.value + 0.5 * (innerWidth(i) + innerWidth(j));

const localStep = () => {
  const frac = fracOffset();
  const leftIndex = frac >= 0 ? 0 : -1;
  const rightIndex = leftIndex + 1;
  return (
    pairDistance(leftIndex, rightIndex) ||
    slotBaseWidth.value + spacingRef.value
  );
};

const slotCenterX = (relSlot: number) => {
  const centerX = containerWidth.value / 2;
  const frac = fracOffset();
  const leftIndex = frac >= 0 ? 0 : -1;
  const rightIndex = leftIndex + 1;
  const t = frac >= 0 ? frac : 1 + frac;

  const pairLen = pairDistance(leftIndex, rightIndex);
  let leftX = -t * pairLen;
  let rightX = (1 - t) * pairLen;

  if (relSlot >= rightIndex) {
    let x = rightX;
    for (let j = rightIndex; j < relSlot; j++) x += pairDistance(j, j + 1);
    return centerX + x;
  }
  if (relSlot <= leftIndex) {
    let x = leftX;
    for (let j = relSlot; j < leftIndex; j++) x -= pairDistance(j, j + 1);
    return centerX + x;
  }
  return centerX + (relSlot === leftIndex ? leftX : rightX);
};

const slotStyle = (relSlot: number) => {
  const left = slotCenterX(relSlot) - slotBaseWidth.value / 2;
  const z = 1000 - Math.floor(100 * Math.abs(relSlot - fracOffset()));
  return {
    position: "relative", // changed from absolute
    width: `${slotBaseWidth.value}px`,
    height: `${Math.round((slotBaseWidth.value * AR_H) / AR_W)}px`,
    transform: `translate3d(${left}px,0,0)`,
    willChange: "transform",
    zIndex: z,
  } as const;
};

const slotInnerStyle = (relSlot: number) => {
  const scale = innerScale(relSlot);
  const dist = Math.abs(relSlot - fracOffset());
  const t = clamp(1 - dist, 0, 1);
  const opacity = 0.6 + 0.4 * smoothstep(t);
  return {
    transform: `scale(${scale})`,
    opacity,
    transition:
      isDragging.value || rafId.value
        ? "none"
        : "transform 180ms ease, opacity 180ms ease",
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  } as const;
};

const shouldLoad = (relSlot: number) => {
  if (!props.lazyOffscreen) return true;
  const dist = Math.abs(relSlot - fracOffset());
  const hysteresis = 0.75;
  return dist <= 1 + Math.max(0, props.preloadNeighbors) + hysteresis;
};

/* ========================
 * Event handling (non-public)
 * ======================== */
// ---- rubber-band fix support ----
let suppressModelWatch = false;
// ---------------------------------

let winOnMove: any = null;
let winOnUp: any = null;

const attachWindowEvents = () => {
  winOnMove = (ev: MouseEvent | TouchEvent) => onPointerMove(ev);
  winOnUp = () => onPointerUp();

  window.addEventListener("mousemove", winOnMove as any, { passive: false });
  window.addEventListener("mouseup", winOnUp as any, { passive: true });
  window.addEventListener("touchmove", winOnMove as any, { passive: false });
  window.addEventListener("touchend", winOnUp as any, { passive: true });
  window.addEventListener("touchcancel", winOnUp as any, { passive: true });
};
const detachWindowEvents = () => {
  if (winOnMove) {
    window.removeEventListener("mousemove", winOnMove);
    window.removeEventListener("touchmove", winOnMove);
    winOnMove = null;
  }
  if (winOnUp) {
    window.removeEventListener("mouseup", winOnUp);
    window.removeEventListener("touchend", winOnUp);
    window.removeEventListener("touchcancel", winOnUp);
    winOnUp = null;
  }
};

const onPointerDown = (e: MouseEvent | TouchEvent) => {
  if (!hasItems.value) return;
  // non-left mouse button guard
  // @ts-ignore
  if (!("touches" in e) && e.button !== undefined && e.button !== 0) return;

  cancelAnim();
  isDragging.value = true;

  // @ts-ignore
  const startX =
    "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
  lastPointerX.value = startX;

  (document.body as any).style.userSelect = "none";
  attachWindowEvents();
};

const onPointerMove = (e: MouseEvent | TouchEvent) => {
  if (!isDragging.value || !hasItems.value) return;
  if ("touches" in e) e.preventDefault();

  // @ts-ignore
  const x = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
  const deltaX = x - lastPointerX.value;
  const step = localStep();

  let newOffset = offset.value - deltaX / step;
  if (!loopRef.value)
    newOffset = clamp(newOffset, 0, Math.max(0, itemCount.value - 1));

  offset.value = newOffset;
  lastPointerX.value = x;
};

const onPointerUp = () => {
  if (!isDragging.value || !hasItems.value) return;
  isDragging.value = false;
  (document.body as any).style.userSelect = "";
  detachWindowEvents();
  animateTo(Math.round(offset.value));
};

/* ========================
 * Lifecycle
 * ======================== */
let resizeObserver: ResizeObserver | null = null;

onMounted(async () => {
  await nextTick();
  requestAnimationFrame(measure);
  resizeObserver = new ResizeObserver(() => measure());
  if (root.value) resizeObserver.observe(root.value);
  window.addEventListener("resize", measure, { passive: true });
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  window.removeEventListener("resize", measure);
  detachWindowEvents();
  cancelAnim();
});

/* ========================
 * Reactivity to prop changes
 * ======================== */
watch(
  () => props.modelValue,
  (v) => {
    if (!hasItems.value) {
      offset.value = 0;
      return;
    }
    if (suppressModelWatch) return;

    if (loopRef.value) {
      const target = nearestWrappedIndex(offset.value, wrapIndex(v));
      animateTo(target);
    } else {
      animateTo(clamp(v, 0, itemCount.value - 1));
    }
  }
);
watch([perViewRef, spacingRef, centerScaleRef, sideScaleRef], () => measure());
watch(itemCount, () => {
  if (!loopRef.value && hasItems.value) {
    offset.value = clamp(Math.round(offset.value), 0, itemCount.value - 1);
  }
  measure();
});

/* ========================
 * Public API (exposed)
 * ======================== */
/** Advance to the next slide (wraps when loop is enabled). */
const next = () => animateTo(Math.round(offset.value) + 1);
/** Move to the previous slide (wraps when loop is enabled). */
const prev = () => animateTo(Math.round(offset.value) - 1);
/** Jump to an absolute slide index (respects loop and clamping rules). */
const goTo = (index: number) => animateTo(index);
/** Recalculate sizes and layout, e.g., after container/responsive changes. */
const recalculate = () => measure();

defineExpose({ next, prev, goTo, recalculate });

/** expose items (ref) for template */
const items = itemsRef;

/* ========================
 * Probable defects marked
 * ======================== */
// TODO: REVIEW - Using Math.round(offset) in multiple places can cause flicker at half-way thresholds.
// TODO: REVIEW - Window event listeners rely on passive:false for touchmove to allow preventDefault; ensure this is acceptable for your app's scroll UX.

const AR_W = 11;
const AR_H = 15;
</script>

<style scoped>
.flat-root {
  position: relative;
  width: 100%;
  overflow: hidden;
  touch-action: pan-y;
  display: block;
}
.flat-stage {
  position: relative;
  width: 100%;
  min-width: 1px;
  height: 100%;
  display: grid; /* ensure overlapping stacking context for relative children */
}
.flat-slot {
  position: relative; /* changed from absolute */
  grid-area: 1 / 1; /* all slots overlap and are transform-positioned */
  pointer-events: auto;
}
.flat-inner {
  border-radius: 12px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.12);
  transform-origin: center center;
}
</style>
