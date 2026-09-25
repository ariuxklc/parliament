"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import styles from "./review.module.css";
import type { BillExplainer, ImpactPoint, SummaryPoint } from "@/lib/summaries/types";
import { ExplainerCard } from "../bill/ExplainerCard";
import { appUrl } from "@/lib/site";
import { formatDate, formatTime } from "@/lib/format";

interface Props {
  initial: BillExplainer[];
  defaultBillId: number;
  needsToken: boolean;
}

export function ReviewDesk({ initial, defaultBillId, needsToken }: Props) {
  const [items, setItems] = useState(initial);
  const [selectedId, setSelectedId] = useState<number | null>(initial[0]?.billId ?? null);
  const [newId, setNewId] = useState(String(defaultBillId));
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const selected = items.find((e) => e.billId === selectedId) ?? null;
  const headers = (json = true): HeadersInit => ({ ...(json ? { "Content-Type": "application/json" } : {}), ...(needsToken ? { "x-review-token": token } : {}) });

  const upsert = (e: BillExplainer) => {
    setItems((list) => [e, ...list.filter((x) => x.billId !== e.billId)]);
    setSelectedId(e.billId);
  };

  const call = async (label: string, fn: () => Promise<Response>, okText: string) => {
    setBusy(label);
    setMessage(null);
    try {
      const r = await fn();
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Алдаа гарлаа");
      upsert(d as BillExplainer);
      setMessage({ kind: "ok", text: okText });
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Алдаа гарлаа" });
    } finally {
      setBusy(null);
    }
  };

  const generate = (billId: number) => {
    const existing = items.find((e) => e.billId === billId);
    if (existing && !confirm("Одоогийн тайлбарыг шинэ ноорогоор солих уу? (Нийтлэгдсэн бол нийтлэлээс буцна.)")) return;
    void call("generate", () => fetch("/api/review/generate", { method: "POST", headers: headers(), body: JSON.stringify({ billId }) }), "Ноорог бэлэн. Эх заалттай тулгаж шалгана уу.");
  };

  return (
    <div className={styles.desk}>
      <div className={styles.toolbar}>
        <label className={styles.field}>
          <span>LawForum төслийн дугаар</span>
          <input inputMode="numeric" value={newId} onChange={(e) => setNewId(e.target.value.replace(/\D/g, ""))} />
        </label>
        <button type="button" className={styles.primary} disabled={!newId || busy !== null} onClick={() => generate(Number(newId))}>
          {busy === "generate" ? "AI ноорог бэлтгэж байна… (30 сек орчим)" : "AI-аар ноорог үүсгэх"}
        </button>
        {needsToken ? (
          <label className={styles.field}>
            <span>Хянагчийн нууц үг</span>
            <input type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </label>
        ) : null}
        {items.length ? (
          <label className={styles.field}>
            <span>Тайлбарууд</span>
            <select value={selectedId ?? ""} onChange={(e) => setSelectedId(Number(e.target.value))}>
              {items.map((e) => (
                <option key={e.billId} value={e.billId}>
                  {e.status === "approved" ? "✓ " : "• "}
                  {e.billTitle.slice(0, 60)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {message ? (
        <p className={styles.message} data-kind={message.kind} role={message.kind === "error" ? "alert" : "status"}>
          {message.text}
        </p>
      ) : null}

      {selected ? (
        <Editor key={`${selected.billId}-${selected.updatedAt}`} explainer={selected} busy={busy} onCall={call} headers={headers} onRegenerate={() => generate(selected.billId)} />
      ) : (
        <p className={styles.empty}>Одоогоор тайлбар алга. Дээрээс төслийн дугаар оруулж ноорог үүсгэнэ үү (жишээ: 11151 — Өгөгдлийн тухай).</p>
      )}
    </div>
  );
}

function Editor({
  explainer: e,
  busy,
  onCall,
  headers,
  onRegenerate,
}: {
  explainer: BillExplainer;
  busy: string | null;
  onCall: (label: string, fn: () => Promise<Response>, okText: string) => Promise<void>;
  headers: (json?: boolean) => HeadersInit;
  onRegenerate: () => void;
}) {
  const [summary, setSummary] = useState<SummaryPoint[]>(e.summary);
  const [impact, setImpact] = useState<ImpactPoint[]>(e.impact);
  const [reviewer, setReviewer] = useState(e.reviewedBy ?? "");
  const [checked, setChecked] = useState(false);
  const [videoUrl, setVideoUrl] = useState(e.video && e.video.kind !== "file" ? e.video.src : "");
  const [videoTitle, setVideoTitle] = useState(e.video?.title ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [removeVideo, setRemoveVideo] = useState(false);

  const preview: BillExplainer = useMemo(() => ({ ...e, summary, impact, video: removeVideo ? null : e.video }), [e, summary, impact, removeVideo]);
  const videoPayload = () => {
    if (removeVideo) return null;
    if (videoUrl) return { src: videoUrl, title: videoTitle };
    return e.video && e.video.kind === "file" ? { src: e.video.src, title: videoTitle } : null;
  };
  const payload = (action: "save" | "approve" | "unpublish") => JSON.stringify({ billId: e.billId, summary, impact, action, reviewer, video: videoPayload() });
  const save = (action: "save" | "approve" | "unpublish", ok: string) => onCall(action, () => fetch("/api/review/save", { method: "POST", headers: headers(), body: payload(action) }), ok);

  const upload = () => {
    if (!file) return;
    const form = new FormData();
    form.set("billId", String(e.billId));
    form.set("file", file);
    form.set("title", videoTitle);
    void onCall("video", () => fetch("/api/review/video", { method: "POST", headers: headers(false), body: form }), "Видео хадгалагдлаа.");
  };

  return (
    <div className={styles.editor}>
      <div className={styles.editorHead}>
        <div>
          <span className={styles.status} data-status={e.status}>
            {e.status === "approved" ? "Нийтлэгдсэн" : "Ноорог — олон нийтэд харагдахгүй"}
          </span>
          <h2>{e.billTitle}</h2>
          <p className={styles.meta}>
            {e.generatedAt ? `AI ноорог: ${formatDate(e.generatedAt)} ${formatTime(e.generatedAt)}` : ""}
            {e.approvedAt ? ` · Баталсан: ${formatDate(e.approvedAt)}` : ""}
            {e.editedByReviewer ? " · Хүн засварласан" : ""}
          </p>
        </div>
        <div className={styles.links}>
          <Link href={appUrl.bill(e.billId)} target="_blank">
            Төслийн хуудас
          </Link>
          <a href={e.billUrl} target="_blank" rel="noopener noreferrer">
            LawForum эх бичвэр
          </a>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.edit}>
          <h3>30 секундэд</h3>
          {summary.map((p, i) => (
            <div key={i} className={styles.point}>
              <textarea value={p.text} rows={3} onChange={(ev) => setSummary((s) => s.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} />
              <div className={styles.pointFoot}>
                <span className={styles.refs}>Эх: {p.refs.map((r) => e.sources.find((s) => s.ref === r)?.number || r).join(", ") || "—"}</span>
                <button type="button" onClick={() => setSummary((s) => s.filter((_, j) => j !== i))}>
                  Устгах
                </button>
              </div>
            </div>
          ))}

          <h3>Энэ танд хамаатай юу?</h3>
          {impact.length === 0 ? <p className={styles.hint}>AI эх бичвэрээс тодорхой бүлэг олсонгүй — энэ хэсэг харагдахгүй.</p> : null}
          {impact.map((p, i) => (
            <div key={i} className={styles.point}>
              <input value={p.who} onChange={(ev) => setImpact((s) => s.map((x, j) => (j === i ? { ...x, who: ev.target.value } : x)))} aria-label="Хэнд" />
              <textarea value={p.text} rows={2} onChange={(ev) => setImpact((s) => s.map((x, j) => (j === i ? { ...x, text: ev.target.value } : x)))} />
              <div className={styles.pointFoot}>
                <span className={styles.refs}>Эх: {p.refs.map((r) => e.sources.find((s) => s.ref === r)?.number || r).join(", ") || "—"}</span>
                <button type="button" onClick={() => setImpact((s) => s.filter((_, j) => j !== i))}>
                  Устгах
                </button>
              </div>
            </div>
          ))}

          <h3>Видео</h3>
          <div className={styles.video}>
            <label className={styles.field}>
              <span>Гарчиг (заавал биш)</span>
              <input value={videoTitle} onChange={(ev) => setVideoTitle(ev.target.value)} />
            </label>
            <label className={styles.field}>
              <span>Файл (MP4/WebM/MOV, 250 MB хүртэл)</span>
              <input type="file" accept="video/mp4,video/webm,video/quicktime" onChange={(ev) => setFile(ev.target.files?.[0] ?? null)} />
            </label>
            <button type="button" className={styles.secondary} disabled={!file || busy !== null} onClick={upload}>
              {busy === "video" ? "Хуулж байна…" : "Видео хуулах"}
            </button>
            <label className={styles.field}>
              <span>эсвэл холбоос (YouTube, TikTok…)</span>
              <input value={videoUrl} placeholder="https://" onChange={(ev) => setVideoUrl(ev.target.value)} />
            </label>
            {e.video ? (
              <p className={styles.hint}>
                Одоогийн видео: {e.video.kind === "file" ? "хуулсан файл" : e.video.src}{" "}
                <button type="button" className={styles.inlineBtn} onClick={() => setRemoveVideo((v) => !v)}>
                  {removeVideo ? "Хасахгүй" : "Видеог хасах (хадгалахад)"}
                </button>
              </p>
            ) : null}
          </div>

          <div className={styles.approve}>
            <label className={styles.field}>
              <span>Хянасан хүний нэр</span>
              <input value={reviewer} onChange={(ev) => setReviewer(ev.target.value)} />
            </label>
            <label className={styles.check}>
              <input type="checkbox" checked={checked} onChange={(ev) => setChecked(ev.target.checked)} />
              Өгүүлбэр бүрийг эх заалттай нь тулгаж шалгасан
            </label>
            <div className={styles.actions}>
              <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => save("save", "Хадгаллаа.")}>
                Хадгалах
              </button>
              <button type="button" className={styles.primary} disabled={busy !== null || !checked || !reviewer.trim() || !summary.length} onClick={() => save("approve", "Батлагдаж нийтлэгдлээ.")}>
                Батлаж нийтлэх
              </button>
              {e.status === "approved" ? (
                <button type="button" className={styles.secondary} disabled={busy !== null} onClick={() => save("unpublish", "Нийтлэлээс буцаалаа.")}>
                  Нийтлэлээс буцаах
                </button>
              ) : null}
              <button type="button" className={styles.ghost} disabled={busy !== null} onClick={onRegenerate}>
                Дахин үүсгэх
              </button>
            </div>
          </div>
        </div>

        <aside className={styles.sources}>
          <h3>Эх заалтууд</h3>
          <ul>
            {e.sources.map((s) => (
              <li key={s.ref}>
                <a href={`${e.billUrl}#${s.anchor}`} target="_blank" rel="noopener noreferrer">
                  {s.number ? `${s.number} заалт` : "Эх хэсэг"}
                </a>
                {s.article ? <small>{s.article}</small> : null}
                <p>{s.text}</p>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <h3 className={styles.previewTitle}>Урьдчилан харах — төслийн хуудсан дээр</h3>
      <ExplainerCard explainer={preview} variant="preview" />
      <h3 className={styles.previewTitle}>Урьдчилан харах — нүүр хуудсан дээр</h3>
      <ExplainerCard explainer={preview} variant="home" />
    </div>
  );
}
