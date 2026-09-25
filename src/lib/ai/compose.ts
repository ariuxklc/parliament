import { INSUFFICIENT_ANSWER, type ChatAnswer, type ChatChoice, type ChatCitation, type ChatEntity, type Evidence } from "./types.ts";

/** Hosts whose pages may be shown as citations. Anything else is dropped before the model or the user sees it. */
export const OFFICIAL_HOSTS = new Set(["lawforum.parliament.mn", "new.parliament.mn", "parliament.mn", "www.parliament.mn"]);

export function isOfficialUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && OFFICIAL_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

type Focus = ChatAnswer["focus"];

export function toCitation(source: Evidence, n: number): ChatCitation {
  return { n, sourceId: source.sourceId, title: source.title, url: source.url, publisher: source.publisher, kind: source.kind };
}

/** Numbers citations in first-use order and links every point to its numbers. */
export function withCitations(points: { text: string; sources: Evidence[] }[]): Pick<ChatAnswer, "points" | "citations"> {
  const order = new Map<string, ChatCitation>();
  const out = points.map((point) => ({
    text: point.text,
    citations: point.sources.filter((s) => isOfficialUrl(s.url)).map((source) => {
      let citation = order.get(source.sourceId);
      if (!citation) {
        citation = toCitation(source, order.size + 1);
        order.set(source.sourceId, citation);
      }
      return citation.n;
    }),
  }));
  return { points: out.map((p) => ({ ...p, citations: [...new Set(p.citations)] })), citations: [...order.values()] };
}

export function joinPoints(points: { text: string }[], limitations?: string): string {
  return [...points.map((p) => p.text), limitations ?? ""].filter(Boolean).join(" ");
}

/** An answer written by the server from structured official data. No model involved. */
export function dataAnswer(points: { text: string; sources: Evidence[] }[], opts: { limitations?: string; entities: ChatEntity[]; focus?: Focus }): ChatAnswer {
  const cited = withCitations(points);
  return {
    status: "answered",
    mode: "data",
    answer: joinPoints(cited.points, opts.limitations),
    ...cited,
    limitations: opts.limitations,
    insufficientEvidence: false,
    lastEntities: opts.entities,
    focus: opts.focus,
  };
}

export function insufficientAnswer(opts: { related?: Evidence[]; message?: string; entities?: ChatEntity[]; focus?: Focus } = {}): ChatAnswer {
  const related = (opts.related ?? []).filter((s) => isOfficialUrl(s.url)).slice(0, 4).map((s, i) => toCitation(s, i + 1));
  const answer = opts.message ? `${INSUFFICIENT_ANSWER} ${opts.message}` : INSUFFICIENT_ANSWER;
  return {
    status: "insufficient",
    mode: "none",
    answer,
    points: [{ text: answer, citations: [] }],
    insufficientEvidence: true,
    citations: [],
    related: related.length ? related : undefined,
    lastEntities: opts.entities ?? [],
    focus: opts.focus,
  };
}

export function clarifyAnswer(message: string, choices: ChatChoice[], entities: ChatEntity[] = []): ChatAnswer {
  return {
    status: "clarify",
    mode: "none",
    answer: message,
    points: [{ text: message, citations: [] }],
    insufficientEvidence: false,
    citations: [],
    choices: choices.slice(0, 6),
    lastEntities: entities,
  };
}

export function policyAnswer(): ChatAnswer {
  const answer =
    "Ask Parliament AI нь улс төрийн байр суурь, аль нэг төсөл, нам, гишүүнийг дэмжих эсэх талаар зөвлөмж өгдөггүй. " +
    "Харин төслийн агуулга, хэлэлцүүлгийн шат, санал хураалтын үр дүн зэрэг албан ёсны мэдээллийг олж, энгийнээр тайлбарлаж өгч чадна.";
  return { status: "insufficient", mode: "none", answer, points: [{ text: answer, citations: [] }], insufficientEvidence: true, citations: [], lastEntities: [] };
}
