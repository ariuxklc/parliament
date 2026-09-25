"use client";

import { Fragment, useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import type { ChatAnswer, ChatCitation, ChatEntity, ChatEvent, ChatTurn } from "@/lib/ai/types";
import { ArrowUpRight } from "./ui/icons";
import styles from "./AskParliamentChat.module.css";

type Message = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; question: string; result: ChatAnswer };

export type AskContext = { entity: ChatEntity; title: string; kindLabel: string };

const GLOBAL_SUGGESTIONS = [
  "Намайг ажлаас гэнэт халчихлаа, цалингаа ч аваагүй. Би юу хийх вэ?",
  "Мопед унахад ямар дүрэм, торгууль байдаг вэ?",
  "Зөрчлийн тухай хууль 2025, 2026 онд хэрхэн өөрчлөгдсөн бэ?",
  "2026 оны 6-р сарын 26-нд УИХ юу хэлэлцэж, юу баталсан бэ?",
];

/** One-tap follow-ups under the latest answer — the next thing a worried person usually wants. */
const FOLLOW_UPS = ["Энгийнээр тайлбарлаад өгөөч", "Одоо юу хийх вэ?", "Хаана хандах вэ?", "Өргөдөл бичихэд туслаач"];
const FOLLOW_UPS_EN = ["Explain it more simply", "What should I do now?", "Where can I get help?", "Help me write a letter"];
const isEnglish = (text: string) => (text.match(/[A-Za-z]/g)?.length ?? 0) > (text.match(/[Ѐ-ӿ]/g)?.length ?? 0);

const CONTEXT_SUGGESTIONS = [
  "Энэ төсөл юу өөрчлөх гэж байгаа вэ?",
  "Энэ төсөл надад хэрхэн хамаарах вэ?",
  "Энэ төсөлтэй төстэй хүчин төгөлдөр хууль байгаа юу?",
];

const MAX_CHARS = 1_000;
const HISTORY_TURNS = 8;
const STORAGE_VERSION = "v2";

function sessionId(): string {
  try {
    const existing = sessionStorage.getItem("ask-parliament:session");
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem("ask-parliament:session", id);
    return id;
  } catch {
    return "anon";
  }
}

/** Assistant answers go back as history without citation markers (the model re-checks facts with tools). */
const plain = (text: string) => text.replace(/\[\d+\]/g, "").slice(0, 3_000);

export function AskParliamentChat({
  context,
  variant = "page",
  suggestions,
  autoFocus = false,
}: {
  context?: AskContext;
  variant?: "page" | "panel";
  suggestions?: string[];
  autoFocus?: boolean;
}) {
  const storageKey = `ask-parliament:${STORAGE_VERSION}:${context ? `${context.entity.type}-${context.entity.id}` : "global"}`;
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const restored = useRef(false);

  // Keep the conversation for this tab only (sessionStorage) so a refresh does not lose it.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { messages: Message[] } | null;
      if (saved?.messages?.length) {
        setMessages(saved.messages);
        nextId.current = Math.max(...saved.messages.map((m) => m.id)) + 1;
      }
    } catch {
      /* storage unavailable — start fresh */
    }
    restored.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-20) }));
    } catch {
      /* ignore */
    }
  }, [messages, storageKey]);

  // Move the view only for a new turn the reader just started: their question (with the "searching" note
  // below it) when they ask, then the BEGINNING of the answer when it arrives. Status updates, timers and
  // restored conversations never move it, so scrolling up to read is never pulled back down.
  const follow = useRef<"question" | "answer" | null>(null);
  useEffect(() => {
    const el = transcriptRef.current;
    const last = messages.at(-1);
    if (!el || !last || !follow.current) return;
    const expected = follow.current === "question" ? "user" : "assistant";
    if (last.role !== expected) return;
    follow.current = last.role === "user" ? "answer" : null;
    el.querySelector<HTMLElement>(`[data-turn="${last.id}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [messages]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  // Start loading the most-asked laws on the server as soon as the chat is shown.
  useEffect(() => {
    void fetch("/api/chat", { method: "GET" }).catch(() => {});
  }, []);

  // Seconds spent waiting, so a long search can say so kindly.
  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const timer = window.setInterval(() => setElapsed((s) => s + 1), 1_000);
    return () => window.clearInterval(timer);
  }, [loading]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_CHARS || loading) return;
    const history: ChatTurn[] = messages
      .slice(-HISTORY_TURNS)
      .map((m) => (m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: plain(m.result.answer) }));
    follow.current = "question";
    setMessages((current) => [...current, { id: nextId.current++, role: "user", text: trimmed }]);
    setQuestion("");
    setError(null);
    setStatuses([]);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ask-session": sessionId() },
        body: JSON.stringify({ question: trimmed, history, context: context?.entity }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok || !response.body) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Хариулт авах боломжгүй байна. Дахин оролдоно уу.");
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let answer: ChatAnswer | null = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newline: number;
        while ((newline = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "status") setStatuses((s) => (s.includes(event.text) ? s : [...s, event.text]));
          else if (event.type === "answer") answer = event.answer;
          else if (event.type === "error") throw new Error(event.error);
        }
      }
      if (!answer) throw new Error("Хариулт дутуу ирлээ. Дахин оролдоно уу.");
      const result = answer;
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", question: trimmed, result }]);
    } catch (cause) {
      const message =
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Хариулт хэт удаж байна. Дахин оролдоно уу."
          : cause instanceof Error
            ? cause.message
            : "Хариулт авах боломжгүй байна.";
      // No answer to follow: without this, removing the question would scroll to the previous answer instead.
      follow.current = null;
      setMessages((current) => current.slice(0, -1));
      setQuestion(trimmed);
      setError({ message, retry: () => void send(trimmed) });
    } finally {
      setLoading(false);
      setStatuses([]);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(question);
    }
  }

  function reset() {
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  }

  const prompts = suggestions ?? (context ? CONTEXT_SUGGESTIONS : GLOBAL_SUGGESTIONS);

  return (
    <section className={`${styles.chat} ${variant === "panel" ? styles.panel : ""}`} aria-label="Ask Parliament AI">
      {context ? (
        <div className={styles.contextBar}>
          <span className={styles.contextLabel}>{context.kindLabel}</span>
          <span className={styles.contextTitle}>«{context.title}»</span>
          <span className={styles.contextHint}>«энэ төсөл» гэвэл үүнийг ойлгоно · бусад асуулт ч асууж болно</span>
        </div>
      ) : null}

      <div ref={transcriptRef} className={styles.transcript} aria-live="polite" aria-busy={loading}>
        {messages.length === 0 ? (
          <div className={styles.welcome}>
            {/* Minimal start screen (Ariuka, 2026-09-26): the example questions show what it can do. */}
            <p className={styles.suggestLabel}>Жишээ асуултууд</p>
            <div className={styles.suggestions}>
              {prompts.map((s) => (
                <button type="button" key={s} onClick={() => void send(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m) =>
          m.role === "user" ? (
            <p className={styles.question} key={m.id} data-turn={m.id}>
              <span className="visually-hidden">Таны асуулт: </span>
              {m.text}
            </p>
          ) : (
            <AnswerCard key={m.id} result={m.result} turn={m.id} />
          ),
        )}

        {!loading && messages.at(-1)?.role === "assistant" ? (
          <div className={styles.followUps} aria-label="Дараагийн асуулт">
            {(isEnglish((messages.at(-1) as Extract<Message, { role: "assistant" }>).question) ? FOLLOW_UPS_EN : FOLLOW_UPS).map((f) => (
              <button type="button" key={f} onClick={() => void send(f)}>
                {f}
              </button>
            ))}
          </div>
        ) : null}

        {loading ? (
          <div className={styles.loading} role="status">
            <span className={styles.pulse} aria-hidden="true" />
            <div>
              <p>{statuses.length ? statuses[statuses.length - 1] : "Таны асуултыг хүлээж авлаа. Холбогдох мэдээллийг хайж байна…"}</p>
              {statuses.length > 1 ? (
                <ul className={styles.statusTrail}>
                  {statuses.slice(0, -1).slice(-3).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              ) : null}
              {elapsed >= 12 ? (
                <p className={styles.slowNote}>Хуулийн эх бичвэр урт тул түр хүлээнэ үү — танд яг хамаарах заалтыг олж байна.</p>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error.message}</span>
          {error.retry ? (
            <button type="button" onClick={error.retry} disabled={loading}>
              Дахин оролдох
            </button>
          ) : null}
        </div>
      ) : null}

      <form className={styles.form} onSubmit={submit}>
        <label htmlFor={`ask-${storageKey}`} className="visually-hidden">
          Хууль, Улсын Их Хурлын талаар асуулт
        </label>
        <textarea
          id={`ask-${storageKey}`}
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_CHARS}
          rows={2}
          placeholder={context ? "Энэ төсөл, хууль эсвэл УИХ-ын талаар асуугаарай…" : "Хууль эсвэл УИХ-ын талаар асуугаарай…"}
          disabled={loading}
        />
        <div className={styles.formSide}>
          <button type="submit" disabled={loading || !question.trim()}>
            Илгээх
          </button>
          {question.length > MAX_CHARS * 0.8 ? <span className={styles.counter}>{question.length}/{MAX_CHARS}</span> : null}
        </div>
      </form>
      <div className={styles.footer}>
        <p>AI туслахын хариулт нь хууль зүйн зөвлөгөө биш. Чухал шийдвэр гаргахаасаа өмнө эх сурвалжийн холбоосоор шалгана уу.</p>
        {messages.length ? (
          <button type="button" onClick={reset} disabled={loading}>
            Шинэ яриа
          </button>
        ) : null}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- answer */

/** The answer as plain text with its sources, for saving or sending to someone. */
export function answerAsText(result: ChatAnswer): string {
  const body = result.answer.replace(/\*\*/g, "").replace(/\*([^*\s][^*\n]*?)\*/g, "$1");
  const sources = result.citations.map((c) => `[${c.n}] ${c.title} — ${c.url}`).join("\n");
  return sources ? `${body}\n\nЭх сурвалж:\n${sources}` : body;
}

function CopyButton({ result }: { result: ChatAnswer }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={styles.copy}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(answerAsText(result))
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2_000);
          })
          .catch(() => {});
      }}
    >
      {copied ? "Хуулбарласан ✓" : "Хуулбарлах"}
    </button>
  );
}

function AnswerCard({ result, turn }: { result: ChatAnswer; turn?: number }) {
  return (
    <article className={`${styles.answer} ${styles.ai}`} data-turn={turn}>
      <header className={styles.answerHead}>
        <span className={styles.answerLabel}>AI туслах</span>
        {result.steps.length ? (
          <details className={styles.lookups}>
            <summary>{result.steps.length} эх сурвалжаас хайсан</summary>
            <ul>
              {result.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <CopyButton result={result} />
      </header>

      <div className={styles.answerBody}>
        <RichText text={result.answer} citations={result.citations} />
        {result.unverifiedNumbers ? (
          <p className={styles.limitations}>Хариултын зарим тоог хайсан эх сурвалжаас тулгаж чадсангүй — эх сурвалжийн холбоосоор шалгана уу.</p>
        ) : null}
      </div>

      {result.citations.length ? <SourceList heading="Албан ёсны эх сурвалж" items={result.citations} /> : null}
      {result.consulted.length && !result.citations.length ? <SourceList heading="Харсан албан ёсны эх сурвалжууд" items={result.consulted} muted /> : null}
    </article>
  );
}

type Block = { kind: "p"; lines: string[] } | { kind: "h"; text: string } | { kind: "ul"; items: string[] } | { kind: "ol"; items: string[] };

/**
 * Light Markdown: paragraphs, "- " and "1. " lists, "### " sub-headings. Rendered as text — never HTML.
 * Single line breaks are kept, so a drafted letter keeps its address and signature lines.
 */
function blocks(text: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", lines: para });
    para = [];
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d{1,2}[.)]\s+(.*)$/.exec(line);
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (!line) flush();
    else if (bullet || numbered) {
      flush();
      const kind: "ul" | "ol" = bullet ? "ul" : "ol";
      const item = (bullet ?? numbered)![1];
      const last = out[out.length - 1];
      if (last && (last.kind === "ul" || last.kind === "ol") && last.kind === kind) last.items.push(item);
      else out.push(kind === "ul" ? { kind: "ul", items: [item] } : { kind: "ol", items: [item] });
    } else if (heading) {
      flush();
      out.push({ kind: "h", text: heading[1] });
    } else para.push(line);
  }
  flush();
  return out;
}

function inline(text: string, citations: ChatCitation[]): ReactNode[] {
  return text.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*?\*|\[\d+\])/g).map((part, i) => {
    const bold = /^\*\*([^*\n]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const em = /^\*([^*\n]+)\*$/.exec(part);
    if (em) return <em key={i}>{em[1]}</em>;
    const cite = /^\[(\d+)\]$/.exec(part);
    if (cite) {
      const c = citations.find((x) => x.n === Number(cite[1]));
      return c ? (
        <a key={i} className={styles.cite} href={c.url} target="_blank" rel="noopener noreferrer" title={c.title} aria-label={`Эх сурвалж ${c.n}: ${c.title} (шинэ цонхонд)`}>
          {c.n}
        </a>
      ) : null;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export function RichText({ text, citations }: { text: string; citations: ChatCitation[] }) {
  return (
    <>
      {blocks(text).map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className={styles.richList}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item, citations)}</li>
            ))}
          </ul>
        ) : b.kind === "ol" ? (
          <ol key={i} className={styles.richList}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item, citations)}</li>
            ))}
          </ol>
        ) : b.kind === "h" ? (
          <p key={i} className={styles.subhead}>
            {inline(b.text, citations)}
          </p>
        ) : (
          <p key={i}>
            {b.lines.map((line, j) => (
              <Fragment key={j}>
                {j ? <br /> : null}
                {inline(line, citations)}
              </Fragment>
            ))}
          </p>
        ),
      )}
    </>
  );
}

function SourceList({ heading, items, muted = false }: { heading: string; items: ChatCitation[]; muted?: boolean }) {
  return (
    <div className={`${styles.sources} ${muted ? styles.sourcesMuted : ""}`}>
      <strong>{heading}</strong>
      <ol>
        {items.map((c) => (
          <li key={`${c.url}|${c.title}`}>
            <a href={c.url} target="_blank" rel="noopener noreferrer">
              {muted ? null : <span className={styles.sourceNumber}>{c.n}</span>}
              <span className={styles.sourceText}>
                <span className={styles.publisher}>{c.publisher}</span>
                {c.title}
              </span>
              <ArrowUpRight size={14} />
              <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
