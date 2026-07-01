/**
 * backupRestore.ts — Backup & restore library DB + export history
 */

import { save, open } from "@tauri-apps/plugin-dialog";
import { copyFile, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getDbPath } from "./db";
import type { PlayRecord, Song } from "./db";

export async function backupLibraryDb(): Promise<boolean> {
  try {
    const dbPath = await getDbPath();
    const filePath = dbPath.replace(/^sqlite:/, "");
    const savePath = await save({
      title: "Backup Library Database",
      defaultPath: `sonarix-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
    });
    if (!savePath) return false;
    await copyFile(filePath, savePath);
    return true;
  } catch (err) {
    console.error("[backupRestore] backup failed:", err);
    return false;
  }
}

export async function restoreLibraryDb(): Promise<boolean> {
  try {
    const selected = await open({
      title: "Restore Library Database",
      filters: [{ name: "SQLite Database", extensions: ["db"] }],
      multiple: false,
    });
    if (!selected || typeof selected !== "string") return false;
    const dbPath = await getDbPath();
    const filePath = dbPath.replace(/^sqlite:/, "");
    await copyFile(selected, filePath);
    return true;
  } catch (err) {
    console.error("[backupRestore] restore failed:", err);
    return false;
  }
}

export async function exportListeningHistory(
  history: PlayRecord[],
  songs: Song[],
): Promise<boolean> {
  const savePath = await save({
    title: "Export Listening History",
    defaultPath: `sonarix-history-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: "JSON", extensions: ["json"] }],
  });
  if (!savePath) return false;

  const byId = new Map(songs.map(s => [s.id, s]));
  const rows = history.map(h => ({
    song_id: h.song_id,
    played_at: h.played_at,
    title: byId.get(h.song_id)?.title ?? "",
    artist: byId.get(h.song_id)?.artist ?? "",
  }));

  await writeTextFile(savePath, JSON.stringify(rows, null, 2));
  return true;
}

export async function exportListeningHistoryCsv(
  history: PlayRecord[],
  songs: Song[],
): Promise<boolean> {
  const savePath = await save({
    title: "Export Listening History (CSV)",
    defaultPath: `sonarix-history-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (!savePath) return false;

  const byId = new Map(songs.map(s => [s.id, s]));
  const lines = ["played_at,song_id,title,artist"];
  for (const h of history) {
    const s = byId.get(h.song_id);
    const title = (s?.title ?? "").replace(/"/g, '""');
    const artist = (s?.artist ?? "").replace(/"/g, '""');
    lines.push(`"${h.played_at}",${h.song_id},"${title}","${artist}"`);
  }
  await writeTextFile(savePath, lines.join("\n"));
  return true;
}
