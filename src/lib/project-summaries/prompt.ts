/**
 * Instructions + strict output schema for project briefs. Pure.
 * The model sees: project title/type/initiator/date (official metadata) and numbered excerpts of the
 * project's own official files. It never sees URLs, file ids, keys or tools.
 */

import type { SelectedDoc } from "./sources.ts";

export const PROMPT_VERSION = 1;

export const INSTRUCTIONS = `Чи Монгол Улсын Их Хуралд өргөн мэдүүлсэн хууль, тогтоолын төслийн албан ёсны баримт бичгийг иргэдэд товч, ойлгомжтой танилцуулдаг туслах.

Эх сурвалж: ЗӨВХӨН доор өгөгдсөн хэсгүүд (D1.1, D2.3 гэх мэт дугаартай). Баримт бүрийн төрлийг (төслийн эх бичвэр, үзэл баримтлал, танилцуулга, судалгаа …) харгалз. Гаднын мэдлэг, таамаг, өөрийн дүгнэлт бүү нэм.

Гаргах хэсгүүд:
1) summary — төсөл юуны тухай болохыг 2–4 өгүүлбэрээр.
2) mainChanges — төслөөр санал болгож буй гол өөрчлөлт, шинэ зохицуулалт 3–7 (эх бичвэрт тодорхой байвал л). Шинэ хууль бол гол зохицуулалтууд; нэмэлт, өөрчлөлт бол юуг хэрхэн өөрчлөх.
3) statedRationale — яагаад өргөн мэдүүлснийг (ямар асуудал, шаардлагыг дурдсан) баримт бичигт бичсэнээр 1–3 өгүүлбэр. Тодорхой бичээгүй бол хоосон массив.
4) affectedAreas — хэнд, юунд хамаарах: иргэд, байгууллага, аж ахуйн нэгж, салбар, төрийн байгууллага … 1–5. who = богино нэр (2–5 үг), text = тэдэнд юу өөрчлөгдөх.
5) keyPoints — анхаарах гол зүйлс: шинэ үүрэг, хугацаа, чухал тодорхойлолт, хэрэгжүүлэх байгууллага, бүтцийн өөрчлөлт, хүчин төгөлдөр болох хугацаа. 0–5.

Заавал мөрдөх:
- Өгүүлбэр бүрийн refs-д түүнийг шууд дэмжих хэсгийн дугаар(ууд)-ыг бич. Дэмжих хэсэггүй зүйл бүү бич. Хэсэг дүүргэх гэж зохиож болохгүй — хоосон байж болно.
- Тоо, огноо, хувь, мөнгөн дүнг зөвхөн иш татсан хэсэгт яг байгаа бол л, тэр хэлбэрээр нь бич.
- Энэ бол батлагдаагүй төсөл: "төсөлд … гэж тусгасан", "… санал болгож байна" гэх мэтээр бич. "Хууль батлагдсан", "хэрэгжиж байна" гэж бүү бич.
- Шалтгаан, зорилгыг хууль санаачлагчийнх гэдгийг илэрхийл ("танилцуулгад дурдсанаар …", "үзэл баримтлалд …").
- Төвийг сахи: сайн/муу гэж үнэлэх, дэмжих/эсэргүүцэхийг ятгах, улс төрийн сэдэл таамаглах, баримтад байхгүй хууль зүйн үр дагавар зохиохыг хориглоно.
- Энгийн, 20–30 насны иргэнд ойлгогдох хэлээр. Хуулийн нэр томьёог шаардлагатай бол энгийнээр тайлбарла. Өгүүлбэр бүр 35 үгээс богино.
- Хэсгүүд хэт богино, ойлгомжгүй, эсвэл өөр сэдвийн баримт бол insufficientEvidence = true.
Хариултыг зөвхөн JSON схемээр, монгол хэлээр өг.`;

const statement = {
  type: "object",
  additionalProperties: false,
  required: ["text", "refs"],
  properties: { text: { type: "string" }, refs: { type: "array", items: { type: "string" } } },
} as const;

export const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["insufficientEvidence", "summary", "mainChanges", "statedRationale", "affectedAreas", "keyPoints"],
  properties: {
    insufficientEvidence: { type: "boolean" },
    summary: { type: "array", items: statement },
    mainChanges: { type: "array", items: statement },
    statedRationale: { type: "array", items: statement },
    affectedAreas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["who", "text", "refs"],
        properties: { who: { type: "string" }, text: { type: "string" }, refs: { type: "array", items: { type: "string" } } },
      },
    },
    keyPoints: { type: "array", items: statement },
  },
} as const;

export interface ProjectMetaForModel {
  title: string;
  type: string | null;
  initiator: string | null;
  date: string | null;
}

/** Exactly what the model sees. A test asserts that no URL or file id leaks in here. */
export function buildModelInput(project: ProjectMetaForModel, docs: SelectedDoc[]) {
  return {
    project: {
      title: project.title,
      type: project.type,
      initiator: project.initiator,
      date: project.date,
      note: "Улсын Их Хуралд өргөн мэдүүлсэн төсөл (батлагдаагүй байж болно).",
    },
    documents: docs.map((d) => ({
      ref: d.ref,
      kind: d.input.role,
      category: d.input.doc.category,
      title: d.input.doc.filename.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " "),
      excerpts: d.excerpts.map((e) => ({ id: e.id, heading: e.heading, text: e.text })),
    })),
  };
}
