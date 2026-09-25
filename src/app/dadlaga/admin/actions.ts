"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import {
  deleteOpportunity,
  getApplication,
  getOpportunity,
  listAccounts,
  newId,
  saveAccount,
  saveApplication,
  saveOpportunity,
  slotUsage,
  spotsLeft,
} from "@/lib/youth/store";
import { OFFICE_COOKIE, canManage, currentViewer, findByUsername, hashPassword, sessionFor, verifyPassword } from "@/lib/youth/auth";
import { MODES, OPPORTUNITY_TYPES, type Opportunity, type Slot } from "@/lib/youth/types";
import { STAFF_COOKIE, checkPasscode, passcodeConfigured, sessionToken } from "@/lib/staff-auth";

const str = (f: FormData, k: string, max = 400) => String(f.get(k) ?? "").trim().slice(0, max);
export type FormState = { ok: false; message: string } | { ok: true; message: string; secret?: string; slots?: Slot[] } | null;

async function viewerOrLogin() {
  const v = await currentViewer();
  if (!v) redirect("/dadlaga/admin/login");
  return v;
}
const refresh = (id?: string) => {
  revalidatePath("/dadlaga", "layout");
  revalidatePath("/");
  if (id) revalidatePath(`/dadlaga/${id}`);
};

// ---------- session ----------

export async function officeLogin(_: FormState, form: FormData): Promise<FormState> {
  const acc = findByUsername(str(form, "username", 60));
  // Same message and same work (a hash) whether or not the user exists.
  const ok = verifyPassword(str(form, "password", 200), acc?.passwordHash ?? hashPassword("x"));
  if (!acc || !ok || !acc.active) return { ok: false, message: "Нэвтрэх нэр эсвэл нууц үг буруу байна." };
  const s = sessionFor(acc.id);
  (await cookies()).set(OFFICE_COOKIE, s.value, { httpOnly: true, sameSite: "lax", path: "/", maxAge: s.maxAge });
  const next = str(form, "next");
  redirect(next.startsWith("/dadlaga/admin") ? next : "/dadlaga/admin");
}

export async function officeLogout() {
  (await cookies()).delete(OFFICE_COOKIE);
  redirect("/dadlaga");
}

/** Secretariat sign-in with the shared staff passcode (only when STAFF_PASSCODE is set). */
export async function staffLogin(_: FormState, form: FormData): Promise<FormState> {
  if (!passcodeConfigured() || !checkPasscode(str(form, "passcode", 200))) return { ok: false, message: "Нууц код буруу байна." };
  (await cookies()).set(STAFF_COOKIE, sessionToken(), { httpOnly: true, sameSite: "lax", path: "/", maxAge: 8 * 3600 });
  redirect("/dadlaga/admin");
}

export async function staffLogout() {
  (await cookies()).delete(STAFF_COOKIE);
  redirect("/dadlaga");
}

// ---------- listings ----------

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveListing(_: FormState, form: FormData): Promise<FormState> {
  const v = await viewerOrLogin();
  const id = str(form, "id", 20);
  const existing = id ? getOpportunity(id) : null;
  if (id && (!existing || !canManage(v, existing.ownerId))) return { ok: false, message: "Энэ зарыг засах эрхгүй байна." };

  // Owner: an office always owns what it creates; the Secretariat may assign any office (or itself).
  let ownerId = existing?.ownerId ?? (v.kind === "office" ? v.account.id : "secretariat");
  if (v.kind === "super") {
    const pick = str(form, "ownerId", 20);
    if (pick === "secretariat" || listAccounts().some((a) => a.id === pick)) ownerId = pick;
  }

  const type = str(form, "type", 20) as Opportunity["type"];
  const mode = str(form, "mode", 20) as Opportunity["mode"];
  const title = str(form, "title", 120);
  const host = str(form, "host", 160);
  const summary = str(form, "summary", 200);
  const description = str(form, "description", 4000);
  const tasks = str(form, "tasks", 2000).split("\n").map((t) => t.replace(/^[-•*]\s*/, "").trim()).filter(Boolean).slice(0, 12);
  const requirements = str(form, "requirements", 1500);
  const gradeMin = Number(form.get("gradeMin"));
  const gradeMax = Number(form.get("gradeMax"));
  const location = str(form, "location", 200);
  const deadline = str(form, "deadline", 10);
  const intent = str(form, "intent", 20);
  const status: Opportunity["status"] = intent === "publish" ? "published" : intent === "close" ? "closed" : intent === "draft" ? "draft" : (existing?.status ?? "draft");

  if (!(type in OPPORTUNITY_TYPES)) return { ok: false, message: "Төрлөө сонгоно уу." };
  if (!(mode in MODES)) return { ok: false, message: "Хэлбэрээ сонгоно уу." };
  if (title.length < 4) return { ok: false, message: "Гарчиг бичнэ үү." };
  if (host.length < 2) return { ok: false, message: "Зохион байгуулагчийг бичнэ үү." };
  if (summary.length < 10) return { ok: false, message: "Товч тайлбар (картад харагдана) бичнэ үү." };
  if (description.length < 20) return { ok: false, message: "Дэлгэрэнгүй тайлбар бичнэ үү." };
  if (![gradeMin, gradeMax].every((g) => Number.isInteger(g) && g >= 6 && g <= 12) || gradeMin > gradeMax)
    return { ok: false, message: "Ангийн хязгаар буруу байна (6–12)." };
  if (!DATE.test(deadline)) return { ok: false, message: "Бүртгэл хаагдах огноог оруулна уу." };

  // Slots come as parallel arrays; blank rows are ignored.
  const [ids, dates, starts, ends, caps] = ["slotId", "slotDate", "slotStart", "slotEnd", "slotCap"].map((k) => form.getAll(k).map(String));
  const slots: Slot[] = [];
  for (let i = 0; i < dates.length; i++) {
    if (!dates[i] && !starts[i] && !ends[i]) continue;
    const s = { id: ids[i] || newId(), date: dates[i], start: starts[i], end: ends[i], capacity: Number(caps[i]) };
    if (!DATE.test(s.date) || !TIME.test(s.start) || !TIME.test(s.end)) return { ok: false, message: `${i + 1}-р цагийн огноо/цаг дутуу байна.` };
    if (s.end <= s.start) return { ok: false, message: `${i + 1}-р цаг: дуусах цаг эхлэхээс хойно байх ёстой.` };
    if (!Number.isInteger(s.capacity) || s.capacity < 1 || s.capacity > 200) return { ok: false, message: `${i + 1}-р цаг: суудлын тоо 1–200.` };
    slots.push(s);
  }
  if (status === "published" && !slots.length) return { ok: false, message: "Нийтлэхийн өмнө дор хаяж нэг цаг нэмнэ үү." };

  // Never silently drop students: a slot with confirmed students can't be removed or shrunk below them.
  if (existing) {
    const used = slotUsage(existing.id);
    for (const old of existing.slots) {
      const n = used.get(old.id) ?? 0;
      if (!n) continue;
      const now = slots.find((s) => s.id === old.id);
      if (!now) return { ok: false, message: `${old.date} ${old.start} цагт ${n} сурагч баталгаажсан — эхлээд тэднийг шилжүүлнэ үү.` };
      if (now.capacity < n) return { ok: false, message: `${old.date} ${old.start} цагт ${n} сурагч баталгаажсан тул суудлыг ${n}-с бага болгох боломжгүй.` };
    }
  }

  const now = new Date().toISOString();
  const o: Opportunity = {
    id: existing?.id ?? newId(),
    ownerId,
    host,
    type,
    title,
    summary,
    description,
    tasks,
    requirements,
    gradeMin,
    gradeMax,
    mode,
    location,
    deadline,
    slots: slots.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
    status,
    demo: existing?.demo,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  saveOpportunity(o);
  refresh(o.id);
  if (!existing) redirect(`/dadlaga/admin/listings/${o.id}?saved=${status}`);
  const label = { draft: "Ноорог болгож хадгаллаа.", published: "Нийтэлсэн — сурагчдад харагдаж байна.", closed: "Бүртгэлийг хаалаа." }[status];
  return { ok: true, message: label, slots: o.slots };
}

export async function removeListing(form: FormData) {
  const v = await viewerOrLogin();
  const o = getOpportunity(str(form, "id", 20));
  if (!o || !canManage(v, o.ownerId)) return;
  deleteOpportunity(o.id);
  refresh();
  redirect("/dadlaga/admin");
}

// ---------- applications ----------

export async function updateApplication(_: FormState, form: FormData): Promise<FormState> {
  const v = await viewerOrLogin();
  const a = getApplication(str(form, "id", 20));
  const o = a && getOpportunity(a.opportunityId);
  if (!a || !o || !canManage(v, o.ownerId)) return { ok: false, message: "Энэ бүртгэлийг засах эрхгүй байна." };
  if (a.status === "withdrawn") return { ok: false, message: "Сурагч бүртгэлээ цуцалсан." };

  const intent = str(form, "intent", 20);
  a.parentCalled = form.get("parentCalled") === "on";
  a.officeNote = str(form, "officeNote", 1000) || null;

  if (intent === "confirm") {
    const slotId = str(form, "slotId", 20);
    const slot = o.slots.find((s) => s.id === slotId);
    if (!slot || !a.slotIds.includes(slotId)) return { ok: false, message: "Сурагчийн сонгосон цагуудаас нэгийг сонгоно уу." };
    if (!a.parentCalled) return { ok: false, message: "Баталгаажуулахын өмнө эцэг эх рүү утасдаж, тэмдэглэнэ үү." };
    const used = slotUsage(o.id);
    if (a.status === "accepted" && a.confirmedSlotId) used.set(a.confirmedSlotId, (used.get(a.confirmedSlotId) ?? 1) - 1); // moving within own seat
    if (spotsLeft(slot, used) < 1) return { ok: false, message: "Энэ цаг дүүрсэн байна. Өөр цаг сонгох эсвэл хүлээлгийн жагсаалтад оруулна уу." };
    a.status = "accepted";
    a.confirmedSlotId = slot.id;
  } else if (intent === "waitlist" || intent === "reject" || intent === "reviewing") {
    a.status = intent === "reject" ? "rejected" : intent;
    a.confirmedSlotId = null;
  } else if (intent !== "save") return { ok: false, message: "Үйлдэл тодорхойгүй." };
  else if (a.status === "submitted") a.status = "reviewing"; // someone opened and worked on it

  a.updatedAt = new Date().toISOString();
  saveApplication(a);
  refresh(o.id);
  revalidatePath(`/dadlaga/admin/applications/${a.id}`);
  const msg = { confirm: "Баталгаажууллаа.", waitlist: "Хүлээлгийн жагсаалтад орууллаа.", reject: "Татгалзсан гэж тэмдэглэлээ.", reviewing: "Хянаж байна гэж тэмдэглэлээ.", save: "Хадгаллаа." }[intent]!;
  return { ok: true, message: msg };
}

// ---------- accounts (Secretariat only) ----------

const tempPassword = () => {
  const abc = "23456789abcdefghjkmnpqrstuvwxyz";
  return [...randomBytes(12)].map((b) => abc[b % abc.length]).join("").replace(/(.{4})(?!$)/g, "$1-");
};

export async function createAccount(_: FormState, form: FormData): Promise<FormState> {
  const v = await viewerOrLogin();
  if (v.kind !== "super") return { ok: false, message: "Зөвхөн Тамгын газар бүртгэл үүсгэнэ." };
  const username = str(form, "username", 40).toLowerCase();
  const displayName = str(form, "displayName", 120);
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) return { ok: false, message: "Нэвтрэх нэр: 3–40 латин жижиг үсэг, тоо, . _ -" };
  if (displayName.length < 3) return { ok: false, message: "Албаны нэрийг бичнэ үү." };
  if (findByUsername(username)) return { ok: false, message: "Ийм нэвтрэх нэр бүртгэлтэй байна." };
  const secret = tempPassword();
  saveAccount({ id: newId(), username, displayName, passwordHash: hashPassword(secret), active: true, createdAt: new Date().toISOString() });
  revalidatePath("/dadlaga/admin/accounts");
  return { ok: true, message: `"${username}" үүслээ. Түр нууц үгийг одоо хуулж авна уу — дахин харагдахгүй.`, secret };
}

export async function resetPassword(_: FormState, form: FormData): Promise<FormState> {
  const v = await viewerOrLogin();
  if (v.kind !== "super") return { ok: false, message: "Зөвхөн Тамгын газар." };
  const acc = listAccounts().find((a) => a.id === str(form, "id", 20));
  if (!acc) return { ok: false, message: "Бүртгэл олдсонгүй." };
  const secret = tempPassword();
  saveAccount({ ...acc, passwordHash: hashPassword(secret) });
  return { ok: true, message: `"${acc.username}" шинэ түр нууц үг:`, secret };
}

export async function setAccountActive(form: FormData) {
  const v = await viewerOrLogin();
  if (v.kind !== "super") return;
  const acc = listAccounts().find((a) => a.id === str(form, "id", 20));
  if (!acc) return;
  saveAccount({ ...acc, active: form.get("active") === "1" });
  revalidatePath("/dadlaga/admin/accounts");
}
