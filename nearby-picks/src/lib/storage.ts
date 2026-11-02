import { useCallback, useEffect, useState } from 'react';

/** localStorage can throw (private mode, blocked storage) — never let that break the app. */
export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable; state still works for this session */
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
  validate: (v: unknown) => v is T = (_v): _v is T => true,
) {
  const [value, setValue] = useState<T>(() => {
    const stored = readJson<unknown>(key, fallback);
    return validate(stored) ? stored : fallback;
  });
  useEffect(() => writeJson(key, value), [key, value]);
  return [value, setValue] as const;
}

export type SpotMark = 'saved' | 'visited';
type Marks = Record<string, SpotMark[]>;

export function useSpotMarks() {
  const [marks, setMarks] = usePersistentState<Marks>(
    'np.marks.v1',
    {},
    (v): v is Marks => typeof v === 'object' && v !== null && !Array.isArray(v),
  );

  const has = useCallback((id: string, mark: SpotMark) => marks[id]?.includes(mark) ?? false, [marks]);

  const toggle = useCallback(
    (id: string, mark: SpotMark) =>
      setMarks((prev) => {
        const current = prev[id] ?? [];
        const next = current.includes(mark) ? current.filter((m) => m !== mark) : [...current, mark];
        const copy = { ...prev };
        if (next.length) copy[id] = next;
        else delete copy[id];
        return copy;
      }),
    [setMarks],
  );

  return { has, toggle };
}
