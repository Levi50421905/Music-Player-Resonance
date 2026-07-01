/**
 * useSystemIntegration.ts — Tray close, autostart, OS global media shortcuts
 */

import { useEffect, useRef } from "react";
import { useSettingsStore } from "../store";

interface Handlers {
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const isTauri = () => !!(window as any).__TAURI_INTERNALS__;

export function useSystemIntegration(handlers: Handlers) {
  const closeToTray = useSettingsStore(s => s.closeToTray);
  const startWithWindows = useSettingsStore(s => s.startWithWindows);
  const globalMediaKeys = useSettingsStore(s => s.globalMediaKeys);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // Close → hide to tray
  useEffect(() => {
    if (!isTauri() || !closeToTray) return;
    let unlisten: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        unlisten = await getCurrentWindow().onCloseRequested(async (e) => {
          e.preventDefault();
          await getCurrentWindow().hide();
        });
      } catch { /* non-tauri */ }
    })();
    return () => { unlisten?.(); };
  }, [closeToTray]);

  // Start with Windows
  useEffect(() => {
    if (!isTauri()) return;
    (async () => {
      try {
        const { enable, disable } = await import("@tauri-apps/plugin-autostart");
        if (startWithWindows) await enable();
        else await disable();
      } catch (err) {
        console.warn("[SystemIntegration] autostart:", err);
      }
    })();
  }, [startWithWindows]);

  // Global media shortcuts (OS-level, complements Media Session API)
  useEffect(() => {
    if (!isTauri() || !globalMediaKeys) return;
    let cancelled = false;

    (async () => {
      try {
        const { register, unregisterAll } = await import("@tauri-apps/plugin-global-shortcut");
        await unregisterAll();

        const bind = async (shortcut: string, fn: () => void) => {
          try {
            await register(shortcut, (e) => {
              if (e.state === "Pressed") fn();
            });
          } catch { /* shortcut unavailable on this OS */ }
        };

        if (cancelled) return;
        await bind("MediaPlayPause", () => handlersRef.current.onPlayPause());
        await bind("MediaTrackNext", () => handlersRef.current.onNext());
        await bind("MediaTrackPrevious", () => handlersRef.current.onPrev());
      } catch (err) {
        console.warn("[SystemIntegration] global shortcuts:", err);
      }
    })();

    return () => {
      cancelled = true;
      import("@tauri-apps/plugin-global-shortcut")
        .then(m => m.unregisterAll())
        .catch(() => {});
    };
  }, [globalMediaKeys]);
}
