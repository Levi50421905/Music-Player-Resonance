/**
 * db.ts — SQLite Database Layer
 */

import Database from "@tauri-apps/plugin-sql";
import { appLocalDataDir, resourceDir } from "@tauri-apps/api/path";
import { invoke } from "@tauri-apps/api/core";
import { mkdir, copyFile, stat } from "@tauri-apps/plugin-fs";
import { persistCoverArt, resolveCoverArtUrl } from "./coverArt";

let _db: Database | null = null;
let _dbPath: string | null = null;
let _legacyMigrated = false;

async function resolveDbPath(): Promise<string> {
  if (_dbPath) return _dbPath;
  const dataDir = await appLocalDataDir();
  try {
    await mkdir(dataDir, { recursive: true });
  } catch { /* already exists */ }
  const normalized = dataDir.replace(/\\/g, "/").replace(/\/$/, "");
  _dbPath = `sqlite:${normalized}/sonarix.db`;
  return _dbPath;
}

async function dbFilePath(): Promise<string> {
  const p = await resolveDbPath();
  return p.replace(/^sqlite:/, "");
}

async function fileSizeBytes(path: string): Promise<number> {
  try {
    const st = await stat(path.replace(/\\/g, "/"));
    return st.size ?? 0;
  } catch {
    return 0;
  }
}

/** Import sonarix.db lama dari lokasi CWD-relative ke appLocalDataDir. */
async function migrateLegacyDatabase(): Promise<void> {
  if (_legacyMigrated) return;
  _legacyMigrated = true;

  const target = await dbFilePath();
  const targetNorm = target.replace(/\\/g, "/");
  const targetSize = await fileSizeBytes(targetNorm);
  if (targetSize > 50_000) return;

  const candidates: string[] = [];
  try {
    const exe = (await invoke<string>("get_exe_dir")).replace(/\\/g, "/");
    candidates.push(`${exe}/sonarix.db`, `${exe}/../sonarix.db`);
  } catch { /* skip */ }
  try {
    const res = (await resourceDir()).replace(/\\/g, "/");
    candidates.push(`${res}/sonarix.db`, `${res}/../sonarix.db`);
  } catch { /* skip */ }

  let bestPath: string | null = null;
  let bestSize = 0;

  for (const path of candidates) {
    const norm = path.replace(/\\/g, "/");
    if (norm === targetNorm) continue;
    const size = await fileSizeBytes(norm);
    if (size > bestSize) {
      bestSize = size;
      bestPath = norm;
    }
  }

  if (bestPath && bestSize > 1024) {
    try {
      await copyFile(bestPath, targetNorm);
      console.info(`[DB] Migrated legacy database (${bestSize} bytes) from ${bestPath}`);
    } catch (err) {
      console.warn("[DB] Legacy migration failed:", err);
    }
  }
}

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  await migrateLegacyDatabase();
  const path = await resolveDbPath();
  _db = await Database.load(path);
  await migrate(_db);
  return _db;
}

export async function getDbPath(): Promise<string> {
  return resolveDbPath();
}

async function migrate(db: Database) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS songs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      path        TEXT    UNIQUE NOT NULL,
      title       TEXT,
      artist      TEXT,
      album       TEXT,
      genre       TEXT,
      year        INTEGER,
      duration    REAL,
      bitrate     INTEGER,
      format      TEXT,
      cover_art   TEXT,
      bpm         REAL,
      file_size   INTEGER,
      loved       INTEGER NOT NULL DEFAULT 0,
      date_added  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS ratings (
      song_id  INTEGER PRIMARY KEY,
      stars    INTEGER CHECK(stars BETWEEN 1 AND 5),
      FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS play_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      song_id    INTEGER NOT NULL,
      played_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id  INTEGER NOT NULL,
      song_id      INTEGER NOT NULL,
      position     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY(playlist_id, song_id),
      FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY(song_id)     REFERENCES songs(id)     ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      key    TEXT PRIMARY KEY,
      value  TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_play_history_song ON play_history(song_id);
    CREATE INDEX IF NOT EXISTS idx_songs_artist      ON songs(artist);
    CREATE INDEX IF NOT EXISTS idx_songs_album       ON songs(album);
  `);

  const migrations = [
    "ALTER TABLE songs ADD COLUMN file_size INTEGER",
    "ALTER TABLE songs ADD COLUMN loved INTEGER NOT NULL DEFAULT 0",
  ];
  for (const sql of migrations) {
    try { await db.execute(sql); } catch { /* column exists */ }
  }
}

export interface Song {
  id: number;
  path: string;
  title: string;
  artist: string;
  album: string;
  genre: string;
  year: number | null;
  duration: number;
  bitrate: number;
  format: string;
  cover_art: string | null;
  bpm: number | null;
  file_size: number | null;
  loved: number;
  date_added: string;
  stars?: number;
  play_count?: number;
  has_cover?: boolean;
}

export interface PlayRecord {
  song_id: number;
  played_at: string;
}

const SONG_LIST_SELECT = `
  SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year,
         s.duration, s.bitrate, s.format, s.bpm, s.file_size, s.loved, s.date_added,
         (s.cover_art IS NOT NULL AND s.cover_art != '') AS has_cover,
         r.stars,
         COALESCE(pc.play_count, 0) AS play_count
  FROM songs s
  LEFT JOIN ratings r ON r.song_id = s.id
  LEFT JOIN (
    SELECT song_id, COUNT(*) AS play_count FROM play_history GROUP BY song_id
  ) pc ON pc.song_id = s.id
`;

function mapSongRow(row: Song & { has_cover?: number | boolean }): Song {
  return {
    ...row,
    cover_art: null,
    has_cover: Boolean(row.has_cover),
  };
}

export async function upsertSong(db: Database, song: Omit<Song, "id" | "date_added">) {
  let coverRef = song.cover_art;
  if (coverRef?.startsWith("data:")) {
    const fileRef = await persistCoverArt(song.path, coverRef);
    if (fileRef) coverRef = fileRef;
  }

  await db.execute(
    `INSERT INTO songs (path, title, artist, album, genre, year, duration, bitrate, format, cover_art, bpm, file_size)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT(path) DO UPDATE SET
       title=excluded.title, artist=excluded.artist, album=excluded.album,
       genre=excluded.genre, year=excluded.year, duration=excluded.duration,
       bitrate=excluded.bitrate, format=excluded.format,
       cover_art=excluded.cover_art, bpm=excluded.bpm, file_size=excluded.file_size`,
    [song.path, song.title, song.artist, song.album, song.genre,
     song.year, song.duration, song.bitrate, song.format, coverRef,
     song.bpm, song.file_size ?? null]
  );
}

export async function getAllSongs(db: Database): Promise<Song[]> {
  const rows = await db.select<(Song & { has_cover?: number })[]>(
    `${SONG_LIST_SELECT} ORDER BY s.title`
  );
  return rows.map(mapSongRow);
}

export async function getSongCoverArt(db: Database, songId: number): Promise<string | null> {
  const rows = await db.select<{ cover_art: string | null }[]>(
    "SELECT cover_art FROM songs WHERE id = $1",
    [songId]
  );
  const stored = rows[0]?.cover_art;
  if (!stored) return null;
  return resolveCoverArtUrl(stored);
}

export async function deleteSong(db: Database, songId: number) {
  await db.execute(`DELETE FROM songs WHERE id = $1`, [songId]);
}

export async function deleteSongs(db: Database, songIds: number[]) {
  if (songIds.length === 0) return;
  const placeholders = songIds.map((_, i) => `$${i + 1}`).join(",");
  await db.execute(`DELETE FROM songs WHERE id IN (${placeholders})`, songIds);
}

export async function searchSongs(db: Database, query: string): Promise<Song[]> {
  const q = `%${query}%`;
  const rows = await db.select<(Song & { has_cover?: number })[]>(
    `${SONG_LIST_SELECT}
     WHERE s.title LIKE $1 OR s.artist LIKE $1 OR s.album LIKE $1
     ORDER BY s.title`,
    [q]
  );
  return rows.map(mapSongRow);
}

export async function setRating(db: Database, songId: number, stars: number) {
  if (stars === 0) {
    await db.execute(`DELETE FROM ratings WHERE song_id = $1`, [songId]);
  } else {
    await db.execute(
      `INSERT INTO ratings (song_id, stars) VALUES ($1,$2)
       ON CONFLICT(song_id) DO UPDATE SET stars=excluded.stars`,
      [songId, stars]
    );
  }
}

export async function toggleLoved(db: Database, songId: number): Promise<number> {
  const rows = await db.select<{ loved: number }[]>(
    "SELECT loved FROM songs WHERE id = $1", [songId]
  );
  const current = rows[0]?.loved ?? 0;
  const next = current === 1 ? 0 : 1;
  await db.execute("UPDATE songs SET loved = $1 WHERE id = $2", [next, songId]);
  return next;
}

export async function getLovedSongs(db: Database): Promise<Song[]> {
  const rows = await db.select<(Song & { has_cover?: number })[]>(
    `${SONG_LIST_SELECT} WHERE s.loved = 1 ORDER BY s.title`
  );
  return rows.map(mapSongRow);
}

export async function recordPlay(db: Database, songId: number) {
  await db.execute(`INSERT INTO play_history (song_id) VALUES ($1)`, [songId]);
}

export async function getPlayHistory(db: Database, limit = 200) {
  return await db.select<PlayRecord[]>(
    `SELECT song_id, played_at FROM play_history ORDER BY played_at DESC LIMIT $1`,
    [limit]
  );
}

export async function createPlaylist(db: Database, name: string): Promise<number> {
  const result = await db.execute(`INSERT INTO playlists (name) VALUES ($1)`, [name]);
  return result.lastInsertId as number;
}

export async function deletePlaylist(db: Database, playlistId: number) {
  await db.execute(`DELETE FROM playlists WHERE id = $1`, [playlistId]);
}

export async function getPlaylists(db: Database) {
  return await db.select<{ id: number; name: string; count: number; created_at: string }[]>(`
    SELECT p.*, COUNT(ps.song_id) AS count
    FROM playlists p
    LEFT JOIN playlist_songs ps ON ps.playlist_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC
  `);
}

export async function addToPlaylist(db: Database, playlistId: number, songId: number) {
  const rows = await db.select<{ max_pos: number }[]>(
    `SELECT COALESCE(MAX(position),0) AS max_pos FROM playlist_songs WHERE playlist_id=$1`,
    [playlistId]
  );
  const pos = (rows[0]?.max_pos ?? 0) + 1;
  await db.execute(
    `INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, position) VALUES ($1,$2,$3)`,
    [playlistId, songId, pos]
  );
}

export async function removeFromPlaylist(db: Database, playlistId: number, songId: number) {
  await db.execute(
    `DELETE FROM playlist_songs WHERE playlist_id = $1 AND song_id = $2`,
    [playlistId, songId]
  );
}

export async function getPlaylistSongs(db: Database, playlistId: number): Promise<Song[]> {
  const rows = await db.select<(Song & { has_cover?: number })[]>(`
    SELECT s.id, s.path, s.title, s.artist, s.album, s.genre, s.year,
           s.duration, s.bitrate, s.format, s.bpm, s.file_size, s.loved, s.date_added,
           (s.cover_art IS NOT NULL AND s.cover_art != '') AS has_cover,
           r.stars,
           COALESCE(pc.play_count, 0) AS play_count
    FROM playlist_songs ps
    JOIN songs s ON s.id = ps.song_id
    LEFT JOIN ratings r ON r.song_id = s.id
    LEFT JOIN (
      SELECT song_id, COUNT(*) AS play_count FROM play_history GROUP BY song_id
    ) pc ON pc.song_id = s.id
    WHERE ps.playlist_id = $1
    ORDER BY ps.position
  `, [playlistId]);
  return rows.map(mapSongRow);
}

export async function reorderPlaylistSongs(
  db: Database,
  playlistId: number,
  songIds: number[]
): Promise<void> {
  for (let i = 0; i < songIds.length; i++) {
    await db.execute(
      `UPDATE playlist_songs SET position = $1
       WHERE playlist_id = $2 AND song_id = $3`,
      [i + 1, playlistId, songIds[i]]
    );
  }
}

export async function getSetting(db: Database, key: string): Promise<string | null> {
  const rows = await db.select<{ value: string }[]>(
    `SELECT value FROM settings WHERE key=$1`, [key]
  );
  return rows[0]?.value ?? null;
}

export async function setSetting(db: Database, key: string, value: string) {
  await db.execute(
    `INSERT INTO settings (key,value) VALUES ($1,$2)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    [key, value]
  );
}

/** Migrasi cover art base64 lama ke file (background, batch). */
export async function migrateBase64CoversBatch(db: Database, limit = 50): Promise<number> {
  const rows = await db.select<{ id: number; path: string; cover_art: string }[]>(
    `SELECT id, path, cover_art FROM songs
     WHERE cover_art LIKE 'data:%' LIMIT $1`,
    [limit]
  );
  let migrated = 0;
  for (const row of rows) {
    const fileRef = await persistCoverArt(row.path, row.cover_art);
    if (fileRef) {
      await db.execute("UPDATE songs SET cover_art = $1 WHERE id = $2", [fileRef, row.id]);
      migrated++;
    }
  }
  return migrated;
}
