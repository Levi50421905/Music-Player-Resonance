/**
 * SleepTimer.tsx — v6 (Visibility + Persistence Fix)
 *
 * PERUBAHAN vs v5:
 *   [FIX] Dropdown pakai portal + tidak lagi opacity:0 (panel tidak terlihat)
 *   [FIX] Timer disimpan ke localStorage — tetap aktif setelah restart app
 *   [FIX] Banner indikator aktif di player bar
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { audioEngine } from "../../lib/audioEngine";
import { usePlayerStore } from "../../store";
import { toastInfo } from "../Notification/ToastSystem";

const PRESETS = [5, 10, 15, 30, 45, 60, 90] as const;
const FADE_SECONDS = 30;
const LS_KEY = "sonarix-sleep-timer";

export interface SleepTimerState {
  endsAt: number | null;
  remaining: number;
  fading: boolean;
  pauseAfterSong: boolean;
}

interface PersistedTimer {
  endsAt: number;
  originalVolume: number;
}

function loadPersistedTimer(): PersistedTimer | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedTimer;
    if (!data.endsAt || data.endsAt <= Date.now()) {
      localStorage.removeItem(LS_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function savePersistedTimer(data: PersistedTimer | null): void {
  try {
    if (data) localStorage.setItem(LS_KEY, JSON.stringify(data));
    else localStorage.removeItem(LS_KEY);
  } catch { /* quota */ }
}

// ── useSleepTimer hook ────────────────────────────────────────────────────────
export function useSleepTimer() {
  const [timer, setTimer] = useState<SleepTimerState>({
    endsAt: null, remaining: 0, fading: false, pauseAfterSong: false,
  });

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const originalVolume = useRef<number>(80);
  const pauseAfterRef  = useRef(false);
  const { volume }     = usePlayerStore();

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const restoreVolume = useCallback(() => {
    audioEngine.setVolume(originalVolume.current);
    usePlayerStore.getState().setVolume(originalVolume.current);
  }, []);

  const clear = useCallback(() => {
    stopInterval();
    if (timer.fading) restoreVolume();
    savePersistedTimer(null);
    setTimer({ endsAt: null, remaining: 0, fading: false, pauseAfterSong: false });
    pauseAfterRef.current = false;
  }, [timer.fading, stopInterval, restoreVolume]);

  const startInterval = useCallback((endsAt: number) => {
    stopInterval();
    intervalRef.current = setInterval(() => {
      setTimer(prev => {
        if (!prev.endsAt) return prev;
        const remaining = Math.max(0, Math.round((prev.endsAt - Date.now()) / 1000));
        if (remaining <= 0) {
          audioEngine.pause();
          usePlayerStore.getState().setIsPlaying(false);
          restoreVolume();
          savePersistedTimer(null);
          stopInterval();
          toastInfo("Sleep timer: music paused");
          return { endsAt: null, remaining: 0, fading: false, pauseAfterSong: false };
        }
        if (remaining <= FADE_SECONDS) {
          const fadePct = remaining / FADE_SECONDS;
          audioEngine.setVolume(Math.max(0, Math.round(originalVolume.current * fadePct)));
          return { ...prev, remaining, fading: true };
        }
        return { ...prev, remaining };
      });
    }, 1000);
  }, [stopInterval, restoreVolume]);

  const start = useCallback((minutes: number) => {
    stopInterval();
    originalVolume.current = volume;
    const endsAt = Date.now() + minutes * 60_000;
    savePersistedTimer({ endsAt, originalVolume: volume });
    setTimer({ endsAt, remaining: minutes * 60, fading: false, pauseAfterSong: false });
    pauseAfterRef.current = false;
    toastInfo(`Sleep timer: pauses in ${minutes} min`);
    startInterval(endsAt);
  }, [volume, stopInterval, startInterval]);

  const startPauseAfterSong = useCallback(() => {
    savePersistedTimer(null);
    setTimer(prev => ({ ...prev, pauseAfterSong: true, endsAt: null, remaining: 0, fading: false }));
    pauseAfterRef.current = true;
    toastInfo("Music will pause after this song");
  }, []);

  const shouldPauseAfterSong = useCallback(() => {
    if (pauseAfterRef.current) {
      pauseAfterRef.current = false;
      setTimer({ endsAt: null, remaining: 0, fading: false, pauseAfterSong: false });
      return true;
    }
    return false;
  }, []);

  // Restore persisted timer on mount
  useEffect(() => {
    const saved = loadPersistedTimer();
    if (!saved) return;
    originalVolume.current = saved.originalVolume;
    const remaining = Math.max(0, Math.round((saved.endsAt - Date.now()) / 1000));
    setTimer({
      endsAt: saved.endsAt,
      remaining,
      fading: remaining <= FADE_SECONDS,
      pauseAfterSong: false,
    });
    startInterval(saved.endsAt);
    toastInfo(`Sleep timer restored: ${Math.ceil(remaining / 60)} min left`);
  }, [startInterval]);

  useEffect(() => () => stopInterval(), [stopInterval]);

  return { timer, start, clear, startPauseAfterSong, shouldPauseAfterSong, PRESETS };
}

// ── Format helpers ─────────────────────────────────────────────────────────────
function formatRemaining(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m === 0) return `${s}s`;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

// ── Active banner for player bar ──────────────────────────────────────────────
export function SleepTimerBanner({
  timer, onClear,
}: {
  timer: SleepTimerState;
  onClear: () => void;
}) {
  if (!timer.endsAt && !timer.pauseAfterSong) return null;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "4px 10px", borderRadius: "var(--radius-md)",
      background: timer.fading ? "var(--warning-dim)" : "rgba(245,158,11,0.1)",
      border: `1px solid ${timer.fading ? "var(--warning-border)" : "rgba(245,158,11,0.35)"}`,
      fontSize: 11, color: "var(--warning)", flexShrink: 0,
    }}>
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
      </svg>
      {timer.endsAt ? (
        <span style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700 }}>
          Sleep {formatRemaining(timer.remaining)}{timer.fading ? " ↓" : ""}
        </span>
      ) : (
        <span>Pause after song</span>
      )}
      <button
        onClick={onClear}
        title="Cancel sleep timer"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--warning)", fontSize: 13, padding: "0 2px", lineHeight: 1,
        }}
      >✕</button>
    </div>
  );
}

// ── UI Component ───────────────────────────────────────────────────────────────
interface SleepTimerButtonProps {
  timer: SleepTimerState;
  onStart: (minutes: number) => void;
  onClear: () => void;
  onPauseAfterSong: () => void;
}

export default function SleepTimerButton({
  timer, onStart, onClear, onPauseAfterSong,
}: SleepTimerButtonProps) {
  const [open, setOpen] = useState(false);
  const [dropUp, setDropUp] = useState(true);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const isActive = timer.endsAt !== null || timer.pauseAfterSong;
  const isFading = timer.fading;

  useEffect(() => {
    if (!open || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < 280 && spaceAbove > spaceBelow;
    setDropUp(openUp);
    setPanelPos({
      top: openUp ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, rect.right - 210),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      const panel = document.getElementById("sleep-timer-panel");
      if (panel?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dropdown = open ? createPortal(
    <div
      id="sleep-timer-panel"
      style={{
        position: "fixed",
        top: dropUp ? undefined : panelPos.top,
        bottom: dropUp ? window.innerHeight - panelPos.top : undefined,
        left: panelPos.left,
        background: "var(--bg-overlay)",
        border: "1px solid var(--border-medium)",
        borderRadius: "var(--radius-xl)",
        padding: 14,
        width: 210,
        boxShadow: "var(--shadow-lg)",
        zIndex: 10000,
        maxHeight: "min(70vh, 320px)",
        overflowY: "auto",
      }}
    >
      <p style={{
        fontSize: 12, fontWeight: 600,
        color: "var(--text-primary)",
        marginBottom: 10,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
        </svg>
        Sleep Timer
      </p>

      {timer.endsAt && (
        <div style={{
          background: "var(--warning-dim)",
          border: "1px solid var(--warning-border)",
          borderRadius: "var(--radius-md)", padding: "10px",
          marginBottom: 10, textAlign: "center",
        }}>
          <p style={{
            fontSize: 22, fontWeight: 700,
            color: "var(--warning)",
            fontFamily: "'Space Mono', monospace",
            lineHeight: 1,
          }}>
            {formatRemaining(timer.remaining)}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
            {timer.fading ? "Volume fading…" : "until pause"}
          </p>
        </div>
      )}

      <p style={{
        fontSize: 10, color: "var(--text-faint)",
        marginBottom: 7,
        textTransform: "uppercase", letterSpacing: "0.08em",
        fontWeight: 700,
      }}>
        Stop after
      </p>

      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 5, marginBottom: 10,
      }}>
        {PRESETS.map(min => (
          <button
            key={min}
            onClick={() => { onStart(min); setOpen(false); }}
            style={{
              padding: "6px 8px",
              borderRadius: "var(--radius-sm)", fontSize: 12,
              border: "1px solid var(--border-medium)",
              background: "transparent",
              color: "var(--text-secondary)",
              cursor: "pointer", fontFamily: "inherit",
              textAlign: "center",
              transition: "all 0.15s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = "var(--warning-border)";
              e.currentTarget.style.color = "var(--warning)";
              e.currentTarget.style.background = "var(--warning-dim)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = "var(--border-medium)";
              e.currentTarget.style.color = "var(--text-secondary)";
              e.currentTarget.style.background = "transparent";
            }}
          >
            {min}m
          </button>
        ))}
      </div>

      <button
        onClick={() => { onPauseAfterSong(); setOpen(false); }}
        style={{
          width: "100%", padding: "7px 10px",
          borderRadius: "var(--radius-md)", fontSize: 12,
          background: timer.pauseAfterSong ? "var(--accent-dim)" : "transparent",
          border: `1px solid ${timer.pauseAfterSong ? "var(--accent-border)" : "var(--border-medium)"}`,
          color: timer.pauseAfterSong ? "var(--accent-light)" : "var(--text-secondary)",
          cursor: "pointer", fontFamily: "inherit", marginBottom: 7,
          textAlign: "left", transition: "all 0.15s",
        }}
      >
        Pause after this song
      </button>

      {isActive && (
        <button
          onClick={() => { onClear(); setOpen(false); }}
          style={{
            width: "100%", padding: "6px 10px",
            borderRadius: "var(--radius-md)", fontSize: 12,
            background: "var(--danger-dim)",
            border: "1px solid var(--danger-border)",
            color: "#f87171", cursor: "pointer", fontFamily: "inherit",
            textAlign: "left",
          }}
        >
          Cancel timer
        </button>
      )}

      <p style={{
        fontSize: 10, color: "var(--text-faint)",
        marginTop: 8, lineHeight: 1.5,
      }}>
        Volume fades in last {FADE_SECONDS}s
      </p>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Sleep Timer"
        style={{
          height: 30,
          padding: "0 9px",
          borderRadius: "var(--radius-md)",
          border: `1px solid ${isActive
            ? isFading ? "var(--warning-border)" : "rgba(245,158,11,0.35)"
            : "var(--border)"}`,
          background: isActive
            ? isFading ? "var(--warning-dim)" : "rgba(245,158,11,0.1)"
            : "transparent",
          cursor: "pointer",
          color: isActive ? "var(--warning)" : "var(--text-muted)",
          fontSize: 12,
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          gap: 5,
          flexShrink: 0,
          boxShadow: isActive && isFading
            ? "0 0 10px rgba(245,158,11,0.25)"
            : isActive ? "0 0 6px rgba(245,158,11,0.15)" : "none",
          animation: isFading ? "sleep-pulse 2s ease-in-out infinite" : "none",
          transition: "all 0.15s",
        }}
        onMouseEnter={e => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "var(--border-medium)";
            e.currentTarget.style.color = "var(--text-secondary)";
          }
        }}
        onMouseLeave={e => {
          if (!isActive) {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.color = "var(--text-muted)";
          }
        }}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 10A6 6 0 016 2a7 7 0 100 12 6 6 0 008-4z"/>
        </svg>
        {timer.endsAt ? (
          <span style={{
            fontFamily: "'Space Mono', monospace",
            fontSize: 11,
            fontWeight: 700,
            color: "var(--warning)",
          }}>
            {formatRemaining(timer.remaining)}
            {isFading && " ↓"}
          </span>
        ) : timer.pauseAfterSong ? (
          <span style={{ fontSize: 11 }}>after</span>
        ) : null}
      </button>

      {dropdown}

      <style>{`
        @keyframes sleep-pulse {
          0%, 100% { box-shadow: 0 0 6px rgba(245,158,11,0.15); }
          50% { box-shadow: 0 0 14px rgba(245,158,11,0.35); }
        }
      `}</style>
    </div>
  );
}
