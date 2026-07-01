/**
 * usePlaybackPersist.ts — Save & restore playback position + session on restart.
 */

import { useEffect, useRef } from "react";
import { audioEngine } from "../lib/audioEngine";
import { usePlayerStore, useSettingsStore } from "../store";
import type { Song } from "../lib/db";

const LS_KEY       = "sonarix-playback-position";
const SAVE_EVERY   = 5_000;
const MIN_TIME     = 3;
const MAX_AGE_DAYS = 7;

interface SavedPosition {
  songId:   number;
  songPath: string;
  time:     number;
  savedAt:  number;
}

let pendingSeek: SavedPosition | null = null;

export function savePlaybackPosition(song: Song, time: number): void {
  if (!song || time < MIN_TIME) return;
  try {
    const data: SavedPosition = {
      songId:   song.id,
      songPath: song.path,
      time:     Math.floor(time),
      savedAt:  Date.now(),
    };
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch { /* quota */ }
}

function loadPlaybackPosition(): SavedPosition | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedPosition;
    const maxAge = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (Date.now() - data.savedAt > maxAge) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function clearSavedPlayback(): void {
  try { localStorage.removeItem(LS_KEY); } catch {}
  pendingSeek = null;
}

function saveNowFromEngine(): void {
  const { currentSong } = usePlayerStore.getState();
  const t = audioEngine.currentTime;
  if (currentSong && t >= MIN_TIME) savePlaybackPosition(currentSong, t);
}

function seekWhenReady(targetSec: number, maxAttempts = 20): Promise<void> {
  return new Promise((resolve) => {
    if (targetSec <= 0) { resolve(); return; }

    const trySeek = () => {
      if (audioEngine.duration > 0) {
        audioEngine.seek(Math.min(targetSec, audioEngine.duration - 1));
        resolve();
        return true;
      }
      return false;
    };

    if (trySeek()) return;

    let attempts = 0;
    const id = setInterval(() => {
      attempts++;
      if (trySeek() || attempts >= maxAttempts) {
        clearInterval(id);
        if (attempts >= maxAttempts) resolve();
      }
    }, 300);
  });
}

/** Called from playSong when user manually plays — fallback if session restore missed seek. */
export function consumePlaybackSeek(song: Song): number | null {
  if (!pendingSeek) return null;
  if (pendingSeek.songId !== song.id) return null;
  const t = pendingSeek.time;
  pendingSeek = null;
  return t;
}

export function applyPendingSeek(song: Song): void {
  const target = consumePlaybackSeek(song);
  if (target && target > 0) {
    setTimeout(() => { seekWhenReady(target); }, 400);
  }
}

/** Load last song paused at saved position (called once after library + hydration). */
export async function restorePlaybackSession(
  setCurrentTime: (t: number) => void,
  setDuration: (d: number) => void,
  setProgress: (p: number) => void,
): Promise<void> {
  const { currentSong, setIsPlaying } = usePlayerStore.getState();
  if (!currentSong?.path) return;

  const saved = loadPlaybackPosition();
  const seekTo =
    saved && saved.songId === currentSong.id ? saved.time :
    saved && saved.songPath === currentSong.path ? saved.time : 0;

  if (saved && saved.songId !== currentSong.id && saved.songPath !== currentSong.path) {
    clearSavedPlayback();
  }

  try {
    const ok = await audioEngine.prepare(currentSong.path);
    if (!ok) return;

    const { resumeBehavior } = useSettingsStore.getState() as { resumeBehavior?: "auto_play" | "paused" };
    setIsPlaying(resumeBehavior === "auto_play");

    if (seekTo >= MIN_TIME) {
      await seekWhenReady(seekTo);
      const t = audioEngine.currentTime;
      const d = audioEngine.duration;
      setCurrentTime(t);
      if (d > 0) {
        setDuration(d);
        setProgress((t / d) * 100);
      }
      pendingSeek = null;
      if (resumeBehavior === "auto_play") {
        audioEngine.resume();
      }
    } else {
      const d = audioEngine.duration;
      if (d > 0) {
        setDuration(d);
        setCurrentTime(0);
        setProgress(0);
      }
    }
  } catch (err) {
    console.warn("[PlaybackPersist] Session restore failed:", err);
  }
}

interface Props {
  isLibraryReady: boolean;
}

export function usePlaybackPersist({ isLibraryReady }: Props) {
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRestored = useRef(false);

  useEffect(() => {
    timerRef.current = setInterval(saveNowFromEngine, SAVE_EVERY);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    const onUnload = () => {
      saveNowFromEngine();
      usePlayerStore.getState()._rebuildUnified();
    };
    const onHide = () => {
      if (document.hidden) {
        saveNowFromEngine();
        usePlayerStore.getState()._rebuildUnified();
      }
    };

    window.addEventListener("pagehide", onUnload);
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("visibilitychange", onHide);

    let unlistenClose: (() => void) | undefined;
    (async () => {
      if (!(window as any).__TAURI_INTERNALS__) return;
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlistenClose = await getCurrentWindow().onCloseRequested(() => {
          saveNowFromEngine();
          usePlayerStore.getState()._rebuildUnified();
        });
      } catch { /* non-tauri */ }
    })();

    return () => {
      window.removeEventListener("pagehide", onUnload);
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("visibilitychange", onHide);
      unlistenClose?.();
    };
  }, []);

  // Stash pending seek for playSong fallback
  useEffect(() => {
    if (!isLibraryReady || sessionRestored.current) return;
    const saved = loadPlaybackPosition();
    if (!saved) return;
    const { currentSong } = usePlayerStore.getState();
    if (currentSong && (currentSong.id === saved.songId || currentSong.path === saved.songPath)) {
      pendingSeek = saved;
    }
  }, [isLibraryReady]);

  return { persistNow: savePlaybackPosition, clearSaved: clearSavedPlayback };
}
