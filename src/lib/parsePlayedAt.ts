/**
 * Play-history timestamps — store explicit local play_day + unix-ms played_at.
 */

const LEGACY_SQLITE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Local calendar day key, e.g. "2026-07-04" */
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface PlayEventFields {
  played_at: string;
  play_day: string;
}

/** Create fields for a new play event (local day + unix ms). */
export function createPlayEvent(at = new Date()): PlayEventFields {
  return {
    played_at: String(at.getTime()),
    play_day: localDayKey(at),
  };
}

export function parsePlayedAt(playedAt: string | number): Date {
  const trimmed = String(playedAt ?? "").trim();
  if (!trimmed) return new Date(NaN);

  if (/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) {
    const n = Math.round(Number(trimmed));
    return new Date(n < 1e12 ? n * 1000 : n);
  }

  if (/[Zz]$/.test(trimmed) || /[+-]\d{2}:\d{2}$/.test(trimmed)) {
    return new Date(trimmed);
  }

  if (LEGACY_SQLITE.test(trimmed)) {
    return new Date(trimmed.replace(" ", "T") + "Z");
  }

  if (trimmed.includes("T")) {
    return new Date(trimmed + "Z");
  }

  return new Date(trimmed.replace(" ", "T"));
}

/** Resolve the local calendar day for chart grouping. */
export function getPlayDay(record: { played_at: string; play_day?: string | null }): string {
  if (record.play_day && DAY_KEY.test(record.play_day)) {
    return record.play_day;
  }
  const d = parsePlayedAt(record.played_at);
  if (Number.isNaN(d.getTime())) return localDayKey(new Date());
  return localDayKey(d);
}

/** Normalize DB / legacy row into canonical play record. */
export function enrichPlayRecord(record: {
  song_id: number;
  played_at: unknown;
  play_day?: string | null;
}): { song_id: number; played_at: string; play_day: string } {
  const played_at = coercePlayedAtMs(record.played_at);
  const play_day = record.play_day && DAY_KEY.test(record.play_day)
    ? record.play_day
    : localDayKey(parsePlayedAt(played_at));
  return { song_id: record.song_id, played_at, play_day };
}

function coercePlayedAtMs(value: unknown): string {
  if (value == null || value === "") return String(Date.now());
  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?(e[+-]?\d+)?$/i.test(trimmed)) {
    const n = Math.round(Number(trimmed));
    return String(n < 1e12 ? n * 1000 : n);
  }
  const d = parsePlayedAt(trimmed);
  return Number.isNaN(d.getTime()) ? String(Date.now()) : String(d.getTime());
}

/** @deprecated use createPlayEvent */
export function nowPlayedAt(): string {
  return createPlayEvent().played_at;
}

/** @deprecated use enrichPlayRecord */
export function normalizePlayedAt(playedAt: string): string {
  return coercePlayedAtMs(playedAt);
}
