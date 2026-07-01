/**
 * useMediaKeys.ts — Media Session API for global media keys (when enabled)
 */

import { useEffect } from "react";
import type { Song } from "../lib/db";
import { useSettingsStore } from "../store";

interface Handlers {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

export function useMediaKeys(
  currentSong: Song | null,
  isPlaying: boolean,
  handlers: Handlers,
) {
  const globalMediaKeys = useSettingsStore(s => s.globalMediaKeys);

  useEffect(() => {
    if (!globalMediaKeys || !("mediaSession" in navigator)) return;

    const ms = navigator.mediaSession;

    ms.setActionHandler("play", () => { if (!isPlaying) handlers.onPlayPause(); });
    ms.setActionHandler("pause", () => { if (isPlaying) handlers.onPlayPause(); });
    ms.setActionHandler("previoustrack", handlers.onPrev);
    ms.setActionHandler("nexttrack", handlers.onNext);

    return () => {
      ms.setActionHandler("play", null);
      ms.setActionHandler("pause", null);
      ms.setActionHandler("previoustrack", null);
      ms.setActionHandler("nexttrack", null);
    };
  }, [globalMediaKeys, isPlaying, handlers]);

  useEffect(() => {
    if (!globalMediaKeys || !("mediaSession" in navigator) || !currentSong) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title ?? "Unknown",
      artist: currentSong.artist ?? "",
      album: currentSong.album ?? "",
    });
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [globalMediaKeys, currentSong, isPlaying]);
}
