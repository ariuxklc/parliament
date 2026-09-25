"use client";

import { useEffect, useState, type CSSProperties } from "react";

/**
 * Хийморь — the assistant's winged-horse mascot, drawn from a 4 × 6 sprite sheet (public/images/mascot):
 * `horse-bust.webp` (head, wing and pendant) for the launcher, `horse-head.webp` (head only) for avatars.
 * Frames are numbered left→right, top→bottom, 0–23.
 */
export const MOOD = {
  idle: 0,
  sleepy: 1,
  blink: 2,
  listen: 5,
  think: [8, 9, 13, 10],
  laugh: 14,
  greet: 17,
  happy: 18,
  worried: 21,
  sorry: 22,
} as const;

interface SpriteProps {
  frame: number;
  size: number;
  sheet?: "bust" | "head";
  className?: string;
  style?: CSSProperties;
}

export function Sprite({ frame, size, sheet = "head", className, style }: SpriteProps) {
  const col = frame % 4;
  const row = Math.floor(frame / 4);
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "block",
        width: size,
        height: size,
        backgroundImage: `url(/images/mascot/horse-${sheet}.webp)`,
        backgroundSize: "400% 600%",
        backgroundPosition: `${(col * 100) / 3}% ${row * 20}%`,
        backgroundRepeat: "no-repeat",
        ...style,
      }}
    />
  );
}

/** The resting face, with a blink every few seconds (skipped when the visitor prefers less motion). */
export function useBlink(base: number, active = true): number {
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    if (!active || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setClosed(true);
          timer = window.setTimeout(() => {
            setClosed(false);
            schedule();
          }, 150);
        },
        3200 + Math.random() * 3800,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [active]);
  return closed && base === MOOD.idle ? MOOD.blink : base;
}

/** Cycles through the "looking up, thinking" frames while an answer is being prepared. */
export function useThinking(active: boolean): number {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active) return;
    setI(0);
    const id = window.setInterval(() => setI((n) => (n + 1) % MOOD.think.length), 750);
    return () => window.clearInterval(id);
  }, [active]);
  return MOOD.think[i];
}
