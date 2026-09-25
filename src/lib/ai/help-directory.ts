import { expandTopics, passageHits, topicTokens, tokens } from "../parliament/text.ts";

/**
 * Where people can get help. Every entry was checked on 2026-09-25 against the organisation's own
 * website: the name and site are confirmed, and a phone number / hours / address are listed ONLY when
 * they were printed on that site. The assistant must not add numbers that are not here.
 * Re-verify before a public launch — phone numbers and addresses change.
 */

export interface HelpService {
  id: string;
  name: string;
  helpsWith: string;
  website: string;
  phone?: string;
  hours?: string;
  address?: string;
  /** Words people use when they need this service (matched inflection-aware). */
  topics: string[];
  /** Offered when nothing more specific matches. */
  general?: boolean;
}

export const HELP_SERVICES: HelpService[] = [
  {
    id: "legal-aid",
    name: "Хууль зүйн туслалцааны төв",
    helpsWith: "Төрөөс иргэдэд үзүүлэх хууль зүйн туслалцаа — хуулийн зөвлөгөө, өмгөөлөл, маргаантай асуудалд туслалцаа.",
    website: "https://lac.gov.mn/",
    phone: "77001982",
    hours: "Даваа–Баасан 8:30–17:30 (цайны цаг 12:30–13:30)",
    address: "Улаанбаатар хот, Сүхбаатар дүүрэг, 11-р хороо, 7-р хороолол, Ногоон нуурын гудамж",
    topics: ["хууль", "хуульч", "өмгөөлөгч", "өмгөөлөл", "зөвлөгөө", "шүүх", "маргаан", "нэхэмжлэл", "гомдол", "туслалцаа", "эрх", "торгууль", "ажлаас", "халсан", "гэрээ", "өр"],
    general: true,
  },
  {
    id: "11-11",
    name: "11-11 Төв (Засгийн газрын иргэдийн санал, гомдол хүлээн авах төв)",
    helpsWith: "Төрийн байгууллага, албан тушаалтны үйлчилгээ, шийдвэрийн талаарх санал, гомдол, мэдээлэл хүлээн авч холбогдох байгууллагад шилжүүлдэг.",
    website: "https://11-11.mn/",
    phone: "11-11",
    topics: ["гомдол", "санал", "төрийн", "албан", "тушаалтан", "үйлчилгээ", "авилга", "хүнд", "суртал", "зөрчил", "байгууллага"],
    general: true,
  },
  {
    id: "child-108",
    name: "108 Хүүхдийн шуурхай тусламж, хамгааллын төв",
    helpsWith: "Хүүхдийн эрхийн зөрчил, хүүхдэд үзүүлэх хүчирхийлэл, хүүхэд хамгааллын асуудлаар шуурхай тусламж.",
    website: "https://108.mn/",
    phone: "108",
    topics: ["хүүхэд", "хүүхдийн", "сурагч", "өсвөр", "хүчирхийлэл", "дээрэлхэлт", "хамгаалал", "асран", "хамгаалагч"],
  },
  {
    id: "bar",
    name: "Монголын хуульчдын холбоо",
    helpsWith: "Хуульчдын мэргэжлийн холбоо — өмгөөлөгч, хуульч хайхад лавлах боломжтой.",
    website: "https://www.mglbar.mn/",
    phone: "70116364",
    topics: ["хуульч", "өмгөөлөгч", "өмгөөлөл", "шүүх", "нэхэмжлэл"],
    general: true,
  },
  {
    id: "human-rights",
    name: "Хүний эрхийн үндэсний комисс",
    helpsWith: "Хүний эрх, эрх чөлөөг хамгаалах; хүний эрхийн зөрчил, ялгаварлан гадуурхалтын талаарх гомдол.",
    website: "https://nhrcm.gov.mn/",
    topics: ["хүний", "эрх", "ялгаварлан", "гадуурхалт", "жендэр", "тэгш", "дарамт", "хүчирхийлэл", "эрх чөлөө"],
  },
  {
    id: "labour-welfare-services",
    name: "Хөдөлмөр, халамжийн үйлчилгээний ерөнхий газар",
    helpsWith: "Хөдөлмөр эрхлэлт, ажил хайх, нийгмийн халамжийн тэтгэмж, үйлчилгээ.",
    website: "https://hudulmur-halamj.gov.mn/",
    topics: ["ажил", "ажилгүй", "хөдөлмөр", "халамж", "тэтгэмж", "тэтгэвэр", "хөгжлийн", "бэрхшээл", "ахмад", "өрх", "цалин"],
  },
  {
    id: "labour-ministry",
    name: "Хөдөлмөр, нийгмийн хамгааллын яам",
    helpsWith: "Хөдөлмөр, нийгмийн хамгааллын бодлого, мэдээлэл.",
    website: "https://mlsp.gov.mn/",
    topics: ["хөдөлмөр", "нийгмийн", "хамгаалал", "даатгал", "тэтгэвэр", "цалин", "ажил олгогч"],
  },
  {
    id: "police",
    name: "Цагдаагийн ерөнхий газар",
    helpsWith: "Гэмт хэрэг, зөрчил мэдээлэх, замын цагдаа, нийтийн хэв журам.",
    website: "https://police.gov.mn/",
    topics: ["цагдаа", "гэмт", "хэрэг", "хулгай", "залилан", "зодоон", "осол", "замын", "баривчл", "баригд"],
  },
  {
    id: "e-mongolia",
    name: "E-Mongolia — төрийн цахим үйлчилгээний нэгдсэн портал",
    helpsWith: "Лавлагаа, тодорхойлолт, өргөдөл зэрэг төрийн үйлчилгээг онлайнаар авах.",
    website: "https://e-mongolia.mn/",
    topics: ["лавлагаа", "тодорхойлолт", "цахим", "онлайн", "бичиг", "баримт", "үнэмлэх", "бүртгэл", "өргөдөл"],
  },
  {
    id: "petition",
    name: "Нийтийн өргөдлийн систем (Улсын Их Хурал)",
    helpsWith: "Олон нийтийн ашиг сонирхлыг хөндсөн асуудлаар Улсын Их Хуралд нийтийн өргөдөл гаргах, дэмжих.",
    website: "https://petition.parliament.mn/",
    topics: ["өргөдөл", "нийтийн", "их хурал", "уих", "хууль өөрчлөх", "санаачлага", "гарын үсэг"],
  },
];

export const HELP_HOSTS = HELP_SERVICES.map((s) => new URL(s.website).hostname);

/** Services matching a need ("ажлаас халсан", "хүүхдийг дээрэлхэж байна"); general ones when nothing specific matches. */
export function findHelpServices(need: string, limit = 4): HelpService[] {
  const words = expandTopics(topicTokens(need)).length ? expandTopics(topicTokens(need)) : tokens(need);
  const scored = HELP_SERVICES.map((s) => ({ s, score: passageHits(words, `${s.name} ${s.helpsWith} ${s.topics.join(" ")}`) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || Number(!!b.s.general) - Number(!!a.s.general));
  const picked = scored.slice(0, limit).map((r) => r.s);
  for (const s of HELP_SERVICES) if (picked.length < 2 && s.general && !picked.includes(s)) picked.push(s);
  return picked;
}
