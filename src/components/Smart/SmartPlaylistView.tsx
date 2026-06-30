/**
 * SmartPlaylistView.tsx — v3 (Mood Engine + Context Mix)
 */

import { useState, useMemo, useCallback, useEffect } from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import {
  detectMoodContext,
  buildSmartMix,
  generateMoodPlaylist,
  MOOD_CATEGORIES,
  type MoodCategory,
  type MoodContext,
} from "../../lib/moodEngine";
import { generateSmartQueue } from "../../lib/smartShuffle";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60) | 0).padStart(2, "0")}`;

interface Props {
  onPlay: (songs: Song[], startIndex?: number) => void;
}

export default function SmartPlaylistView({ onPlay }: Props) {
  const { songs } = useLibraryStore();
  const { history } = usePlayerStore();
  const [ctx] = useState<MoodContext>(() => detectMoodContext());
  const [selected, setSelected] = useState<MoodCategory | "mix" | null>("mix");
  const [preview, setPreview] = useState<Song[]>([]);

  const smartMix = useMemo(
    () => buildSmartMix(songs, history, ctx),
    [songs, history, ctx],
  );

  const generate = useCallback((mood: MoodCategory) => {
    const list = generateMoodPlaylist(mood, songs, ctx);
    setSelected(mood);
    setPreview(list);
  }, [songs, ctx]);

  useEffect(() => {
    if (selected === "mix") setPreview(smartMix.songs);
  }, [selected, smartMix.songs]);

  const moodStats = useMemo(() =>
    MOOD_CATEGORIES.map(mood => ({
      mood,
      count: songs.filter(s => mood.score(s, ctx) >= mood.minScore).length,
    })),
    [songs, ctx],
  );

  const totalMin = Math.round(preview.reduce((a, s) => a + (s.duration || 0), 0) / 60);

  const handleSmartShuffle = useCallback(() => {
    const pool = preview.length > 0 ? preview : smartMix.songs;
    const shuffled = generateSmartQueue(pool, history);
    if (shuffled.length > 0) onPlay(shuffled, 0);
  }, [preview, smartMix.songs, history, onPlay]);

  const activeMeta = selected === "mix"
    ? { name: smartMix.name, desc: smartMix.description, color: smartMix.color, reason: smartMix.reason }
    : selected
      ? { name: selected.name, desc: selected.desc, color: selected.color, reason: `${preview.length} tracks matched` }
      : null;

  return (
    <div style={{ display: "flex", gap: 18, height: "100%" }}>
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ marginBottom: 14 }}>
          <h3 style={{ fontWeight: 700, fontSize: 15, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
            Smart & Mood
          </h3>
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
            Deteksi otomatis: <strong style={{ color: ctx.color }}>{ctx.label}</strong>
            {" · "}{ctx.hour}:00{ctx.isWeekend ? " · weekend" : ""}
          </p>
        </div>

        {/* Context mix card */}
        <button
          onClick={() => { setSelected("mix"); setPreview(smartMix.songs); }}
          style={{
            display: "flex", flexDirection: "column", gap: 6,
            padding: "12px 13px", borderRadius: "var(--radius-lg, 12px)", marginBottom: 10,
            border: `1px solid ${selected === "mix" ? smartMix.color + "55" : "var(--border)"}`,
            background: selected === "mix" ? `${smartMix.color}12` : "var(--bg-overlay)",
            cursor: "pointer", textAlign: "left", fontFamily: "inherit",
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: smartMix.color, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            ✦ Rekomendasi Sekarang
          </span>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text-primary)" }}>{smartMix.name}</span>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{smartMix.songs.length} lagu · smart shuffle</span>
        </button>

        <div style={{ display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
          {moodStats.map(({ mood, count }) => (
            <MoodCard
              key={mood.id} mood={mood} count={count}
              isActive={selected !== "mix" && selected?.id === mood.id}
              onClick={() => generate(mood)}
            />
          ))}
        </div>
      </div>

      <div style={{ width: 1, background: "var(--border-subtle)", flexShrink: 0 }} />

      <div style={{ flex: 1, overflow: "auto" }}>
        {!activeMeta ? (
          <EmptySmart />
        ) : (
          <>
            <div style={{
              display: "flex", alignItems: "center", gap: 14,
              marginBottom: 18, padding: "14px 16px",
              background: `${activeMeta.color}0f`,
              border: `1px solid ${activeMeta.color}28`,
              borderRadius: "var(--radius-lg, 12px)",
            }}>
              <div style={{
                width: 48, height: 48, borderRadius: "var(--radius-md, 8px)", flexShrink: 0,
                background: `linear-gradient(135deg, ${activeMeta.color}, ${activeMeta.color}aa)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontSize: 20, fontWeight: 700,
              }}>♪</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontWeight: 700, fontSize: 16, color: "var(--text-primary)", margin: 0 }}>{activeMeta.name}</h2>
                <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{activeMeta.desc}</p>
                <p style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 3 }}>
                  {preview.length} tracks · {totalMin} min · {activeMeta.reason}
                </p>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => preview.length > 0 && onPlay(preview, 0)}
                  disabled={preview.length === 0}
                  style={{
                    padding: "8px 16px", borderRadius: "var(--radius-md, 8px)",
                    background: activeMeta.color, border: "none", color: "white",
                    cursor: preview.length > 0 ? "pointer" : "not-allowed",
                    fontFamily: "inherit", fontWeight: 600, fontSize: 12,
                    opacity: preview.length === 0 ? 0.5 : 1,
                  }}
                >Play all</button>
                <button
                  onClick={handleSmartShuffle}
                  disabled={preview.length === 0}
                  style={{
                    padding: "7px 14px", borderRadius: "var(--radius-md, 8px)",
                    background: "transparent", border: `1px solid ${activeMeta.color}55`,
                    color: activeMeta.color, cursor: preview.length > 0 ? "pointer" : "not-allowed",
                    fontFamily: "inherit", fontWeight: 600, fontSize: 11,
                    opacity: preview.length === 0 ? 0.5 : 1,
                  }}
                >Smart shuffle</button>
              </div>
            </div>

            {preview.length === 0 ? (
              <p style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, padding: 32 }}>
                Tidak ada lagu yang cocok. Coba scan ulang library atau rating lebih banyak lagu.
              </p>
            ) : (
              preview.map((song, i) => (
                <div key={song.id} onClick={() => onPlay(preview, i)}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "7px 10px", borderRadius: "var(--radius-md, 8px)",
                    marginBottom: 2, cursor: "pointer",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.04)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ width: 22, textAlign: "center", fontSize: 11, color: "var(--text-faint)", fontFamily: "monospace" }}>{i + 1}</span>
                  <CoverArt id={song.id} coverArt={song.cover_art} hasCover={song.has_cover} size={36} />
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontWeight: 500, fontSize: 13, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{song.title}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
                  </div>
                  {song.bpm && <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--text-muted)" }}>{Math.round(song.bpm)} BPM</span>}
                  <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "monospace" }}>{fmt(Math.floor(song.duration))}</span>
                </div>
              ))
            )}
          </>
        )}
      </div>
    </div>
  );
}

function EmptySmart() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, textAlign: "center" }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: "var(--accent-dim)", border: "1px solid var(--accent-border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✦</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Pilih mood atau mix di kiri</p>
    </div>
  );
}

function MoodCard({ mood, count, isActive, onClick }: {
  mood: MoodCategory; count: number; isActive: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 11,
      padding: "9px 11px", borderRadius: "var(--radius-md, 8px)",
      border: `1px solid ${isActive ? mood.color + "45" : "var(--border)"}`,
      background: isActive ? `${mood.color}10` : "transparent",
      cursor: "pointer", textAlign: "left", width: "100%", fontFamily: "inherit",
    }}>
      <div style={{ width: 3, height: 28, borderRadius: 2, flexShrink: 0, background: count > 0 ? mood.color : "var(--border-medium)" }} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: isActive ? "var(--text-primary)" : "var(--text-secondary)" }}>{mood.name}</div>
        <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 1 }}>{count > 0 ? `${count} tracks` : "No tracks"}</div>
      </div>
    </button>
  );
}
