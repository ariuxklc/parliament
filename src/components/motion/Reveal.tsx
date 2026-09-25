"use client";

import { useEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from "react";
import { observeReveal } from "./observe";

interface RevealProps {
  as?: ElementType;
  children: ReactNode;
  /** Stagger index — each step delays the transition by 70 ms. */
  index?: number;
  className?: string;
  style?: CSSProperties;
  id?: string;
}

/** Fades/slides content in the first time it scrolls into view. Visible by default without JS. */
export function Reveal({ as: Tag = "div", children, index = 0, className, style, id }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeReveal(el, () => setRevealed(true));
  }, []);

  return (
    <Tag
      ref={ref}
      id={id}
      className={className}
      data-reveal=""
      data-revealed={revealed ? "true" : "false"}
      style={{ ...style, ["--reveal-i" as string]: index }}
    >
      {children}
    </Tag>
  );
}

/** Hook form for components that need the in-view signal themselves (charts, counters). */
export function useRevealed<T extends Element>(): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return observeReveal(el, () => setRevealed(true));
  }, []);
  return [ref, revealed];
}
