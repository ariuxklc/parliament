"use client";

import { useEffect, useId, useRef, useState } from "react";
import styles from "./layout.module.css";
import type { NavItem } from "@/lib/types";
import { ArrowUpRight, ChevronDown, Close, MenuIcon } from "../ui/icons";
import { t } from "@/lib/i18n";

/**
 * Official top-level menu (from /api/menu/header/). Desktop: dropdown panels opened by hover or
 * click/Enter, closed with Escape. Mobile: a drawer with the same groups as disclosure lists.
 */
export function HeaderNav({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [drawer, setDrawer] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const baseId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(null);
        setDrawer(false);
      }
    };
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = drawer ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [drawer]);

  const enter = (i: number) => {
    window.clearTimeout(closeTimer.current);
    setOpen(i);
  };
  const leave = () => {
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  };

  return (
    <>
      <nav ref={navRef} className={styles.nav} aria-label="Үндсэн цэс">
        <ul className={styles.navList}>
          {items.map((item, i) => {
            const panelId = `${baseId}-panel-${i}`;
            const hasChildren = item.children.length > 0;
            return (
              <li key={item.label} className={styles.navItem} onPointerEnter={() => hasChildren && enter(i)} onPointerLeave={leave}>
                {hasChildren ? (
                  <button
                    type="button"
                    className={styles.navTrigger}
                    aria-expanded={open === i}
                    aria-controls={panelId}
                    onClick={() => setOpen(open === i ? null : i)}
                  >
                    <span className={styles.navLabel}>{item.label}</span>
                    <ChevronDown size={14} />
                  </button>
                ) : (
                  <a className={styles.navTrigger} href={item.href} data-local={!item.external || undefined} {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                    <span className={styles.navLabel}>{item.label}</span>
                  </a>
                )}
                {hasChildren ? (
                  <div id={panelId} className={styles.navPanel} data-open={open === i}>
                    <ul>
                      {item.children.map((c) => (
                        <li key={c.label}>
                          <a href={c.href} target="_blank" rel="noopener noreferrer" tabIndex={open === i ? 0 : -1}>
                            <span>{c.label}</span>
                            <ArrowUpRight size={13} />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </nav>

      <button type="button" className={styles.menuButton} aria-expanded={drawer} aria-controls={`${baseId}-drawer`} onClick={() => setDrawer(true)}>
        <MenuIcon size={20} />
        <span>{t.brand.menu}</span>
      </button>

      <div id={`${baseId}-drawer`} className={styles.drawer} data-open={drawer} aria-hidden={!drawer}>
        <div className={styles.drawerScrim} onClick={() => setDrawer(false)} />
        <div className={styles.drawerPanel} role="dialog" aria-modal="true" aria-label="Үндсэн цэс">
          <button type="button" className={styles.drawerClose} onClick={() => setDrawer(false)} tabIndex={drawer ? 0 : -1}>
            <Close size={20} />
            <span className="visually-hidden">{t.brand.closeMenu}</span>
          </button>
          <ul>
            {items.map((item) => (
              <li key={item.label}>
                {item.children.length ? (
                  <details>
                    <summary tabIndex={drawer ? 0 : -1}>
                      {item.label}
                      <ChevronDown size={16} />
                    </summary>
                    <ul>
                      {item.children.map((c) => (
                        <li key={c.label}>
                          <a href={c.href} target="_blank" rel="noopener noreferrer" tabIndex={drawer ? 0 : -1}>
                            {c.label}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : (
                  <a className={styles.drawerTop} href={item.href} {...(item.external ? { target: "_blank", rel: "noopener noreferrer" } : {})} tabIndex={drawer ? 0 : -1}>
                    {item.label}
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
