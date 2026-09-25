"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { registerParallax } from "./observe";

interface ParallaxProps {
  /** 0.1–0.35 reads as depth; higher values start to feel like a game. */
  speed?: number;
  max?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  "aria-hidden"?: boolean;
}

/** A layer that drifts slightly slower than the page. Disabled for prefers-reduced-motion. */
export function Parallax({ speed = 0.18, max = 140, className, style, children, ...rest }: ParallaxProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return registerParallax(el, speed, el.parentElement ?? el, max);
  }, [speed, max]);
  return (
    <div ref={ref} data-parallax="" className={className} style={style} aria-hidden={rest["aria-hidden"]}>
      {children}
    </div>
  );
}
