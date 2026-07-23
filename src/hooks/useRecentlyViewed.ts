import { useCallback, useEffect, useState } from "react";

const KEY = "shopnexa:recent:v1";
const MAX = 12;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function useRecentlyViewed() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    setIds(read());
  }, []);

  const track = useCallback((id: string) => {
    if (!id || typeof window === "undefined") return;
    const current = read().filter((x) => x !== id);
    const next = [id, ...current].slice(0, MAX);
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    setIds(next);
  }, []);

  return { ids, track };
}
