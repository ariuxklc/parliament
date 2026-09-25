"use server";

import { revalidatePath } from "next/cache";
import {
  getOpportunity,
  isOpen,
  listApplications,
  newCode,
  newId,
  normalizeCode,
  saveApplication,
  slotUsage,
  spotsLeft,
} from "@/lib/youth/store";
import { APPLICATION_STATUSES, type Application } from "@/lib/youth/types";
import { slotLabel, todayUB } from "@/lib/youth/format";

const str = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const digits = (s: string) => s.replace(/\D/g, "");
// Mongolian mobile/landline numbers are 8 digits; allow an optional +976 prefix.
const validPhone = (s: string) => /^(976)?\d{8}$/.test(digits(s));
const samePhone = (a: string, b: string) => digits(a).slice(-8) === digits(b).slice(-8);

export type ApplyState = { ok: false; message: string; field?: string } | { ok: true; code: string; slots: string[]; title: string } | null;

export async function apply(opportunityId: string, _: ApplyState, form: FormData): Promise<ApplyState> {
  if (form.get("website")) return { ok: false, message: "Алдаа гарлаа." }; // honeypot
  const o = getOpportunity(opportunityId);
  if (!o || !isOpen(o)) return { ok: false, message: "Энэ зарын бүртгэл хаагдсан байна." };

  const today = todayUB();
  const used = slotUsage(o.id);
  const slotIds = form.getAll("slot").map(String);
  const slots = o.slots.filter((s) => slotIds.includes(s.id) && s.date >= today && spotsLeft(s, used) > 0);
  if (!slots.length) return { ok: false, message: "Боломжтой дор хаяж нэг цаг сонгоно уу.", field: "slot" };

  const name = str(form, "name", 80);
  const school = str(form, "school", 120);
  const grade = Number(form.get("grade"));
  const phone = str(form, "phone", 20);
  const email = str(form, "email", 120) || null;
  const parentName = str(form, "parentName", 80);
  const parentPhone = str(form, "parentPhone", 20);
  const motivation = str(form, "motivation", 1200);

  if (name.length < 2) return { ok: false, message: "Нэрээ бичнэ үү.", field: "name" };
  if (school.length < 2) return { ok: false, message: "Сургуулиа бичнэ үү.", field: "school" };
  if (!Number.isInteger(grade) || grade < o.gradeMin || grade > o.gradeMax)
    return { ok: false, message: `Энэ зар ${o.gradeMin}–${o.gradeMax}-р ангийн сурагчдад зориулагдсан.`, field: "grade" };
  if (!validPhone(phone)) return { ok: false, message: "Утасны дугаараа 8 оронтойгоор бичнэ үү.", field: "phone" };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, message: "И-мэйл хаяг буруу байна.", field: "email" };
  if (parentName.length < 2) return { ok: false, message: "Эцэг эх/асран хамгаалагчийн нэрийг бичнэ үү.", field: "parentName" };
  if (!validPhone(parentPhone)) return { ok: false, message: "Эцэг эхийн утасны дугаарыг 8 оронтойгоор бичнэ үү.", field: "parentPhone" };
  if (samePhone(phone, parentPhone)) return { ok: false, message: "Эцэг эхийн утас таны утаснаас өөр байх ёстой.", field: "parentPhone" };
  if (form.get("consent") !== "on") return { ok: false, message: "Эцэг эх/асран хамгаалагчийн зөвшөөрлийг тэмдэглэнэ үү.", field: "consent" };
  if (motivation.length < 30) return { ok: false, message: "Яагаад оролцохыг хүсэж байгаагаа дор хаяж 30 тэмдэгтээр бичнэ үү.", field: "motivation" };

  const duplicate = listApplications().some(
    (a) => a.opportunityId === o.id && a.status !== "withdrawn" && samePhone(a.student.phone, phone),
  );
  if (duplicate) return { ok: false, message: "Та энэ зарт аль хэдийн бүртгүүлсэн байна. Төлөвөө кодоороо шалгана уу.", field: "phone" };

  const now = new Date().toISOString();
  const app: Application = {
    id: newId(),
    code: newCode(),
    opportunityId: o.id,
    slotIds: slots.map((s) => s.id),
    confirmedSlotId: null,
    student: { name, school, grade, phone, email },
    parent: { name: parentName, phone: parentPhone, consent: true },
    motivation,
    status: "submitted",
    officeNote: null,
    parentCalled: false,
    createdAt: now,
    updatedAt: now,
  };
  saveApplication(app);
  revalidatePath("/dadlaga/admin");
  return { ok: true, code: app.code, slots: slots.map(slotLabel), title: o.title };
}

export type StatusView = {
  code: string;
  status: keyof typeof APPLICATION_STATUSES;
  statusLabel: string;
  title: string;
  host: string;
  opportunityId: string;
  chosen: string[];
  confirmed: string | null;
  location: string;
  officeNote: string | null;
  updatedAt: string;
};
export type StatusState = { ok: false; message: string } | { ok: true; view: StatusView } | null;

function find(codeRaw: string, phoneRaw: string) {
  const code = normalizeCode(codeRaw);
  if (!code || !validPhone(phoneRaw)) return null;
  // Both must match: a guessed code alone reveals nothing.
  return listApplications().find((a) => a.code === code && samePhone(a.student.phone, phoneRaw)) ?? null;
}

function view(a: Application): StatusView {
  const o = getOpportunity(a.opportunityId);
  const slot = (id: string) => o?.slots.find((s) => s.id === id);
  return {
    code: a.code,
    status: a.status,
    statusLabel: APPLICATION_STATUSES[a.status],
    title: o?.title ?? "(устгагдсан зар)",
    host: o?.host ?? "",
    opportunityId: a.opportunityId,
    chosen: a.slotIds.map((id) => slot(id)).filter(Boolean).map((s) => slotLabel(s!)),
    confirmed: a.confirmedSlotId && slot(a.confirmedSlotId) ? slotLabel(slot(a.confirmedSlotId)!) : null,
    location: o?.location ?? "",
    officeNote: a.officeNote,
    updatedAt: a.updatedAt,
  };
}

export async function lookup(_: StatusState, form: FormData): Promise<StatusState> {
  const a = find(str(form, "code", 20), str(form, "phone", 20));
  if (!a) return { ok: false, message: "Код эсвэл утасны дугаар таарахгүй байна." };
  return { ok: true, view: view(a) };
}

export async function withdraw(_: StatusState, form: FormData): Promise<StatusState> {
  const a = find(str(form, "code", 20), str(form, "phone", 20));
  if (!a) return { ok: false, message: "Код эсвэл утасны дугаар таарахгүй байна." };
  if (a.status === "withdrawn" || a.status === "rejected") return { ok: true, view: view(a) };
  a.status = "withdrawn";
  a.confirmedSlotId = null;
  a.updatedAt = new Date().toISOString();
  saveApplication(a);
  revalidatePath("/dadlaga/admin");
  return { ok: true, view: view(a) };
}
