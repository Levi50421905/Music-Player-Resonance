/**
 * coverArt.ts — Simpan cover art sebagai file di disk, bukan base64 di SQLite.
 */

import { appLocalDataDir } from "@tauri-apps/api/path";
import { mkdir, writeFile, readFile, exists } from "@tauri-apps/plugin-fs";

const COVER_PREFIX = "file:";
const META_READ_BYTES = 512 * 1024;

let _coversDir: string | null = null;

async function getCoversDir(): Promise<string> {
  if (_coversDir) return _coversDir;
  const dataDir = await appLocalDataDir();
  const dir = `${dataDir.replace(/\\/g, "/")}/covers`;
  try {
    await mkdir(dir, { recursive: true });
  } catch { /* already exists */ }
  _coversDir = dir;
  return dir;
}

function hashPath(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = ((h << 5) - h + path.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

function extFromMime(mime: string): string {
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("gif")) return "gif";
  return "jpg";
}

/** Simpan cover art ke disk; kembalikan referensi untuk kolom DB. */
export async function persistCoverArt(
  songPath: string,
  dataUrl: string
): Promise<string | null> {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  const b64 = match[2];
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const dir = await getCoversDir();
    const fileName = `${hashPath(songPath)}.${extFromMime(mime)}`;
    const fullPath = `${dir}/${fileName}`;
    await writeFile(fullPath, bytes);
    return `${COVER_PREFIX}${fullPath}`;
  } catch {
    return null;
  }
}

/** Resolve referensi cover art ke URL yang bisa dipakai <img src>. */
export async function resolveCoverArtUrl(stored: string | null | undefined): Promise<string | null> {
  if (!stored) return null;
  if (stored.startsWith("data:")) return stored;
  if (stored.startsWith(COVER_PREFIX)) {
    const path = stored.slice(COVER_PREFIX.length);
    try {
      if (!(await exists(path))) return null;
      const bytes = await readFile(path);
      const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
      const mime =
        ext === "png" ? "image/png" :
        ext === "webp" ? "image/webp" :
        ext === "gif" ? "image/gif" :
        "image/jpeg";
      let binary = "";
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return `data:${mime};base64,${btoa(binary)}`;
    } catch {
      return null;
    }
  }
  return stored;
}

export { META_READ_BYTES };
