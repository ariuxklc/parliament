import type { Metadata } from "next";
import Link from "next/link";
import { YouthShell } from "@/components/youth/YouthShell";
import { OpportunityRow } from "@/components/youth/OpportunityCard";
import styles from "@/components/youth/youth.module.css";
import page from "@/components/ask/askPage.module.css";
import { ArrowRight } from "@/components/ui/icons";
import { isOpen, listOpportunities } from "@/lib/youth/store";
import { currentViewer } from "@/lib/youth/auth";
import { MODES, OPPORTUNITY_TYPES, type Mode, type OpportunityType } from "@/lib/youth/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Залуучуудын дадлага — УИХ-ын гишүүнтэй хамт ажиллах",
  description: "Ахлах ангийн сурагчид УИХ-ын гишүүний ажлын албанд дадлага хийж, сайн дурын ажил, судалгаанд оролцох боломж.",
};

const STEPS = ["Зар сонгох", "Тохирох цагаа тэмдэглэх", "Эцэг эхийн зөвшөөрөлтэй бүртгүүлэх", "Кодоороо хариугаа шалгах"];

type Props = { searchParams: Promise<{ type?: string; grade?: string; mode?: string }> };

export default async function YouthList({ searchParams }: Props) {
  const sp = await searchParams;
  const type = sp.type && sp.type in OPPORTUNITY_TYPES ? (sp.type as OpportunityType) : null;
  const mode = sp.mode && sp.mode in MODES ? (sp.mode as Mode) : null;
  const grade = Number(sp.grade) >= 8 && Number(sp.grade) <= 12 ? Number(sp.grade) : null;

  const viewer = await currentViewer();
  const open = listOpportunities().filter((o) => isOpen(o));
  const shown = open
    .filter((o) => (!type || o.type === type) && (!mode || o.mode === mode) && (!grade || (o.gradeMin <= grade && grade <= o.gradeMax)))
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  const href = (over: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const merged = { type, mode, grade: grade ? String(grade) : null, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `/dadlaga?${s}` : "/dadlaga";
  };

  return (
    <YouthShell crumbs={[{ label: "Залуучуудын дадлага" }]}>
      <p className={page.eyebrow}>Залуучуудын дадлага</p>
      <h1 className={page.title}>УИХ-ын гишүүнтэй хамт ажиллаж үзээрэй</h1>
      <p className={styles.lede}>
        Ахлах ангийн сурагч уу? Гишүүний ажлын албанд нэг өдөр ажиллах, дадлага хийх, судалгаа, сайн дурын ажилд оролцох боломжуудаас хичээлийн
        хуваарьтаа тохирох цагаа сонгоод бүртгүүлээрэй.
      </p>

      <div className={styles.how}>
        <ol className={styles.steps} data-row="true" aria-label="Хэрхэн бүртгүүлэх вэ">
          {STEPS.map((s, i) => (
            <li key={s}>
              <span className={styles.stepN}>{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <Link href="/dadlaga/status" className={styles.homeStatus}>
          Бүртгүүлсэн үү? Төлөвөө шалгах
        </Link>
      </div>

      <div className={styles.filterBar}>
        <nav className={styles.types} aria-label="Төрөл">
          <Link href={href({ type: null })} className={styles.chip} aria-current={!type}>
            Бүгд <span className="tabular">{open.length}</span>
          </Link>
          {Object.entries(OPPORTUNITY_TYPES).map(([k, label]) => (
            <Link key={k} href={href({ type: k })} className={styles.chip} aria-current={type === k}>
              {label}
            </Link>
          ))}
        </nav>
        <div className={styles.filterRow}>
          <span className={styles.filterGroup} role="group" aria-label="Анги">
            <span>Анги</span>
            {[null, 8, 9, 10, 11, 12].map((g) => (
              <Link key={g ?? "all"} href={href({ grade: g ? String(g) : null })} className={styles.tab} aria-current={grade === g}>
                {g ? g : "Бүгд"}
              </Link>
            ))}
          </span>
          <span className={styles.filterGroup} role="group" aria-label="Хэлбэр">
            <span>Хэлбэр</span>
            {[null, ...Object.keys(MODES)].map((m) => (
              <Link key={m ?? "all"} href={href({ mode: m })} className={styles.tab} aria-current={mode === m}>
                {m ? MODES[m as Mode] : "Бүгд"}
              </Link>
            ))}
          </span>
        </div>
      </div>

      {shown.length ? (
        <ul className={styles.list}>
          {shown.map((o) => (
            <li key={o.id}>
              <OpportunityRow o={o} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>
          {open.length ? "Энэ шүүлтүүрт тохирох зар алга. Шүүлтүүрээ өөрчилж үзээрэй." : "Одоогоор нээлттэй зар алга. Удахгүй шинэ боломжууд нэмэгдэнэ."}
        </p>
      )}

      <aside className={styles.officeBox} aria-label="Ажлын албанд">
        <div>
          <strong>УИХ-ын гишүүний ажлын алба уу?</strong>
          <p>Сурагчдад зориулсан зар нэмэх, цагийн хуваарь гаргах, бүртгэлүүдийг хянах.</p>
        </div>
        <Link href="/dadlaga/admin" className={styles.officeLink}>
          {viewer ? "Удирдлага руу" : "Нэвтрэх"}
          <ArrowRight size={15} />
        </Link>
      </aside>
    </YouthShell>
  );
}
