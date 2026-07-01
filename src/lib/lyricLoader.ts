/**
 * lyricLoader.ts — Load LRC for mini player / cache (independent of LyricsPanel mount)
 */

import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseLrc, getLrcPath, type LyricLine } from "./lrcParser";
import { setLyricCache } from "./lyricCache";

const LS_LYRICS_CACHE = "sonarix-lyrics-offline-cache";

interface CachedLyrics {
  path: string;
  lines: LyricLine[];
  savedAt: number;
}

function loadOfflineCache(): Record<string, CachedLyrics> {
  try {
    return JSON.parse(localStorage.getItem(LS_LYRICS_CACHE) ?? "{}");
  } catch {
    return {};
  }
}

function saveOfflineCache(path: string, lines: LyricLine[]): void {
  try {
    const all = loadOfflineCache();
    all[path] = { path, lines, savedAt: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > 200) {
      keys.sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));
      for (let i = 0; i < keys.length - 200; i++) delete all[keys[i]];
    }
    localStorage.setItem(LS_LYRICS_CACHE, JSON.stringify(all));
  } catch { /* quota */ }
}

/** Load lyrics for a song path into lyricCache. Returns true if lines found. */
export async function ensureLyricsLoaded(
  songPath: string,
  offlineCacheEnabled = true,
): Promise<boolean> {
  if (!songPath) return false;

  if (offlineCacheEnabled) {
    const cached = loadOfflineCache()[songPath];
    if (cached?.lines?.length) {
      setLyricCache(songPath, cached.lines);
      return true;
    }
  }

  const lrcPath = getLrcPath(songPath);
  try {
    const content = await readTextFile(lrcPath);
    const parsed = parseLrc(content);
    if (parsed.lines.length > 0) {
      setLyricCache(songPath, parsed.lines);
      if (offlineCacheEnabled) saveOfflineCache(songPath, parsed.lines);
      return true;
    }
  } catch { /* no local lrc */ }

  return false;
}

export function cacheLyricsOffline(songPath: string, lines: LyricLine[]): void {
  saveOfflineCache(songPath, lines);
}
