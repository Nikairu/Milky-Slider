import { computed, type ComputedRef, type Ref } from "vue";

type Readable<T> = Ref<T> | ComputedRef<T>;

export function useWarmCache(
  perViewRef: Readable<number>,
  preloadNeighborsRef: Readable<number>,
  visibleItems: ComputedRef<{ wrappedIndex: number }[]>,
  slideOffset: Ref<number>
) {
  const warmLRU: number[] = [];
  const warmSet = new Set<number>();
  const stickySeen = new Set<number>();

  const warmCapacity = computed(() =>
    Math.max(
      0,
      Math.ceil(perViewRef.value ?? 1) * 2 +
        (preloadNeighborsRef.value ?? 0) * 2 +
        4
    )
  );

  function touchWarm(idx: number) {
    if (warmSet.has(idx)) {
      const i = warmLRU.indexOf(idx);
      if (i >= 0) warmLRU.splice(i, 1);
      warmLRU.push(idx);
    } else {
      warmLRU.push(idx);
      warmSet.add(idx);
      while (warmLRU.length > warmCapacity.value) {
        const drop = warmLRU.shift()!;
        warmSet.delete(drop);
      }
    }
  }

  const warmParked = computed(() => {
    const visSet = new Set(visibleItems.value.map((v) => v.wrappedIndex));
    return warmLRU.filter((idx) => !visSet.has(idx));
  });

  const shouldLoadSticky = (relSlot: number, wrappedIndex: number) => {
    const dist = Math.abs(
      relSlot - (slideOffset.value - Math.round(slideOffset.value))
    );
    const allow =
      dist <= 1 + Math.max(0, preloadNeighborsRef.value ?? 0) + 0.75 ||
      stickySeen.has(wrappedIndex);
    if (allow) {
      stickySeen.add(wrappedIndex);
      touchWarm(wrappedIndex);
    }
    return allow;
  };

  return { warmParked, shouldLoadSticky, touchWarm, stickySeen };
}
