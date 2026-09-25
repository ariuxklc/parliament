"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import styles from "./stats.module.css";
import type { ParliamentComposition } from "@/lib/types";
import { useRevealed } from "../../motion/Reveal";

interface Seat {
  x: number;
  y: number;
  partyIndex: number;
  order: number;
}

/** Classic parliament arch: rows get seats in proportion to their radius; parties fill wedges left → right. */
function layoutSeats(counts: number[], rows = 7): Seat[] {
  const total = counts.reduce((a, b) => a + b, 0);
  const r0 = 0.36;
  const radii = Array.from({ length: rows }, (_, i) => r0 + ((1 - r0) * i) / (rows - 1));
  const sum = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map((r) => Math.round((total * r) / sum));
  perRow[rows - 1] += total - perRow.reduce((a, b) => a + b, 0);

  const pts: { x: number; y: number; angle: number }[] = [];
  radii.forEach((r, i) => {
    const n = perRow[i];
    for (let k = 0; k < n; k++) {
      const angle = Math.PI - (Math.PI * k) / Math.max(1, n - 1);
      // rounded so server and browser produce identical attributes (float trig differs in the last digit)
      const round = (v: number) => Math.round(v * 100) / 100;
      pts.push({ x: round(100 + Math.cos(angle) * r * 92), y: round(100 - Math.sin(angle) * r * 92), angle });
    }
  });
  pts.sort((a, b) => b.angle - a.angle);

  const seats: Seat[] = [];
  let p = 0;
  let used = 0;
  pts.forEach((pt, i) => {
    while (p < counts.length - 1 && used >= counts[p]) {
      p++;
      used = 0;
    }
    used++;
    seats.push({ x: pt.x, y: pt.y, partyIndex: p, order: i });
  });
  return seats;
}

export function Hemicycle({ composition }: { composition: ParliamentComposition }) {
  const { parties, totalMembers } = composition;
  const seats = useMemo(() => layoutSeats(parties.map((p) => p.seats)), [parties]);
  const [focus, setFocus] = useState<number | null>(null);
  const [ref, revealed] = useRevealed<HTMLDivElement>();
  const focused = focus !== null ? parties[focus] : null;

  return (
    <div ref={ref} className={styles.hemicycle} data-revealed={revealed} onPointerLeave={() => setFocus(null)}>
      <div className={styles.arch}>
        <svg viewBox="0 0 200 104" role="img" aria-label={parties.map((p) => `${p.party.name} ${p.seats}`).join(", ")}>
          {seats.map((s) => (
            <circle
              key={s.order}
              cx={s.x}
              cy={s.y}
              r={3.1}
              fill={parties[s.partyIndex].party.color}
              className={styles.seat}
              data-dim={focus !== null && focus !== s.partyIndex}
              style={{ ["--k" as string]: s.order }}
              onPointerEnter={() => setFocus(s.partyIndex)}
            />
          ))}
        </svg>
        <div className={styles.archCenter} aria-hidden="true">
          <strong className="tabular">{focused ? focused.seats : totalMembers}</strong>
          <span>{focused ? focused.party.name : "гишүүн"}</span>
        </div>
      </div>
      <ul className={styles.legend}>
        {parties.map((p, i) => (
          <li key={p.party.id}>
            <button
              type="button"
              aria-pressed={focus === i}
              onPointerEnter={() => setFocus(i)}
              onFocus={() => setFocus(i)}
              onBlur={() => setFocus(null)}
              onClick={() => setFocus(focus === i ? null : i)}
              style={{ ["--party" as string]: p.party.color }}
            >
              {p.party.logo ? <Image src={p.party.logo} alt="" width={22} height={22} className={styles.legendLogo} /> : <span className={styles.legendSwatch} />}
              <span className={styles.legendName}>{p.party.name}</span>
              <span className={`tabular ${styles.legendSeats}`}>{p.seats}</span>
              <span className={styles.legendBar} aria-hidden="true">
                <span style={{ width: `${(p.seats / totalMembers) * 100}%` }} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
