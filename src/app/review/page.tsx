import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { ReviewDesk } from "@/components/review/ReviewDesk";
import styles from "@/components/review/review.module.css";
import { getNavigation } from "@/lib/data";
import { listExplainers } from "@/lib/summaries/store";
import { reviewEnabledOnServer } from "@/lib/summaries/reviewAccess";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Товч тайлбар хянах", robots: { index: false, follow: false } };

/** Team-only: draft (AI), edit, check against sources, approve. Not linked from public pages. */
export default async function ReviewPage() {
  const nav = await getNavigation();
  const enabled = reviewEnabledOnServer();
  const items = enabled ? await listExplainers() : [];
  return (
    <>
      <SiteHeader nav={nav} />
      <main id="main" className={`container ${styles.page}`}>
        <h1 className={styles.title}>Товч тайлбар хянах</h1>
        <ol className={styles.steps}>
          <li>Төслийн дугаараа оруулаад AI-аар ноорог үүсгэнэ.</li>
          <li>Өгүүлбэр бүрийг баруун талын эх заалттай тулгаж, шаардлагатай бол засна.</li>
          <li>Шалгасан гэдгээ тэмдэглээд батална — зөвхөн дараа нь олон нийтэд харагдана.</li>
        </ol>
        {enabled ? (
          <ReviewDesk initial={items} defaultBillId={11151} needsToken={process.env.NODE_ENV !== "development"} />
        ) : (
          <p className={styles.disabled}>Хянах хэсэг энэ орчинд идэвхгүй байна (REVIEW_TOKEN тохируулаагүй).</p>
        )}
      </main>
    </>
  );
}
