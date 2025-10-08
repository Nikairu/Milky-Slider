//src/composables/useRenderer.ts
import { type Ref, type ComputedRef } from "vue";

type Readable<T> = Ref<T> | ComputedRef<T>;

export function useRenderer(
  rootEl: Ref<HTMLElement | null>,
  isJsModeActive: Ref<boolean>,
  hasItems: Readable<boolean>,
  baseSlotWidth: Ref<number>,
  spacingPx: () => number,
  containerWidthPx: () => number,
  fractionalOffset: () => number,
  innerScaleAt: (rel: number, frac: number) => number,
  getPreferredDir: () => number
) {
  const domByRel = new Map<number, { slot: HTMLElement; inner: HTMLElement }>();
  const prevFrame = new Map<
    number,
    { tx: number; scale: number; opacity: number }
  >();

  let renderRaf: number | null = null;

  function rebuildDomMap() {
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
  }

  const EPS_TX = 0;
  const EPS_FRAC = 1e-4;

  function writeSlotVars(
    rel: number,
    slot: HTMLElement,
    inner: HTMLElement,
    tx: number,
    scale: number,
    opacity: number
  ) {
    const prev = prevFrame.get(rel);
    const needTx = !prev || Math.abs((prev.tx ?? 0) - tx) > EPS_TX;

    if (needTx) {
      slot.style.setProperty(
        "--slot-transform",
        `translate3d(${tx.toFixed(2)}px,0,0)`
      );
    }

    inner.style.setProperty("--scale", scale.toFixed(4));
    inner.style.setProperty("--opacity", opacity.toFixed(4));

    const nextTx = needTx ? tx : prev?.tx ?? tx;
    prevFrame.set(rel, { tx: nextTx, scale, opacity });
  }

  function renderFrame() {
    if (!isJsModeActive.value || !hasItems.value || baseSlotWidth.value === 0)
      return;

    if (domByRel.size === 0) rebuildDomMap();

    const frac = fractionalOffset();
    const dirHint = getPreferredDir ? getPreferredDir() : 0;

    let L: number, R: number, t: number;
    if (Math.abs(frac) < EPS_FRAC) {
      if (dirHint < 0) {
        L = -1;
        R = 0;
        t = 1;
      } else {
        L = 0;
        R = 1;
        t = 0;
      }
    } else if (frac > 0) {
      L = 0;
      R = 1;
      t = frac;
    } else {
      L = -1;
      R = 0;
      t = 1 + frac;
    }

    const rels = Array.from(domByRel.keys()).sort((a, b) => a - b);

    const scaleByRel = new Map<number, number>();
    const widthByRel = new Map<number, number>();
    const ensure = (rel: number) => {
      const s = innerScaleAt(rel, frac);
      scaleByRel.set(rel, s);
      widthByRel.set(rel, baseSlotWidth.value * s);
    };
    ensure(L);
    ensure(R);
    for (const rel of rels) ensure(rel);

    const pos = new Map<number, number>();
    const seg = spacingPx() + 0.5 * (widthByRel.get(L)! + widthByRel.get(R)!);
    pos.set(L, -t * seg);
    pos.set(R, (1 - t) * seg);

    for (let k = L - 1; rels.includes(k); k--) {
      const right = k + 1;
      const d =
        spacingPx() + 0.5 * (widthByRel.get(k)! + widthByRel.get(right)!);
      pos.set(k, pos.get(right)! - d);
    }
    for (let k = R + 1; rels.includes(k); k++) {
      const left = k - 1;
      const d =
        spacingPx() + 0.5 * (widthByRel.get(left)! + widthByRel.get(k)!);
      pos.set(k, pos.get(left)! + d);
    }

    const cx = containerWidthPx() / 2;

    for (const rel of rels) {
      const pair = domByRel.get(rel)!;
      const centerX = pos.get(rel) ?? 0;
      const tx = cx + centerX - baseSlotWidth.value / 2;
      const s = scaleByRel.get(rel)!;

      const dist = Math.abs(rel - frac);
      const t1 = Math.max(0, Math.min(1, 1 - dist));
      const opa = 0.6 + 0.4 * (t1 * t1 * (3 - 2 * t1));

      writeSlotVars(rel, pair.slot, pair.inner, tx, s, opa);
    }
  }

  function scheduleRender() {
    if (renderRaf != null) return;
    renderRaf = requestAnimationFrame(() => {
      renderRaf = null;
      renderFrame();
    });
  }

  return { rebuildDomMap, renderFrame, scheduleRender };
}
