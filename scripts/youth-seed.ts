/**
 * Seed the youth-opportunities demo: one office account and five example listings (one per type),
 * all fictional and marked demo: true ("Жишээ зар" on every card). Dates are relative to today, so
 * re-running keeps the demo fresh. Re-running replaces the demo listings (and their applications)
 * but keeps the account and its password unless --reset-password is passed.
 *
 *   npm run youth:seed                     # prints the demo login once, when it is created
 *   YOUTH_DEMO_PASSWORD=... npm run youth:seed -- --reset-password
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import type { Account, Application, Opportunity, OpportunityType, Slot } from "../src/lib/youth/types";

const DIR = path.join(process.cwd(), "data", "store");
const file = (n: string) => path.join(DIR, `youth-${n}.json`);
const load = <T,>(n: string, fb: T): T => (existsSync(file(n)) ? JSON.parse(readFileSync(file(n), "utf8")) : fb);
const save = (n: string, d: unknown) => {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${file(n)}.tmp`, JSON.stringify(d, null, 2));
  renameSync(`${file(n)}.tmp`, file(n));
};
const id = () => randomBytes(6).toString("hex");
// Same format as src/lib/youth/auth.ts hashPassword (that module is server-only).
const hash = (pw: string) => {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${scryptSync(pw, salt, 32).toString("hex")}`;
};
const day = (offset: number) => new Date(Date.now() + 8 * 3600_000 + offset * 86400_000).toISOString().slice(0, 10);
const slot = (offset: number, start: string, end: string, capacity: number): Slot => ({ id: id(), date: day(offset), start, end, capacity });

const USERNAME = "demo.office";
const HOST = "Жишээ Гишүүн — УИХ-ын гишүүний ажлын алба (жишээ)";
const now = new Date().toISOString();

// ---------- account ----------
const accounts = load<Account[]>("accounts", []);
let account = accounts.find((a) => a.username === USERNAME);
let printed: string | null = null;
if (!account || process.argv.includes("--reset-password")) {
  const pw = process.env.YOUTH_DEMO_PASSWORD || randomBytes(9).toString("base64url");
  account = { id: account?.id ?? id(), username: USERNAME, displayName: HOST, passwordHash: hash(pw), active: true, createdAt: account?.createdAt ?? now };
  save("accounts", [...accounts.filter((a) => a.id !== account!.id), account]);
  printed = pw;
}

// ---------- listings ----------
type Seed = Omit<Opportunity, "id" | "ownerId" | "host" | "status" | "demo" | "createdAt" | "updatedAt">;
const seeds: Seed[] = [
  {
    type: "shadow" satisfies OpportunityType,
    title: "Гишүүнтэй хамт нэг өдөр — Төрийн ордонд",
    summary: "Хууль хэрхэн хэлэлцэгддэгийг өөрийн нүдээр: байнгын хорооны хуралдаан, иргэдтэй уулзалт, ажлын албаны өдөр тутам.",
    description:
      "Гишүүний ажлын албатай нэг өдрийг хамт өнгөрүүлнэ. Өглөө ажлын албаны төлөвлөгөөний уулзалтад сууж, өдөр нь байнгын хорооны хуралдааныг ажиглана. Орой нь гишүүнтэй 20 минут ярилцаж, асуултаа асуух боломжтой.\n\nАжлын алба хүүхдийн аюулгүй байдлыг хариуцаж, өдрийн турш нэг ажилтан хамт байна.",
    tasks: ["Байнгын хорооны хуралдаан ажиглах", "Иргэдийн өргөдөл хэрхэн шийдвэрлэгддэгийг харах", "Гишүүнтэй ярилцах, асуулт асуух", "Өдрийн тэмдэглэл бичиж, ажлын албанд хуваалцах"],
    requirements: "Иргэний үнэмлэх эсвэл сурагчийн үнэмлэхтэй ирнэ. Хувцаслалт: сургуулийн дүрэмт хувцас.",
    gradeMin: 10,
    gradeMax: 12,
    mode: "onsite",
    location: "Төрийн ордон, Улаанбаатар",
    deadline: day(12),
    slots: [slot(16, "09:00", "16:00", 2), slot(23, "09:00", "16:00", 2), slot(30, "09:00", "16:00", 2)],
  },
  {
    type: "internship",
    title: "Өвлийн амралтын 2 долоо хоногийн дадлага",
    summary: "Ажлын албаны өдөр тутмын ажилд оролцож, иргэдийн санал хүсэлтийг ангилах, товч мэдээ бэлтгэхэд туслах.",
    description:
      "Өвлийн амралтын үеэр 2 долоо хоног, өдөрт 4 цаг ажиллана. Иргэдээс ирсэн санал хүсэлтийг сэдвээр ангилах, хуулийн төслийн тухай товч танилцуулгыг энгийн хэлээр бичих, нийгмийн сүлжээний мэдээлэл бэлтгэхэд туслана. Дадлагын төгсгөлд ажлын албанаас тодорхойлолт олгоно.",
    tasks: ["Иргэдийн санал хүсэлт ангилах", "Хуулийн төслийн товч танилцуулга бичих", "Ажлын албаны уулзалтад оролцох"],
    requirements: "Компьютер дээр бичих чадвартай. 2 долоо хоногийн турш тогтмол ирэх боломжтой байх.",
    gradeMin: 11,
    gradeMax: 12,
    mode: "hybrid",
    location: "Төрийн ордон + онлайн",
    deadline: day(20),
    slots: [slot(35, "10:00", "14:00", 3), slot(49, "10:00", "14:00", 3)],
  },
  {
    type: "research",
    title: "Судалгаа: сурагчид хуулийн мэдээллийг хаанаас авдаг вэ?",
    summary: "Ангийнхнаасаа санал асуулга авч, үр дүнгээ гишүүнд танилцуулах бяцхан судалгааны баг.",
    description:
      "Ажлын алба залуучуудад хуулийн мэдээллийг хэрхэн илүү ойлгомжтой хүргэх талаар судалж байна. Та 4 долоо хоногийн турш долоо хоногт нэг удаа онлайнаар уулзаж, асуулга боловсруулах, сургуульдаа түгээх, үр дүнг нэгтгэхэд оролцоно. Эцэст нь үр дүнгээ гишүүнд танилцуулна.",
    tasks: ["Санал асуулгын асуулт боловсруулах", "Сургуульдаа 20+ хүнээс асуулга авах", "Үр дүнг хүснэгт, график болгох", "Гишүүнд 5 минутын танилцуулга хийх"],
    requirements: "",
    gradeMin: 9,
    gradeMax: 12,
    mode: "remote",
    location: "Онлайн (Google Meet)",
    deadline: day(9),
    slots: [slot(14, "18:00", "19:30", 6), slot(15, "18:00", "19:30", 6)],
  },
  {
    type: "volunteer",
    title: "Иргэдийн уулзалтад сайн дурын туслах",
    summary: "Тойрогт болох иргэдийн уулзалтад бүртгэл хөтлөх, зочдыг угтах, санал хүсэлт цуглуулахад туслах.",
    description:
      "Гишүүн тойрогтоо иргэдтэй уулзалт хийнэ. Сайн дурынхан ирсэн иргэдийг бүртгэж, санал хүсэлтийн хуудсыг тарааж цуглуулна. Уулзалтын төгсгөлд санал хүсэлтийг ажлын албатай хамт ангилна.",
    tasks: ["Ирсэн иргэдийг бүртгэх", "Санал хүсэлтийн хуудас тарааж, цуглуулах", "Санал хүсэлтийг ангилахад туслах"],
    requirements: "Найрсаг харилцаатай, хүмүүстэй ярих дуртай.",
    gradeMin: 8,
    gradeMax: 12,
    mode: "onsite",
    location: "Сүхбаатар дүүрэг, 1-р хорооны соёлын төв (жишээ)",
    deadline: day(6),
    slots: [slot(10, "14:00", "18:00", 5), slot(17, "10:00", "14:00", 5)],
  },
  {
    type: "event",
    title: "Төрийн ордонтой танилцах аялал + «Хууль хэрхэн батлагддаг вэ» семинар",
    summary: "Чуулганы танхим, байнгын хороодын өрөөгөөр аялж, хууль батлагдах 5 алхмыг тоглоомоор сурна.",
    description:
      "Ангиараа эсвэл ганцаараа бүртгүүлж болно. Аялал 1 цаг, семинар 1 цаг үргэлжилнэ. Семинарын үеэр сурагчид жишээ хуулийн төслийг хэлэлцэж, санал хураалт хийж үзнэ.",
    tasks: ["Чуулганы танхимтай танилцах", "Хуулийн төсөл хэлэлцэх тоглоомд оролцох", "Ажлын албаны ажилтантай асуулт хариулт"],
    requirements: "",
    gradeMin: 8,
    gradeMax: 12,
    mode: "onsite",
    location: "Төрийн ордон, Улаанбаатар",
    deadline: day(15),
    slots: [slot(19, "10:00", "12:00", 25), slot(19, "14:00", "16:00", 25), slot(26, "10:00", "12:00", 25)],
  },
];

const opportunities = load<Opportunity[]>("opportunities", []);
const oldDemo = new Set(opportunities.filter((o) => o.demo && o.ownerId === account!.id).map((o) => o.id));
const fresh: Opportunity[] = seeds.map((s) => ({ ...s, id: id(), ownerId: account!.id, host: HOST, status: "published", demo: true, createdAt: now, updatedAt: now }));
save("opportunities", [...opportunities.filter((o) => !oldDemo.has(o.id)), ...fresh]);
save("applications", load<Application[]>("applications", []).filter((a) => !oldDemo.has(a.opportunityId)));

console.log(`Seeded ${fresh.length} demo listings for "${HOST}" (replaced ${oldDemo.size}).`);
if (printed) console.log(`Office login → /dadlaga/admin/login   username: ${USERNAME}   password: ${printed}\n(shown once; re-run with --reset-password to set a new one)`);
else console.log(`Office login unchanged: username ${USERNAME} (use --reset-password for a new password).`);
console.log("Secretariat (all listings, accounts): set STAFF_PASSCODE, then use the Secretariat form at /dadlaga/admin/login");
