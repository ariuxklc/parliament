import Image from "next/image";
import styles from "./layout.module.css";
import { HeaderNav } from "./HeaderNav";
import type { NavItem } from "@/lib/types";
import { t } from "@/lib/i18n";
import Link from "next/link";
import { appUrl, officialUrl } from "@/lib/site";
import { STATE_EMBLEM_SRC as STATE_EMBLEM } from "./emblem";

/** Official menu groups as a fallback when the menu API is unreachable (labels from new.parliament.mn). */
const FALLBACK_NAV: NavItem[] = [
  { label: "Улсын Их Хурлын тухай", href: "https://new.parliament.mn/news/list?category=486", external: true, children: [] },
  { label: "Улсын Их Хурлын үйл ажиллагаа", href: officialUrl.home(), external: true, children: [] },
  { label: "Тамгын газар", href: officialUrl.home(), external: true, children: [] },
  { label: "УИХ-ын гишүүд", href: officialUrl.memberList(), external: true, children: [] },
];

/** Our own section, after the official menu: youth opportunities with MP offices. */
const YOUTH_NAV: NavItem = { label: "Залуучуудын дадлага", href: "/dadlaga", external: false, children: [] };

export function SiteHeader({ nav }: { nav: NavItem[] }) {
  const items = [...(nav.length ? nav : FALLBACK_NAV), YOUTH_NAV];
  return (
    <header className={styles.header}>
      <div className={`container ${styles.headerInner}`}>
        <Link href={appUrl.home()} className={styles.brand} aria-label={`${t.brand.line1} ${t.brand.line2} — нүүр хуудас`}>
          <Image src={STATE_EMBLEM} alt="" width={44} height={44} priority className={styles.emblem} />
          <span className={styles.wordmark} aria-hidden="true">
            <span>{t.brand.line1}</span>
            <span>{t.brand.line2}</span>
          </span>
        </Link>
        <HeaderNav items={items} />
      </div>
      <div className="flag-stripe" aria-hidden="true" />
      <div className={styles.prototypeBar}>
        <div className="container">
          <p>
            <strong>{t.brand.prototype}.</strong> {t.brand.prototypeNote}{" "}
            <a href={officialUrl.home()} target="_blank" rel="noopener noreferrer">
              {t.brand.officialSite}: new.parliament.mn
            </a>
          </p>
        </div>
      </div>
    </header>
  );
}
