import type { Metadata } from "next";
import { YouthShell } from "@/components/youth/YouthShell";
import page from "@/components/ask/askPage.module.css";
import { StatusForm } from "./StatusForm";

export const metadata: Metadata = { title: "Бүртгэлийн төлөв — Залуучуудын дадлага" };

export default async function StatusPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code = "" } = await searchParams;
  return (
    <YouthShell crumbs={[{ href: "/dadlaga", label: "Залуучуудын дадлага" }, { label: "Төлөв шалгах" }]}>
      <p className={page.eyebrow}>Залуучуудын дадлага</p>
      <h1 className={page.title}>Бүртгэлийн төлөв шалгах</h1>
      <p className={page.lede}>Бүртгүүлэхэд авсан код болон утасны дугаараа оруулна уу. Хоёулаа таарвал л мэдээлэл харагдана.</p>
      <div style={{ maxWidth: 760, marginTop: 24 }}>
        <StatusForm initialCode={code.slice(0, 20)} />
      </div>
    </YouthShell>
  );
}
