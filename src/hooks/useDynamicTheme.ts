/**
 * useDynamicTheme.ts — Apply accent from cover art when enabled
 */

import { useEffect } from "react";
import { useSettingsStore } from "../store";
import type { Song } from "../lib/db";
import { extractDominantColor, applyDynamicAccent, clearDynamicAccent } from "../lib/dynamicTheme";
import { applyAccentToDom } from "../components/Settings/SettingsPanel";

export function useDynamicTheme(currentSong: Song | null) {
  const dynamicThemeFromCover = useSettingsStore(s => s.dynamicThemeFromCover);
  const accentColor = useSettingsStore(s => s.accentColor);

  useEffect(() => {
    if (!dynamicThemeFromCover || !currentSong?.cover_art) {
      clearDynamicAccent();
      applyAccentToDom(accentColor);
      return;
    }

    let cancelled = false;
    extractDominantColor(currentSong.cover_art).then(color => {
      if (cancelled) return;
      if (color) {
        applyDynamicAccent(color);
        applyAccentToDom(color);
      } else {
        applyAccentToDom(accentColor);
      }
    });

    return () => {
      cancelled = true;
      clearDynamicAccent();
      applyAccentToDom(accentColor);
    };
  }, [dynamicThemeFromCover, currentSong?.id, currentSong?.cover_art, accentColor]);
}
