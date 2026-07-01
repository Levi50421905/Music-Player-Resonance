/**
 * CommandPalette.tsx — Global search Ctrl+K
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { Song } from "../lib/db";
import CoverArt from "./CoverArt";
import { useLang } from "../lib/i18n";

export type PaletteAction =
  | { type: "song"; song: Song; list: Song[] }
  | { type: "nav"; tab: string; label: string };

interface Props {
  open: boolean;
  onClose: () => void;
  songs: Song[];
  onPlay: (song: Song, list: Song[]) => void;
  onNavigate: (tab: string) => void;
}

export default function CommandPalette({ open, onClose, songs, onPlay, onNavigate }: Props) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSel(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const actions = useMemo((): PaletteAction[] => {
    const q = query.trim().toLowerCase();
    const navItems: PaletteAction[] = ([
      { type: "nav" as const, tab: "home", label: t.navHome },
      { type: "nav" as const, tab: "library", label: t.navLibrary },
      { type: "nav" as const, tab: "favorites", label: t.navFavorites },
      { type: "nav" as const, tab: "smart", label: t.navSmart },
      { type: "nav" as const, tab: "albums", label: t.navAlbums },
      { type: "nav" as const, tab: "artists", label: t.navArtists },
      { type: "nav" as const, tab: "playlists", label: t.navPlaylists },
      { type: "nav" as const, tab: "equalizer", label: t.navEqualizer },
    ] as PaletteAction[]).filter(n => !q || (n.type === "nav" && n.label.toLowerCase().includes(q)));

    const songItems: PaletteAction[] = (q.length >= 1 ? songs : songs.slice(0, 8))
      .filter(s =>
        !q ||
        (s.title ?? "").toLowerCase().includes(q) ||
        (s.artist ?? "").toLowerCase().includes(q) ||
        (s.album ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20)
      .map(s => ({ type: "song" as const, song: s, list: songs }));

    return [...navItems.slice(0, 4), ...songItems];
  }, [query, songs, t]);

  const run = useCallback((action: PaletteAction) => {
    if (action.type === "nav") {
      onNavigate(action.tab);
    } else {
      onPlay(action.song, action.list);
    }
    onClose();
  }, [onNavigate, onPlay, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSel(s => Math.min(s + 1, actions.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
      if (e.key === "Enter" && actions[sel]) { e.preventDefault(); run(actions[sel]); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, actions, sel, run, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 2000,
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "flex-start", justifyContent: "center",
        paddingTop: "12vh",
      }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "min(520px, 92vw)", background: "var(--bg-surface)",
          border: "1px solid var(--border-medium)", borderRadius: 12,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)", overflow: "hidden",
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSel(0); }}
          placeholder={t.searchPlaceholder}
          style={{
            width: "100%", padding: "14px 16px", border: "none", borderBottom: "1px solid var(--border-subtle)",
            background: "transparent", color: "var(--text-primary)", fontSize: 14,
            fontFamily: "inherit", outline: "none",
          }}
        />
        <div style={{ maxHeight: 320, overflowY: "auto", padding: 6 }}>
          {actions.length === 0 ? (
            <p style={{ padding: 16, fontSize: 13, color: "var(--text-muted)", textAlign: "center" }}>Tidak ada hasil</p>
          ) : actions.map((a, i) => (
            <button
              key={a.type === "nav" ? a.tab : a.song.id}
              onClick={() => run(a)}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 8, border: "none", cursor: "pointer",
                background: i === sel ? "var(--accent-dim)" : "transparent",
                fontFamily: "inherit", textAlign: "left",
              }}
            >
              {a.type === "song" ? (
                <>
                  <CoverArt id={a.song.id} coverArt={a.song.cover_art} hasCover={a.song.has_cover} size={34} />
                  <div style={{ overflow: "hidden" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {a.song.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{a.song.artist}</div>
                  </div>
                </>
              ) : (
                <span style={{ fontSize: 13, color: "var(--text-secondary)", padding: "4px 6px" }}>
                  → {a.label}
                </span>
              )}
            </button>
          ))}
        </div>
        <div style={{ padding: "8px 12px", fontSize: 10, color: "var(--text-faint)", borderTop: "1px solid var(--border-subtle)" }}>
          ↑↓ navigasi · Enter pilih · Esc tutup · Ctrl+K
        </div>
      </div>
    </div>
  );
}
