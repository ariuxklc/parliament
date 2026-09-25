import { createHash } from "node:crypto";
import { fetchProject } from "../projects/dparliament.ts";
import { normalizeProject } from "../projects/normalize.ts";
import { findLawForumMatch } from "../projects/lawforum-link.ts";
import type { ProjectDocument, SubmittedProject } from "../projects/types.ts";
import { downloadOfficialFile, OfficialFileError } from "../documents/official-file.ts";
import { EXTRACTOR_VERSION, extractDocument } from "../documents/extract.ts";
import { labelFor, roleOf, selectExcerpts, SELECTION_VERSION, type SourceInput } from "./sources.ts";
import { buildModelInput, PROMPT_VERSION } from "./prompt.ts";
import { briefModelName, callBriefModel } from "./openai.ts";
import { validateBrief, type Dropped } from "./validate.ts";
import { readBrief, readDocCache, readLinks, writeBrief, writeDocCache, writeLink, type CachedExtraction } from "./store.ts";
import { BRIEF_SCHEMA_VERSION, type BriefSourceDoc, type ProjectBrief, type SkippedDoc } from "./types.ts";

/**
 * One project: official metadata → official files → text → selected excerpts → model → checked brief.
 * Run offline (scripts/process-projects.ts); pages only read the cached result. Nothing here trusts a URL
 * from outside: files are fetched by LawForum file id from the project's own official metadata.
 */

export interface ProcessOptions {
  force?: boolean; // regenerate even when the cache key is unchanged
  dryRun?: boolean; // extract + select, no model call
  refreshFiles?: boolean; // re-download files even if their text is cached
  log?: (msg: string) => void;
}

export interface ProcessReport {
  projectId: string;
  title: string;
  outcome: "generated" | "cached" | "dry-run" | "no-readable-documents" | "insufficient" | "rejected";
  documentsRead: number;
  documentsSkipped: SkippedDoc[];
  excerpts: number;
  excerptChars: number;
  dropped: Dropped[];
  lawforumId: number | null;
  usage?: { inputTokens: number | null; outputTokens: number | null };
}

const READABLE = new Set(["pdf", "docx", "doc", "other"]);
const MAX_DOWNLOADS = 12;

async function extractionFor(doc: ProjectDocument, refresh: boolean): Promise<CachedExtraction> {
  const cached = refresh ? null : await readDocCache(doc.fileId);
  if (cached && cached.extractorVersion === EXTRACTOR_VERSION) return cached;
  const file = await downloadOfficialFile(doc.fileId);
  const result = await extractDocument(file.bytes);
  const entry: CachedExtraction = {
    fileId: doc.fileId,
    sha256: file.sha256,
    bytes: file.bytes.byteLength,
    extractorVersion: EXTRACTOR_VERSION,
    extractedAt: new Date().toISOString(),
    result,
  };
  await writeDocCache(entry);
  return entry;
}

function skipReason(status: string): SkippedDoc["reason"] {
  return status === "needs-ocr" ? "needs-ocr" : status === "unsupported" ? "unsupported" : "failed";
}

export async function processProject(projectId: string, opts: ProcessOptions = {}): Promise<ProcessReport> {
  const log = opts.log ?? (() => undefined);
  const raw = await fetchProject(projectId);
  const project: SubmittedProject | null = raw ? normalizeProject(raw) : null;
  if (!project) throw new Error(`project ${projectId} not found in «Өргөн мэдүүлсэн төслүүд»`);
  log(`${project.title} — ${project.documents.length} official files`);

  // Verified LawForum link (shared official file ids) — stored once per project, even when no brief results.
  const links = await readLinks();
  let lawforumId = links[projectId]?.lawforumId ?? null;
  if (!links[projectId]) {
    const match = await findLawForumMatch(project).catch(() => ({ lawforumId: null, sharedFiles: 0 }));
    lawforumId = match.lawforumId;
    await writeLink(projectId, { ...match, checkedAt: new Date().toISOString() });
  }

  // The submission package explains what is proposed and why; later-stage files (committee opinions,
  // final versions) describe the process and are listed on the page but not summarised.
  const candidates = project.documents
    .filter((d) => d.step === "Өргөн мэдүүлэх" || d.step === "Тайлан, мэдээлэл илтгэл" || !d.step)
    .map((d) => ({ doc: d, role: roleOf(d) }))
    .sort((a, b) => ROLE_RANK.indexOf(a.role) - ROLE_RANK.indexOf(b.role));

  const inputs: SourceInput[] = [];
  const skipped: SkippedDoc[] = [];
  const hashes = new Map<number, CachedExtraction>();
  let downloads = 0;
  for (const { doc, role } of candidates) {
    if (!READABLE.has(doc.fileType)) {
      skipped.push({ fileId: doc.fileId, filename: doc.filename, category: doc.category, reason: "unsupported", note: `${doc.fileType.toUpperCase()} файл` });
      continue;
    }
    if (downloads >= MAX_DOWNLOADS) break;
    downloads++;
    try {
      const ex = await extractionFor(doc, opts.refreshFiles ?? false);
      hashes.set(doc.fileId, ex);
      log(`  ${String(doc.fileId).padEnd(6)} ${role.padEnd(12)} ${ex.result.status.padEnd(11)} ${String(ex.result.chars).padStart(7)} chars  ${doc.filename.slice(0, 60)}`);
      if (ex.result.status === "ok") inputs.push({ doc, role, blocks: ex.result.blocks });
      else skipped.push({ fileId: doc.fileId, filename: doc.filename, category: doc.category, reason: skipReason(ex.result.status), note: ex.result.note });
    } catch (err) {
      const tooLarge = err instanceof OfficialFileError && err.code === "too-large";
      skipped.push({ fileId: doc.fileId, filename: doc.filename, category: doc.category, reason: tooLarge ? "too-large" : "failed", note: err instanceof Error ? err.message.slice(0, 120) : null });
      log(`  ${String(doc.fileId).padEnd(6)} ${role.padEnd(12)} ${tooLarge ? "too-large" : "failed"}  ${doc.filename.slice(0, 60)}`);
    }
  }

  const selected = selectExcerpts(inputs);
  const excerptCount = selected.reduce((n, d) => n + d.excerpts.length, 0);
  const excerptChars = selected.reduce((n, d) => n + d.excerpts.reduce((m, e) => m + e.text.length, 0), 0);
  const base = { projectId, title: project.title, documentsRead: inputs.length, documentsSkipped: skipped, excerpts: excerptCount, excerptChars, dropped: [] as Dropped[] };
  if (!selected.length) return { ...base, outcome: "no-readable-documents", lawforumId };

  const model = briefModelName();
  const cacheKey = createHash("sha256")
    .update(
      JSON.stringify({
        projectId,
        sources: selected.map((d) => [d.input.doc.fileId, hashes.get(d.input.doc.fileId)?.sha256]).sort(),
        schema: BRIEF_SCHEMA_VERSION,
        prompt: PROMPT_VERSION,
        extractor: EXTRACTOR_VERSION,
        selection: SELECTION_VERSION,
        model,
      }),
    )
    .digest("hex");

  const existing = await readBrief(projectId);
  if (existing && existing.cacheKey === cacheKey && !opts.force) return { ...base, outcome: "cached", lawforumId: existing.lawforumId };
  if (opts.dryRun) {
    for (const d of selected) log(`  ${d.ref} ${d.input.role.padEnd(12)} ${d.excerpts.length} excerpts ${d.excerpts.reduce((m, e) => m + e.text.length, 0)} chars — ${d.input.doc.filename.slice(0, 50)}`);
    return { ...base, outcome: "dry-run", lawforumId };
  }

  const input = buildModelInput(
    { title: project.title, type: project.type, initiator: project.initiator?.name ?? null, date: project.date },
    selected,
  );
  const result = await callBriefModel(input);
  if (result.refused || !result.output) return { ...base, outcome: "rejected", lawforumId, usage: result.usage };

  const excerptText = new Map(selected.flatMap((d) => d.excerpts.map((e) => [e.id, e.text] as const)));
  const v = validateBrief(result.output, excerptText, project.title);
  if (v.insufficientEvidence && v.summary.length === 0) return { ...base, outcome: "insufficient", dropped: v.dropped, lawforumId, usage: result.usage };
  if (!v.summary.length) return { ...base, outcome: "rejected", dropped: v.dropped, lawforumId, usage: result.usage };

  const cited = new Set([...v.summary, ...v.mainChanges, ...v.statedRationale, ...v.affectedAreas, ...v.keyPoints].flatMap((s) => s.refs));
  const sources: BriefSourceDoc[] = selected.map((d) => ({
    ref: d.ref,
    fileId: d.input.doc.fileId,
    role: d.input.role,
    label: labelFor(d.input.role, d.input.doc.filename, project.type),
    category: d.input.doc.category,
    step: d.input.doc.step,
    filename: d.input.doc.filename,
    fileType: d.input.doc.fileType,
    officialUrl: d.input.doc.officialUrl,
    viewUrl: d.input.doc.viewUrl,
    sha256: hashes.get(d.input.doc.fileId)?.sha256 ?? "",
    extraction: "native",
    pages: hashes.get(d.input.doc.fileId)?.result.pages ?? null,
    chars: hashes.get(d.input.doc.fileId)?.result.chars ?? 0,
  }));

  const brief: ProjectBrief = {
    schemaVersion: BRIEF_SCHEMA_VERSION,
    projectId,
    projectTitle: project.title,
    projectUrl: project.officialUrl,
    lawforumId,
    status: "ai",
    summary: v.summary,
    mainChanges: v.mainChanges,
    statedRationale: v.statedRationale,
    affectedAreas: v.affectedAreas,
    keyPoints: v.keyPoints,
    sources,
    excerpts: selected.flatMap((d) => d.excerpts.filter((e) => cited.has(e.id))),
    skipped,
    documentFileIds: project.documents.map((d) => d.fileId).sort((a, b) => a - b),
    cacheKey,
    model,
    promptVersion: PROMPT_VERSION,
    generatedAt: new Date().toISOString(),
  };
  await writeBrief(brief);
  return { ...base, outcome: "generated", dropped: v.dropped, lawforumId, usage: result.usage };
}

const ROLE_RANK = ["draft", "concept", "introduction", "needs", "impact", "cost", "related", "discussion", "letter", "other"];
