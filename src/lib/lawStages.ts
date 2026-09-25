/**
 * Official legislative stages, in the order shown on slide 2 of the presentation
 * "БАЙНГЫН ХОРООНЫ АСУУДАЛ ЭРХЛЭХ ГАЗАР, 2026" supplied by the hackathon organizers.
 * Two typos on the slide were corrected: "сааначлах, болвсруулах" → "санаачлах, боловсруулах".
 * `lawforumStage` marks the stages LawForum records expose (stage 0 / stage 10).
 */
export const LAW_STAGES: { name: string; lawforumStage?: "drafting" | "submitted" }[] = [
  { name: "Төсөл санаачлах, боловсруулах", lawforumStage: "drafting" },
  { name: "Өргөн мэдүүлэх", lawforumStage: "submitted" },
  { name: "Хэлэлцүүлэгт бэлтгэх" },
  { name: "Хэлэлцэх эсэх" },
  { name: "Анхны хэлэлцүүлэг" },
  { name: "Эцсийн хэлэлцүүлэг" },
  { name: "Эцэслэн батлах" },
  { name: "Эцсийн найруулга" },
  { name: "Ёсчлох" },
  { name: "ЕТГ илгээх" },
];
