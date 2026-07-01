/**
 * useFolderWatch.ts — Auto folder watch / rescan hook
 */

import { useEffect, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore, useLibraryStore } from "../store";
import { getDb, getAllSongs } from "./db";
import { scanFolders, scanOptionsFromSettings } from "./scanner";
import { toastInfo, toastSuccess } from "../components/Notification/ToastSystem";
import * as musicMetadata from "music-metadata";
import { readFile, stat } from "@tauri-apps/plugin-fs";
import { upsertSong } from "./db";
import { META_READ_BYTES } from "./coverArt";

const AUDIO_EXTENSIONS = new Set([
  "mp3", "flac", "wav", "ogg", "aac", "m4a", "alac", "wma", "opus", "ape"
]);

const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif",
]);

const MAX_COVER_ART_BYTES = 2 * 1024 * 1024;

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function parseSingleFile(filePath: string) {
  const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
  const normalizedPath = filePath.replace(/\\/g, "/");
  let bytes: Uint8Array;
  try {
    const st = await stat(normalizedPath);
    if (st.size != null && st.size <= META_READ_BYTES) {
      bytes = await readFile(normalizedPath);
    } else {
      bytes = new Uint8Array(await invoke<number[]>("read_file_prefix", { path: normalizedPath, len: META_READ_BYTES }));
    }
  } catch {
    bytes = await readFile(normalizedPath);
  }
  const blob = new Blob([bytes]);

  const meta = await musicMetadata.parseBlob(blob, { skipCovers: false } as any);
  const { common, format } = meta;
  const fileName = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.[^.]+$/, "") ?? "Unknown";

  let coverArt: string | null = null;
  if (common.picture && common.picture.length > 0) {
    const pic = common.picture[0];
    const mime = (pic.format ?? "").toLowerCase().trim();
    if (ALLOWED_IMAGE_MIMES.has(mime) && pic.data.byteLength <= MAX_COVER_ART_BYTES) {
      try {
        coverArt = `data:${mime};base64,${uint8ToBase64(pic.data)}`;
      } catch { /* skip */ }
    }
  }

  let fileSize: number | null = null;
  try {
    const st = await stat(normalizedPath);
    fileSize = st.size ?? null;
  } catch { /* skip */ }

  return {
    path:       normalizedPath,
    title:      common.title ?? fileName,
    artist:     common.artist ?? common.albumartist ?? "Unknown Artist",
    album:      common.album ?? "Unknown Album",
    genre:      common.genre?.[0] ?? "Unknown",
    year:       common.year ?? null,
    duration:   format.duration ?? 0,
    bitrate:    format.bitrate ? Math.round(format.bitrate / 1000) : 0,
    format:     ext.toUpperCase(),
    cover_art:  coverArt,
    bpm:        common.bpm ?? null,
    file_size:  fileSize,
    loved:      0,
    stars:      undefined,
    play_count: undefined,
  };
}

export function useFolderWatch() {
  const { watchFolders, autoScanOnStart, excludeFolders } = useSettingsStore();
  const { setSongs } = useLibraryStore();

  const pendingFiles = useRef<string[]>([]);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isProcessing = useRef(false);
  const autoScanDone = useRef(false);

  const processQueue = useCallback(async () => {
    if (isProcessing.current || pendingFiles.current.length === 0) return;
    isProcessing.current = true;

    const toProcess = [...pendingFiles.current];
    pendingFiles.current = [];

    try {
      const db = await getDb();
      let added = 0;

      for (const filePath of toProcess) {
        try {
          const song = await parseSingleFile(filePath);
          await upsertSong(db, song);
          added++;
        } catch (err) {
          console.warn("[FolderWatch] Gagal parse:", filePath, err);
        }
      }

      if (added > 0) {
        const updated = await getAllSongs(db);
        setSongs(Array.isArray(updated) ? updated : []);
        toastSuccess(`${added} file baru ditambahkan otomatis`);
      }
    } finally {
      isProcessing.current = false;
      if (pendingFiles.current.length > 0) {
        debounceTimer.current = setTimeout(processQueue, 2000);
      }
    }
  }, [setSongs]);

  const handleFileAdded = useCallback((filePath: string) => {
    const ext = filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
    if (!AUDIO_EXTENSIONS.has(ext)) return;

    pendingFiles.current.push(filePath);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(processQueue, 2000);
  }, [processQueue]);

  useEffect(() => {
    if (!watchFolders || watchFolders.length === 0) return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    const startWatching = async () => {
      for (const folder of watchFolders) {
        try {
          await invoke("watch_folder", { path: folder });
        } catch (err) {
          console.warn("[FolderWatch] Gagal watch:", folder, err);
        }
      }
    };

    startWatching();

    let unlisten: (() => void) | null = null;
    listen<string>("fs:file-added", (event) => {
      handleFileAdded(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      for (const folder of watchFolders) {
        invoke("unwatch_folder", { path: folder }).catch(() => {});
      }
    };
  }, [watchFolders, handleFileAdded]);

  // Auto-scan watched folders on startup (incremental)
  useEffect(() => {
    if (!autoScanOnStart || autoScanDone.current) return;
    if (!watchFolders || watchFolders.length === 0) return;
    if (!(window as any).__TAURI_INTERNALS__) return;

    const timer = setTimeout(async () => {
      autoScanDone.current = true;
      toastInfo("Auto scan on startup…");
      try {
        await scanFolders(watchFolders, undefined, scanOptionsFromSettings(useSettingsStore.getState() as any));
        const db = await getDb();
        const updated = await getAllSongs(db);
        setSongs(Array.isArray(updated) ? updated : []);
      } catch (err) {
        console.warn("[FolderWatch] Auto scan failed:", err);
      }
    }, 5000);

    return () => clearTimeout(timer);
  }, [autoScanOnStart, watchFolders, excludeFolders, setSongs]);
}
