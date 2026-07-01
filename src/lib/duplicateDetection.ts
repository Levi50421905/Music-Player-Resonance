/**
 * duplicateDetection.ts — Find likely duplicate tracks in library
 */

import type { Song } from "./db";

export interface DuplicateGroup {
  key: string;
  reason: "path_similar" | "metadata" | "file_size";
  songs: Song[];
}

function normalizeTitle(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim();
}

export function findDuplicates(songs: Song[]): DuplicateGroup[] {
  const groups = new Map<string, Song[]>();

  for (const song of songs) {
    const title = normalizeTitle(song.title ?? "");
    const artist = normalizeTitle(song.artist ?? "");
    const dur = Math.round(song.duration ?? 0);
    const key = `${artist}::${title}::${dur}`;
    if (!title || !artist) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(song);
  }

  const result: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length > 1) {
      result.push({ key, reason: "metadata", songs: list });
    }
  }

  // Same file size + similar title
  const sizeMap = new Map<number, Song[]>();
  for (const song of songs) {
    const sz = song.file_size ?? 0;
    if (sz <= 0) continue;
    if (!sizeMap.has(sz)) sizeMap.set(sz, []);
    sizeMap.get(sz)!.push(song);
  }
  for (const [, list] of sizeMap) {
    if (list.length > 1) {
      const titles = new Set(list.map(s => normalizeTitle(s.title ?? "")));
      if (titles.size === 1 && list.length > 1) {
        const key = `size::${list[0].file_size}::${[...titles][0]}`;
        if (!result.some(g => g.key === key)) {
          result.push({ key, reason: "file_size", songs: list });
        }
      }
    }
  }

  return result.sort((a, b) => b.songs.length - a.songs.length);
}
