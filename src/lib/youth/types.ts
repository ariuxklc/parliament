// Youth opportunities ("Дадлага"): high-school students apply to work alongside an MP's office.

export const OPPORTUNITY_TYPES = {
  shadow: "Гишүүнтэй нэг өдөр",
  internship: "Богино хугацааны дадлага",
  research: "Судалгаа, төсөлд оролцох",
  volunteer: "Сайн дурын ажил",
  event: "Арга хэмжээ, айлчлал",
} as const;
export type OpportunityType = keyof typeof OPPORTUNITY_TYPES;

export const MODES = { onsite: "Биечлэн", remote: "Онлайн", hybrid: "Хосолсон" } as const;
export type Mode = keyof typeof MODES;

export type Slot = {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  capacity: number;
};

export type Opportunity = {
  id: string;
  ownerId: string; // office account id
  host: string; // e.g. "Г.Бат, УИХ-ын гишүүн — ажлын алба"
  type: OpportunityType;
  title: string;
  summary: string; // one line on the card
  description: string;
  tasks: string[]; // "What you'll do"
  requirements: string;
  gradeMin: number; // 8–12
  gradeMax: number;
  mode: Mode;
  location: string;
  deadline: string; // YYYY-MM-DD, last day to apply
  slots: Slot[];
  status: "draft" | "published" | "closed";
  demo?: boolean; // seeded example — labelled as such everywhere
  createdAt: string;
  updatedAt: string;
};

export const APPLICATION_STATUSES = {
  submitted: "Илгээсэн",
  reviewing: "Хянаж байна",
  accepted: "Баталгаажсан",
  waitlist: "Хүлээлгийн жагсаалт",
  rejected: "Энэ удаад тэнцээгүй",
  withdrawn: "Цуцалсан",
} as const;
export type ApplicationStatus = keyof typeof APPLICATION_STATUSES;

export type Application = {
  id: string;
  code: string; // tracking code shown to the student, e.g. "DL-7K3F-9QXM"
  opportunityId: string;
  slotIds: string[]; // slots the student can make
  confirmedSlotId: string | null;
  student: { name: string; school: string; grade: number; phone: string; email: string | null };
  parent: { name: string; phone: string; consent: true };
  motivation: string;
  status: ApplicationStatus;
  officeNote: string | null; // message shown to the student
  parentCalled: boolean; // office confirmed consent by phone
  createdAt: string;
  updatedAt: string;
};

export type Account = {
  id: string;
  username: string;
  displayName: string; // e.g. "Г.Бат — УИХ-ын гишүүний ажлын алба"
  passwordHash: string; // scrypt$<salt>$<hash>
  active: boolean;
  createdAt: string;
};
