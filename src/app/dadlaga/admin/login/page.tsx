import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { YouthShell } from "@/components/youth/YouthShell";
import { currentViewer } from "@/lib/youth/auth";
import page from "@/components/ask/askPage.module.css";
import bill from "@/components/youth/forms.module.css";
import { LoginForm, StaffLoginForm } from "./LoginForm";
import { passcodeConfigured } from "@/lib/staff-auth";

export const metadata: Metadata = { title: "Ажлын албаны нэвтрэлт — Залуучуудын дадлага" };

export default async function OfficeLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/dadlaga/admin" } = await searchParams;
  if (await currentViewer()) redirect(next.startsWith("/dadlaga/admin") ? next : "/dadlaga/admin");
  return (
    <YouthShell crumbs={[{ href: "/dadlaga", label: "Залуучуудын дадлага" }, { label: "Нэвтрэх" }]}>
      <div className={`${bill.panel} ${bill.narrow}`}>
        <p className={page.eyebrow}>УИХ-ын гишүүний ажлын алба</p>
        <h1 className={bill.headline} style={{ marginTop: 8 }}>
          Дадлагын зар удирдах
        </h1>
        <p className={bill.muted} style={{ marginTop: 8 }}>
          Ажлын алба бүр өөрийн нэвтрэх эрхтэй. Эрхийг УИХ-ын Тамгын газар олгоно.
        </p>
        <LoginForm next={next} />
        {passcodeConfigured() ? (
          <details style={{ marginTop: 20 }}>
            <summary className={bill.muted} style={{ cursor: "pointer" }}>
              Тамгын газрын ажилтан уу? Бүх албаны зарыг харах
            </summary>
            <StaffLoginForm />
          </details>
        ) : null}
      </div>
    </YouthShell>
  );
}
