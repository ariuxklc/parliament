// Offline tests for «Өргөн мэдүүлсэн төслүүд» (submitted projects): normalization, document extraction,
// source selection and the server-side checks on AI briefs. No network. Run: npm run test:projects
import { test } from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { normalizeProject, coreTitleKey, isProjectId, ubDate } from "../src/lib/projects/normalize.ts";
import { parseDocumentXml, extractDocx } from "../src/lib/documents/docx.ts";
import { headingLevel } from "../src/lib/documents/structure.ts";
import { judgePdfText } from "../src/lib/documents/extract.ts";
import { sniff, downloadOfficialFile } from "../src/lib/documents/official-file.ts";
import { roleOf, labelFor, toSections, selectExcerpts } from "../src/lib/project-summaries/sources.ts";
import { buildModelInput } from "../src/lib/project-summaries/prompt.ts";
import { validateBrief, numbersGrounded } from "../src/lib/project-summaries/validate.ts";

const PROJECT_ID = "9fc73f2c-cd0a-4004-bb46-38bde21358c8";

// Shape of a real d.parliament.mn record (trimmed): /tusul/tusulList, 2026-09-25.
const raw = {
  id: PROJECT_ID,
  type: "TUSUL",
  name: "БАЙГАЛИЙН НӨӨЦ АШИГЛАЛТЫН ИЛ ТОД БАЙДЛЫН ТУХАЙ",
  name1: "Монгол Улсын хууль",
  lawDate: "2026-09-11T08:00:00.000Z",
  publishDate: "2026-09-11T08:00:00.000Z",
  jdata: {
    step: "Өргөн баригдсан",
    team: ["1a0f73e6-edb0-4204-abf2-fa61d61ad815", "75cf7a51-31c8-4248-8abf-c0225cc9458b"],
    attachments: [
      { category: { id: "1", title: "Өргөн мэдүүлэх -Үзэл баримтлал" }, files: [{ title: null, fileUrl: "/files/18250/?d=1", fileName: "Үзэл баримтлал.pdf", fileType: "application/pdf" }] },
      {
        category: { id: "76", title: "Өргөн мэдүүлэх -Төслийн документ файл /DOC, DOCX/" },
        files: [
          { title: null, fileUrl: "/files/18253/?d=1", fileName: "Хуулийн_Төсөл_final.docx", fileType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
          { title: null, fileUrl: "https://evil.example/files/1/", fileName: "x.pdf", fileType: "application/pdf" },
          { title: null, fileUrl: "/files/18253/?d=1", fileName: "duplicate.docx", fileType: null },
        ],
      },
      { category: { id: "34", title: "Анхны хэлэлцүүлэг -Холбогдох Байнгын, дэд, түр хорооны санал, дүгнэлт" }, files: [{ title: null, fileUrl: "/files/19001/", fileName: "Санал дүгнэлт.pdf", fileType: "application/pdf" }] },
    ],
  },
  creator: { id: "b0c9", name: "УЯНГА", name1: "УИХ-ын гишүүн", parentId: "ba8970de-3012-4c5b-b38d-88138769b87f", jdata: { ovog: "Болдын" } },
};

test("normalizeProject keeps verified fields and only LawForum file paths", () => {
  const p = normalizeProject(raw);
  assert.equal(p.title, raw.name);
  assert.equal(p.type, "Монгол Улсын хууль");
  assert.equal(p.date, "2026-09-11");
  assert.equal(p.year, 2026);
  assert.deepEqual(p.initiator, { name: "Б.Уянга", role: "УИХ-ын гишүүн", group: "УИХ-ын гишүүд" });
  assert.equal(p.coInitiatorCount, 2);
  assert.equal(p.officialUrl, `https://d.parliament.mn/tusul/${PROJECT_ID}`);
  assert.deepEqual(p.documents.map((d) => d.fileId), [18250, 18253, 19001], "off-site URL and duplicate id are dropped");
  const concept = p.documents[0];
  assert.equal(concept.step, "Өргөн мэдүүлэх");
  assert.equal(concept.category, "Үзэл баримтлал");
  assert.equal(concept.officialUrl, "https://lawforum.parliament.mn/files/18250/?d=1");
  assert.equal(concept.viewUrl, "https://lawforum.parliament.mn/files/18250/");
  assert.equal(p.documents[1].fileType, "docx");
  assert.ok(!("step" in p) && !JSON.stringify(p).includes("Өргөн баригдсан"), "the hand-set stage label is not exposed");
});

test("ids and dates", () => {
  assert.ok(isProjectId(PROJECT_ID));
  assert.ok(!isProjectId("../etc/passwd") && !isProjectId("9FC73F2C-CD0A-4004-BB46-38BDE21358C8x"));
  assert.equal(normalizeProject({ ...raw, id: "not-a-uuid" }), null);
  assert.equal(normalizeProject({ ...raw, type: "NEWS" }), null);
  assert.equal(ubDate("2025-12-31T17:00:00.000Z"), "2026-01-01", "Ulaanbaatar is UTC+8");
});

test("coreTitleKey matches bulletin titles with package notes, and keeps different subjects apart", () => {
  const bulletin = "Сургуулийн орчны эрүүл мэнд,\nаюулгүй байдлын тухай хуулийн\nтөсөл болон хамт өргөн\nмэдүүлсэн хуулийн төслүүд (3)\n/Анхдагч хуулийн төсөл/";
  assert.equal(coreTitleKey(bulletin), coreTitleKey("Сургуулийн орчны эрүүл мэнд, аюулгүй байдлын тухай"));
  assert.equal(coreTitleKey("ХОТ, ТОСГОНЫ ЭРХ ЗҮЙН БАЙДЛЫН ТУХАЙ ХУУЛЬ /ШИНЭЧИЛСЭН НАЙРУУЛГА/"), "хот тосгоны эрх зүйн байдлын тухай");
  assert.notEqual(
    coreTitleKey("ҮНДЭСНИЙ ИХ БАЯР НААДМЫН ТУХАЙ ХУУЛЬД ӨӨРЧЛӨЛТ ОРУУЛАХ ТУХАЙ"),
    coreTitleKey("ҮНДЭСНИЙ ИХ БАЯР НААДМЫН ТУХАЙ ХУУЛЬД НЭМЭЛТ, ӨӨРЧЛӨЛТ ОРУУЛАХ ТУХАЙ"),
  );
});

/* ---------------------------------------------------------------- documents */

const W = (body) => `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>${body}</w:body></w:document>`;
const P = (text, ppr = "") => `<w:p><w:pPr>${ppr}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

test("DOCX parser: headings, lists, tables, tracked deletions, entities", () => {
  const xml = W(
    P("НЭГДҮГЭЭР БҮЛЭГ") +
      P("1 дүгээр зүйл.Хуулийн зорилго") +
      P("1.1.Энэ хуулийн зорилго нь ил тод байдлыг &amp; хяналтыг хангах") +
      P("Жагсаалтын мөр", '<w:numPr><w:ilvl w:val="0"/></w:numPr>') +
      P("Гарчиг хэв маяг", '<w:pStyle w:val="Heading2"/>') +
      `<w:p><w:r><w:t>үлдэх</w:t></w:r><w:del><w:r><w:delText>устгасан</w:delText></w:r></w:del></w:p>` +
      `<w:tbl><w:tr><w:tc>${P("Нүд 1")}</w:tc><w:tc>${P("Нүд 2")}</w:tc></w:tr><w:tr><w:tc>${P("3")}</w:tc><w:tc>${P("4")}</w:tc></w:tr></w:tbl>`,
  );
  const blocks = parseDocumentXml(xml);
  assert.deepEqual(
    blocks.map((b) => [b.kind, b.text, b.level ?? null]),
    [
      ["heading", "НЭГДҮГЭЭР БҮЛЭГ", 1],
      ["heading", "1 дүгээр зүйл.Хуулийн зорилго", 2],
      ["paragraph", "1.1.Энэ хуулийн зорилго нь ил тод байдлыг & хяналтыг хангах", null],
      ["list", "Жагсаалтын мөр", null],
      ["heading", "Гарчиг хэв маяг", 2],
      ["paragraph", "үлдэх", null],
      ["table", "Нүд 1 | Нүд 2\n3 | 4", null],
    ],
  );
});

test("DOCX extraction reads a real zip container", () => {
  // minimal zip: one deflated entry word/document.xml
  const name = Buffer.from("word/document.xml");
  const data = Buffer.from(W(P("Сайн байна уу")), "utf8");
  const comp = deflateRawSync(data);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const cdOffset = local.length + name.length + comp.length;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length + name.length, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  const zip = Buffer.concat([local, name, comp, central, name, eocd]);
  assert.equal(sniff(zip), "zip");
  assert.deepEqual(extractDocx(zip), [{ kind: "paragraph", text: "Сайн байна уу" }]);
});

test("file sniffing and SSRF-safe downloader input", async () => {
  assert.equal(sniff(Buffer.from("%PDF-1.7\n")), "pdf");
  assert.equal(sniff(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])), "ole");
  assert.equal(sniff(Buffer.from("<html>")), "unknown");
  for (const bad of [0, -1, 1.5, Number.NaN, 1e12]) {
    await assert.rejects(downloadOfficialFile(bad), /invalid file id/);
  }
});

test("PDF text layer quality check", () => {
  assert.equal(judgePdfText(["", "", ""]).usable, false, "scanned pages");
  const good = "Энэ хуулийн зорилго нь байгалийн нөөц ашиглалтын мэдээллийг нээлттэй болгоход оршино. ".repeat(8);
  assert.equal(judgePdfText([good, good]).usable, true);
  const mojibake = "Ìîíãîë Óëñûí õóóëü õýðýãæèëò ".repeat(40);
  assert.equal(judgePdfText([mojibake]).usable, false, "CP1251 text decoded as Latin-1");
});

test("heading heuristics stay conservative", () => {
  assert.equal(headingLevel("5 дугаар зүйл.Мэдээллийн нууцлал"), 2);
  assert.equal(headingLevel("Хоёр.Хуулийн төслийн зорилго, ерөнхий бүтэц"), 1);
  assert.equal(headingLevel("ТАВДУГААР БҮЛЭГ"), 1);
  assert.equal(headingLevel("Энэ хуулийн 5.1-д заасан мэдээллийг нийтэлнэ."), 0);
});

/* ---------------------------------------------------------------- sources + model input */

test("document roles: filename first (NFD names from macOS too), then official category", () => {
  const doc = (filename, categoryId, step = "Өргөн мэдүүлэх") => ({ filename, categoryId, category: "", step });
  assert.equal(roleOf(doc("Үзэл баримтлал.pdf", "17")), "concept");
  assert.equal(roleOf(doc("08_Хэлэлцүүлгийн_үр_дүнгийн_тайлан_1.docx".normalize("NFD"), "77")), "discussion");
  assert.equal(roleOf(doc("2026.07.08_Дагах хуулийн төсөл_FINAL (1).docx", "77")), "related");
  assert.equal(roleOf(doc("final.docx", "76")), "draft");
  assert.equal(roleOf(doc("x.pdf", "34", "Анхны хэлэлцүүлэг")), "other");
  assert.equal(labelFor("draft", "Үндсэн чиглэл.docx", "Улсын Их Хурлын тогтоол"), "Тогтоолын төсөл");
  assert.equal(labelFor("introduction", "дэлгэрэнгүй танилцуулга.pdf"), "Дэлгэрэнгүй танилцуулга");
});

test("sections split at headings and stay under the size limit", () => {
  const blocks = [
    { kind: "heading", text: "1 дүгээр зүйл.Зорилго", level: 2 },
    { kind: "paragraph", text: "А. ".repeat(700) },
    { kind: "heading", text: "2 дугаар зүйл.Хүрээ", level: 2 },
    { kind: "paragraph", text: "Энэ хууль үйлчилнэ." },
  ];
  const s = toSections(blocks, 800);
  assert.ok(s.every((x) => x.text.length <= 820), "no section above the limit");
  assert.equal(s.at(-1).heading, "2 дугаар зүйл.Хүрээ");
});

test("excerpt selection respects the budget, ranks the draft first, and never exposes URLs to the model", () => {
  const p = normalizeProject(raw);
  const para = (t) => ({ kind: "paragraph", text: t });
  const inputs = [
    { doc: p.documents[0], role: "concept", blocks: [{ kind: "heading", text: "Нэг.Үндэслэл, шаардлага", level: 1 }, para("Асуудал ".repeat(300))] },
    { doc: p.documents[1], role: "draft", blocks: [{ kind: "heading", text: "1 дүгээр зүйл.Зорилго", level: 2 }, para("Зорилго нь ил тод байдал. ".repeat(200))] },
  ];
  const selected = selectExcerpts(inputs, 4_000);
  assert.equal(selected[0].input.role, "draft");
  assert.deepEqual(selected.map((d) => d.ref), ["D1", "D2"]);
  const chars = selected.reduce((n, d) => n + d.excerpts.reduce((m, e) => m + e.text.length, 0), 0);
  assert.ok(chars <= 4_000, `budget kept (${chars})`);
  const input = JSON.stringify(buildModelInput({ title: p.title, type: p.type, initiator: "Б.Уянга", date: p.date }, selected));
  assert.ok(!/https?:|lawforum|\/files\/|18250|18253/.test(input), "no URLs or file ids in the model input");
  assert.match(input, /"id":"D1\.1"/);
});

/* ---------------------------------------------------------------- validation */

test("validator drops unknown refs, ungrounded numbers, markup and evaluation", () => {
  const excerpts = new Map([
    ["D1.1", "8.2.Зөвшөөрөл эзэмшигч нь зөвшөөрөл олгосноос хойш ажлын 5 өдрийн дотор нэгдсэн порталд бүртгүүлнэ."],
    ["D1.2", "Нийт зардал 10 000 төгрөг."],
  ]);
  const out = validateBrief(
    {
      insufficientEvidence: false,
      summary: [
        { text: "Зөвшөөрөл эзэмшигч ажлын 5 өдрийн дотор бүртгүүлнэ.", refs: ["D1.1", "D9.9"] },
        { text: "Ажлын 7 өдрийн дотор бүртгүүлнэ.", refs: ["D1.1"] },
        { text: "Эх сурвалжгүй өгүүлбэр.", refs: [] },
        { text: "Дэлгэрэнгүйг https://example.com-оос үзнэ үү.", refs: ["D1.1"] },
        { text: "Иргэд энэ төслийг дэмжих ёстой.", refs: ["D1.1"] },
      ],
      mainChanges: [{ text: "Зардал нь 10000 төгрөг.", refs: ["D1.2"] }],
      statedRationale: [],
      affectedAreas: [{ who: "", text: "Зөвшөөрөл эзэмшигчид бүртгүүлнэ.", refs: ["D1.1"] }],
      keyPoints: Array.from({ length: 9 }, (_, i) => ({ text: `Порталд бүртгүүлнэ (${i === 0 ? "" : "давтагдсан "}${"а".repeat(i)}).`, refs: ["D1.1"] })),
    },
    excerpts,
    "Байгалийн нөөц",
  );
  assert.deepEqual(out.summary, [{ text: "Зөвшөөрөл эзэмшигч ажлын 5 өдрийн дотор бүртгүүлнэ.", refs: ["D1.1"] }]);
  assert.equal(out.mainChanges.length, 1, "10000 matches the source's 10 000");
  assert.equal(out.affectedAreas[0].who, "Иргэд");
  assert.equal(out.keyPoints.length, 5, "section limit");
  const reasons = out.dropped.map((d) => d.reason);
  for (const r of ["ungrounded-number", "no-valid-refs", "markup", "evaluative", "over-limit"]) assert.ok(reasons.includes(r), r);
});

test("number grounding ignores thousands separators only", () => {
  assert.ok(numbersGrounded("10,000 төгрөг", "10 000 төгрөг"));
  assert.ok(!numbersGrounded("15 хоног", "5 хоног"));
  assert.ok(numbersGrounded("3,5 хувь", "3,5 хувь"));
});
