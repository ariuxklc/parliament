"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import styles from "./chatDock.module.css";
import { MOOD, Sprite, useBlink, useThinking } from "./Mascot";
import { RichText, answerAsText } from "../AskParliamentChat";
import { ArrowUpRight, ChevronDown, Close } from "../ui/icons";
import type { ChatAnswer, ChatEvent, ChatTurn } from "@/lib/ai/types";

/*
 * Хийморь — the site-wide Ask Parliament AI chat, as a small messenger in the corner.
 * Same service and protocol as the full chat (/api/chat, NDJSON events) and the same conversation:
 * it reads and writes the global chat's sessionStorage key, so "Бүтэн хуудас" (/ask) continues it.
 * Hidden where a page already embeds the assistant (/ask, /laws/[id]).
 */

type Message = { id: number; role: "user"; text: string } | { id: number; role: "assistant"; question: string; result: ChatAnswer };

const NAME = "Хийморь";
const STORAGE_KEY = "ask-parliament:v2:global"; // shared with <AskParliamentChat /> on /ask
const GREETED_KEY = "ask-parliament:greeted";
const MAX_CHARS = 1_000;
const HISTORY_TURNS = 8;

const STARTERS = [
  "Ажлаас гэнэт халагдвал юу хийх вэ?",
  "Мопед унахад ямар дүрэм байдаг вэ?",
  "Энэ долоо хоногт УИХ юу хэлэлцэж байна?",
  "Хууль яаж батлагддаг вэ?",
];
const FOLLOW_UPS = ["Энгийнээр тайлбарлаач", "Одоо юу хийх вэ?", "Хаана хандах вэ?"];

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

const plain = (text: string) => text.replace(/\[\d+\]/g, "").slice(0, 3_000);

const SendIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M5 12h13M12 5l7 7-7 7" />
  </svg>
);
const NewIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export function ChatDock() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [everOpened, setEverOpened] = useState(false);
  const [greeting, setGreeting] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  const [cheer, setCheer] = useState(false); // a moment of delight when an answer arrives
  const [launcherHover, setLauncherHover] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(1);
  const restored = useRef(false);

  const hidden = Boolean(pathname?.startsWith("/ask") || pathname?.startsWith("/laws/"));

  // Continue the conversation already held in this tab.
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null") as { messages: Message[] } | null;
      if (saved?.messages?.length) {
        setMessages(saved.messages);
        nextId.current = Math.max(...saved.messages.map((m) => m.id)) + 1;
      }
    } catch {
      /* storage unavailable */
    }
    restored.current = true;
  }, [open]);

  useEffect(() => {
    if (!restored.current) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ messages: messages.slice(-20) }));
    } catch {
      /* ignore */
    }
  }, [messages]);

  // A one-time hello next to the launcher, a few seconds after the first page view of the session.
  useEffect(() => {
    if (hidden) return;
    let seen = true;
    try {
      seen = sessionStorage.getItem(GREETED_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (seen) return;
    const t = window.setTimeout(() => setGreeting(true), 3500);
    return () => window.clearTimeout(t);
  }, [hidden]);

  const dismissGreeting = useCallback(() => {
    setGreeting(false);
    try {
      sessionStorage.setItem(GREETED_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  const openChat = () => {
    dismissGreeting();
    setEverOpened(true);
    setOpen(true);
  };
  const closeChat = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcherRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/chat", { method: "GET" }).catch(() => {}); // warm the most-asked laws
    const t = window.setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 220);
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") closeChat();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closeChat]);

  // New answers are read from their first line (like a messenger); everything else keeps the end in view.
  const lastSeen = useRef(0);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const last = messages.at(-1);
    if (last?.role === "assistant" && last.id !== lastSeen.current && lastSeen.current !== 0) {
      const row = el.querySelector<HTMLElement>(`[data-msg="${last.id}"]`);
      if (row) el.scrollTo({ top: row.offsetTop - 12, behavior: "smooth" });
    } else {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
    lastSeen.current = last?.id ?? -1;
  }, [messages, loading, status, error, open]);

  useEffect(() => {
    if (!loading) return;
    setElapsed(0);
    const id = window.setInterval(() => setElapsed((s) => s + 1), 1_000);
    return () => window.clearInterval(id);
  }, [loading]);

  // Grow the textarea with its text, up to four lines.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 112)}px`;
  }, [question, open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > MAX_CHARS || loading) return;
    const history: ChatTurn[] = messages
      .slice(-HISTORY_TURNS)
      .map((m) => (m.role === "user" ? { role: "user", content: m.text } : { role: "assistant", content: plain(m.result.answer) }));
    setMessages((current) => [...current, { id: nextId.current++, role: "user", text: trimmed }]);
    setQuestion("");
    setError(null);
    setStatus(null);
    setLoading(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-ask-session": sessionId() },
        body: JSON.stringify({ question: trimmed, history }),
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
        let nl: number;
        while ((nl = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          const event = JSON.parse(line) as ChatEvent;
          if (event.type === "status") setStatus(event.text);
          else if (event.type === "answer") answer = event.answer;
          else if (event.type === "error") throw new Error(event.error);
        }
      }
      if (!answer) throw new Error("Хариулт дутуу ирлээ. Дахин оролдоно уу.");
      const result = answer;
      setMessages((current) => [...current, { id: nextId.current++, role: "assistant", question: trimmed, result }]);
      setCheer(true);
      window.setTimeout(() => setCheer(false), 1800);
    } catch (cause) {
      const message =
        cause instanceof Error && cause.name === "TimeoutError"
          ? "Хариулт хэт удаж байна. Дахин оролдоно уу."
          : cause instanceof Error
            ? cause.message
            : "Хариулт авах боломжгүй байна.";
      setMessages((current) => current.slice(0, -1));
      setQuestion(trimmed);
      setError({ message, retry: () => void send(trimmed) });
    } finally {
      setLoading(false);
      setStatus(null);
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(question);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send(question);
    }
  };
  const reset = () => {
    setMessages([]);
    setError(null);
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    inputRef.current?.focus();
  };

  // Faces: the header shows the live mood, the launcher mostly rests and blinks.
  const thinking = useThinking(loading);
  const liveBase = loading ? thinking : error ? MOOD.worried : cheer ? MOOD.laugh : question.trim() ? MOOD.listen : MOOD.idle;
  const headFrame = useBlink(liveBase, open);
  const launcherFrame = useBlink(launcherHover || greeting ? MOOD.greet : MOOD.idle, !open);

  if (hidden) return null;

  const last = messages.at(-1);

  return (
    <div className={styles.dock}>
      {greeting && !open ? (
        <div className={styles.hello} role="status">
          <button type="button" className={styles.helloText} onClick={openChat}>
            Сайн байна уу! Хууль, Улсын Их Хурлын талаар асуух зүйл байвал надад бичээрэй.
          </button>
          <button type="button" className={styles.helloClose} onClick={dismissGreeting} aria-label="Хаах">
            <Close size={14} />
          </button>
        </div>
      ) : null}

      <button
        ref={launcherRef}
        type="button"
        className={styles.launcher}
        data-open={open}
        aria-expanded={open}
        aria-controls="chat-dock-panel"
        aria-label={`${NAME} — УИХ-ын AI туслахтай чатлах`}
        onClick={openChat}
        onPointerEnter={() => setLauncherHover(true)}
        onPointerLeave={() => setLauncherHover(false)}
      >
        <Sprite frame={launcherFrame} size={74} sheet="bust" className={styles.launcherSprite} />
      </button>

      {everOpened ? (
        <section id="chat-dock-panel" className={styles.panel} data-open={open} aria-hidden={!open} inert={!open} aria-labelledby="chat-dock-name" role="dialog">
          <header className={styles.head}>
            <span className={styles.avatar}>
              <Sprite frame={headFrame} size={42} />
              <span className={styles.online} aria-hidden="true" />
            </span>
            <div className={styles.who}>
              <h2 id="chat-dock-name">{NAME}</h2>
              <p aria-live="polite">{loading ? "бичиж байна…" : "УИХ-ын AI туслах"}</p>
            </div>
            <div className={styles.headActions}>
              {messages.length ? (
                <button type="button" onClick={reset} disabled={loading} title="Шинэ яриа" aria-label="Шинэ яриа эхлэх">
                  <NewIcon />
                </button>
              ) : null}
              <Link href="/ask" onClick={() => setOpen(false)} title="Бүтэн хуудсаар нээх" aria-label="Бүтэн хуудсаар нээх">
                <ArrowUpRight size={17} />
              </Link>
              <button type="button" onClick={closeChat} title="Хураах" aria-label="Чатыг хураах">
                <ChevronDown size={20} />
              </button>
            </div>
          </header>

          <div ref={listRef} className={styles.list} aria-live="polite" aria-busy={loading}>
            <div className={styles.intro}>
              <Sprite frame={MOOD.greet} size={64} sheet="bust" />
              <p>
                <strong>{NAME}</strong> · Улсын Их Хурлын AI туслах
              </p>
              <small>Хууль, төсөл, хуралдааны талаар асуугаарай. Хариулт бүр албан ёсны эх сурвалжтай.</small>
            </div>

            <div className={styles.row} data-from="bot">
              <Sprite frame={MOOD.idle} size={30} className={styles.rowAvatar} />
              <div className={styles.bubble}>Сайн байна уу! Юугаар туслах вэ?</div>
            </div>
            {!messages.length ? (
              <div className={styles.chips} aria-label="Жишээ асуултууд">
                {STARTERS.map((s) => (
                  <button type="button" key={s} onClick={() => void send(s)} disabled={loading}>
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className={styles.row} data-from="me">
                  <p className={styles.bubble}>
                    <span className="visually-hidden">Та: </span>
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className={styles.row} data-from="bot" data-msg={m.id}>
                  <Sprite frame={MOOD.idle} size={30} className={styles.rowAvatar} />
                  <Answer result={m.result} />
                </div>
              ),
            )}

            {loading ? (
              <div className={styles.row} data-from="bot" role="status">
                <Sprite frame={thinking} size={30} className={styles.rowAvatar} />
                <div>
                  <div className={`${styles.bubble} ${styles.typing}`} aria-label="Хариулт бэлдэж байна">
                    <span />
                    <span />
                    <span />
                  </div>
                  <p className={styles.statusLine}>
                    {elapsed >= 12 ? "Хуулийн эх бичвэр урт тул түр хүлээнэ үү…" : (status ?? "Холбогдох мэдээллийг хайж байна…")}
                  </p>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className={styles.row} data-from="bot" role="alert">
                <Sprite frame={MOOD.sorry} size={30} className={styles.rowAvatar} />
                <div className={`${styles.bubble} ${styles.errorBubble}`}>
                  {error.message}
                  <button type="button" onClick={error.retry} disabled={loading}>
                    Дахин оролдох
                  </button>
                </div>
              </div>
            ) : null}

            {!loading && !error && last?.role === "assistant" ? (
              <div className={styles.chips} aria-label="Дараагийн асуулт">
                {FOLLOW_UPS.map((f) => (
                  <button type="button" key={f} onClick={() => void send(f)}>
                    {f}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          <form className={styles.composer} onSubmit={submit}>
            <label htmlFor="chat-dock-input" className="visually-hidden">
              Асуултаа бичих
            </label>
            <textarea
              id="chat-dock-input"
              ref={inputRef}
              rows={1}
              value={question}
              maxLength={MAX_CHARS}
              placeholder="Асуултаа бичээрэй…"
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={loading}
            />
            <button type="submit" className={styles.send} disabled={loading || !question.trim()} aria-label="Илгээх">
              <SendIcon />
            </button>
          </form>
          <p className={styles.fineprint}>AI туслах · хууль зүйн зөвлөгөө биш, эх сурвалжаар шалгана уу</p>
        </section>
      ) : null}
    </div>
  );
}

/** One answer bubble: the text with numbered citations, then its sources (folded) and a copy action. */
function Answer({ result }: { result: ChatAnswer }) {
  const [copied, setCopied] = useState(false);
  const sources = result.citations.length ? result.citations : result.consulted;
  return (
    <div className={`${styles.bubble} ${styles.answer}`}>
      <div className={styles.answerText}>
        <RichText text={result.answer} citations={result.citations} />
      </div>
      {result.unverifiedNumbers ? <p className={styles.caution}>Зарим тоог эх сурвалжаас тулгаж чадсангүй — холбоосоор шалгана уу.</p> : null}
      <div className={styles.answerFoot}>
        {sources.length ? (
          <details className={styles.sources}>
            <summary>
              {sources.length} эх сурвалж
              <ChevronDown size={13} />
            </summary>
            <ol>
              {sources.map((c) => (
                <li key={`${c.url}|${c.title}`}>
                  <a href={c.url} target="_blank" rel="noopener noreferrer">
                    {result.citations.length ? <span className={styles.sourceN}>{c.n}</span> : null}
                    <span>
                      <small>{c.publisher}</small>
                      {c.title}
                    </span>
                    <span className="visually-hidden"> (шинэ цонхонд нээгдэнэ)</span>
                  </a>
                </li>
              ))}
            </ol>
          </details>
        ) : null}
        <button
          type="button"
          className={styles.copy}
          onClick={() => {
            void navigator.clipboard
              ?.writeText(answerAsText(result))
              .then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              })
              .catch(() => {});
          }}
        >
          {copied ? "Хуулбарласан ✓" : "Хуулбарлах"}
        </button>
      </div>
    </div>
  );
}
