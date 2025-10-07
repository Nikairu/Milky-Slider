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
            : ['left-0', 'ml-0', '[transform:var(--slot-transform)!important]'],
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
          :style="innerCssVars(vis.relSlot)"
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

    <!-- Warm parking lot: keep a small LRU set of slides mounted but invisible -->
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
            // always keep image mounted for parked slides
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
  onMounted,
  onBeforeUnmount,
  toRef,
  watch,
  withDefaults,
  defineProps,
  nextTick,
} from "vue";

/* ========================
 * Props (withDefaults)
 * ======================== */
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
    overscanEachSide: 99, // sensible default; huge values hurt perf
    expandOnDrag: true,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: number): void;
  (e: "change", value: number): void;
}>();

/* ========================
 * State
 * ======================== */
const rootEl = ref<HTMLElement | null>(null);
const isJsModeActive = ref(false);
const containerWidth = ref(0);
const baseSlotWidth = ref(0);
const slideOffset = ref(props.modelValue!);
const isDragging = ref(false);
const lastPointerX = ref(0);
const rafHandle = ref<number | null>(null);

/* DOM caches for fast per-frame writes */
const domByRel = new Map<number, { slot: HTMLElement; inner: HTMLElement }>();
const prevFrame = new Map<
  number,
  { tx: number; scale: number; opacity: number }
>();
let renderRaf: number | null = null;

/* ========================
 * Prop refs + items
 * ======================== */
const perViewRef = toRef(props, "perView");
const spacingRef = toRef(props, "spacing");
const centerScaleRef = toRef(props, "centerScale");
const sideScaleRef = toRef(props, "sideScale");
const loopRef = toRef(props, "loop");
const snapMsRef = toRef(props, "snapMs");

const itemsArr = computed<Readonly<(T | null | undefined)[]>>(
  () => props.items ?? []
);

/* ========================
 * Derived
 * ======================== */
const itemCount = computed(() => itemsArr.value.length);
const hasItems = computed(() => itemCount.value > 0);
const copiesModeActive = computed(
  () =>
    loopRef.value &&
    hasItems.value &&
    (perViewRef.value ?? 0) >= itemCount.value
);
const centerIndex = computed(() => Math.round(slideOffset.value));

/* ========================
 * Sticky loading + warm cache
 * ======================== */
const stickySeen = new Set<number>(); // wrapped indices we’ll keep mounted when possible

// exposed to the slot (sticky)
const shouldLoadSticky = (relSlot: number, wrappedIndex: number) => {
  // “near” window + preload ring
  const dist = Math.abs(
    relSlot - (slideOffset.value - Math.round(slideOffset.value))
  );
  const allow =
    dist <= 1 + Math.max(0, props.preloadNeighbors!) + 0.75 ||
    stickySeen.has(wrappedIndex);
  if (allow) stickySeen.add(wrappedIndex);
  // touch warm cache (LRU) when allowed
  if (allow) touchWarm(wrappedIndex);
  return allow;
};

// tiny LRU of recently seen slides, kept mounted offscreen
const warmLRU: number[] = [];
const warmSet = new Set<number>();
const warmCapacity = computed(() =>
  Math.max(
    0,
    Math.ceil(perViewRef.value ?? 1) * 2 + (props.preloadNeighbors ?? 0) * 2 + 4
  )
);

function touchWarm(idx: number) {
  if (warmSet.has(idx)) {
    // move to end
    const i = warmLRU.indexOf(idx);
    if (i >= 0) warmLRU.splice(i, 1);
    warmLRU.push(idx);
  } else {
    warmLRU.push(idx);
    warmSet.add(idx);
    while (warmLRU.length > warmCapacity.value) {
      const drop = warmLRU.shift()!;
      warmSet.delete(drop);
      // don’t clear stickySeen — keeping it sticky avoids conditional v-if churn in the slot
    }
  }
}

const warmParked = computed(() => {
  // not currently visible
  const visSet = new Set(visibleItems.value.map((v) => v.wrappedIndex));
  return warmLRU.filter((idx) => !visSet.has(idx));
});

/* ========================
 * Utils
 * ======================== */
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const smoothstep = (x: number) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const wrapIndexCircular = (i: number) => {
  if (!hasItems.value) return 0;
  const m = itemCount.value;
  return ((i % m) + m) % m;
};
const fractionalOffset = () =>
  slideOffset.value - Math.round(slideOffset.value);

const nearestEquivalentAbsoluteIndex = (
  currentAbs: number,
  targetWrapped: number
) => {
  if (!hasItems.value) return 0;
  const m = itemCount.value;
  const base = Math.floor(currentAbs / m) * m + targetWrapped;
  const candidates = [base - m, base, base + m];
  let best = candidates[0],
    bestDist = Math.abs(best - currentAbs);
  for (const cand of candidates) {
    const d = Math.abs(cand - currentAbs);
    if (d < bestDist) {
      best = cand;
      bestDist = d;
    }
  }
  return best;
};

/* ========================
 * Visibility window
 * ======================== */
type VisibleItem = { absIndex: number; wrappedIndex: number; relSlot: number };

const relativeWindow = computed(() => {
  if (!hasItems.value) return [] as number[];
  const pv = Math.max(1, perViewRef.value!);
  const visibleCount = Math.ceil(pv);
  const interactive =
    props.expandOnDrag && (isDragging.value || !!rafHandle.value);
  const extraEachSide = Math.max(props.overscanEachSide!, interactive ? 2 : 0);
  let count = visibleCount + 2 * extraEachSide;
  if (copiesModeActive.value) {
    const min = visibleCount + 2;
    if (count < min) count = min;
  } else if (loopRef.value) {
    count = Math.min(count, itemCount.value);
  }
  const leftCount = Math.floor((count - 1) / 2);
  const out: number[] = [];
  for (let k = -leftCount; k <= leftCount; k++) out.push(k);
  return out;
});

const visibleItems = computed<VisibleItem[]>(() => {
  if (!hasItems.value) return [];
  const centerAbs = centerIndex.value;
  const out: VisibleItem[] = [];
  for (const rel of relativeWindow.value) {
    const abs = centerAbs + rel;
    if (!loopRef.value && (abs < 0 || abs > itemCount.value - 1)) continue;
    const wrapped = wrapIndexCircular(abs);
    out.push({ absIndex: abs, wrappedIndex: wrapped, relSlot: rel });
  }
  return out;
});

const copyCycleIndex = (absIndex: number) =>
  hasItems.value ? Math.floor(absIndex / itemCount.value) : 0;

const itemKeyFor = (vis: { absIndex: number; wrappedIndex: number }) => {
  if (!hasItems.value) return vis.absIndex;
  const obj = itemsArr.value[vis.wrappedIndex];
  if (props.itemKey) {
    const base = props.itemKey(obj ?? undefined, vis.absIndex);
    return loopRef.value &&
      (copiesModeActive.value || relativeWindow.value.length > itemCount.value)
      ? `${base}@${copyCycleIndex(vis.absIndex)}`
      : base;
  }
  if (loopRef.value) {
    return copiesModeActive.value ||
      relativeWindow.value.length > itemCount.value
      ? `${vis.wrappedIndex}@${copyCycleIndex(vis.absIndex)}`
      : vis.wrappedIndex;
  }
  return vis.absIndex;
};

/* ========================
 * Root CSS vars
 * ======================== */
const ASPECT_W = 11;
const ASPECT_H = 15;

const rootCssVars = computed(() => {
  const pv = Math.max(1, perViewRef.value!);
  const gapsCount = Math.max(0, Math.ceil(pv) - 1);
  return {
    "--per-view": String(pv),
    "--gaps-count": String(gapsCount),
    "--spacing": `${Math.max(0, spacingRef.value!)}px`,
    "--center-scale": String(Math.max(0, centerScaleRef.value!)),
    "--side-scale": String(Math.max(0, sideScaleRef.value!)),
    "--ar-w": String(ASPECT_W),
    "--ar-h": String(ASPECT_H),
    "--scale-budget":
      "calc(var(--center-scale) + (var(--per-view) - 1) * var(--side-scale))",
    "--gaps": "calc(var(--gaps-count) * var(--spacing))",
    "--slot-base-w": "calc((100% - var(--gaps)) / var(--scale-budget))",
    "--ar-ratio": "calc(var(--ar-h) / var(--ar-w))",
  } as Record<string, string>;
});

/* ========================
 * Geometry
 * ======================== */
const measureGeometry = () => {
  const el = rootEl.value;
  const width = el
    ? el.clientWidth || el.getBoundingClientRect().width || 0
    : 0;
  containerWidth.value = width;
  if (!hasItems.value) {
    baseSlotWidth.value = 0;
    return;
  }
  const pv = Math.max(1, perViewRef.value!);
  const gapsCount = Math.max(0, Math.ceil(pv) - 1);
  const gapsPx = spacingRef.value! * gapsCount;
  const scaleBudget = centerScaleRef.value! + (pv - 1) * sideScaleRef.value!;
  const innerWidthPx = Math.max(0, width - gapsPx);
  baseSlotWidth.value = scaleBudget > 0 ? innerWidthPx / scaleBudget : 0;
};

const innerScale = (relSlot: number) => {
  const dist = Math.abs(relSlot - fractionalOffset());
  const t = clamp(1 - dist, 0, 1);
  const w = smoothstep(t);
  return (
    sideScaleRef.value! + (centerScaleRef.value! - sideScaleRef.value!) * w
  );
};

/* ========================
 * CSS vars (static from template)
 * ======================== */
const slotCssVars = (relSlot: number) => {
  const vars: Record<string, string> = {
    "--slot-rel": String(relSlot),
    "--slot-abs": String(Math.abs(relSlot)),
    "--slot-dir": String(relSlot === 0 ? 0 : relSlot > 0 ? 1 : -1),
  };
  if (!isJsModeActive.value) {
    vars["--d-side"] =
      "calc(var(--spacing) + var(--slot-base-w) * var(--side-scale))";
    vars["--d-first"] =
      "calc(var(--spacing) + 0.5 * var(--slot-base-w) * (var(--center-scale) + var(--side-scale)))";
    vars["--abs01"] = "min(1, var(--slot-abs))";
    vars["--x"] =
      "calc(var(--slot-dir) * (var(--slot-abs) * var(--d-side) + var(--abs01) * (var(--d-first) - var(--d-side))))";
  }
  return vars;
};

const innerCssVars = (relSlot: number) => {
  if (!isJsModeActive.value) {
    return {
      "--is-center": "calc(1 - min(1, var(--slot-abs, 0)))",
      "--scale":
        "calc(var(--side-scale) + var(--is-center) * (var(--center-scale) - var(--side-scale)))",
      "--opacity": "calc(0.6 + 0.4 * var(--is-center))",
    } as Record<string, string>;
  }
  return {};
};

/* ========================
 * Imperative renderer (O(n) + diffed writes)
 * ======================== */
const rebuildDomMap = () => {
  domByRel.clear();
  prevFrame.clear();
  const root = rootEl.value;
  if (!root) return;
  const slots = root.querySelectorAll<HTMLElement>('[data-role="flat-slot"]');
  slots.forEach((slot) => {
    const rel = Number(slot.getAttribute("data-rel"));
    const inner = slot.querySelector<HTMLElement>('[data-role="flat-inner"]');
    if (Number.isFinite(rel) && inner) domByRel.set(rel, { slot, inner });
  });
};

const EPS_TX = 0.25;
const EPS_SCALE = 0.002;
const EPS_OPA = 0.004;

const renderFrame = () => {
  if (!isJsModeActive.value || !hasItems.value || baseSlotWidth.value === 0)
    return;

  const frac = fractionalOffset();
  const L = frac >= 0 ? 0 : -1;
  const R = L + 1;
  const t = frac >= 0 ? frac : 1 + frac;

  const rels = Array.from(domByRel.keys()).sort((a, b) => a - b);

  // NEW: ensure neighbors (L,R) always have width/scale even if not rendered
  const scaleByRel = new Map<number, number>();
  const widthByRel = new Map<number, number>();
  const allRels = new Set<number>(rels);
  allRels.add(L);
  allRels.add(R);
  for (const rel of allRels) {
    const s = innerScale(rel);
    scaleByRel.set(rel, s);
    widthByRel.set(rel, baseSlotWidth.value * s);
  }

  // use computed L/R widths (never undefined now)
  const seg =
    spacingRef.value! + 0.5 * (widthByRel.get(L)! + widthByRel.get(R)!);

  const pos = new Map<number, number>();
  pos.set(L, -t * seg);
  pos.set(R, (1 - t) * seg);

  for (let k = L - 1; rels.includes(k); k--) {
    const right = k + 1;
    const d =
      spacingRef.value! + 0.5 * (widthByRel.get(k)! + widthByRel.get(right)!);
    pos.set(k, pos.get(right)! - d);
  }
  for (let k = R + 1; rels.includes(k); k++) {
    const left = k - 1;
    const d =
      spacingRef.value! + 0.5 * (widthByRel.get(left)! + widthByRel.get(k)!);
    pos.set(k, pos.get(left)! + d);
  }

  const cx = containerWidth.value / 2;
  for (const rel of rels) {
    const { slot, inner } = domByRel.get(rel)!;
    const centerX = pos.get(rel) ?? 0;
    const tx = cx + centerX - baseSlotWidth.value / 2;
    const s = scaleByRel.get(rel)!;
    const dist = Math.abs(rel - frac);
    const opa = 0.6 + 0.4 * smoothstep(clamp(1 - dist, 0, 1));
    writeSlotVars(rel, slot, inner, tx, s, opa);
  }
};

function writeSlotVars(
  rel: number,
  slot: HTMLElement,
  inner: HTMLElement,
  tx: number,
  scale: number,
  opacity: number
) {
  const prev = prevFrame.get(rel);
  const needTx = !prev || Math.abs(prev.tx - tx) > EPS_TX;
  const needScale = !prev || Math.abs(prev.scale - scale) > EPS_SCALE;
  const needOpa = !prev || Math.abs(prev.opacity - opacity) > EPS_OPA;

  if (needTx)
    slot.style.setProperty(
      "--slot-transform",
      `translate3d(${tx.toFixed(2)}px,0,0)`
    );
  if (needScale) inner.style.setProperty("--scale", scale.toFixed(4));
  if (needOpa) inner.style.setProperty("--opacity", opacity.toFixed(4));

  if (needTx || needScale || needOpa)
    prevFrame.set(rel, { tx, scale, opacity });
}

const scheduleRender = () => {
  if (renderRaf != null) return;
  renderRaf = requestAnimationFrame(() => {
    renderRaf = null;
    renderFrame();
  });
};

/* ========================
 * Animation & events
 * ======================== */
const cancelAnimation = () => {
  if (rafHandle.value) {
    cancelAnimationFrame(rafHandle.value);
    rafHandle.value = null;
  }
};
let suppressModelWatch = false;

const animateToIndex = (target: number) => {
  if (!hasItems.value) return;
  if (!isJsModeActive.value) {
    const max = itemCount.value - 1;
    const clamped = loopRef.value ? target : clamp(target, 0, max);
    slideOffset.value = clamped;
    suppressModelWatch = true;
    const view = loopRef.value ? wrapIndexCircular(clamped) : clamped;
    emit("update:modelValue", view);
    emit("change", view);
    suppressModelWatch = false;
    return;
  }
  const max = itemCount.value - 1;
  const end = loopRef.value ? target : clamp(target, 0, max);
  cancelAnimation();
  const start = slideOffset.value,
    t0 = performance.now(),
    dur = snapMsRef.value!;
  const tick = (now: number) => {
    const t = Math.min(1, (now - t0) / dur);
    slideOffset.value = start + (end - start) * easeOutCubic(t);
    scheduleRender();
    if (t < 1) {
      rafHandle.value = requestAnimationFrame(tick);
      return;
    }
    rafHandle.value = null;
    const finalIdx = Math.round(slideOffset.value);
    const view = loopRef.value
      ? wrapIndexCircular(finalIdx)
      : clamp(finalIdx, 0, max);
    suppressModelWatch = true;
    emit("update:modelValue", view);
    emit("change", view);
    Promise.resolve().then(() => {
      suppressModelWatch = false;
    });
  };
  rafHandle.value = requestAnimationFrame(tick);
};

let onWindowPointerMove: any = null,
  onWindowPointerUp: any = null,
  resizeObserver: ResizeObserver | null = null;

const attachWindowEvents = () => {
  onWindowPointerMove = (ev: MouseEvent | TouchEvent) => onPointerMove(ev);
  onWindowPointerUp = () => onPointerUp();
  window.addEventListener("mousemove", onWindowPointerMove as any, {
    passive: false,
  });
  window.addEventListener("mouseup", onWindowPointerUp as any, {
    passive: true,
  });
  window.addEventListener("touchmove", onWindowPointerMove as any, {
    passive: false,
  });
  window.addEventListener("touchend", onWindowPointerUp as any, {
    passive: true,
  });
  window.addEventListener("touchcancel", onWindowPointerUp as any, {
    passive: true,
  });
};
const detachWindowEvents = () => {
  if (onWindowPointerMove) {
    window.removeEventListener("mousemove", onWindowPointerMove);
    window.removeEventListener("touchmove", onWindowPointerMove);
    onWindowPointerMove = null;
  }
  if (onWindowPointerUp) {
    window.removeEventListener("mouseup", onWindowPointerUp);
    window.removeEventListener("touchend", onWindowPointerUp);
    window.removeEventListener("touchcancel", onWindowPointerUp);
    onWindowPointerUp = null;
  }
};

const enterJsMode = async () => {
  if (isJsModeActive.value) return;
  isJsModeActive.value = true;
  measureGeometry();
  await nextTick();
  rebuildDomMap();
  renderFrame();
  resizeObserver = new ResizeObserver(() => {
    measureGeometry();
    scheduleRender();
  });
  if (rootEl.value) resizeObserver.observe(rootEl.value);
  window.addEventListener(
    "resize",
    () => {
      measureGeometry();
      scheduleRender();
    },
    { passive: true }
  );
};

const localStepDistancePx = () => {
  const frac = fractionalOffset();
  const L = frac >= 0 ? 0 : -1;
  const R = L + 1;
  const widthL = baseSlotWidth.value * innerScale(L);
  const widthR = baseSlotWidth.value * innerScale(R);
  return spacingRef.value! + 0.5 * (widthL + widthR);
};

const onPointerDown = async (e: MouseEvent | TouchEvent) => {
  if (!hasItems.value) return;
  // @ts-ignore
  if (!("touches" in e) && e.button !== undefined && e.button !== 0) return;
  await enterJsMode();
  cancelAnimation();
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
  const delta = x - lastPointerX.value;
  const step = localStepDistancePx();
  let nextOffset = slideOffset.value - delta / step;
  if (!loopRef.value)
    nextOffset = clamp(nextOffset, 0, Math.max(0, itemCount.value - 1));
  slideOffset.value = nextOffset;
  lastPointerX.value = x;
  scheduleRender();
};

const onPointerUp = () => {
  if (!isDragging.value || !hasItems.value) return;
  isDragging.value = false;
  (document.body as any).style.userSelect = "";
  detachWindowEvents();
  animateToIndex(Math.round(slideOffset.value));
};

/* ========================
 * Lifecycle & reactivity
 * ======================== */
onMounted(() => {});
onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  detachWindowEvents();
  cancelAnimation();
  if (renderRaf) cancelAnimationFrame(renderRaf);
});

watch(
  () => props.modelValue,
  (v) => {
    if (!hasItems.value) {
      slideOffset.value = 0;
      return;
    }
    if (suppressModelWatch) return;
    if (loopRef.value)
      animateToIndex(
        nearestEquivalentAbsoluteIndex(slideOffset.value, wrapIndexCircular(v!))
      );
    else animateToIndex(clamp(v!, 0, itemCount.value - 1));
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
watch(itemCount, () => {
  if (!loopRef.value && hasItems.value)
    slideOffset.value = clamp(
      Math.round(slideOffset.value),
      0,
      itemCount.value - 1
    );
  if (isJsModeActive.value) {
    measureGeometry();
    scheduleRender();
  }
});

/* ========================
 * Public API
 * ======================== */
const next = () => animateToIndex(Math.round(slideOffset.value) + 1);
const prev = () => animateToIndex(Math.round(slideOffset.value) - 1);
const goTo = (i: number) => animateToIndex(i);
const recalculate = () => {
  if (!isJsModeActive.value) return;
  measureGeometry();
  scheduleRender();
};
defineExpose({ next, prev, goTo, recalculate });

/* ========================
 * Demo helpers
 * ======================== */
const items = itemsArr;
const numberClass = (idx: number) => {
  const k = (((idx % 6) + 6) % 6) + 1;
  return `number-slide${k}`;
};
const defaultClass = (vis: { absIndex: number; wrappedIndex: number }) => {
  if (!hasItems.value) return "";
  const idx = loopRef.value ? vis.wrappedIndex : vis.absIndex;
  if (!loopRef.value && (idx < 0 || idx >= itemCount.value)) return "";
  return numberClass(idx);
};
const shouldLoad = (relSlot: number) => true; // kept only for backward compatibility if someone imports it
</script>
