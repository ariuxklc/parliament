"use client";

import { useEffect, useRef, useState } from "react";
import { observeReveal, prefersReducedMotion } from "./observe";
import { formatNumber } from "@/lib/format";

interface CountUpProps {
  value: number;
  decimals?: number;
  suffix?: string;
  durationMs?: number;
  className?: string;
  /** "view" (default): animate when first scrolled into view. "mount": animate every time it mounts. */
  trigger?: "view" | "mount";
}

/**
 * Counts up to `value` the first time it scrolls into view.
 * The server renders the final value, and assistive tech always gets the final value.
 */
export function CountUp({ value, decimals = 0, suffix = "", durationMs = 1100, className, trigger = "view" }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    let raf = 0;
    const animate = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / durationMs);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(value * eased);
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    if (trigger === "mount") {
      setShown(0);
      animate();
      return () => cancelAnimationFrame(raf);
    }
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) return; // already visible on load — don't flash
    setShown(0);
    const stop = observeReveal(el, animate);
    return () => {
      stop();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs, trigger]);

  const text = decimals ? shown.toFixed(decimals) : formatNumber(Math.round(shown));
  const final = decimals ? value.toFixed(decimals) : formatNumber(value);
  return (
    <span ref={ref} className={className}>
      <span aria-hidden="true" className="tabular">
        {text}
        {suffix}
      </span>
      <span className="visually-hidden">
        {final}
        {suffix}
      </span>
    </span>
  );
}
