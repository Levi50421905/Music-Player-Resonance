/**
 * Dashboard.tsx — v6 (Context Menu on Song Rows)
 *
 * PERUBAHAN vs v5:
 *   [NEW] Klik kanan di lagu (Recently Played, Most Played, Top Rated) → context menu
 */

import { useMemo, useState, useCallback, useEffect } from "react";
import React from "react";
import { useLibraryStore, usePlayerStore } from "../../store";
import { getDb, getPlaylists, addToPlaylist } from "../../lib/db";
import type { Song } from "../../lib/db";
import CoverArt from "../CoverArt";
import { useLang, getGreeting } from "../../lib/i18n";
import LibraryBreakdown, { buildLibraryBreakdown, type BreakdownEntry } from "./LibraryBreakdown";
import SongContextMenu, { ConfirmDeleteModal } from "../SongContextMenu";
import TagEditorModal from "../Library/TagEditorModal";
import { deleteSongs } from "../../lib/db";
import { detectMoodContext, getListeningStreak, buildSessionContinuation, getResumeQueueInfo, buildListeningInsights } from "../../lib/moodEngine";
import { toastInfo, toastSuccess } from "../Notification/ToastSystem";

interface Props {
  onPlay:        (songs: Song[], index?: number, contextName?: string) => void;
  onRating:      (songId: number, stars: number) => void;
  onScanFolder?: () => void;
}

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

function SectionHeader({ title, count, onSeeAll, seeAllLabel }: {
  title: string;
  count?: number;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <div style={{ width: 3, height: 14, borderRadius: 2, background: "var(--accent)", flexShrink: 0 }} />
      <h3 style={{ fontWeight: 600, fontSize: 13, color: "var(--text-primary)", letterSpacing: "-0.2px", flex: 1 }}>
        {title}
      </h3>
      {count !== undefined && (
        <span style={{ fontSize: 11, color: "var(--text-faint)", fontFamily: "'Space Mono', monospace" }}>
          {count}
        </span>
      )}
      {onSeeAll && (
        <button
          onClick={onSeeAll}
          style={{
            fontSize: 11, fontWeight: 600, color: "var(--accent-light)",
            background: "transparent", border: "none", cursor: "pointer",
            padding: "2px 6px", borderRadius: "var(--radius-sm)",
            fontFamily: "inherit",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--accent-dim)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
        >
          {seeAllLabel ?? "See All"}
        </button>
      )}
    </div>
  );
}

export default function Dashboard({ onPlay, onRating, onScanFolder }: Props) {
  const { songs, setSongs } = useLibraryStore() as any;
  const { t, lang } = useLang();
  const { currentSong, history } = usePlayerStore();

  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; song: Song; list: Song[] } | null>(null);
  const [confirmDel, setConfirmDel]   = useState<Song[] | null>(null);
  const [editSong, setEditSong]       = useState<Song | null>(null);
  const [playlists, setPlaylists]     = useState<any[]>([]);
  const [expandedList, setExpandedList] = useState<"mostPlayed" | "topRated" | "allArtists" | "allAlbums" | null>(null);

  useEffect(() => {
    getDb().then(db => getPlaylists(db)).then(setPlaylists).catch(() => {});
  }, []);

  const stats = useMemo(() => {
    const totalDuration = songs.reduce((a: number, s: Song) => a + (s.duration || 0), 0);
    const lossless = songs.filter((s: Song) => ["FLAC", "WAV", "ALAC", "APE"].includes((s.format || "").toUpperCase())).length;
    const rated = songs.filter((s: Song) => s.stars && s.stars > 0);
    const avgRating = rated.length > 0
      ? (rated.reduce((a: number, s: Song) => a + (s.stars || 0), 0) / rated.length).toFixed(1)
      : "—";
    return {
      tracks: songs.length,
      hours: Math.round(totalDuration / 3600),
      losslessPct: songs.length > 0 ? Math.round((lossless / songs.length) * 100) : 0,
      avgRating,
      totalPlays: history.length,
    };
  }, [songs, history]);

  const recentlyPlayed = useMemo(() => {
    const seen = new Set<number>();
    const result: Song[] = [];
    for (const record of history) {
      if (!seen.has(record.song_id)) {
        seen.add(record.song_id);
        const song = songs.find((s: Song) => s.id === record.song_id);
        if (song) result.push(song);
      }
      if (result.length >= 15) break;
    }
    return result;
  }, [history, songs]);

  const topByPlays = useMemo(() =>
    [...songs].sort((a: Song, b: Song) => (b.play_count || 0) - (a.play_count || 0)),
    [songs]
  );

  const topByRating = useMemo(() =>
    songs.filter((s: Song) => s.stars && s.stars >= 4)
      .sort((a: Song, b: Song) => (b.stars || 0) - (a.stars || 0)),
    [songs]
  );

  const playedTopList = useMemo(
    () => topByPlays.filter(s => (s.play_count ?? 0) > 0),
    [topByPlays],
  );

  const listeningStreak = useMemo(() => getListeningStreak(history), [history]);
  const sessionContinue = useMemo(
    () => buildSessionContinuation(history, songs),
    [history, songs],
  );
  const resumeInfo = useMemo(() => getResumeQueueInfo(), [currentSong, history]);
  const insights = useMemo(() => buildListeningInsights(history, songs), [history, songs]);

  const libraryBreakdown = useMemo(() => buildLibraryBreakdown(songs), [songs]);

  const songsByArtist = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const s of songs) {
      const key = s.artist?.trim() || "Unknown";
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [songs]);

  const songsByAlbumKey = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const s of songs) {
      const album = s.album?.trim();
      if (!album) continue;
      const lower = album.toLowerCase();
      if (lower === "unknown" || lower === "unknown album") continue;
      const key = `${s.artist?.trim() || "Unknown"}\x00${album}`;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [songs]);

  const handleCtxMenu = useCallback(async (e: React.MouseEvent, song: Song, list: Song[]) => {
    e.preventDefault();
    try { const db = await getDb(); setPlaylists(await getPlaylists(db)); } catch {}
    const x = Math.min(e.clientX, window.innerWidth - 240);
    const y = Math.min(e.clientY, window.innerHeight - 380);
    setContextMenu({ x, y, song, list });
  }, []);

  const handleAddToQueue = useCallback((ss: Song[]) => {
    const store = usePlayerStore.getState() as any;
    ss.forEach(s => store.addToManualQueue(s));
    toastInfo(t.toastAddedQueue(ss.length));
  }, [t]);

  const handlePlayNext = useCallback((ss: Song[]) => {
    const store = usePlayerStore.getState() as any;
    [...ss].reverse().forEach(s => store.playNextTrack(s));
    toastInfo(t.toastPlayNext(ss.length));
  }, [t]);

  const handleAddToPlaylist = useCallback(async (pid: number, ss: Song[]) => {
    const db = await getDb();
    for (const s of ss) await addToPlaylist(db, pid, s.id);
    toastSuccess(t.toastAddedPlaylist(ss.length));
  }, [t]);

  const handleDeleteSongs = useCallback(async (ss: Song[]) => {
    const db = await getDb();
    await deleteSongs(db, ss.map(s => s.id));
    setSongs((prev: Song[]) => Array.isArray(prev) ? prev.filter(s => !ss.find(d => d.id === s.id)) : prev);
    setConfirmDel(null);
    setContextMenu(null);
    toastSuccess(t.toastDeleted(ss.length));
  }, [setSongs, t]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (songs.length === 0) {
    return (
      <div style={{
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        height: "100%", gap: 20, textAlign: "center", padding: "40px 20px",
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "var(--radius-xl)",
          background: "linear-gradient(135deg, var(--accent-dim), rgba(236,72,153,0.1))",
          border: "1px solid var(--accent-border)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
          animation: "float 3s ease-in-out infinite",
        }}>♪</div>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 19, color: "var(--text-primary)", letterSpacing: "-0.4px", marginBottom: 8 }}>
            {t.libraryEmpty}
          </h2>
          <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.7, maxWidth: 340, marginBottom: 24 }}>
            {t.libraryEmptyDesc}
          </p>
          {onScanFolder && (
            <button onClick={onScanFolder} style={{
              padding: "10px 22px", borderRadius: "var(--radius-lg)",
              fontSize: 13, fontWeight: 600,
              background: "linear-gradient(135deg, var(--accent), var(--accent-pink))",
              border: "none", color: "white", cursor: "pointer",
              fontFamily: "inherit",
              boxShadow: "0 4px 18px rgba(124,58,237,0.35)",
            }}>
              {t.scanMusicFolder}
            </button>
          )}
        </div>
        <style>{`@keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }`}</style>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>

      {/* Context menu */}
      {contextMenu && (
        <SongContextMenu
          x={contextMenu.x} y={contextMenu.y}
          songs={[contextMenu.song]}
          playlists={playlists}
          onClose={() => setContextMenu(null)}
          onPlayNow={ss => { onPlay(contextMenu.list, contextMenu.list.findIndex(s => s.id === ss[0].id)); }}
          onPlayNext={handlePlayNext}
          onAddToQueue={handleAddToQueue}
          onAddToPlaylist={handleAddToPlaylist}
          onEditMetadata={song => setEditSong(song)}
          onDelete={ss => setConfirmDel(ss)}
        />
      )}

      {editSong && (
        <TagEditorModal
          song={editSong}
          onClose={() => setEditSong(null)}
          onSaved={() => setEditSong(null)}
        />
      )}

      {confirmDel && (
        <ConfirmDeleteModal
          songs={confirmDel}
          onConfirm={() => handleDeleteSongs(confirmDel)}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {expandedList && (
        <div
          onClick={() => setExpandedList(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 900,
            background: "rgba(0,0,0,0.65)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              width: "min(520px, 100%)", maxHeight: "80vh",
              background: "var(--bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-xl)",
              display: "flex", flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)",
            }}>
              <h3 style={{ fontWeight: 700, fontSize: 14, color: "var(--text-primary)" }}>
                {expandedList === "mostPlayed" ? t.mostPlayed
                  : expandedList === "topRated" ? t.topRated
                  : expandedList === "allArtists" ? t.topArtists
                  : t.topAlbums}
              </h3>
              <button
                onClick={() => setExpandedList(null)}
                style={{
                  fontSize: 12, fontWeight: 600, color: "var(--text-muted)",
                  background: "transparent", border: "1px solid var(--border)",
                  borderRadius: "var(--radius-md)", padding: "4px 10px",
                  cursor: "pointer", fontFamily: "inherit",
                }}
              >
                {t.close}
              </button>
            </div>
            <div style={{ overflowY: "auto", flex: 1 }}>
              {(expandedList === "mostPlayed" || expandedList === "topRated") && (
                (expandedList === "mostPlayed" ? playedTopList : topByRating).map((song: Song, i: number, arr: Song[]) => (
                  <TrackRow
                    key={song.id}
                    song={song}
                    rank={i + 1}
                    onPlay={() => {
                      const list = expandedList === "mostPlayed" ? playedTopList : topByRating;
                      onPlay(list, i);
                      setExpandedList(null);
                    }}
                    onContextMenu={e => handleCtxMenu(e, song, expandedList === "mostPlayed" ? playedTopList : topByRating)}
                    onRating={onRating}
                    isLast={i === arr.length - 1}
                    suffix={
                      expandedList === "mostPlayed" ? (
                        <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                          {song.play_count}×
                        </span>
                      ) : (
                        <div style={{ display: "flex", gap: 1 }}>
                          {[1, 2, 3, 4, 5].map(n => (
                            <span key={n} style={{ fontSize: 10, color: n <= (song.stars ?? 0) ? "var(--warning)" : "var(--border-medium)" }}>
                              {n <= (song.stars ?? 0) ? "★" : "☆"}
                            </span>
                          ))}
                        </div>
                      )
                    }
                  />
                ))
              )}
              {(expandedList === "allArtists" || expandedList === "allAlbums") && (
                (expandedList === "allArtists" ? libraryBreakdown.allArtists : libraryBreakdown.allAlbums).map(
                  (entry: BreakdownEntry, i: number, arr: BreakdownEntry[]) => (
                    <BreakdownRow
                      key={`${entry.name}-${entry.subtitle ?? ""}-${i}`}
                      entry={entry}
                      rank={i + 1}
                      isLast={i === arr.length - 1}
                      playsLabel={entry.plays > 0 ? t.breakdownPlays(entry.plays) : t.breakdownTracks(entry.tracks)}
                      onPlay={() => {
                        if (expandedList === "allArtists") {
                          const list = songsByArtist.get(entry.name);
                          if (list?.length) onPlay(list, 0, entry.name);
                        } else if (entry.subtitle) {
                          const list = songsByAlbumKey.get(`${entry.subtitle}\x00${entry.name}`);
                          if (list?.length) onPlay(list, 0, `${entry.subtitle} — ${entry.name}`);
                        }
                        setExpandedList(null);
                      }}
                    />
                  ),
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Welcome + mood hint ── */}
      {(() => {
        const mood = detectMoodContext(undefined, lang);
        const h = new Date().getHours();
        const greet = getGreeting(lang, h);
        return (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16,
            padding: "16px 18px", borderRadius: "var(--radius-lg)",
            background: "linear-gradient(135deg, rgba(124,58,237,0.12), rgba(59,130,246,0.08))",
            border: "1px solid var(--border)",
          }}>
            <div>
              <h2 style={{ fontWeight: 700, fontSize: 17, color: "var(--text-primary)", letterSpacing: "-0.3px" }}>
                {greet}
              </h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                {mood.description} · {t.tracksInLibrary(stats.tracks)}
              </p>
            </div>
            <div style={{
              flexShrink: 0, padding: "6px 12px", borderRadius: 20,
              background: `${mood.color}22`, border: `1px solid ${mood.color}55`,
              fontSize: 11, fontWeight: 600, color: mood.color,
            }}>
              {mood.label}
            </div>
          </div>
        );
      })()}

      {/* ── Smart actions: streak, resume, session continue ── */}
      {(listeningStreak > 0 || resumeInfo || sessionContinue) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {listeningStreak > 0 && (
            <div style={{
              flex: "1 1 140px", padding: "12px 14px", borderRadius: "var(--radius-lg)",
              background: "var(--bg-overlay)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", gap: 10,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #F59E0B, #EF4444)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 16, fontWeight: 800, color: "white",
              }}>{listeningStreak}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
                  {t.listeningStreak}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {t.streakDays(listeningStreak)}
                </div>
              </div>
            </div>
          )}

          {resumeInfo && currentSong && (
            <div style={{
              flex: "2 1 200px", padding: "12px 14px", borderRadius: "var(--radius-lg)",
              background: "rgba(124,58,237,0.08)", border: "1px solid var(--accent-border)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div style={{ overflow: "hidden" }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--accent-light)" }}>
                  {t.resumeQueue}
                </div>
                <div style={{
                  fontSize: 11, color: "var(--text-muted)", marginTop: 2,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                }}>
                  {resumeInfo.songTitle}
                  {resumeInfo.queueRemaining > 0 ? ` · ${t.moreTracks(resumeInfo.queueRemaining)}` : ""}
                  {resumeInfo.contextName ? ` · ${resumeInfo.contextName}` : ""}
                </div>
              </div>
              <button
                onClick={() => onPlay([currentSong], 0)}
                style={{
                  flexShrink: 0, padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: "var(--accent)", border: "none", color: "white", cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >{t.play}</button>
            </div>
          )}

          {sessionContinue && (
            <div style={{
              flex: "2 1 200px", padding: "12px 14px", borderRadius: "var(--radius-lg)",
              background: "var(--bg-overlay)", border: "1px solid var(--border)",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 12, color: "var(--text-primary)" }}>
                  {sessionContinue.label}
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                  {sessionContinue.songs.length} {t.tracksWord} · {t.similarHourYesterday}
                </div>
              </div>
              <button
                onClick={() => onPlay(sessionContinue.songs, 0, t.sessionYesterday)}
                style={{
                  flexShrink: 0, padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600,
                  background: "transparent", border: "1px solid var(--accent-border)",
                  color: "var(--accent-light)", cursor: "pointer", fontFamily: "inherit",
                }}
              >{t.mix}</button>
            </div>
          )}
        </div>
      )}

      {insights && (
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10,
        }}>
          {[
            { label: t.genreThisHour, value: insights.topGenreAtHour },
            { label: t.artistThisWeek, value: insights.topArtistWeek },
            { label: t.peakHourInsight, value: insights.peakHour },
            { label: t.playsThisWeek, value: String(insights.playsThisWeek) },
          ].map(item => (
            <div key={item.label} style={{
              padding: "12px 14px", borderRadius: "var(--radius-lg)",
              background: "var(--bg-overlay)", border: "1px solid var(--border)",
            }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "var(--accent-light)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {item.value}
              </div>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{item.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
        gap: 10,
      }}>
        {[
          { value: stats.tracks.toLocaleString(), label: t.statTracks,           sub: t.statTracksSub },
          { value: t.hoursShort(stats.hours),    label: t.statDuration,         sub: t.statDurationSub },
          { value: `${stats.losslessPct}%`,       label: t.statLossless,         sub: t.statLosslessSub },
          { value: stats.avgRating,               label: t.statAvgRating,        sub: t.statAvgRatingSub },
          { value: stats.totalPlays.toLocaleString(), label: t.statTotalPlaysLabel, sub: t.statTotalPlaysSub },
        ].map(stat => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </div>

      {/* ── Recently Played ── */}
      {recentlyPlayed.length > 0 && (
        <div>
          <SectionHeader title={t.recentlyPlayed} count={recentlyPlayed.length} />
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", gap: 10, overflowX: "auto", paddingBottom: 6, scrollbarWidth: "none" }}>
              {recentlyPlayed.map((song, i) => (
                <div
                  key={song.id}
                  onClick={() => onPlay(recentlyPlayed, i)}
                  onContextMenu={e => handleCtxMenu(e, song, recentlyPlayed)}
                  style={{
                    flexShrink: 0, width: 130, cursor: "pointer",
                    borderRadius: "var(--radius-lg)", overflow: "hidden",
                    border: currentSong?.id === song.id ? "1px solid var(--accent-border)" : "1px solid var(--border)",
                    background: currentSong?.id === song.id ? "var(--accent-dim)" : "var(--bg-overlay)",
                    transition: "transform 0.18s, border-color 0.15s",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = "translateY(-2px)")}
                  onMouseLeave={e => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  <CoverArt id={song.id} coverArt={song.cover_art} hasCover={song.has_cover} size={130}
                    style={{ width: "100%", height: 130, borderRadius: 0 }} />
                  <div style={{ padding: "7px 9px 8px" }}>
                    <div style={{
                      fontWeight: 600, fontSize: 11,
                      whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      color: currentSong?.id === song.id ? "var(--accent-light)" : "var(--text-primary)",
                      lineHeight: 1.3,
                    }}>
                      {song.title}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {song.artist}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              position: "absolute", top: 0, right: 0, bottom: 6, width: 40,
              background: "linear-gradient(to left, var(--bg-base) 0%, transparent 100%)",
              pointerEvents: "none",
            }} />
          </div>
        </div>
      )}

      {/* ── Top tracks grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        {/* Most played */}
        <div>
          <SectionHeader
            title={t.mostPlayed}
            count={playedTopList.length || undefined}
            onSeeAll={playedTopList.length > 6 ? () => setExpandedList("mostPlayed") : undefined}
            seeAllLabel={t.seeAll}
          />
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", overflow: "hidden",
          }}>
            {playedTopList.slice(0, 6).length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "16px", textAlign: "center" }}>
                {t.playTracksToSee}
              </p>
            ) : (
              playedTopList.slice(0, 6).map((song, i, arr) => (
                <TrackRow
                  key={song.id} song={song} rank={i + 1}
                  onPlay={() => onPlay(playedTopList, i)}
                  onContextMenu={e => handleCtxMenu(e, song, playedTopList)}
                  onRating={onRating}
                  isLast={i === arr.length - 1}
                  suffix={
                    <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                      {song.play_count}×
                    </span>
                  }
                />
              ))
            )}
          </div>
        </div>

        {/* Top rated */}
        <div>
          <SectionHeader
            title={t.topRated}
            count={topByRating.length || undefined}
            onSeeAll={topByRating.length > 6 ? () => setExpandedList("topRated") : undefined}
            seeAllLabel={t.seeAll}
          />
          <div style={{
            background: "var(--bg-overlay)", border: "1px solid var(--border)",
            borderRadius: "var(--radius-lg)", overflow: "hidden",
          }}>
            {topByRating.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-faint)", padding: "16px", textAlign: "center" }}>
                {t.rateTracksToSee}
              </p>
            ) : (
              topByRating.slice(0, 6).map((song: Song, i: number, arr: Song[]) => (
                <TrackRow
                  key={song.id} song={song} rank={i + 1}
                  onPlay={() => onPlay(topByRating, i)}
                  onContextMenu={e => handleCtxMenu(e, song, topByRating)}
                  onRating={onRating}
                  isLast={i === arr.length - 1}
                  suffix={
                    <div style={{ display: "flex", gap: 1 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <span key={n} style={{ fontSize: 10, color: n <= (song.stars ?? 0) ? "var(--warning)" : "var(--border-medium)" }}>
                          {n <= (song.stars ?? 0) ? "★" : "☆"}
                        </span>
                      ))}
                    </div>
                  }
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Library profile ── */}
      {songs.length > 0 && (
        <div>
          <SectionHeader title={t.libraryProfile} />
          <LibraryBreakdown
            lang={lang}
            songs={songs}
            t={t}
            allArtistsCount={libraryBreakdown.allArtists.length}
            allAlbumsCount={libraryBreakdown.allAlbums.length}
            onSeeAllArtists={() => setExpandedList("allArtists")}
            onSeeAllAlbums={() => setExpandedList("allAlbums")}
            onPlayArtist={(artist, list) => onPlay(list, 0, artist)}
            onPlayAlbum={(album, artist, list) => onPlay(list, 0, `${artist} — ${album}`)}
          />
        </div>
      )}
    </div>
  );
}

function StatCard({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div style={{
      background: "var(--bg-overlay)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "14px 14px 12px",
      transition: "border-color 0.15s",
    }}
      onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border-medium)"}
      onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"}
    >
      <div style={{ fontWeight: 700, fontSize: 22, color: "var(--accent-light)", letterSpacing: "-0.5px", lineHeight: 1, fontFamily: "'Space Mono', monospace" }}>
        {value}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginTop: 6 }}>{label}</div>
      <div style={{ fontSize: 11, color: "var(--text-faint)", marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function BreakdownRow({ entry, rank, playsLabel, onPlay, isLast }: {
  entry: BreakdownEntry;
  rank: number;
  playsLabel: string;
  onPlay: () => void;
  isLast?: boolean;
}) {
  return (
    <div
      onClick={onPlay}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px", minHeight: 44,
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 18, fontSize: 11, fontFamily: "monospace", textAlign: "center", flexShrink: 0,
        color: rank <= 3 ? "var(--warning)" : "var(--text-faint)",
        fontWeight: rank <= 3 ? 700 : 400,
      }}>
        {rank}
      </span>
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontWeight: 500, fontSize: 12, color: "var(--text-primary)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {entry.name}
        </div>
        {entry.subtitle && (
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>{entry.subtitle}</div>
        )}
      </div>
      <span style={{ fontSize: 11, color: "var(--text-muted)", fontFamily: "'Space Mono', monospace", flexShrink: 0 }}>
        {playsLabel}
      </span>
    </div>
  );
}

function TrackRow({ song, rank, onPlay, onContextMenu, onRating, suffix, isLast }: {
  song: Song; rank: number;
  onPlay: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onRating: (id: number, s: number) => void;
  suffix: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <div
      onClick={onPlay}
      onContextMenu={onContextMenu}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", minHeight: 44,
        borderBottom: isLast ? "none" : "1px solid var(--border-subtle)",
        cursor: "pointer", transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.03)")}
      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
    >
      <span style={{
        width: 18, fontSize: 11, fontFamily: "monospace", textAlign: "center", flexShrink: 0,
        color: rank <= 3 ? "var(--warning)" : "var(--text-faint)",
        fontWeight: rank <= 3 ? 700 : 400,
      }}>
        {rank}
      </span>
      <CoverArt id={song.id} coverArt={song.cover_art} hasCover={song.has_cover} size={32} />
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{ fontWeight: 500, fontSize: 12, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {song.title}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{song.artist}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{suffix}</div>
    </div>
  );
}