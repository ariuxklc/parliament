/**
 * Offline processing for «Өргөн мэдүүлсэн төслүүд» — downloads official files, extracts text and writes
 * AI briefs to data/project-summaries/. Pages never generate; they only read what this script cached.
 *
 *   npm run projects:process -- --candidates 20          rank projects by readable source material
 *   npm run projects:process -- --ids <uuid>,<uuid> --dry   extract + select excerpts, no model call
 *   npm run projects:process -- --ids <uuid>,<uuid>          generate (skips unchanged ones; --force to redo)
 *
 * Needs OPENAI_API_KEY (and optionally OPENAI_MODEL) in .env.local for generation. Never prints secrets.
 */

import { fetchSubmittedProjects } from "../src/lib/projects/dparliament.ts";
import { normalizeProject } from "../src/lib/projects/normalize.ts";
import { roleOf } from "../src/lib/project-summaries/sources.ts";
import { processProject } from "../src/lib/project-summaries/pipeline.ts";

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const value = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function candidates(limit: number) {
  const projects = (await fetchSubmittedProjects()).map(normalizeProject).filter((p) => p !== null);
  const ranked = projects
    .map((p) => {
      const sub = p.documents.filter((d) => d.step === "Өргөн мэдүүлэх");
      const roles = new Map<string, { docx: number; pdf: number }>();
      for (const d of sub) {
        const r = roleOf(d);
        const c = roles.get(r) ?? { docx: 0, pdf: 0 };
        if (d.fileType === "docx") c.docx++;
        else if (d.fileType === "pdf") c.pdf++;
        roles.set(r, c);
      }
      // DOCX always has text; most PDFs are scans, so they count for little until they are read.
      const score = ["draft", "concept", "introduction", "needs", "impact", "cost"].reduce((s, r) => {
        const c = roles.get(r);
        return s + (c ? (c.docx ? 3 : 0) + (c.pdf ? 1 : 0) : 0);
      }, 0);
      return { p, score, roles };
    })
    .sort((a, b) => b.score - a.score || (b.p.date ?? "").localeCompare(a.p.date ?? ""));
  for (const { p, score, roles } of ranked.slice(0, limit)) {
    const summary = [...roles].map(([r, c]) => `${r}:${c.docx}d/${c.pdf}p`).join(" ");
    console.log(`${String(score).padStart(2)}  ${p.date}  ${p.id}  ${p.type ?? ""} | ${p.title.slice(0, 70)}\n      ${summary}`);
  }
}

async function main() {
  if (flag("candidates")) return candidates(Number(value("candidates") ?? 20));
  const ids = (value("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) {
    console.log("Usage: --candidates [n] | --ids <uuid,uuid> [--dry] [--force] [--refresh-files]");
    process.exitCode = 1;
    return;
  }
  if (!flag("dry") && !process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set (.env.local). Use --dry to extract without generating.");
    process.exitCode = 1;
    return;
  }
  for (const id of ids) {
    const t0 = Date.now();
    try {
      const r = await processProject(id, { dryRun: flag("dry"), force: flag("force"), refreshFiles: flag("refresh-files"), log: (m) => console.log(m) });
      const usage = r.usage ? ` tokens in/out ${r.usage.inputTokens}/${r.usage.outputTokens}` : "";
      console.log(
        `→ ${r.outcome} · read ${r.documentsRead}, skipped ${r.documentsSkipped.length} · ${r.excerpts} excerpts / ${r.excerptChars} chars · LawForum ${r.lawforumId ?? "—"}${usage} · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      );
      for (const d of r.dropped) console.log(`   dropped [${d.section}] ${d.reason}: ${d.text.slice(0, 110)}`);
    } catch (err) {
      console.error(`✗ ${id}: ${err instanceof Error ? err.message : String(err)}`);
      process.exitCode = 1;
    }
    console.log("");
  }
}

await main();
