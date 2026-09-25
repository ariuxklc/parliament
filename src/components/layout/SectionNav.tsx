"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import styles from "./layout.module.css";
import { STATE_EMBLEM_SRC } from "./emblem";

export interface SectionLink {
  id: string;
  label: string;
}

/**
 * Sticky in-page navigation — the modern equivalent of the official quick-link pill row.
 * Scroll-spy marks the section in view; the gold indicator slides between pills (transform only).
 */
export function SectionNav({ links }: { links: SectionLink[] }) {
  const [active, setActive] = useState<string>(links[0]?.id ?? "");
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState<{ x: number; w: number } | null>(null);

  // Scroll-spy. Sections are looked up by id on every check because streamed sections replace
  // their placeholders after mount (an IntersectionObserver would keep watching stale nodes).
  useEffect(() => {
    let raf = 0;
    const check = () => {
      raf = 0;
      const line = window.innerHeight * 0.38;
      let current = links[0]?.id ?? "";
      for (const l of links) {
        const el = document.getElementById(l.id);
        if (el && el.getBoundingClientRect().top <= line) current = l.id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [links]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const list = listRef.current;
      const btn = list?.querySelector<HTMLAnchorElement>(`a[data-id="${active}"]`);
      if (!list || !btn) return setIndicator(null);
      setIndicator({ x: btn.offsetLeft, w: btn.offsetWidth });
      // keep the active pill visible on narrow screens
      const { scrollLeft, clientWidth } = list;
      if (btn.offsetLeft < scrollLeft || btn.offsetLeft + btn.offsetWidth > scrollLeft + clientWidth) {
        list.scrollTo({ left: btn.offsetLeft - 16, behavior: "smooth" });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [active, stuck]);

  return (
    <>
      <div ref={sentinel} aria-hidden="true" />
      <div className={styles.sectionNav} data-stuck={stuck}>
        <div className={`container ${styles.sectionNavInner}`}>
          <a href="#top" className={styles.sectionNavBrand} tabIndex={stuck ? 0 : -1} aria-hidden={!stuck}>
            <Image src={STATE_EMBLEM_SRC} alt="" width={28} height={28} />
            <span>УИХ</span>
          </a>
          <nav aria-label="Хуудасны хэсгүүд">
            <ul ref={listRef} className={styles.sectionNavList}>
              {indicator ? (
                <li aria-hidden="true" className={styles.sectionNavIndicator} style={{ transform: `translateX(${indicator.x}px)`, width: indicator.w }} />
              ) : null}
              {links.map((l) => (
                <li key={l.id}>
                  <a href={`#${l.id}`} data-id={l.id} aria-current={active === l.id ? "true" : undefined} className={styles.sectionNavLink}>
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
    </>
  );
}
