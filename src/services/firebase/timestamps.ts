export function toMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === "number") return value;
  const ts = value as { toMillis?: () => number } | undefined;
  return ts?.toMillis?.() ?? fallback;
}
