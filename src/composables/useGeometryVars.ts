/* src/composables/useGeometryVars.ts */
import { ref, computed, type ComputedRef, type Ref } from "vue";

export function useGeometryVars(
  rootEl: Ref<HTMLElement | null>,
  perViewRef: ComputedRef<number>,
  spacingRef: ComputedRef<number>,
  centerScaleRef: ComputedRef<number>,
  sideScaleRef: ComputedRef<number>,
  hasItems: ComputedRef<boolean>,
  isJsModeActive: Ref<boolean>
) {
  // simple refs (no computed setters)
  const containerWidth = ref(0);
  const baseSlotWidth = ref(0);

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

  function measureGeometry() {
    const el = rootEl.value;
    let width = 0;
    if (el) {
      const rect = el.getBoundingClientRect();
      width = Math.max(rect.width, el.clientWidth, 0);
      if (!width && el.parentElement) {
        const prect = el.parentElement.getBoundingClientRect();
        width = Math.max(width, prect.width);
      }
    }
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
  }

  const innerScale = (relSlot: number, fractionalOffset: number) => {
    const dist = Math.abs(relSlot - fractionalOffset);
    const t = Math.max(0, Math.min(1, 1 - dist));
    const w = t * t * (3 - 2 * t); // smoothstep
    return (
      sideScaleRef.value! + (centerScaleRef.value! - sideScaleRef.value!) * w
    );
  };

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

  return {
    containerWidth,
    baseSlotWidth,
    rootCssVars,
    innerScale,
    slotCssVars,
    innerCssVars,
    measureGeometry,
  };
}
