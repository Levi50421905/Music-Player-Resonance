/**
 * TagEditorModal.tsx — Edit song metadata in library (+ optional write to file)
 */

import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getDb, updateSongMetadata } from "../../lib/db";
import type { Song } from "../../lib/db";
import { useLibraryStore, usePlayerStore } from "../../store";
import { useLang } from "../../lib/i18n";

interface Props {
  song: Song;
  onClose: () => void;
  onSaved: (song: Song) => void;
}

export default function TagEditorModal({ song, onClose, onSaved }: Props) {
  const { setSongs } = useLibraryStore() as any;
  const { t } = useLang();
  const [title, setTitle] = useState(song.title ?? "");
  const [artist, setArtist] = useState(song.artist ?? "");
  const [album, setAlbum] = useState(song.album ?? "");
  const [genre, setGenre] = useState(song.genre ?? "");
  const [year, setYear] = useState(song.year ? String(song.year) : "");
  const [writeToFile, setWriteToFile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setStatusNote(null);
    try {
      const db = await getDb();
      const yearNum = year ? parseInt(year, 10) : null;
      const meta = {
        title: title.trim() || song.title,
        artist: artist.trim() || song.artist,
        album: album.trim() || song.album,
        genre: genre.trim() || song.genre,
        year: yearNum && !isNaN(yearNum) ? yearNum : null,
      };
      await updateSongMetadata(db, song.id, meta);

      if (writeToFile) {
        try {
          await invoke("write_audio_metadata", {
            path: song.path,
            title: meta.title,
            artist: meta.artist,
            album: meta.album,
            genre: meta.genre,
            year: meta.year,
          });
          setStatusNote(t.tagEditSavedToFile);
        } catch (err) {
          setStatusNote(String(err));
        }
      } else {
        setStatusNote(t.tagEditLibraryOnly);
      }

      const updated: Song = { ...song, ...meta };
      setSongs((prev: Song[]) => prev.map(s => s.id === song.id ? updated : s));
      const { currentSong, setCurrentSong } = usePlayerStore.getState();
      if (currentSong?.id === song.id) setCurrentSong(updated);
      onSaved(updated);
    } finally {
      setSaving(false);
    }
  };

  const field = (label: string, value: string, set: (v: string) => void) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>{label}</span>
      <input
        value={value}
        onChange={e => set(e.target.value)}
        style={{
          width: "100%", padding: "8px 10px", borderRadius: 8,
          border: "1px solid var(--border)", background: "var(--bg-overlay)",
          color: "var(--text-primary)", fontSize: 13, fontFamily: "inherit",
        }}
      />
    </label>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 2100,
      background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "min(400px, 92vw)", padding: 20, borderRadius: 12,
        background: "var(--bg-surface)", border: "1px solid var(--border-medium)",
      }}>
        <h3 style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, color: "var(--text-primary)" }}>{t.tagEditTitle}</h3>
        <p style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 16, wordBreak: "break-all" }}>{song.path}</p>
        {field(t.tagEditFieldTitle, title, setTitle)}
        {field(t.tagEditFieldArtist, artist, setArtist)}
        {field(t.tagEditFieldAlbum, album, setAlbum)}
        {field(t.tagEditFieldGenre, genre, setGenre)}
        {field(t.tagEditFieldYear, year, setYear)}
        <label style={{
          display: "flex", alignItems: "center", gap: 8, marginBottom: 12,
          fontSize: 12, color: "var(--text-secondary)", cursor: "pointer",
        }}>
          <input
            type="checkbox"
            checked={writeToFile}
            onChange={e => setWriteToFile(e.target.checked)}
          />
          {t.tagEditWriteToFile}
        </label>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer",
            background: "transparent", border: "1px solid var(--border)", color: "var(--text-muted)", fontFamily: "inherit",
          }}>{t.tagEditCancel}</button>
          <button onClick={save} disabled={saving} style={{
            padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer",
            background: "var(--accent)", border: "none", color: "white", fontFamily: "inherit",
          }}>{saving ? t.tagEditSaving : t.tagEditSave}</button>
        </div>
        {statusNote && (
          <p style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 12 }}>{statusNote}</p>
        )}
      </div>
    </div>
  );
}
