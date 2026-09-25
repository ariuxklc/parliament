"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import type { ChatAnswer, ChatEntity, ChatTurn } from "@/lib/ai/types";
import { ArrowUpRight } from "./ui/icons";
import styles from "./AskParliamentChat.module.css";

type Message =
  | { id: number; role: "user"; text: string }
  | { id: number; role: "assistant"; question: string; result: ChatAnswer };

export type AskContext = { entity: ChatEntity; title: string; kindLabel: string };

const GLOBAL_SUGGESTIONS = [
  "Сүүлийн үед ямар хуулийн төслүүд хэлэлцэгдэж байна?",
  "Өгөгдлийн тухай хуулийн төсөл юу өөрчлөх гэж байгаа вэ?",
  "2025 онд боловсролтой холбоотой ямар төслүүд байсан бэ?",
  "Боловсролын ерөнхий хуулийн төслийн санал хураалтын үр дүн ямар байсан бэ?",
];

const CONTEXT_SUGGESTIONS = [
  "Энэ төсөл юу өөрчлөх гэж байгаа вэ?",
  "Энэ төсөл иргэдэд хэрхэн хамаарах вэ?",
  "Энэ төсөл одоо ямар шатанд явж байна?",
];

const MAX_CHARS = 500;
const HISTORY_TURNS = 6;

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

const MODE_LABEL: Record<string, string> = {
  ai: "AI тайлбар",
  data: "Албан ёсны өгөгдлөөс",
};

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
  const storageKey = `ask-parliament:${context ? `${context.entity.type}-${context.entity.id}` : "global"}`;
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastEntities, setLastEntities] = useState<ChatEntity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextId = useRef(1);
  const restored = useRef(false);

  // Keep the conversation for this tab only (sessionStorage) so a refresh does not lose it.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(storageKey) ?? "null") as { messages: Message[]; lastEntities: ChatEntity[] } | null;
      if (saved?.messages?.length) {
        setMessages(saved.messages);
        setLastEntities(saved.lastEntities ?? []);
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
      sessionStorage.setItem(storageKey, JSON.stringify({ messages: messages.slice(-20), lastEntities }));
    } catch {
      /* ignore */
    }
  }, [messages, lastEntities, storageKey]);

  useEffect(() => {
    const el = transcriptRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  async function send(text: string, opts: { selected?: ChatEntity; shown?: string } = {}) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_CHARS || loading) return;
    const history: ChatTurn[] = messages.slice(-HISTORY_TURNS).map((m) =>
      m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: m.result.answer.slice(0, 1_000) },
    );
    setMessages((current) => [...current, { id: nextId.current++, role: "user", text: opts.shown ?? trimmed }]);
    setQuestion("");
    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ask-session": sessionId() },
        body: JSON.stringify({ question: trimmed, history, context: context?.entity, lastEntities, selected: opts.selected }),
        signal: AbortSignal.timeout(60_000),
      });
      const data = (await response.json().catch(() => ({}))) as ChatAnswer & { error?: string };
      if (!response.ok || !data.status) throw new Error(data.error || "Хариулт авах боломжгүй байна. Дахин оролдоно уу.");
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", question: trimmed, result: data }]);
      if (data.lastEntities?.length) setLastEntities(data.lastEntities.slice(0, 3));
    } catch (cause) {
      const message =
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Хариулт хэт удаж байна. Дахин оролдоно уу."
          : cause instanceof Error
            ? cause.message
            : "Хариулт авах боломжгүй байна.";
      setMessages((current) => current.slice(0, -1));
      setQuestion(trimmed);
      setError({ message, retry: () => void send(trimmed, opts) });
    } finally {
      setLoading(false);
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
    setLastEntities([]);
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
            <ol className={styles.steps} aria-label="Хэрхэн ажилладаг вэ">
              <li><strong>Хайна</strong> — УИХ, LawForum-ын албан ёсны мэдээллээс</li>
              <li><strong>Тайлбарлана</strong> — олдсон эх сурвалжид л тулгуурлан</li>
              <li><strong>Холбоосоор</strong> — эх сурвалжийг өөрөө шалгана</li>
            </ol>
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
            <p className={styles.question} key={m.id}>
              <span className="visually-hidden">Таны асуулт: </span>
              {m.text}
            </p>
          ) : (
            <AnswerCard key={m.id} result={m.result} disabled={loading} onChoose={(entity, title) => void send(m.question, { selected: entity, shown: `«${title}»` })} />
          ),
        )}

        {loading ? (
          <div className={styles.loading} role="status">
            <span className={styles.pulse} aria-hidden="true" />
            Албан ёсны эх сурвалжаас хайж, тайлбар бэлтгэж байна…
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
          Улсын Их Хурлын талаар асуулт
        </label>
        <textarea
          id={`ask-${storageKey}`}
          ref={inputRef}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={onKeyDown}
          maxLength={MAX_CHARS}
          rows={2}
          placeholder={context ? "Энэ төсөл эсвэл УИХ-ын талаар асуугаарай…" : "УИХ-ын талаар асуугаарай…"}
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
        <p>AI тайлбар нь албан ёсны эх бичвэр, хууль зүйн зөвлөгөө биш. Эх сурвалжийн холбоосоор шалгана уу.</p>
        {messages.length ? (
          <button type="button" onClick={reset} disabled={loading}>
            Шинэ яриа
          </button>
        ) : null}
      </div>
    </section>
  );
}

function AnswerCard({ result, disabled, onChoose }: { result: ChatAnswer; disabled: boolean; onChoose: (entity: ChatEntity, title: string) => void }) {
  const byNumber = new Map(result.citations.map((c) => [c.n, c]));
  const tone = result.status === "insufficient" ? styles.insufficient : result.status === "clarify" ? styles.clarify : result.mode === "data" ? styles.data : styles.ai;
  const label =
    result.status === "insufficient" ? "Баталгаатай мэдээлэл олдсонгүй" : result.status === "clarify" ? "Тодруулга" : MODE_LABEL[result.mode] ?? "Хариулт";

  return (
    <article className={`${styles.answer} ${tone}`}>
      <header className={styles.answerHead}>
        <span className={styles.answerLabel}>{label}</span>
        {result.status === "answered" && result.mode === "data" ? <span className={styles.badge}>AI ашиглаагүй</span> : null}
        {result.focus ? <span className={styles.focus}>«{result.focus.title}»</span> : null}
      </header>

      <div className={styles.answerBody}>
        {result.points.map((p, i) => (
          <p key={i}>
            {p.text}
            {p.citations.map((n) => {
              const c = byNumber.get(n);
              return c ? (
                <a key={n} className={styles.cite} href={c.url} target="_blank" rel="noopener noreferrer" title={c.title} aria-label={`Эх сурвалж ${n}: ${c.title} (шинэ цонхонд)`}>
                  {n}
                </a>
              ) : null;
            })}
          </p>
        ))}
        {result.limitations ? <p className={styles.limitations}>{result.limitations}</p> : null}
      </div>

      {result.choices?.length ? (
        <div className={styles.choices}>
          {result.choices.map((c) => (
            <button type="button" key={`${c.entity.type}-${c.entity.id}`} onClick={() => onChoose(c.entity, c.title)} disabled={disabled}>
              <span>{c.title}</span>
              <small>{c.detail}</small>
            </button>
          ))}
        </div>
      ) : null}

      {result.citations.length ? (
        <SourceList heading="Албан ёсны эх сурвалж" items={result.citations} />
      ) : null}
      {result.related?.length ? <SourceList heading="Шалгаж болох албан ёсны хуудсууд" items={result.related} muted /> : null}
    </article>
  );
}

function SourceList({ heading, items, muted = false }: { heading: string; items: ChatAnswer["citations"]; muted?: boolean }) {
  return (
    <div className={`${styles.sources} ${muted ? styles.sourcesMuted : ""}`}>
      <strong>{heading}</strong>
      <ol>
        {items.map((c) => (
          <li key={c.sourceId}>
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
