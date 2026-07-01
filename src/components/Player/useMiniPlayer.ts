/**
 * useMiniPlayer.ts — Mini player window management (fixed)
 *
 * Bug fix: WebviewWindow constructor throws "window not found" when called
 * outside Tauri (e.g. in a browser dev environment, or before Tauri IPC is
 * fully initialised).  Every Tauri API call is now guarded.
 *
 * Also fixed: closeMini() was calling miniWinRef.current?.close() which can
 * throw if the window was already destroyed — now wrapped in try/catch.
 */

import { useEffect, useRef, useCallback } from "react";
import { emit, listen }                   from "@tauri-apps/api/event";
import { usePlayerStore }                 from "../../store";
import { useSettingsStore }             from "../../store";
import { getLyricLineAt }                 from "../../lib/lyricCache";
import { ensureLyricsLoaded }             from "../../lib/lyricLoader";

const LS_MINI_POS = "sonarix-mini-position";

async function restoreMiniPosition(win: any): Promise<void> {
  try {
    const raw = localStorage.getItem(LS_MINI_POS);
    if (!raw) return;
    const { x, y } = JSON.parse(raw);
    const { PhysicalPosition } = await import("@tauri-apps/api/dpi");
    await win.setPosition(new PhysicalPosition(x, y));
  } catch { /* ignore */ }
}

async function saveMiniPosition(win: any): Promise<void> {
  try {
    const pos = await win.outerPosition();
    localStorage.setItem(LS_MINI_POS, JSON.stringify({ x: pos.x, y: pos.y }));
  } catch { /* ignore */ }
}

const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

// ─── useMiniPlayer ────────────────────────────────────────────────────────────
export function useMiniPlayer() {
  // Store the window instance — typed as `any` so we don't import
  // WebviewWindow at module load time (which crashes outside Tauri).
  const miniWinRef = useRef<any>(null);
  const { currentSong, isPlaying, progress, duration, volume, currentTime } = usePlayerStore();
  const { lyricsOffsetMs, lyricsOfflineCache } = useSettingsStore() as {
    lyricsOffsetMs?: number;
    lyricsOfflineCache?: boolean;
  };

  useEffect(() => {
    if (!currentSong?.path) return;
    ensureLyricsLoaded(currentSong.path, lyricsOfflineCache !== false).catch(() => {});
  }, [currentSong?.path, lyricsOfflineCache]);

  const lyricLine = currentSong?.path
    ? getLyricLineAt(currentSong.path, currentTime ?? 0, lyricsOffsetMs ?? 0)
    : "";

  // Sync player state → mini window on every change
  useEffect(() => {
    if (!miniWinRef.current || !isTauri()) return;
    emit("mini:state", {
      title:    currentSong?.title    ?? "No track",
      artist:   currentSong?.artist   ?? "",
      songId:   currentSong?.id       ?? 0,
      coverArt: currentSong?.cover_art ?? null,
      isPlaying,
      progress,
      duration,
      volume,
      lyricLine,
    }).catch(() => {});
  }, [currentSong, isPlaying, progress, duration, volume, currentTime, lyricLine]);

  // Open mini window
  const openMini = useCallback(async () => {
    if (!isTauri()) {
      console.warn("[MiniPlayer] Not running inside Tauri — mini player unavailable.");
      return;
    }

    // If already open, just focus it
    if (miniWinRef.current) {
      try { await miniWinRef.current.setFocus(); } catch { /* already closed */ }
      return;
    }

    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

      // Reuse existing window if label already registered (e.g. after app restart)
      const existing = await WebviewWindow.getByLabel("mini");
      if (existing) {
        miniWinRef.current = existing;
        try { await existing.setFocus(); } catch { /* ignore */ }
        await restoreMiniPosition(existing);
        emit("mini:state", {
          title:    currentSong?.title    ?? "No track",
          artist:   currentSong?.artist   ?? "",
          songId:   currentSong?.id       ?? 0,
          coverArt: currentSong?.cover_art ?? null,
          isPlaying, progress, duration, volume,
          lyricLine: currentSong?.path ? getLyricLineAt(currentSong.path, currentTime ?? 0, lyricsOffsetMs ?? 0) : "",
        }).catch(() => {});
        return;
      }

      const win = new WebviewWindow("mini", {
        url:         "/#/mini",
        title:       "Sonarix Mini",
        width:       340,
        height:      68,
        minWidth:    280,
        minHeight:   60,
        maxHeight:   96,
        resizable:   true,
        decorations: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        transparent: true,
      });

      miniWinRef.current = win;

      win.once("tauri://created", async () => {
        await restoreMiniPosition(win);
        emit("mini:state", {
          title:    currentSong?.title    ?? "No track",
          artist:   currentSong?.artist   ?? "",
          songId:   currentSong?.id       ?? 0,
          coverArt: currentSong?.cover_art ?? null,
          isPlaying, progress, duration, volume,
          lyricLine: currentSong?.path ? getLyricLineAt(currentSong.path, currentTime ?? 0, lyricsOffsetMs ?? 0) : "",
        }).catch(() => {});
      });

      win.once("tauri://destroyed", () => {
        saveMiniPosition(win).catch(() => {});
        miniWinRef.current = null;
      });

      // Also handle creation errors (e.g. label already in use)
      win.once("tauri://error", (e: any) => {
        console.warn("[MiniPlayer] Window creation error:", e);
        miniWinRef.current = null;
      });
    } catch (err) {
      console.warn("[MiniPlayer] Failed to open mini window:", err);
      miniWinRef.current = null;
    }
  }, [currentSong, isPlaying, progress, duration, volume]);

  // Close mini window
  const closeMini = useCallback(async () => {
    if (!miniWinRef.current) return;
    try { await saveMiniPosition(miniWinRef.current); } catch { /* ignore */ }
    try { await miniWinRef.current.close(); } catch { /* already gone */ }
    miniWinRef.current = null;
  }, []);

  const isMiniOpen = () => miniWinRef.current !== null;

  return { openMini, closeMini, isMiniOpen };
}

// ─── useMiniPlayerCommands ────────────────────────────────────────────────────
export function useMiniPlayerCommands(handlers: {
  onPlayPause: () => void;
  onNext:      () => void;
  onPrev:      () => void;
}) {
  useEffect(() => {
    if (!isTauri()) return;

    const unlisteners: (() => void)[] = [];

    (async () => {
      try {
        unlisteners.push(await listen("mini:playpause", handlers.onPlayPause));
        unlisteners.push(await listen("mini:next",      handlers.onNext));
        unlisteners.push(await listen("mini:prev",      handlers.onPrev));

        unlisteners.push(await listen("mini:close", async () => {
          try {
            const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
            const win = await WebviewWindow.getByLabel("mini");
            await win?.close();
          } catch { /* window already gone */ }
        }));

        // mini:request-state is handled by the sync useEffect above
        unlisteners.push(await listen("mini:request-state", () => {}));
      } catch (err) {
        console.warn("[MiniPlayerCommands] listen error:", err);
      }
    })();

    return () => unlisteners.forEach(fn => fn());
  }, [handlers.onPlayPause, handlers.onNext, handlers.onPrev]);
}