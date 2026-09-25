import styles from "./featured.module.css";
import { ExplainerCard } from "../../bill/ExplainerCard";
import { Reveal } from "../../motion/Reveal";
import { getFeaturedExplainer } from "@/lib/summaries/store";

/**
 * Homepage "30 секундэд": the most recently approved explainer (and its video, if any).
 * Renders nothing until a person has approved one in /review — no placeholders for visitors.
 */
export async function FeaturedExplainer() {
  const explainer = await getFeaturedExplainer().catch(() => null);
  if (!explainer) return null;
  return (
    <section className={styles.section} aria-label="30 секундэд ойлгох">
      <div className="container">
        <Reveal>
          <ExplainerCard explainer={explainer} variant="home" headingId="featured-explainer" />
        </Reveal>
      </div>
    </section>
  );
}
