/**
 * bookmarks.ts — Song position bookmarks (SQLite + in-memory cache)
 */

import { getDb } from "./db";

const LS_KEY = "sonarix-bookmarks";

export interface SongBookmark {
  songId: number;
  time: number;
  label: string;
  createdAt: string;
}

let cache: SongBookmark[] = [];
let hydrated = false;

async function persistBookmark(bm: SongBookmark): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO song_bookmarks (song_id, time, label, created_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT(song_id, time) DO UPDATE SET label = excluded.label`,
    [bm.songId, bm.time, bm.label, bm.createdAt],
  );
}

async function deleteBookmarkDb(songId: number, time: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `DELETE FROM song_bookmarks WHERE song_id = $1 AND time = $2`,
    [songId, time],
  );
}

/** Load bookmarks from DB and migrate legacy localStorage once. */
export async function hydrateBookmarks(): Promise<void> {
  if (hydrated) return;
  try {
    const db = await getDb();
    const rows = await db.select<{ song_id: number; time: number; label: string; created_at: string }[]>(
      `SELECT song_id, time, label, created_at FROM song_bookmarks ORDER BY created_at DESC LIMIT 500`,
    );
    cache = rows.map(r => ({
      songId: r.song_id,
      time: r.time,
      label: r.label,
      createdAt: r.created_at,
    }));

    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const legacy: SongBookmark[] = JSON.parse(raw);
        for (const bm of legacy) {
          if (!cache.some(b => b.songId === bm.songId && b.time === bm.time)) {
            cache.push(bm);
            await persistBookmark(bm);
          }
        }
        localStorage.removeItem(LS_KEY);
      }
    } catch { /* ignore */ }

    if (cache.length > 500) cache = cache.slice(-500);
    hydrated = true;
  } catch {
    try {
      const raw = localStorage.getItem(LS_KEY);
      cache = raw ? JSON.parse(raw) : [];
    } catch {
      cache = [];
    }
    hydrated = true;
  }
}

export function getBookmarks(): SongBookmark[] {
  return cache;
}

export function getBookmarksForSong(songId: number): SongBookmark[] {
  return cache.filter(b => b.songId === songId);
}

export async function addBookmark(songId: number, time: number, label?: string): Promise<SongBookmark> {
  const bm: SongBookmark = {
    songId,
    time: Math.floor(time),
    label: label ?? `Bookmark ${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`,
    createdAt: new Date().toISOString(),
  };
  cache = [...cache.filter(b => !(b.songId === songId && b.time === bm.time)), bm].slice(-500);
  try {
    await persistBookmark(bm);
  } catch { /* cache still valid */ }
  return bm;
}

export async function removeBookmark(songId: number, time: number): Promise<void> {
  cache = cache.filter(b => !(b.songId === songId && b.time === time));
  try {
    await deleteBookmarkDb(songId, time);
  } catch { /* ignore */ }
}
