import Image from "next/image";
import styles from "./layout.module.css";
import { STATE_EMBLEM_SRC } from "./emblem";
import { t } from "@/lib/i18n";
import { officialUrl, LAWFORUM_SITE, PARLIAMENT_SITE } from "@/lib/site";

const OFFICIAL_LINKS = [
  { label: "new.parliament.mn — Улсын Их Хурал", href: `${PARLIAMENT_SITE}/` },
  { label: "lawforum.parliament.mn — Хуулийн төслийн хэлэлцүүлэг", href: `${LAWFORUM_SITE}/` },
  { label: "petition.parliament.mn — Нийтийн өргөдөл", href: officialUrl.petitions() },
  { label: "Хуралдааны ирц", href: officialUrl.attendance() },
  { label: "Санал хураалт", href: officialUrl.votes() },
];

export function SiteFooter({ generatedAt }: { generatedAt: string }) {
  return (
    <footer className={styles.footer}>
      <div className="container">
        <div className={styles.footerGrid}>
          <div>
            <div className={styles.footerBrand}>
              <Image src={STATE_EMBLEM_SRC} alt="" width={40} height={40} />
              <span>
                {t.brand.line1}
                <br />
                {t.brand.line2}
              </span>
            </div>
            <h3>{t.footer.sources}</h3>
            <p>{t.footer.sourcesBody}</p>
          </div>
          <div>
            <h3>{t.footer.official}</h3>
            <ul>
              {OFFICIAL_LINKS.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3>{t.footer.developer}</h3>
            <ul>
              <li>
                <a href={officialUrl.openData()} target="_blank" rel="noopener noreferrer">
                  data.parliament.mn
                </a>
              </li>
              <li>
                <a href={`${LAWFORUM_SITE}/LawForumAPI/docs/`} target="_blank" rel="noopener noreferrer">
                  LawForum API
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>
            {t.brand.prototype} · Open Parliament Hackathon 2026
          </span>
          <span>Хуудас үүссэн: {generatedAt}</span>
        </div>
      </div>
    </footer>
  );
}
