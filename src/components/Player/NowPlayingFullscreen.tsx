/**
 * NowPlayingFullscreen.tsx — Immersive focused now-playing view
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { usePlayerStore, useSettingsStore, type RepeatMode, type ShuffleMode } from "../../store";
import { getDb, getSongCoverArt } from "../../lib/db";
import { extractDominantColor } from "../../lib/dynamicTheme";
import { getLyricLines } from "../../lib/lyricCache";
import { ensureLyricsLoaded } from "../../lib/lyricLoader";
import { getActiveLine, type LyricLine } from "../../lib/lrcParser";
import { audioEngine } from "../../lib/audioEngine";
import { useLang } from "../../lib/i18n";

interface Props {
  open: boolean;
  onClose: () => void;
  onPlayPause: () => void;
  onNext: () => void;
  onPrev: () => void;
  progress: number;
  isPlaying: boolean;
}

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

function IconPrev() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="19 20 9 12 19 4 19 20" /><line x1="5" y1="19" x2="5" y2="5" />
    </svg>
  );
}
function IconNext() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 4 15 12 5 20 5 4" /><line x1="19" y1="5" x2="19" y2="19" />
    </svg>
  );
}
function IconPlay() {
  return <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>;
}
function IconPause() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
    </svg>
  );
}
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
function IconVolume({ muted, low }: { muted: boolean; low: boolean }) {
  if (muted) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      {!low && <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />}
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}

function FullscreenLyrics({
  songPath, currentTime, offsetMs, accent,
}: {
  songPath: string;
  currentTime: number;
  offsetMs: number;
  accent: string;
}) {
  const { t } = useLang();
  const { lyricsOfflineCache } = useSettingsStore() as { lyricsOfflineCache?: boolean };
  const [lines, setLines] = useState<LyricLine[]>([]);
  const activeRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!songPath) {
      setLines([]);
      return;
    }
    let cancelled = false;
    void ensureLyricsLoaded(songPath, lyricsOfflineCache !== false).then(() => {
      if (!cancelled) setLines(getLyricLines(songPath));
    });
    const poll = setInterval(() => {
      const next = getLyricLines(songPath);
      setLines(prev => (prev.length !== next.length ? next : prev));
    }, 1500);
    return () => { cancelled = true; clearInterval(poll); };
  }, [songPath, lyricsOfflineCache]);

  const tSec = currentTime + offsetMs / 1000;
  const activeIdx = getActiveLine(lines, tSec);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  if (!lines.length) {
    return (
      <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.25)", fontStyle: "italic", textAlign: "center", padding: "8px 0" }}>
        {t.nowPlayingNoLyrics}
      </p>
    );
  }

  const accentColor = accent.startsWith("#") ? accent : "var(--accent-light)";

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 180, overflowY: "auto", overflowX: "hidden",
        padding: "4px 8px",
        maskImage: "linear-gradient(transparent, black 12%, black 88%, transparent)",
        WebkitMaskImage: "linear-gradient(transparent, black 12%, black 88%, transparent)",
      }}
    >
      {lines.map((line, i) => {
        const isActive = i === activeIdx;
        const isPast = activeIdx >= 0 && i < activeIdx;
        return (
          <div
            key={`${line.time}-${i}`}
            ref={isActive ? activeRef : undefined}
            style={{
              padding: "6px 8px", borderRadius: 8, marginBottom: 2,
              fontSize: isActive ? 16 : 13,
              fontWeight: isActive ? 700 : 400,
              lineHeight: 1.45,
              color: isActive ? accentColor : isPast ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.55)",
              transform: isActive ? "scale(1.02)" : "scale(1)",
              transition: "color 0.25s, font-size 0.25s, transform 0.25s",
              textAlign: "center",
            }}
          >
            {line.text || "…"}
          </div>
        );
      })}
    </div>
  );
}

function FsShuffleBtn({ mode, onClick }: { mode: ShuffleMode; onClick: () => void }) {
  const active = mode !== "off";
  return (
    <button type="button" onClick={onClick} title={active ? "Shuffle on" : "Shuffle off"} style={{
      width: 40, height: 40, borderRadius: 10, cursor: "pointer",
      background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)"}`,
      color: active ? "#fff" : "rgba(255,255,255,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
        <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      </svg>
    </button>
  );
}

function FsRepeatBtn({ mode, onClick }: { mode: RepeatMode; onClick: () => void }) {
  const vis = mode === "repeat_one" ? "one" : (mode === "repeat_all" || mode === "repeat_category") ? "all" : "off";
  const active = vis !== "off";
  return (
    <button type="button" onClick={onClick} title={vis === "one" ? "Repeat one" : vis === "all" ? "Repeat all" : "Repeat off"} style={{
      width: 40, height: 40, borderRadius: 10, cursor: "pointer", position: "relative",
      background: active ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
      border: `1px solid ${active ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.1)"}`,
      color: vis === "one" ? "#EC4899" : active ? "#fff" : "rgba(255,255,255,0.55)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
      </svg>
      {vis === "one" && (
        <span style={{
          position: "absolute", top: -3, right: -3, width: 12, height: 12, borderRadius: "50%",
          background: "#EC4899", color: "#fff", fontSize: 7, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>1</span>
      )}
    </button>
  );
}

export default function NowPlayingFullscreen({
  open, onClose, onPlayPause, onNext, onPrev, progress, isPlaying,
}: Props) {
  const {
    currentSong, currentTime, duration, unifiedQueue,
    volume, setVolume, shuffleMode, repeatMode, cycleShuffleMode, cycleRepeatMode,
  } = usePlayerStore();
  const { lyricsOffsetMs, coverArtStyle } = useSettingsStore() as {
    lyricsOffsetMs?: number;
    coverArtStyle?: "square" | "rounded" | "circle";
  };
  const { t } = useLang();

  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>("var(--accent)");
  const [mounted, setMounted] = useState(false);
  const seekRef = useRef<HTMLDivElement>(null);

  const upNext = unifiedQueue?.[0]?.song ?? null;
  const dur = duration || audioEngine.duration || 0;
  const ct = currentTime ?? audioEngine.currentTime ?? 0;

  const coverRadius = coverArtStyle === "circle"
    ? "50%"
    : coverArtStyle === "square"
      ? 4
      : 20;

  useEffect(() => {
    if (!open) {
      setMounted(false);
      return;
    }
    const id = requestAnimationFrame(() => setMounted(true));
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(id);
      document.body.style.overflow = "";
    };
  }, [open]);

  useEffect(() => {
    if (!open || !currentSong) return;
    let cancelled = false;

    (async () => {
      if (currentSong.cover_art) {
        if (!cancelled) setCoverSrc(currentSong.cover_art);
        return;
      }
      if (!currentSong.has_cover) {
        if (!cancelled) setCoverSrc(null);
        return;
      }
      try {
        const db = await getDb();
        const url = await getSongCoverArt(db, currentSong.id);
        if (!cancelled) setCoverSrc(url);
      } catch {
        if (!cancelled) setCoverSrc(null);
      }
    })();

    return () => { cancelled = true; };
  }, [open, currentSong?.id, currentSong?.cover_art, currentSong?.has_cover]);

  useEffect(() => {
    if (!coverSrc) {
      setAccent("var(--accent)");
      return;
    }
    extractDominantColor(coverSrc).then(c => {
      if (c) setAccent(c);
    });
  }, [coverSrc]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); onPlayPause(); }
      if (e.key === "ArrowRight" && !e.ctrlKey) { e.preventDefault(); onNext(); }
      if (e.key === "ArrowLeft" && !e.ctrlKey) { e.preventDefault(); onPrev(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onPlayPause, onNext, onPrev]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const bar = seekRef.current;
    if (!bar || dur <= 0) return;
    const rect = bar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioEngine.seek(pct * dur);
  }, [dur]);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    audioEngine.setVolume(v);
  }, [setVolume]);

  if (!open || !currentSong) return null;

  const accentGlow = accent.startsWith("#") ? `${accent}55` : "rgba(124,58,237,0.35)";

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={t.nowPlayingTitle}
      style={{
        position: "fixed", inset: 0, zIndex: 5000,
        display: "flex", flexDirection: "column",
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.35s ease",
      }}
    >
      {/* Ambient background */}
      <div style={{ position: "absolute", inset: 0, overflow: "hidden", background: "#070718" }}>
        {coverSrc ? (
          <>
            <img
              src={coverSrc}
              alt=""
              aria-hidden
              style={{
                position: "absolute", inset: "-20%",
                width: "140%", height: "140%",
                objectFit: "cover",
                filter: "blur(60px) saturate(1.4) brightness(0.45)",
                transform: "scale(1.1)",
              }}
            />
            <div style={{
              position: "absolute", inset: 0,
              background: `linear-gradient(135deg, ${accentGlow} 0%, rgba(7,7,24,0.92) 45%, rgba(7,7,24,0.98) 100%)`,
            }} />
          </>
        ) : (
          <div style={{
            position: "absolute", inset: 0,
            background: "linear-gradient(160deg, #0f0a1e 0%, #070718 50%, #0a1020 100%)",
          }} />
        )}
        <div style={{
          position: "absolute", inset: 0,
          background: "radial-gradient(ellipse 80% 60% at 30% 40%, rgba(255,255,255,0.04), transparent 70%)",
          pointerEvents: "none",
        }} />
      </div>

      {/* Header */}
      <header style={{
        position: "relative", zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 28px 0", flexShrink: 0,
      }}>
        <div>
          <p style={{
            fontSize: 11, fontWeight: 700, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "rgba(255,255,255,0.45)", margin: 0,
          }}>
            {t.nowPlayingTitle}
          </p>
          {isPlaying && (
            <p style={{ fontSize: 10, color: accent, margin: "4px 0 0", fontWeight: 600 }}>
              ● {t.nowPlayingLive}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "8px 14px",
            color: "rgba(255,255,255,0.7)",
            cursor: "pointer", fontFamily: "inherit", fontSize: 12,
            transition: "background 0.15s, color 0.15s",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
        >
          <IconClose />
          {t.closeFullscreen}
          <kbd style={{
            marginLeft: 4, padding: "1px 5px", borderRadius: 4, fontSize: 9,
            background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.15)",
            fontFamily: "'Space Mono', monospace",
          }}>Esc</kbd>
        </button>
      </header>

      {/* Main content */}
      <div
        className="np-fs-body"
        onClick={onClose}
        style={{
          position: "relative", zIndex: 1, flex: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: "24px 28px 32px", minHeight: 0,
        }}
      >
        <div
          className="np-fs-inner"
          onClick={e => e.stopPropagation()}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 1.1fr)",
            gap: 48, alignItems: "center",
            width: "100%", maxWidth: 1100,
            transform: mounted ? "translateY(0) scale(1)" : "translateY(24px) scale(0.97)",
            opacity: mounted ? 1 : 0,
            transition: "transform 0.45s cubic-bezier(0.22,1,0.36,1), opacity 0.4s ease",
          }}
        >
          {/* Cover */}
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
            <div style={{
              position: "relative",
              width: "min(42vw, 480px)",
              maxWidth: "100%",
              aspectRatio: "1",
            }}>
              <div style={{
                position: "absolute", inset: "-8%",
                borderRadius: typeof coverRadius === "number" ? coverRadius + 24 : "50%",
                background: `radial-gradient(circle, ${accentGlow} 0%, transparent 70%)`,
                filter: "blur(20px)",
                opacity: 0.9,
              }} />
              {coverSrc ? (
                <img
                  src={coverSrc}
                  alt=""
                  style={{
                    position: "relative", width: "100%", height: "100%",
                    objectFit: "cover",
                    borderRadius: coverRadius,
                    boxShadow: `0 32px 80px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.08), 0 0 60px ${accentGlow}`,
                  }}
                />
              ) : (
                <div style={{
                  width: "100%", height: "100%",
                  borderRadius: coverRadius,
                  background: `linear-gradient(135deg, ${accent}, var(--accent-pink, #EC4899))`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 80, color: "rgba(255,255,255,0.25)",
                  boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
                }}>♪</div>
              )}
            </div>
          </div>

          {/* Meta + controls */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18, minWidth: 0 }}>
            <div>
              <h1 style={{
                fontWeight: 800, fontSize: "clamp(1.5rem, 3vw, 2.25rem)",
                lineHeight: 1.15, letterSpacing: "-0.03em",
                color: "#fff", margin: "0 0 10px",
                overflow: "hidden", textOverflow: "ellipsis",
                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
              }}>
                {currentSong.title}
              </h1>
              <p style={{
                fontSize: "clamp(0.95rem, 1.5vw, 1.125rem)",
                color: "rgba(255,255,255,0.55)", margin: "0 0 14px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {currentSong.artist}
                {currentSong.album ? ` · ${currentSong.album}` : ""}
              </p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {currentSong.format && (
                  <Badge label={currentSong.format} accent={accent} />
                )}
                {currentSong.bitrate ? (
                  <Badge label={`${currentSong.bitrate} kbps`} />
                ) : null}
                {currentSong.stars ? (
                  <Badge label={"★".repeat(currentSong.stars)} accent={accent} />
                ) : null}
              </div>
            </div>

            {/* Multi-line synced lyrics */}
            <div style={{
              minHeight: 80, padding: "10px 12px",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 12,
            }}>
              {currentSong.path && (
                <FullscreenLyrics
                  songPath={currentSong.path}
                  currentTime={ct}
                  offsetMs={lyricsOffsetMs ?? 0}
                  accent={accent}
                />
              )}
            </div>

            {/* Seek */}
            <div>
              <div
                ref={seekRef}
                onClick={handleSeek}
                style={{
                  height: 6, borderRadius: 3, cursor: "pointer",
                  background: "rgba(255,255,255,0.12)",
                  position: "relative", overflow: "hidden",
                }}
              >
                <div style={{
                  height: "100%", width: `${progress}%`,
                  background: `linear-gradient(90deg, ${accent}, var(--accent-pink, #EC4899))`,
                  borderRadius: 3,
                  transition: "width 0.25s linear",
                  boxShadow: `0 0 12px ${accentGlow}`,
                }} />
                <div style={{
                  position: "absolute", top: "50%", left: `${progress}%`,
                  transform: "translate(-50%, -50%)",
                  width: 14, height: 14, borderRadius: "50%",
                  background: "#fff",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                  opacity: dur > 0 ? 1 : 0,
                  transition: "left 0.25s linear",
                }} />
              </div>
              <div style={{
                display: "flex", justifyContent: "space-between",
                marginTop: 8, fontSize: 11,
                fontFamily: "'Space Mono', monospace",
                color: "rgba(255,255,255,0.4)",
              }}>
                <span>{fmt(ct)}</span>
                <span>{fmt(dur)}</span>
              </div>
            </div>

            {/* Transport + shuffle/repeat + volume */}
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16 }}>
                <FsShuffleBtn mode={shuffleMode ?? "off"} onClick={cycleShuffleMode} />
                <TransportBtn onClick={onPrev} label={t.nowPlayingPrev}>
                  <IconPrev />
                </TransportBtn>
                <button
                  type="button"
                  onClick={onPlayPause}
                  style={{
                    width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
                    background: `linear-gradient(135deg, ${accent}, var(--accent-pink, #EC4899))`,
                    border: "none", color: "white", cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: `0 8px 32px ${accentGlow}`,
                    transition: "transform 0.15s, box-shadow 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.06)"; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
                >
                  {isPlaying ? <IconPause /> : <IconPlay />}
                </button>
                <TransportBtn onClick={onNext} label={t.nowPlayingNext}>
                  <IconNext />
                </TransportBtn>
                <FsRepeatBtn mode={repeatMode ?? "all_stop"} onClick={cycleRepeatMode} />
              </div>

              <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 12px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <button
                  type="button"
                  onClick={() => handleVolumeChange(volume === 0 ? 80 : 0)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: volume === 0 ? "#f87171" : "rgba(255,255,255,0.65)",
                    padding: 4, display: "flex",
                  }}
                >
                  <IconVolume muted={volume === 0} low={volume > 0 && volume < 50} />
                </button>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={volume}
                  onChange={e => handleVolumeChange(+e.target.value)}
                  style={{ flex: 1, cursor: "pointer", accentColor: accent.startsWith("#") ? accent : "#7C3AED" }}
                />
                <span style={{
                  fontSize: 10, fontFamily: "'Space Mono', monospace",
                  color: "rgba(255,255,255,0.4)", minWidth: 28, textAlign: "right",
                }}>
                  {volume}%
                </span>
              </div>
            </div>

            {/* Up next */}
            {upNext && (
              <div style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "10px 14px", borderRadius: 10,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  textTransform: "uppercase", color: "rgba(255,255,255,0.35)",
                  flexShrink: 0,
                }}>
                  {t.upNext}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{
                    margin: 0, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {upNext.title}
                  </p>
                  <p style={{
                    margin: 0, fontSize: 11, color: "rgba(255,255,255,0.4)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {upNext.artist}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 860px) {
          .np-fs-inner {
            grid-template-columns: 1fr !important;
            gap: 28px !important;
            text-align: center;
          }
          .np-fs-inner > div:first-child > div {
            width: min(72vw, 360px) !important;
          }
        }
      `}</style>
    </div>
  );
}

function Badge({ label, accent }: { label: string; accent?: string }) {
  return (
    <span style={{
      fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
      background: accent ? `${accent}22` : "rgba(255,255,255,0.06)",
      border: `1px solid ${accent ? `${accent}44` : "rgba(255,255,255,0.1)"}`,
      color: accent ?? "rgba(255,255,255,0.5)",
    }}>
      {label}
    </span>
  );
}

function TransportBtn({ children, onClick, label }: {
  children: React.ReactNode; onClick: () => void; label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      style={{
        width: 52, height: 52, borderRadius: "50%",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "rgba(255,255,255,0.75)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.15s, transform 0.15s, color 0.15s",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "rgba(255,255,255,0.12)";
        e.currentTarget.style.color = "#fff";
        e.currentTarget.style.transform = "scale(1.08)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "rgba(255,255,255,0.06)";
        e.currentTarget.style.color = "rgba(255,255,255,0.75)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      {children}
    </button>
  );
}
