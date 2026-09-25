import type { LawForumClause, LawForumDocument } from "../parliament/lawforum-page.ts";
import type { BillRecord, BulletinBill, MemberDetail, MemberRecord, PollRecord, ScheduleEventRecord, ScheduleRecord, SessionRecord } from "../parliament/records.ts";
import { LAWFORUM_SITE, officialUrl } from "../site.ts";
import type { Evidence } from "./types.ts";

/**
 * Official record → evidence passage. Wording states what each source does and does not establish
 * (e.g. a LawForum publication date is not a formal submission date), so the model is not tempted
 * to over-read it. Numbers are copied verbatim from the source for the numeric grounding check.
 */

const clip = (value: string, max: number) => (value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value);

export function stageListing(stage: BillRecord["stage"]): string {
  return stage === "submitted"
    ? "LawForum-ын «Өргөн мэдүүлсэн төслүүд» хэсэгт бүртгэлтэй"
    : "LawForum-ын «Боловсруулж буй төслүүд» хэсэгт бүртгэлтэй (олон нийтээс санал авч буй)";
}

export function billEvidence(bill: BillRecord): Evidence {
  return {
    sourceId: `lawforum-${bill.id}`,
    kind: "bill",
    publisher: "LawForum",
    title: `LawForum — «${clip(bill.title, 120)}»`,
    url: bill.url,
    entity: { type: "bill", id: String(bill.id) },
    text:
      `Төслийн нэр: «${bill.title}». Төрөл: ${bill.typeTitle}${bill.categoryTitle ? `; ангилал: ${bill.categoryTitle}` : ""}. ` +
      `${stageListing(bill.stage)}. LawForum-д нийтэлсэн огноо: ${bill.publishedDate} ` +
      `(энэ нь УИХ-д албан ёсоор өргөн мэдүүлсэн огноо гэсэн үг биш). ` +
      `LawForum нь хэлэлцүүлгийн нарийвчилсан шатыг энэ бүртгэлд заадаггүй.`,
  };
}

export function clauseEvidence(bill: BillRecord, clause: LawForumClause): Evidence {
  const label = clause.number ? `${clause.number} дэх хэсэг` : clip(clause.article || clause.text, 60);
  const context = clause.article && clause.article !== clause.text ? `${clause.article}: ` : "";
  return {
    sourceId: `lawforum-${bill.id}-c${clause.anchor}`,
    kind: "bill_text",
    publisher: "LawForum",
    title: `«${clip(bill.title, 80)}» төсөл, ${label}`,
    url: `${bill.url}#${clause.anchor}`,
    entity: { type: "bill", id: String(bill.id) },
    text: clip(`${context}${clause.text}`, 1_100),
  };
}

export function outlineEvidence(bill: BillRecord, doc: LawForumDocument): Evidence | null {
  const headings = doc.clauses.filter((c) => c.isHeading).map((c) => c.text);
  if (headings.length < 2) return null;
  return {
    sourceId: `lawforum-${bill.id}-outline`,
    kind: "bill_outline",
    publisher: "LawForum",
    title: `«${clip(bill.title, 90)}» төслийн бүтэц`,
    url: bill.url,
    entity: { type: "bill", id: String(bill.id) },
    text: clip(`Төслийн зүйлүүдийн гарчиг (LawForum дээрх төслийн эх бичвэрээс): ${headings.join("; ")}.`, 1_600),
  };
}

export function filesEvidence(bill: BillRecord, doc: LawForumDocument): Evidence | null {
  const labels = [...new Set(doc.files.map((f) => f.label))];
  if (!labels.length) return null;
  return {
    sourceId: `lawforum-${bill.id}-files`,
    kind: "bill_files",
    publisher: "LawForum",
    title: `«${clip(bill.title, 90)}» — төслийн албан ёсны файлууд`,
    url: bill.url,
    entity: { type: "bill", id: String(bill.id) },
    text: clip(`LawForum хуудсанд хавсаргасан файлуудын нэр: ${labels.join("; ")}. Эдгээр файлын агуулгыг энэ хариултад уншаагүй.`, 1_200),
  };
}

export function bulletinEvidence(row: BulletinBill): Evidence {
  const stages = row.stages.length
    ? row.stages
        .map((s, i) => `${i + 1}) ${s.label} — Байнгын хороо: ${s.committeeNote || "огноо тэмдэглээгүй"}; Нэгдсэн хуралдаан: ${s.plenaryNote || "огноо тэмдэглээгүй"}`)
        .join(". ")
    : "шатны тэмдэглэл байхгүй";
  return {
    sourceId: `bulletin-${row.id}`,
    kind: "bulletin",
    publisher: "new.parliament.mn",
    title: `УИХ-ын хуулийн төслийн мэдээлэл (${row.snapshotDate}) — «${clip(row.title, 80)}»`,
    url: row.url,
    entity: { type: "bulletin", id: String(row.id) },
    text: clip(
      `«${row.bulletinTitle}» жагсаалт, ${row.snapshotDate}-ны байдлаар. Төсөл: «${row.title}». Ангилал: ${row.category}. ` +
        `Санаачлагч: ${row.initiator ?? "тэмдэглээгүй"}. Өргөн мэдүүлсэн огноо: ${row.submittedDate ?? "тэмдэглээгүй"}. ` +
        `Хариуцах байнгын хороо: ${row.committee ?? "тэмдэглээгүй"}.${row.workingGroup ? ` Ажлын хэсэг: ${row.workingGroup}.` : ""} ` +
        `Хэлэлцүүлгийн шатны тэмдэглэл: ${stages}.`,
      1_500,
    ),
  };
}

export function pollEvidence(p: PollRecord): Evidence {
  const pct = (n: number | null) => (n === null ? "" : ` (${n}%)`);
  return {
    sourceId: `poll-${p.id}`,
    kind: "vote",
    publisher: "new.parliament.mn",
    title: `Санал хураалт, ${p.date} — ${clip(p.motion, 80)}`,
    url: p.url,
    entity: { type: "vote", id: String(p.id) },
    text: clip(
      `Санал хураалтын асуулт: «${p.motion}». ${p.meetingTitle}, ${p.date}.` +
        `${p.agendaTitle ? ` Энэ санал хураалт «${p.agendaTitle}» гэсэн хэлэлцэх асуудлын хүрээнд явагдсан` : ""}` +
        `${p.agendaTitle && /хамт\s+өргөн\s+мэдүүлсэн/iu.test(p.agendaTitle) ? " (гарчигт дурдсанаар энэ асуудалд хамт өргөн мэдүүлсэн төслүүд багтана)." : p.agendaTitle ? "." : ""} ` +
        `Зөвшөөрсөн: ${p.forCount}${pct(p.forPercent)}; татгалзсан: ${p.againstCount}${pct(p.againstPercent)}; нийт санал өгсөн: ${p.totalVoted}` +
        `${p.notVoted !== null ? `; санал өгөөгүй: ${p.notVoted}` : ""}${p.totalMembers !== null ? `; нийт гишүүн: ${p.totalMembers}` : ""}. ` +
        `Албан ёсны үр дүн: ${p.resultLabel}.`,
      1_200,
    ),
  };
}

export function memberEvidence(m: MemberRecord, detail: MemberDetail | null, includeAttendance: boolean): Evidence[] {
  const roles = m.positions
    .filter((p) => p.unitType !== "PARLIAMENT" || p.title !== "Гишүүн")
    .map((p) => `${p.unit} — ${p.title}`);
  const out: Evidence[] = [
    {
      sourceId: `member-${m.id}`,
      kind: "member",
      publisher: "new.parliament.mn",
      title: `УИХ-ын гишүүн ${m.shortName}`,
      url: m.url,
      entity: { type: "member", id: String(m.id) },
      text: clip(
        `${m.lastName} овогтой ${m.firstName} (${m.shortName}), Улсын Их Хурлын гишүүн. Нам: ${m.party ?? "тэмдэглээгүй"}.` +
          `${m.role ? ` Албан тушаал: ${m.role}.` : ""} ` +
          `Албан ёсны гишүүдийн жагсаалтад бүртгэлтэй хороо, дэд хорооны гишүүнчлэл: ${roles.length ? roles.join("; ") : "бүртгэлгүй"}.`,
        1_200,
      ),
    },
  ];
  if (detail) {
    const parts = [
      detail.constituency ? `Тойрог: ${detail.constituency}${detail.electionSystem ? ` (${detail.electionSystem})` : ""}.` : "",
      detail.electionName ? `Сонгууль: ${detail.electionName}.` : "",
      detail.positions.length ? `Одоогийн албан тушаалууд: ${detail.positions.map((p) => `${p.unit} — ${p.title}`).join("; ")}.` : "",
      includeAttendance && detail.attendance
        ? `Нэгдсэн хуралдааны ирц: ${detail.attendance.percentage}% (${detail.attendance.present}/${detail.attendance.total} хуралдаан; ${detail.attendance.scope}).`
        : "",
    ].filter(Boolean);
    if (parts.length) {
      out.push({
        sourceId: `member-${m.id}-detail`,
        kind: "member",
        publisher: "new.parliament.mn",
        title: `УИХ-ын гишүүн ${m.shortName} — дэлгэрэнгүй`,
        url: detail.url,
        entity: { type: "member", id: String(m.id) },
        text: clip(parts.join(" "), 1_200),
      });
    }
  }
  return out;
}

export function committeeEvidence(unitId: number, unit: string, members: MemberRecord[]): Evidence {
  const rows = members.map((m) => ({ m, title: m.positions.find((p) => p.unitId === unitId)?.title ?? "Гишүүн" }));
  const leaders = rows.filter((r) => r.title !== "Гишүүн").map((r) => `${r.title}: ${r.m.shortName}`);
  const plain = rows.filter((r) => r.title === "Гишүүн").map((r) => r.m.shortName);
  return {
    sourceId: `committee-${unitId}`,
    kind: "committee",
    publisher: "new.parliament.mn",
    title: `${unit} — гишүүд`,
    url: officialUrl.committee(unitId),
    text: clip(
      `${unit}. Албан ёсны гишүүдийн жагсаалтаар тоолсон гишүүдийн тоо: ${rows.length} (тоог сервер тоолсон). ` +
        `${leaders.length ? `Удирдлага: ${leaders.join("; ")}. ` : ""}Бусад гишүүд: ${plain.join(", ")}.`,
      1_500,
    ),
  };
}

export function committeesListEvidence(committees: string[]): Evidence {
  return {
    sourceId: "committees",
    kind: "committee",
    publisher: "new.parliament.mn",
    title: "УИХ-ын байнгын хороод",
    url: officialUrl.memberList(),
    text: `Албан ёсны гишүүдийн жагсаалтад бүртгэлтэй байнгын хороод (${committees.length}, тоог сервер тоолсон): ${committees.join("; ")}.`,
  };
}

export function partyCompositionEvidence(members: MemberRecord[]): Evidence {
  const counts = new Map<string, number>();
  for (const m of members) counts.set(m.party ?? "Тэмдэглээгүй", (counts.get(m.party ?? "Тэмдэглээгүй") ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([party, n]) => `${party}: ${n}`);
  return {
    sourceId: "members-composition",
    kind: "list",
    publisher: "new.parliament.mn",
    title: "УИХ-ын гишүүдийн жагсаалт — намын бүрэлдэхүүн",
    url: officialUrl.memberList(),
    text: `Албан ёсны гишүүдийн жагсаалтад ${members.length} гишүүн бүртгэлтэй (тоог сервер тоолсон). Намаар: ${rows.join("; ")}.`,
  };
}

export function scheduleDayEvidence(week: ScheduleRecord, date: string, events: ScheduleEventRecord[]): Evidence {
  const kindLabel: Record<string, string> = { PLENARY: "Нэгдсэн хуралдаан", COMMITTEE: "Байнгын хороо", WORKING_GROUP: "Ажлын хэсэг" };
  const lines = events.map((e) => {
    const items = e.agendaItems.length ? `: ${e.agendaItems.map((a, i) => `${i + 1}) ${clip(a, 180)}`).join(" ")}` : "";
    return `${e.time ? `${e.time} ` : ""}${kindLabel[e.kind] ?? "Хуралдаан"} — ${clip(e.title, 140)}${items}`;
  });
  return {
    sourceId: `schedule-${date}`,
    kind: "schedule",
    publisher: "new.parliament.mn",
    title: `УИХ-ын баталсан хуваарь, ${date} (${events[0]?.weekday ?? ""})`,
    url: week.url,
    text: clip(`«${week.title}» хуваарь (${week.startDate}–${week.endDate}), ${date}: ${lines.join(" | ")}.`, 1_500),
  };
}

export function sessionsEvidence(sessions: SessionRecord[]): Evidence {
  const rows = sessions.slice(0, 6).map((s) => `${s.label}: анхны нэгдсэн хуралдаан ${s.startDate}, сүүлд бүртгэгдсэн ${s.endDate}, нэгдсэн хуралдааны тоо ${s.meetingCount}`);
  return {
    sourceId: "sessions",
    kind: "session",
    publisher: "new.parliament.mn",
    title: "УИХ-ын чуулганууд (ирцийн бүртгэлээс)",
    url: sessions[0]?.url ?? officialUrl.plenaryMeetings(),
    text: `Албан ёсны ирцийн бүртгэлд буй чуулганууд (сүүлийнхээс нь): ${rows.join("; ")}. Сүүлд бүртгэгдсэн огноо нь чуулган хаагдсан огноо биш.`,
  };
}

export function billListEvidence(label: string, total: number, bills: BillRecord[]): Evidence {
  const rows = bills.map((b, i) => `${i + 1}) «${clip(b.title, 150)}» — ${b.typeTitle}, LawForum-д нийтэлсэн ${b.publishedDate}, ${b.stage === "submitted" ? "Өргөн мэдүүлсэн төслүүд хэсэгт" : "Боловсруулж буй төслүүд хэсэгт"}`);
  return {
    sourceId: `lawforum-list`,
    kind: "list",
    publisher: "LawForum",
    title: `LawForum — ${label}`,
    url: `${LAWFORUM_SITE}/projects`,
    text: clip(`${label}. LawForum-ын нийтэд нээлттэй бүртгэлээс шүүсэн нийт тоо: ${total} (тоог сервер тоолсон). ${bills.length ? `Хамгийн сүүлийнх нь: ${rows.join("; ")}.` : ""}`, 2_000),
  };
}

export function bulletinSummaryEvidence(rows: BulletinBill[]): Evidence | null {
  if (!rows.length) return null;
  const byCategory = new Map<string, number>();
  for (const r of rows) byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  return {
    sourceId: "bulletin-summary",
    kind: "list",
    publisher: "new.parliament.mn",
    title: `УИХ-ын хуулийн төслийн мэдээлэл (${rows[0].snapshotDate})`,
    url: rows[0].url,
    text:
      `«${rows[0].bulletinTitle}» жагсаалтад ${rows[0].snapshotDate}-ны байдлаар ${rows.length} төсөл бүртгэлтэй (тоог сервер тоолсон). ` +
      `Ангиллаар: ${[...byCategory.entries()].map(([k, v]) => `${k}: ${v}`).join("; ")}.`,
  };
}
