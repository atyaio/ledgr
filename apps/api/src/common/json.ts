import type { CustomFields } from '@ledgr/shared';

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const parseCustomFields = (raw: string | null | undefined): CustomFields => parseJson<CustomFields>(raw, {});
export const parseStringArray = (raw: string | null | undefined): string[] => parseJson<string[]>(raw, []);
export const iso = (d: Date): string => d.toISOString();
