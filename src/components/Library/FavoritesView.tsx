/**
 * FavoritesView.tsx — Loved / favorite tracks tab
 */

import { useState, useEffect, useCallback } from "react";
import { getDb, getLovedSongs, toggleLoved } from "../../lib/db";
import type { Song } from "../../lib/db";
import { useLibraryStore, usePlayerStore } from "../../store";
import CoverArt from "../CoverArt";
import TagEditorModal from "./TagEditorModal";
import { useLang } from "../../lib/i18n";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Props {
  onPlay: (songs: Song[], index?: number) => void;
  onRating?: (songId: number, stars: number) => void;
}

export default function FavoritesView({ onPlay }: Props) {
  const { t } = useLang();
  const { setSongs } = useLibraryStore() as any;
  const { currentSong } = usePlayerStore();
  const [loved, setLoved] = useState<Song[]>([]);
  const [editSong, setEditSong] = useState<Song | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    const db = await getDb();
    setLoved(await getLovedSongs(db));
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = loved.filter(s => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (s.title ?? "").toLowerCase().includes(q) ||
      (s.artist ?? "").toLowerCase().includes(q);
  });

  const handleUnlove = async (song: Song) => {
    const db = await getDb();
    await toggleLoved(db, song.id);
    setSongs((prev: Song[]) => prev.map(s => s.id === song.id ? { ...s, loved: 0 } : s));
    setLoved(prev => prev.filter(s => s.id !== song.id));
  };

  if (loved.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "48px 20px", color: "var(--text-muted)" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>♡</div>
        <h3 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", marginBottom: 8 }}>{t.noFavorites}</h3>
        <p style={{ fontSize: 13 }}>{t.noFavoritesHint}</p>
      </div>
    );
  }

  return (
    <div>
      {editSong && (
        <TagEditorModal
          song={editSong}
          onClose={() => setEditSong(null)}
          onSaved={updated => {
            setLoved(prev => prev.map(s => s.id === updated.id ? updated : s));
            setEditSong(null);
          }}
        />
      )}

      <div style={{ marginBottom: 14 }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)" }}>{t.favoritesTitle}</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>{filtered.length} lagu</p>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={t.searchFavorites}
        style={{
          width: "100%", padding: "8px 12px", marginBottom: 12,
          background: "var(--bg-overlay)", border: "1px solid var(--border)",
          borderRadius: 8, color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
        }}
      />

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={() => onPlay(filtered, 0)} style={{
          padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600,
          background: "linear-gradient(135deg, var(--accent), #EC4899)",
          border: "none", color: "white", cursor: "pointer", fontFamily: "inherit",
        }}>{t.playAll}</button>
      </div>

      {filtered.map((song, i) => (
        <div
          key={song.id}
          onClick={() => onPlay(filtered, i)}
          style={{
            display: "flex", alignItems: "center", gap: 11, padding: "8px 8px",
            borderRadius: 8, cursor: "pointer",
            background: currentSong?.id === song.id ? "var(--accent-dim)" : "transparent",
          }}
        >
          <CoverArt id={song.id} coverArt={song.cover_art} hasCover={song.has_cover} size={40} />
          <div style={{ flex: 1, overflow: "hidden" }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {song.title}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
          </div>
          <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>{fmt(song.duration)}</span>
          <button
            onClick={e => { e.stopPropagation(); setEditSong(song); }}
            title="Edit metadata"
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", fontSize: 14 }}
          >✎</button>
          <button
            onClick={e => { e.stopPropagation(); handleUnlove(song); }}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#EC4899", fontSize: 14 }}
          >♥</button>
        </div>
      ))}
    </div>
  );
}
