/**
 * lyricCache.ts — In-memory LRC cache for mini player one-line sync
 */

import type { LyricLine } from "./lrcParser";
import { getActiveLine } from "./lrcParser";

const cache = new Map<string, LyricLine[]>();

export function setLyricCache(songPath: string, lines: LyricLine[]): void {
  if (!songPath) return;
  cache.set(songPath, lines);
}

export function clearLyricCache(songPath?: string): void {
  if (songPath) cache.delete(songPath);
  else cache.clear();
}

export function getLyricLines(songPath: string | undefined): LyricLine[] {
  if (!songPath) return [];
  return cache.get(songPath) ?? [];
}

export function getLyricLineAt(songPath: string | undefined, currentTime: number, offsetMs = 0): string {
  if (!songPath) return "";
  const lines = cache.get(songPath);
  if (!lines?.length) return "";
  const t = currentTime + offsetMs / 1000;
  const idx = getActiveLine(lines, t);
  if (idx < 0) return "";
  return lines[idx].text;
}
