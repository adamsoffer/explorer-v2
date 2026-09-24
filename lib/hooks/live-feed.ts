"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Turns a polled list into a live feed. New items (by id) are marked fresh
 * so they can animate in. While the reader is scrolled down, arrivals are
 * held back and counted instead of shifting the list under them.
 */
export function useLiveFeed<T extends { id: string }>(
  items: T[] | undefined,
  { holdBelow = 240 }: { holdBelow?: number } = {}
) {
  const [shown, setShown] = useState<T[] | undefined>(undefined);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState(0);

  useEffect(() => {
    if (!items) return;
    if (!shown) {
      setShown(items);
      return;
    }
    const known = new Set(shown.map((i) => i.id));
    const incoming = items.filter((i) => !known.has(i.id));
    if (!incoming.length) return;
    if (typeof window !== "undefined" && window.scrollY > holdBelow) {
      setWaiting(incoming.length);
      return;
    }
    setShown(items);
    setFresh(new Set(incoming.map((i) => i.id)));
    setWaiting(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  /** Show held-back arrivals and jump to them. */
  const reveal = useCallback(() => {
    if (!items || !shown) return;
    const known = new Set(shown.map((i) => i.id));
    setFresh(new Set(items.filter((i) => !known.has(i.id)).map((i) => i.id)));
    setShown(items);
    setWaiting(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [items, shown]);

  return { shown, fresh, waiting, reveal };
}
