/**
 * CoverArt.tsx — Lazy-load cover art from DB/disk
 */

import React, { useState, useEffect } from "react";
import { getDb, getSongCoverArt } from "../lib/db";

import { useSettingsStore } from "../store";

const PALETTES = [
  ["#7C3AED", "#DB2777"], ["#0EA5E9", "#10B981"], ["#F59E0B", "#EF4444"],
  ["#6366F1", "#8B5CF6"], ["#14B8A6", "#3B82F6"], ["#EC4899", "#F97316"],
  ["#8B5CF6", "#06B6D4"], ["#10B981", "#84CC16"],
];

const coverCache = new Map<number, string | null>();

interface Props {
  id: number;
  coverArt?: string | null;
  hasCover?: boolean;
  size?: number;
  style?: React.CSSProperties;
}

export default function CoverArt({ id, coverArt, hasCover, size = 48, style }: Props) {
  const coverArtStyle = useSettingsStore(s => s.coverArtStyle);
  const [src, setSrc] = useState<string | null>(coverArt ?? coverCache.get(id) ?? null);
  const radius = coverArtStyle === "circle"
    ? "50%"
    : coverArtStyle === "square"
      ? 0
      : Math.round(size * 0.14);

  useEffect(() => {
    if (coverArt) {
      setSrc(coverArt);
      coverCache.set(id, coverArt);
      return;
    }
    if (coverCache.has(id)) {
      setSrc(coverCache.get(id) ?? null);
      return;
    }
    if (!hasCover) return;

    let cancelled = false;
    (async () => {
      try {
        const db = await getDb();
        const url = await getSongCoverArt(db, id);
        if (!cancelled) {
          coverCache.set(id, url);
          setSrc(url);
        }
      } catch { /* fallback art */ }
    })();

    return () => { cancelled = true; };
  }, [id, coverArt, hasCover]);

  if (src) {
    return (
      <img
        src={src}
        width={size} height={size}
        loading="lazy"
        style={{ borderRadius: radius, objectFit: "cover", flexShrink: 0, display: "block", ...style }}
        alt=""
      />
    );
  }

  const [c1, c2] = PALETTES[id % PALETTES.length];
  const s = size;
  const circles = [
    { cx: s * 0.3, cy: s * 0.4, r: s * 0.22 },
    { cx: s * 0.65, cy: s * 0.55, r: s * 0.17 },
    { cx: s * 0.5, cy: s * 0.2, r: s * 0.12 },
  ];

  return (
    <svg width={s} height={s} style={{ borderRadius: radius, flexShrink: 0, display: "block", ...style }}>
      <defs>
        <linearGradient id={`cg${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <rect width={s} height={s} rx={radius} fill={`url(#cg${id})`} />
      {circles.map((c, i) => (
        <circle key={i} cx={c.cx} cy={c.cy} r={c.r} fill="rgba(255,255,255,0.1)" />
      ))}
      <circle cx={s / 2} cy={s / 2} r={s * 0.13} fill="rgba(0,0,0,0.4)" />
      <circle cx={s / 2} cy={s / 2} r={s * 0.055} fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

export function invalidateCoverCache(songId?: number): void {
  if (songId !== undefined) coverCache.delete(songId);
  else coverCache.clear();
}
