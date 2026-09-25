import { t } from "@/lib/i18n";

/** Placeholder that reserves space while a streamed section loads (prevents layout jumps). */
export function SectionSkeleton({ id, tone, height }: { id: string; tone: "light" | "dark"; height: number }) {
  return (
    <section
      id={id}
      aria-busy="true"
      style={{
        minHeight: height,
        background: tone === "dark" ? "var(--blue-950)" : "var(--surface)",
        display: "grid",
        placeItems: "center",
        color: tone === "dark" ? "var(--ink-on-dark-muted)" : "var(--ink-500)",
        fontSize: 14,
      }}
    >
      <span>{t.laws.loading}</span>
    </section>
  );
}
