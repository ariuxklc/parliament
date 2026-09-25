"use client";

import { useEffect, useState } from "react";
import type { MemberProfile } from "@/lib/types";

/** Client-side cache so hovering back and forth never refetches. */
const cache = new Map<number, Promise<MemberProfile>>();

export function prefetchMemberProfile(id: number): Promise<MemberProfile> {
  let p = cache.get(id);
  if (!p) {
    p = fetch(`/api/members/${id}`).then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      return (await r.json()) as MemberProfile;
    });
    p.catch(() => cache.delete(id)); // allow a retry later
    cache.set(id, p);
  }
  return p;
}

export function useMemberProfile(id: number | null): { profile: MemberProfile | null; state: "loading" | "ready" | "error" } {
  const [result, setResult] = useState<{ id: number | null; profile: MemberProfile | null; state: "loading" | "ready" | "error" }>({
    id: null,
    profile: null,
    state: "loading",
  });

  useEffect(() => {
    if (id === null) return;
    let alive = true;
    setResult((r) => (r.id === id ? r : { id, profile: null, state: "loading" }));
    prefetchMemberProfile(id)
      .then((profile) => alive && setResult({ id, profile, state: "ready" }))
      .catch(() => alive && setResult({ id, profile: null, state: "error" }));
    return () => {
      alive = false;
    };
  }, [id]);

  return result.id === id ? { profile: result.profile, state: result.state } : { profile: null, state: "loading" };
}
