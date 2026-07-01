/**
 * useKeyboardShortcuts.ts — v3 (custom keybinds support)
 */

import { useEffect } from "react";
import { audioEngine } from "../../lib/audioEngine";
import { usePlayerStore, useSettingsStore } from "../../store";

interface Handlers {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onToggleMini: () => void;
  onToggleLyrics: () => void;
  onOpenSettings: () => void;
  onFocusSearch: () => void;
  onRating?: (songId: number, stars: number) => void;
  onToggleCheatsheet?: () => void;
  onOpenSleepTimer?: () => void;
  onOpenCommandPalette?: () => void;
  onToggleQueue?: () => void;
  onToggleFullscreen?: () => void;
}

function matchShortcut(e: KeyboardEvent, spec: string): boolean {
  const parts = spec.split("+").map(p => p.trim());
  const code = parts[parts.length - 1];
  if (e.code !== code) return false;
  const needShift = parts.includes("Shift");
  const needCtrl = parts.includes("Ctrl") || parts.includes("Meta");
  const needAlt = parts.includes("Alt");
  return e.shiftKey === needShift
    && (e.ctrlKey || e.metaKey) === needCtrl
    && e.altKey === needAlt;
}

export function useKeyboardShortcuts(handlers: Handlers) {
  const { setVolume, volume, currentSong } = usePlayerStore() as any;

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      const ctrl = e.ctrlKey || e.metaKey;
      const custom = useSettingsStore.getState().customKeybinds ?? {};

      if (custom.fullscreen && matchShortcut(e, custom.fullscreen)) {
        e.preventDefault();
        handlers.onToggleFullscreen?.();
        return;
      }
      if (custom.commandPalette && matchShortcut(e, custom.commandPalette)) {
        e.preventDefault();
        handlers.onOpenCommandPalette?.();
        return;
      }
      if (custom.toggleQueue && matchShortcut(e, custom.toggleQueue)) {
        e.preventDefault();
        handlers.onToggleQueue?.();
        return;
      }

      switch (e.code) {
        case "Space":
          e.preventDefault();
          handlers.onPlayPause();
          break;

        case "ArrowRight":
          e.preventDefault();
          if (e.shiftKey) handlers.onNext();
          else if (ctrl) audioEngine.seek(audioEngine.currentTime + 30);
          else audioEngine.seek(audioEngine.currentTime + 5);
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (e.shiftKey) handlers.onPrev();
          else if (ctrl) audioEngine.seek(Math.max(0, audioEngine.currentTime - 30));
          else audioEngine.seek(Math.max(0, audioEngine.currentTime - 5));
          break;

        case "ArrowUp":
          e.preventDefault();
          {
            const newVol = Math.min(100, volume + 5);
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        case "ArrowDown":
          e.preventDefault();
          {
            const newVol = Math.max(0, volume - 5);
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        case "KeyM":
          if (!ctrl) {
            const isMuted = volume === 0;
            const newVol = isMuted ? 80 : 0;
            setVolume?.(newVol);
            audioEngine.setVolume(newVol);
          }
          break;

        case "KeyR":
          if (!ctrl) {
            e.preventDefault();
            handlers.onCycleRepeat();
          }
          break;

        case "Digit0":
          if (ctrl) { e.preventDefault(); handlers.onToggleMini(); }
          break;

        case "KeyL":
          if (ctrl) { e.preventDefault(); handlers.onToggleLyrics(); }
          break;

        case "KeyS":
          if (ctrl && e.shiftKey) {
            e.preventDefault();
            handlers.onOpenSleepTimer?.();
            break;
          }
          if (!ctrl) {
            e.preventDefault();
            handlers.onToggleShuffle();
          }
          break;

        case "KeyK":
          if (ctrl) { e.preventDefault(); handlers.onOpenCommandPalette?.(); }
          break;

        case "KeyQ":
          if (ctrl) { e.preventDefault(); handlers.onToggleQueue?.(); }
          break;

        case "KeyP":
          if (e.shiftKey && !ctrl) {
            e.preventDefault();
            handlers.onToggleFullscreen?.();
          }
          break;

        case "Comma":
          if (ctrl) { e.preventDefault(); handlers.onOpenSettings(); }
          break;

        case "KeyF":
          if (!ctrl) { e.preventDefault(); handlers.onFocusSearch(); }
          break;

        case "Slash":
          if (e.shiftKey && !ctrl) {
            e.preventDefault();
            handlers.onToggleCheatsheet?.();
          }
          break;

        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
          if (!ctrl && currentSong) {
            const stars = parseInt(e.code.replace("Digit", ""));
            const newStars = currentSong.stars === stars ? 0 : stars;
            handlers.onRating?.(currentSong.id, newStars);
          }
          break;
      }
    };

    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [volume, currentSong, handlers]);
}
