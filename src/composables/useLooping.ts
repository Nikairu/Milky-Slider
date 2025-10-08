//src/composables/useLooping.ts
import { computed, type ComputedRef, type Ref } from "vue";

type Readable<T> = Ref<T> | ComputedRef<T>;

export function useLooping<T>(
  loopRef: Readable<boolean>,
  perViewRef: Readable<number>,
  itemsArr: ComputedRef<Readonly<(T | null | undefined)[]>>,
  relativeWindow: ComputedRef<number[]>,
  itemKey: null | ((item: T | null | undefined, absIndex: number) => any)
) {
  const itemCount = computed(() => itemsArr.value.length);
  const hasItems = computed(() => itemCount.value > 0);

  const copiesModeActive = computed(
    () =>
      loopRef.value &&
      hasItems.value &&
      (perViewRef.value ?? 0) >= itemCount.value
  );

  const wrapIndexCircular = (i: number) => {
    if (!hasItems.value) return 0;
    const m = itemCount.value;
    return ((i % m) + m) % m;
  };

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

  const copyCycleIndex = (absIndex: number) =>
    hasItems.value ? Math.floor(absIndex / itemCount.value) : 0;

  const itemKeyFor = (vis: { absIndex: number; wrappedIndex: number }) => {
    if (!hasItems.value) return vis.absIndex;
    const obj = itemsArr.value[vis.wrappedIndex];
    if (itemKey) {
      const base = itemKey(obj ?? undefined, vis.absIndex);
      return loopRef.value &&
        (copiesModeActive.value ||
          relativeWindow.value.length > itemCount.value)
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

  return {
    itemCount,
    hasItems,
    copiesModeActive,
    wrapIndexCircular,
    nearestEquivalentAbsoluteIndex,
    copyCycleIndex,
    itemKeyFor,
  };
}
