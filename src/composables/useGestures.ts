import { ref, type Ref, type ComputedRef } from "vue";

type Readable<T> = Ref<T> | ComputedRef<T>;

export function useGestures(
  rootEl: Ref<HTMLElement | null>,
  isJsModeActive: Ref<boolean>,
  hasItems: Readable<boolean>,
  loopRef: Readable<boolean>,
  itemCount: Readable<number>,
  snapMsRef: Readable<number>,
  slideOffset: Ref<number>,
  measureGeometry: () => void,
  rebuildDomMap: () => void,
  renderFrame: () => void,
  scheduleRender: () => void,
  innerScaleAt: (rel: number, frac: number) => number,
  baseSlotWidth: Ref<number>,
  spacingPx: () => number,
  emitUpdate: (v: number) => void,
  emitChange: (v: number) => void,
  wrapIndexCircular: (i: number) => number
) {
  const isDragging = ref(false);
  const lastPointerX = ref(0);
  const rafHandle = ref<number | null>(null);
  const preferredDir = ref(0);
  const getPreferredDir = () => preferredDir.value;

  let resizeObserver: ResizeObserver | null = null;
  let onWindowPointerMove: any = null;
  let onWindowPointerUp: any = null;
  let onWindowResize: any = null;

  const EPS_NUDGE = 1e-3;

  function cancelAnimation() {
    if (rafHandle.value != null) {
      cancelAnimationFrame(rafHandle.value);
      rafHandle.value = null;
    }
  }

  async function enterJsMode(dirHint = 0) {
    if (isJsModeActive.value) return;

    isJsModeActive.value = true;
    preferredDir.value = dirHint;

    measureGeometry();

    // Ensure DOM updated for JS-mode, then map nodes
    await Promise.resolve();
    rebuildDomMap();

    // Nudge BEFORE the first render so the initial frame matches direction
    const frac0 = slideOffset.value - Math.round(slideOffset.value);
    if (dirHint !== 0 && Math.abs(frac0) < EPS_NUDGE) {
      slideOffset.value = slideOffset.value + dirHint * EPS_NUDGE;
    }

    // First paint synchronously to avoid any ambiguous frame
    renderFrame();

    // Observe resize
    resizeObserver = new ResizeObserver(() => {
      measureGeometry();
      scheduleRender();
    });
    const el = rootEl.value ?? document.documentElement;
    try {
      resizeObserver.observe(el);
    } catch {
      /* no-op */
    }
    onWindowResize = () => {
      measureGeometry();
      scheduleRender();
    };
    window.addEventListener("resize", onWindowResize as any, { passive: true });
  }

  function localStepDistancePx() {
    const frac = slideOffset.value - Math.round(slideOffset.value);
    const L = frac >= 0 ? 0 : -1;
    const R = L + 1;
    const widthL = baseSlotWidth.value * innerScaleAt(L, frac);
    const widthR = baseSlotWidth.value * innerScaleAt(R, frac);
    return spacingPx() + 0.5 * (widthL + widthR);
  }

  function attachWindowEvents() {
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
  }

  function detachWindowEvents() {
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
  }

  function clamp(v: number, min: number, max: number) {
    return Math.max(min, Math.min(max, v));
  }

  function easeOutCubic(t: number) {
    return 1 - Math.pow(1 - t, 3);
  }

  function animateToIndex(target: number) {
    if (!hasItems.value) return;

    if (!isJsModeActive.value) {
      const max = itemCount.value - 1;
      const end = loopRef.value ? target : clamp(target, 0, max);
      slideOffset.value = end;
      const view = loopRef.value
        ? wrapIndexCircular(Math.round(end))
        : clamp(Math.round(end), 0, max);
      emitUpdate(view);
      emitChange(view);
      return;
    }

    const max = itemCount.value - 1;
    const end = loopRef.value ? target : clamp(target, 0, max);

    cancelAnimation();

    const start = slideOffset.value;
    const dir = end > start ? 1 : end < start ? -1 : 0;

    // Make direction available to the very first paint
    preferredDir.value = dir;

    const frac = slideOffset.value - Math.round(slideOffset.value);

    // If we're exactly on an integer, bias a tiny amount toward the intended direction
    if (dir !== 0 && Math.abs(frac) < EPS_NUDGE) {
      slideOffset.value = start + dir * EPS_NUDGE;

      // IMPORTANT FIX: paint synchronously so the first frame already matches `dir`
      // This avoids a one-frame flash in the opposite direction.
      renderFrame();
    }

    const t0 = performance.now();
    const dur = snapMsRef.value;

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

      emitUpdate(view);
      emitChange(view);
    };

    rafHandle.value = requestAnimationFrame(tick);
  }

  async function onPointerDown(e: MouseEvent | TouchEvent) {
    if (!hasItems.value) return;
    // @ts-ignore
    if (!("touches" in e) && e.button !== undefined && e.button !== 0) return;

    await enterJsMode(0);

    cancelAnimation();
    isDragging.value = true;
    preferredDir.value = 0;

    // @ts-ignore
    const startX =
      "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    lastPointerX.value = startX;

    (document.body as any).style.userSelect = "none";
    attachWindowEvents();
  }

  function onPointerMove(e: MouseEvent | TouchEvent) {
    if (!isDragging.value || !hasItems.value) return;
    if ("touches" in e) e.preventDefault();

    // @ts-ignore
    const x = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
    const delta = x - lastPointerX.value;
    const step = localStepDistancePx();

    const dir = delta < 0 ? -1 : delta > 0 ? 1 : 0;
    if (dir !== 0) {
      preferredDir.value = dir;
      const frac0 = slideOffset.value - Math.round(slideOffset.value);
      if (Math.abs(frac0) < EPS_NUDGE) {
        slideOffset.value = slideOffset.value + dir * EPS_NUDGE;
      }
    }

    let nextOffset = slideOffset.value - delta / step;
    if (!loopRef.value)
      nextOffset = clamp(nextOffset, 0, Math.max(0, itemCount.value - 1));
    slideOffset.value = nextOffset;

    lastPointerX.value = x;
    scheduleRender();
  }

  function onPointerUp() {
    if (!isDragging.value || !hasItems.value) return;

    isDragging.value = false;
    (document.body as any).style.userSelect = "";

    detachWindowEvents();
    animateToIndex(Math.round(slideOffset.value));
  }

  function teardown() {
    if (resizeObserver) {
      try {
        resizeObserver.disconnect();
      } catch {}
      resizeObserver = null;
    }
    if (onWindowResize) {
      window.removeEventListener("resize", onWindowResize);
      onWindowResize = null;
    }
    detachWindowEvents();
    cancelAnimation();
  }

  return {
    isDragging,
    rafHandle,
    enterJsMode,
    animateToIndex,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    cancelAnimation,
    teardown,
    getPreferredDir,
  };
}
