"use client";

/**
 * Shared motion infrastructure.
 * - One IntersectionObserver for every reveal element (instead of one per component).
 * - One passive scroll listener + requestAnimationFrame loop for every parallax layer,
 *   writing only `transform` (GPU-composited, no layout reads inside the write phase).
 */

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ reveal */

type RevealCallback = () => void;
const revealCallbacks = new WeakMap<Element, RevealCallback>();
let revealObserver: IntersectionObserver | null = null;

export function observeReveal(el: Element, onReveal: RevealCallback): () => void {
  if (typeof IntersectionObserver === "undefined") {
    onReveal();
    return () => {};
  }
  revealObserver ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        revealCallbacks.get(e.target)?.();
        revealCallbacks.delete(e.target);
        revealObserver?.unobserve(e.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );
  revealCallbacks.set(el, onReveal);
  revealObserver.observe(el);
  return () => {
    revealCallbacks.delete(el);
    revealObserver?.unobserve(el);
  };
}

/* ---------------------------------------------------------------- parallax */

interface Layer {
  el: HTMLElement;
  speed: number; // fraction of scroll delta; positive = moves slower than content (lags behind)
  anchor: HTMLElement; // element whose position drives the effect
  max: number; // clamp in px
}

const layers = new Set<Layer>();
let ticking = false;
let listening = false;

function update() {
  ticking = false;
  const vh = window.innerHeight;
  // read phase
  const reads: [Layer, number][] = [];
  for (const layer of layers) {
    const r = layer.anchor.getBoundingClientRect();
    if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue; // off-screen — skip work
    const offset = r.top + r.height / 2 - vh / 2; // distance of anchor centre from viewport centre
    reads.push([layer, Math.max(-layer.max, Math.min(layer.max, -offset * layer.speed))]);
  }
  // write phase
  for (const [layer, y] of reads) layer.el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
}

function onScroll() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(update);
  }
}

export function registerParallax(el: HTMLElement, speed: number, anchor: HTMLElement = el.parentElement ?? el, max = 160): () => void {
  if (prefersReducedMotion()) return () => {};
  const layer: Layer = { el, speed, anchor, max };
  layers.add(layer);
  if (!listening) {
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    listening = true;
  }
  onScroll();
  return () => {
    layers.delete(layer);
    el.style.transform = "";
    if (!layers.size && listening) {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      listening = false;
    }
  };
}
