/**
 * scanner.ts — v5
 * Incremental scan, partial metadata read, exclude folders, import dropped paths.
 */

import { open }                    from "@tauri-apps/plugin-dialog";
import { readDir, readFile, stat } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import * as musicMetadata          from "music-metadata";
import { getDb, upsertSong, markSongDuplicate, type Song } from "./db";
import { META_READ_BYTES }         from "./coverArt";
import { pickLocalizedTag, type MetadataLangPriority } from "./metadataLang";
import { fetchCoverArtUrl } from "./albumArtFetch";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "mp4", "m4b", "alac", "wma", "opus", "ape"
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);

const MAX_COVER_ART_BYTES = 2 * 1024 * 1024;

export interface ScanProgress {
  total: number;
  current: number;
  currentFile: string;
  currentFolder: string;
  done: boolean;
  skipped?: number;
  failed?: number;
}

export interface ScanResult {
  songs: Song[];
  failedFiles: { path: string; error: string }[];
  skippedCount: number;
}

export interface ScanOptions {
  excludeFolders?: string[];
  excludeExtensions?: string[];
  duplicateHandling?: "skip" | "mark" | "allow";
  scanFollowSymlinks?: boolean;
  autoUnblockFiles?: boolean;
  metadataLangPriority?: MetadataLangPriority;
  fetchMissingCoverArt?: boolean;
}

/** Build scan options from persisted settings store. */
export function scanOptionsFromSettings(s: {
  excludeFolders?: string[];
  excludeExtensions?: string[];
  duplicateHandling?: ScanOptions["duplicateHandling"];
  scanFollowSymlinks?: boolean;
  autoUnblockFiles?: boolean;
  metadataLangPriority?: MetadataLangPriority;
}): ScanOptions {
  return {
    excludeFolders: s.excludeFolders,
    excludeExtensions: s.excludeExtensions,
    duplicateHandling: s.duplicateHandling,
    scanFollowSymlinks: s.scanFollowSymlinks,
    autoUnblockFiles: s.autoUnblockFiles,
    metadataLangPriority: s.metadataLangPriority,
    fetchMissingCoverArt: true,
  };
}

async function buildDuplicateKeyMap(db: Awaited<ReturnType<typeof getDb>>): Promise<Map<string, number>> {
  const rows = await db.select<{ title: string; artist: string; duration: number; id: number }[]>(
    `SELECT id, title, artist, duration FROM songs`,
  );
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = duplicateKey(r.title, r.artist, r.duration);
    if (!map.has(key)) map.set(key, r.id);
  }
  return map;
}

function duplicateKey(title: string, artist: string, duration: number): string {
  return `${(title ?? "").trim().toLowerCase()}|${(artist ?? "").trim().toLowerCase()}|${Math.round(duration ?? 0)}`;
}

function isExcludedExtension(filePath: string, excludeExtensions: string[]): boolean {
  if (excludeExtensions.length === 0) return false;
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  return excludeExtensions.some(e => e.replace(/^\./, "").toLowerCase() === ext);
}

async function ingestScannedSong(
  db: Awaited<ReturnType<typeof getDb>>,
  song: Omit<Song, "id" | "date_added">,
  dupKeys: Map<string, number> | null,
  dupMode: "skip" | "mark" | "allow",
): Promise<"ok" | "skip"> {
  const key = duplicateKey(song.title ?? "", song.artist ?? "", song.duration ?? 0);
  const isDup = dupKeys?.has(key) ?? false;
  if (isDup && dupMode === "skip") return "skip";

  const toSave = {
    ...song,
    is_duplicate: isDup && dupMode === "mark" ? 1 : (song.is_duplicate ?? 0),
  };
  await upsertSong(db, toSave);
  if (isDup && dupMode === "mark") {
    await markSongDuplicate(db, song.path);
  }
  if (dupKeys && dupMode !== "allow") dupKeys.set(key, -1);
  return "ok";
}

function sanitizeCoverArt(pic: { format: string; data: Uint8Array }): string | null {
  const mime = (pic.format ?? "").toLowerCase().trim();
  if (!ALLOWED_IMAGE_MIMES.has(mime)) return null;
  if (pic.data.byteLength > MAX_COVER_ART_BYTES) return null;
  if (!hasValidImageMagicBytes(pic.data, mime)) return null;
  try {
    return `data:${mime};base64,${uint8ToBase64(pic.data)}`;
  } catch {
    return null;
  }
}

function hasValidImageMagicBytes(data: Uint8Array, mime: string): boolean {
  if (data.length < 4) return false;
  const b = data;
  if (mime === "image/jpeg" || mime === "image/jpg") return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF;
  if (mime === "image/png")  return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47;
  if (mime === "image/gif")  return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (mime === "image/webp") {
    if (data.length < 12) return false;
    return b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
           b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50;
  }
  return false;
}

async function buildExistingPathMap(db: Awaited<ReturnType<typeof getDb>>): Promise<Map<string, number | null>> {
  const rows = await db.select<{ path: string; file_size: number | null }[]>(
    "SELECT path, file_size FROM songs"
  );
  const map = new Map<string, number | null>();
  for (const row of rows) {
    const norm = normalizePath(row.path);
    map.set(norm, row.file_size ?? null);
    map.set(norm.replace(/\//g, "\\"), row.file_size ?? null);
  }
  return map;
}

export async function scanFolder(
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  const selected = await open({ directory: true, multiple: false, title: "Select music folder" });
  if (!selected || typeof selected !== "string") return { songs: [], failedFiles: [], skippedCount: 0 };
  return _scanPaths([selected], onProgress, options);
}

export async function scanFolders(
  paths?: string[],
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  let targetPaths = paths;

  if (!targetPaths || targetPaths.length === 0) {
    const selected = await open({
      directory: true,
      multiple: true,
      title: "Pilih folder musik (bisa pilih beberapa)",
    });

    if (!selected) return { songs: [], failedFiles: [], skippedCount: 0 };
    targetPaths = Array.isArray(selected) ? selected : [selected];
  }

  if (targetPaths.length === 0) return { songs: [], failedFiles: [], skippedCount: 0 };
  return _scanPaths(targetPaths, onProgress, options);
}

/** Import file/folder paths from drag-and-drop (no dialog). */
export async function importPaths(
  paths: string[],
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  if (!paths.length) return { songs: [], failedFiles: [], skippedCount: 0 };

  const folderPaths: string[] = [];
  const filePaths: string[] = [];

  for (const raw of paths) {
    const p = normalizePath(raw);
    try {
      const info = await stat(p);
      if (info.isDirectory) {
        folderPaths.push(p);
      } else if (info.isFile) {
        const ext = p.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTENSIONS.has(ext)) filePaths.push(p);
      }
    } catch {
      const ext = p.split(".").pop()?.toLowerCase() ?? "";
      if (AUDIO_EXTENSIONS.has(ext)) filePaths.push(p);
    }
  }

  if (folderPaths.length > 0) {
    const folderResult = await _scanPaths(folderPaths, onProgress, options);
    if (filePaths.length === 0) return folderResult;
    const fileResult = await _importFileList(filePaths, onProgress, options);
    return {
      songs: [...folderResult.songs, ...fileResult.songs],
      failedFiles: [...folderResult.failedFiles, ...fileResult.failedFiles],
      skippedCount: folderResult.skippedCount + fileResult.skippedCount,
    };
  }

  return _importFileList(filePaths, onProgress, options);
}

async function _importFileList(
  filePaths: string[],
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  const db = await getDb();
  const existingPaths = await buildExistingPathMap(db);
  const exclude = normalizeExcludeFolders(options?.excludeFolders ?? []);
  const excludeExt = (options?.excludeExtensions ?? []).map(e => e.replace(/^\./, "").toLowerCase());
  const dupMode = options?.duplicateHandling ?? "allow";
  const dupKeys = dupMode !== "allow" ? await buildDuplicateKeyMap(db) : null;
  const results: Song[] = [];
  const failedFiles: { path: string; error: string }[] = [];
  let skippedCount = 0;
  let forbiddenCount = 0;

  for (let i = 0; i < filePaths.length; i++) {
    const filePath = normalizePath(filePaths[i]);
    if (isExcluded(filePath, exclude) || isExcludedExtension(filePath, excludeExt)) {
      skippedCount++;
      continue;
    }

    onProgress?.({
      total: filePaths.length,
      current: i + 1,
      currentFile: getLastPathPart(filePath),
      currentFolder: getParentFolderName(filePath),
      done: false,
      skipped: skippedCount,
      failed: failedFiles.length,
    });

    let currentFileSize: number | null = null;
    try {
      const fileStat = await stat(filePath);
      currentFileSize = fileStat.size ?? null;
    } catch { /* continue */ }

    const existingSize = existingPaths.get(filePath);
    if (existingSize !== undefined && currentFileSize !== null && existingSize === currentFileSize) {
      skippedCount++;
      continue;
    }

    try {
      if (options?.autoUnblockFiles) {
        try { await invoke("unblock_file", { path: filePath }); } catch { /* non-Windows */ }
      }
      const song = await parseFile(filePath, currentFileSize, options);
      const handled = await ingestScannedSong(db, song, dupKeys, dupMode);
      if (handled === "skip") { skippedCount++; continue; }
      results.push(song as Song);
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("forbidden path") || errMsg.includes("not allowed")) {
        forbiddenCount++;
      } else {
        failedFiles.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (forbiddenCount > 0) {
    console.error(`[Scanner] ${forbiddenCount} file(s) forbidden — check fs:scope.`);
  }

  onProgress?.({
    total: filePaths.length,
    current: filePaths.length,
    currentFile: "",
    currentFolder: "",
    done: true,
    skipped: skippedCount,
    failed: failedFiles.length,
  });

  return { songs: results, failedFiles, skippedCount };
}

async function _scanPaths(
  folderPaths: string[],
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<ScanResult> {
  const db            = await getDb();
  const existingPaths = await buildExistingPathMap(db);
  const exclude       = normalizeExcludeFolders(options?.excludeFolders ?? []);
  const excludeExt    = (options?.excludeExtensions ?? []).map(e => e.replace(/^\./, "").toLowerCase());
  const dupMode       = options?.duplicateHandling ?? "allow";
  const dupKeys       = dupMode !== "allow" ? await buildDuplicateKeyMap(db) : null;

  const allFiles: string[] = [];
  for (const folderPath of folderPaths) {
    const normalizedRoot = normalizePath(folderPath);
    onProgress?.({ total: 0, current: 0, currentFile: "", currentFolder: getLastPathPart(normalizedRoot), done: false });
    const files = await listAudioFiles(normalizedRoot, exclude, excludeExt, options?.scanFollowSymlinks);
    allFiles.push(...files);
  }

  if (allFiles.length === 0) {
    onProgress?.({ total: 0, current: 0, currentFile: "", currentFolder: "", done: true, skipped: 0, failed: 0 });
    return { songs: [], failedFiles: [], skippedCount: 0 };
  }

  const results: Song[] = [];
  const failedFiles: { path: string; error: string }[] = [];
  let skippedCount = 0;
  let forbiddenCount = 0;

  for (let i = 0; i < allFiles.length; i++) {
    const filePath  = allFiles[i];
    if (isExcludedExtension(filePath, excludeExt)) {
      skippedCount++;
      continue;
    }
    const fileName  = getLastPathPart(filePath);
    const parentFolder = getParentFolderName(filePath);

    onProgress?.({
      total: allFiles.length,
      current: i + 1,
      currentFile: fileName,
      currentFolder: parentFolder,
      done: false,
      skipped: skippedCount,
      failed: failedFiles.length,
    });

    let currentFileSize: number | null = null;
    try {
      const fileStat = await stat(filePath);
      currentFileSize = fileStat.size ?? null;
    } catch { /* continue */ }

    const existingSize = existingPaths.get(filePath);
    if (existingSize !== undefined && currentFileSize !== null && existingSize === currentFileSize) {
      skippedCount++;
      continue;
    }

    try {
      if (options?.autoUnblockFiles) {
        try { await invoke("unblock_file", { path: filePath }); } catch { /* non-Windows */ }
      }
      const song = await parseFile(filePath, currentFileSize, options);
      const handled = await ingestScannedSong(db, song, dupKeys, dupMode);
      if (handled === "skip") { skippedCount++; continue; }
      results.push(song as Song);
    } catch (err) {
      const errMsg = String(err);
      if (errMsg.includes("forbidden path") || errMsg.includes("not allowed")) {
        forbiddenCount++;
        if (forbiddenCount <= 3) console.warn(`[Scanner] Forbidden path: ${filePath}`);
      } else {
        failedFiles.push({
          path: filePath,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  if (forbiddenCount > 0) {
    console.error(`[Scanner] ${forbiddenCount} file(s) forbidden — check fs:scope.`);
  }

  onProgress?.({
    total: allFiles.length,
    current: allFiles.length,
    currentFile: "",
    currentFolder: "",
    done: true,
    skipped: skippedCount,
    failed: failedFiles.length,
  });

  return { songs: results, failedFiles, skippedCount };
}

function normalizePath(p: string): string { return p.replace(/\\/g, "/"); }

function normalizeExcludeFolders(folders: string[]): string[] {
  return folders.map(f => normalizePath(f).replace(/\/$/, "").toLowerCase());
}

function isExcluded(filePath: string, excludeFolders: string[]): boolean {
  if (excludeFolders.length === 0) return false;
  const norm = normalizePath(filePath).toLowerCase();
  return excludeFolders.some(ex => norm.startsWith(ex + "/") || norm === ex);
}

function getLastPathPart(path: string): string {
  return path.replace(/\\/g, "/").split("/").filter(Boolean).pop() ?? path;
}

function getParentFolderName(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length >= 2) return parts[parts.length - 2];
  return parts[0] ?? "";
}

async function listAudioFiles(
  dirPath: string,
  excludeFolders: string[],
  excludeExtensions: string[] = [],
  followSymlinks = false,
): Promise<string[]> {
  const entries = await readDir(dirPath);
  const files: string[] = [];

  async function walk(items: Awaited<ReturnType<typeof readDir>>, basePath: string) {
    if (isExcluded(basePath, excludeFolders)) return;

    for (const entry of items) {
      const fullPath = `${basePath.replace(/\\/g, "/")}/${entry.name}`;
      if (entry.isDirectory) {
        if (entry.name?.startsWith(".")) continue;
        if (isExcluded(fullPath, excludeFolders)) continue;
        try {
          const subEntries = await readDir(fullPath);
          await walk(subEntries, fullPath);
        } catch { /* skip unreadable folder */ }
      } else if ((entry as { isSymlink?: boolean }).isSymlink && followSymlinks) {
        try {
          const st = await stat(fullPath);
          if (st.isDirectory) {
            const subEntries = await readDir(fullPath);
            await walk(subEntries, fullPath);
          } else if (st.isFile && entry.name) {
            const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
            if (AUDIO_EXTENSIONS.has(ext) && !isExcludedExtension(fullPath, excludeExtensions)) {
              files.push(fullPath);
            }
          }
        } catch { /* broken symlink */ }
      } else if (entry.isFile && entry.name) {
        const ext = entry.name.split(".").pop()?.toLowerCase() ?? "";
        if (AUDIO_EXTENSIONS.has(ext) && !isExcludedExtension(fullPath, excludeExtensions)) files.push(fullPath);
      }
    }
  }

  await walk(entries, dirPath);
  return files;
}

async function readAudioHeader(filePath: string): Promise<Uint8Array> {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  const isMp4Family = ["m4a", "mp4", "m4b", "alac", "aac"].includes(ext);

  try {
    const st = await stat(filePath);
    const fileSize = st.size ?? 0;

    // MP4/M4A: moov atom is often at end — must read full file (head+tail concat is invalid MP4)
    const FULL_READ_LIMIT = 64 * 1024 * 1024;
    if (isMp4Family && fileSize > 0 && fileSize <= FULL_READ_LIMIT) {
      return await readFile(filePath);
    }

    if (isMp4Family && fileSize > FULL_READ_LIMIT) {
      // Very large: read last 16MB where moov atom usually lives
      const tail = await invoke<number[]>("read_file_suffix", { path: filePath, len: 16 * 1024 * 1024 });
      return new Uint8Array(tail);
    }

    if (fileSize > 0 && fileSize <= META_READ_BYTES) {
      return await readFile(filePath);
    }
  } catch { /* use prefix read */ }

  const bytes = await invoke<number[]>("read_file_prefix", { path: filePath, len: META_READ_BYTES });
  return new Uint8Array(bytes);
}

async function parseFile(
  filePath: string,
  fileSize?: number | null,
  options?: ScanOptions,
): Promise<Omit<Song, "id" | "date_added">> {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  const normalizedPath = normalizePath(filePath);
  const fileName = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";
  const displayFormat = ext === "mp4" || ext === "m4b" ? "M4A" : ext.toUpperCase();

  let bytes: Uint8Array;
  try {
    bytes = await readAudioHeader(normalizedPath);
  } catch (err) {
    throw new Error(`Cannot read file: ${err instanceof Error ? err.message : String(err)}`);
  }

  const resolvedFileSize = fileSize ?? bytes.byteLength;

  let meta: Awaited<ReturnType<typeof musicMetadata.parseBlob>>;
  try {
    const blob = new Blob([bytes]);
    meta = await musicMetadata.parseBlob(blob, { skipCovers: false } as any);
  } catch (firstErr) {
    // Retry: full read for MP4 family if first attempt used partial data
    const isMp4Family = ["m4a", "mp4", "m4b", "alac", "aac"].includes(ext);
    if (isMp4Family && resolvedFileSize <= 64 * 1024 * 1024) {
      try {
        const full = await readFile(normalizedPath);
        meta = await musicMetadata.parseBlob(new Blob([full]), { skipCovers: false } as any);
      } catch {
        throw firstErr;
      }
    } else {
      throw firstErr;
    }
  }

  const { common, format, native } = meta;

  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    coverArt = sanitizeCoverArt(common.picture[0]);
  }

  const langPriority = options?.metadataLangPriority ?? "auto";
  const titleFallback = common.title ?? fileName;
  const artistFallback = common.artist ?? common.albumartist ?? "Unknown Artist";
  const albumFallback = common.album ?? "Unknown Album";
  const title = pickLocalizedTag(native as Record<string, unknown>, "title", langPriority, titleFallback);
  const artist = pickLocalizedTag(native as Record<string, unknown>, "artist", langPriority, artistFallback);
  const album = pickLocalizedTag(native as Record<string, unknown>, "album", langPriority, albumFallback);

  if (!coverArt && options?.fetchMissingCoverArt !== false) {
    const url = await fetchCoverArtUrl({ title, artist, album });
    if (url) coverArt = url;
  }

  const codec = (format.codec ?? "").toLowerCase();
  const isAlac = codec.includes("alac") || codec.includes("apple lossless");
  const displayFormatResolved = isAlac ? "ALAC" : displayFormat;

  return {
    path:       normalizedPath,
    title,
    artist,
    album,
    genre:      common.genre?.[0] ?? "Unknown",
    year:       common.year ?? null,
    duration:   format.duration ?? 0,
    bitrate:    format.bitrate ? Math.round(format.bitrate / 1000) : 0,
    format:     displayFormatResolved,
    cover_art:  coverArt,
    bpm:        common.bpm ?? null,
    file_size:  resolvedFileSize,
    loved:      0,
    is_duplicate: 0,
    stars:      undefined,
    play_count: undefined,
    sample_rate: format.sampleRate ? Math.round(format.sampleRate) : null,
    bits_per_sample: format.bitsPerSample ?? null,
  } as Omit<Song, "id" | "date_added">;
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function addFiles(
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<Song[]> {
  const selected = await open({
    multiple: true,
    title: "Add music files",
    filters: [{ name: "Audio Files", extensions: [...AUDIO_EXTENSIONS] }],
  });

  if (!selected) return [];
  const files = (Array.isArray(selected) ? selected : [selected]).map(normalizePath);
  const result = await _importFileList(files, onProgress, options);
  return result.songs;
}

export async function addFilesFromPaths(
  paths: string[],
  onProgress?: (p: ScanProgress) => void,
  options?: ScanOptions
): Promise<Song[]> {
  const result = await importPaths(paths, onProgress, options);
  return result.songs;
}
