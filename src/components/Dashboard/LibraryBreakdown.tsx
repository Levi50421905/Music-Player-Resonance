/**
 * LibraryBreakdown — top artists, albums, and format mix from library metadata.
 */

import { useMemo } from "react";
import type { Song } from "../../lib/db";
import type { Lang } from "../../lib/i18n";

export interface BreakdownEntry {
  name: string;
  subtitle?: string;
  tracks: number;
  plays: number;
}

export interface FormatEntry {
  format: string;
  count: number;
  pct: number;
}

const ALBUM_KEY_SEP = "\x00";

function albumLookupKey(s: Song): string | null {
  const album = s.album?.trim();
  if (!album) return null;
  const lower = album.toLowerCase();
  if (lower === "unknown" || lower === "unknown album") return null;
  const artist = s.artist?.trim() || "Unknown";
  return `${artist}${ALBUM_KEY_SEP}${album}`;
}

export function buildLibraryBreakdown(songs: Song[]) {
  const albums = new Map<string, { tracks: number; plays: number; album: string; artist: string }>();
  const artists = new Map<string, { tracks: number; plays: number }>();
  const formats = new Map<string, number>();

  for (const s of songs) {
    const artist = s.artist?.trim() || "Unknown";
    const fmt = s.format?.trim().toUpperCase() || "UNKNOWN";
    const plays = s.play_count ?? 0;

    const albumKey = albumLookupKey(s);
    if (albumKey) {
      const existing = albums.get(albumKey) ?? {
        tracks: 0,
        plays: 0,
        artist,
        album: s.album.trim(),
      };
      existing.tracks++;
      existing.plays += plays;
      albums.set(albumKey, existing);
    }

    const a = artists.get(artist) ?? { tracks: 0, plays: 0 };
    a.tracks++;
    a.plays += plays;
    artists.set(artist, a);

    formats.set(fmt, (formats.get(fmt) ?? 0) + 1);
  }

  const sortByPlays = <T extends { tracks: number; plays: number }>(entries: [string, T][]) =>
    entries.sort((x, y) => y[1].plays - x[1].plays || y[1].tracks - x[1].tracks);

  const allArtists: BreakdownEntry[] = sortByPlays([...artists.entries()])
    .map(([name, v]) => ({ name, tracks: v.tracks, plays: v.plays }));

  const allAlbums: BreakdownEntry[] = sortByPlays([...albums.entries()])
    .map(([, v]) => ({
      name: v.album,
      subtitle: v.artist,
      tracks: v.tracks,
      plays: v.plays,
    }));

  const topArtists = allArtists.slice(0, 6);
  const topAlbums = allAlbums.slice(0, 6);

  const total = songs.length || 1;
  const formatList: FormatEntry[] = [...formats.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([format, count]) => ({ format, count, pct: Math.round((count / total) * 100) }));

  return { topArtists, topAlbums, allArtists, allAlbums, formats: formatList };
}

interface Props {
  lang: Lang;
  songs: Song[];
  t: {
    topArtists: string;
    topAlbums: string;
    formatMix: string;
    breakdownTracks: (n: number) => string;
    breakdownPlays: (n: number) => string;
    playArtist: string;
    playAlbum: string;
    seeAll: string;
  };
  onPlayArtist?: (artist: string, songs: Song[]) => void;
  onPlayAlbum?: (album: string, artist: string, songs: Song[]) => void;
  onSeeAllArtists?: () => void;
  onSeeAllAlbums?: () => void;
  allArtistsCount?: number;
  allAlbumsCount?: number;
}

function BarList({
  items,
  max,
  onPlay,
  playLabel,
  tracksLabel,
  playsLabel,
}: {
  items: BreakdownEntry[];
  max: number;
  onPlay?: (item: BreakdownEntry) => void;
  playLabel: string;
  tracksLabel: (n: number) => string;
  playsLabel: (n: number) => string;
}) {
  if (items.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "var(--text-faint)", margin: 0, padding: "8px 0" }}>
        —
      </p>
    );
  }

  const fallbackMax = Math.max(...items.map(i => i.tracks), 1);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {items.map(item => {
        const intensity = max > 0 && item.plays > 0
          ? item.plays / max
          : item.tracks / fallbackMax;
        const widthPct = Math.max(item.plays > 0 || item.tracks > 0 ? 8 : 0, Math.round(intensity * 100));

        return (
          <button
            key={`${item.name}-${item.subtitle ?? ""}`}
            type="button"
            onClick={() => onPlay?.(item)}
            disabled={!onPlay}
            title={onPlay ? playLabel : undefined}
            style={{
              display: "block", width: "100%", textAlign: "left",
              background: "transparent", border: "none", padding: "5px 6px", margin: "0 -6px",
              borderRadius: "var(--radius-sm)",
              cursor: onPlay ? "pointer" : "default", fontFamily: "inherit",
              transition: "background 0.12s",
            }}
            onMouseEnter={e => { if (onPlay) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
          >
            <div style={{
              fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              marginBottom: 2,
            }}>
              {item.name}
            </div>
            <div style={{
              fontSize: 10, color: "var(--text-muted)", marginBottom: 6,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              minHeight: 14,
            }}>
              {item.subtitle ?? tracksLabel(item.tracks)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                flex: 1, height: 5, borderRadius: 999, background: "var(--bg-muted)",
                overflow: "hidden",
              }}>
                <div style={{
                  width: `${widthPct}%`, height: "100%", borderRadius: 999,
                  background: "linear-gradient(90deg, var(--accent), #EC4899)",
                  boxShadow: widthPct > 0 ? "0 0 8px rgba(124,58,237,0.35)" : "none",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <span style={{
                fontSize: 10, color: "var(--text-muted)", flexShrink: 0,
                fontFamily: "'Space Mono', monospace", minWidth: 52, textAlign: "right",
              }}>
                {item.plays > 0 ? playsLabel(item.plays) : ""}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function ColumnHeader({ title, onSeeAll, seeAllLabel }: {
  title: string;
  onSeeAll?: () => void;
  seeAllLabel?: string;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
      margin: "0 0 12px", paddingBottom: 8, borderBottom: "1px solid var(--border-subtle)",
    }}>
      <p style={{
        fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
        margin: 0, letterSpacing: "0.02em",
      }}>
        {title}
      </p>
      {onSeeAll && seeAllLabel && (
        <button
          type="button"
          onClick={onSeeAll}
          style={{
            fontSize: 10, fontWeight: 600, color: "var(--accent-light)",
            background: "transparent", border: "none", cursor: "pointer",
            padding: "2px 4px", fontFamily: "inherit", flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
        >
          {seeAllLabel}
        </button>
      )}
    </div>
  );
}

export default function LibraryBreakdown({
  lang, songs, t, onPlayArtist, onPlayAlbum,
  onSeeAllArtists, onSeeAllAlbums, allArtistsCount, allAlbumsCount,
}: Props) {
  const data = useMemo(() => buildLibraryBreakdown(songs), [songs]);
  const maxArtistPlays = Math.max(...data.topArtists.map(a => a.plays), 1);
  const maxAlbumPlays = Math.max(...data.topAlbums.map(a => a.plays), 1);

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

  const songsByAlbum = useMemo(() => {
    const map = new Map<string, Song[]>();
    for (const s of songs) {
      const key = albumLookupKey(s);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(s);
      map.set(key, list);
    }
    return map;
  }, [songs]);

  return (
    <div style={{
      background: "var(--bg-overlay)", border: "1px solid var(--border)",
      borderRadius: "var(--radius-lg)", padding: "16px 18px",
    }}>
      <div style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 0.9fr)",
        gap: 24,
        alignItems: "start",
      }}>
        <div>
          <ColumnHeader
            title={t.topArtists}
            seeAllLabel={t.seeAll}
            onSeeAll={(allArtistsCount ?? data.allArtists.length) > 6 ? onSeeAllArtists : undefined}
          />
          <BarList
            items={data.topArtists}
            max={maxArtistPlays}
            onPlay={onPlayArtist ? (item) => {
              const list = songsByArtist.get(item.name);
              if (list?.length) onPlayArtist(item.name, list);
            } : undefined}
            playLabel={t.playArtist}
            tracksLabel={t.breakdownTracks}
            playsLabel={t.breakdownPlays}
          />
        </div>

        <div>
          <ColumnHeader
            title={t.topAlbums}
            seeAllLabel={t.seeAll}
            onSeeAll={(allAlbumsCount ?? data.allAlbums.length) > 6 ? onSeeAllAlbums : undefined}
          />
          <BarList
            items={data.topAlbums}
            max={maxAlbumPlays}
            onPlay={onPlayAlbum ? (item) => {
              const key = item.subtitle
                ? `${item.subtitle}${ALBUM_KEY_SEP}${item.name}`
                : null;
              const list = key ? songsByAlbum.get(key) : undefined;
              if (list?.length && item.subtitle) onPlayAlbum(item.name, item.subtitle, list);
            } : undefined}
            playLabel={t.playAlbum}
            tracksLabel={t.breakdownTracks}
            playsLabel={t.breakdownPlays}
          />
        </div>

        <div>
          <ColumnHeader title={t.formatMix} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 }}>
            {data.formats.map(f => (
              <div
                key={f.format}
                style={{
                  padding: "10px 12px", borderRadius: "var(--radius-md)",
                  background: "var(--bg-muted)", border: "1px solid var(--border-subtle)",
                }}
              >
                <div style={{
                  fontWeight: 700, fontSize: 15, color: "var(--accent-light)",
                  fontFamily: "'Space Mono', monospace", lineHeight: 1,
                }}>
                  {f.pct}%
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-secondary)", marginTop: 6 }}>
                  {f.format}
                </div>
                <div style={{ fontSize: 10, color: "var(--text-faint)", marginTop: 2 }}>
                  {lang === "id" ? `${f.count} lagu` : `${f.count} tracks`}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
