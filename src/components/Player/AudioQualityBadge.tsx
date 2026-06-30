/**
 * AudioQualityBadge.tsx — Format / bitrate / bit-depth badge for player bar
 */

import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Song } from "../../lib/db";
import { getQualityFromSong, type QualityInfo } from "../../lib/audioQuality";

interface Props {
  song: Song | null;
  compact?: boolean;
}

export default function AudioQualityBadge({ song, compact = false }: Props) {
  const [extra, setExtra] = useState<{ sampleRate?: number; bitsPerSample?: number }>({});

  useEffect(() => {
    if (!song?.path) { setExtra({}); return; }
    const fmt = (song.format ?? "").toUpperCase();
    const hasMeta = (song as any).sample_rate || (song as any).bits_per_sample;
    if (hasMeta) { setExtra({}); return; }

    if (!(window as any).__TAURI_INTERNALS__) return;
    if (!["FLAC", "ALAC", "M4A", "MP4", "WAV", "APE"].includes(fmt)) return;

    let cancelled = false;
    invoke<{ sampleRate?: number; bitsPerSample?: number }>("get_track_meta", { path: song.path })
      .then(meta => {
        if (cancelled) return;
        setExtra({
          sampleRate: meta?.sampleRate,
          bitsPerSample: meta?.bitsPerSample,
        });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [song?.id, song?.path, song?.format]);

  if (!song) return null;

  const enriched = extra.sampleRate || extra.bitsPerSample
    ? { ...song, sample_rate: extra.sampleRate ?? (song as any).sample_rate, bits_per_sample: extra.bitsPerSample ?? (song as any).bits_per_sample }
    : song;

  const info: QualityInfo | null = getQualityFromSong(enriched);
  if (!info) return null;

  return (
    <span
      title={info.label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: compact ? "2px 6px" : "3px 8px",
        borderRadius: 6,
        fontSize: compact ? 9 : 10,
        fontWeight: 700,
        fontFamily: "'Space Mono', monospace",
        letterSpacing: "0.02em",
        color: info.color,
        background: info.bgColor,
        border: `1px solid ${info.borderColor}`,
        flexShrink: 0,
        whiteSpace: "nowrap",
        textTransform: info.tier === "lossless" ? "none" : "uppercase",
      }}
    >
      {info.tier === "lossless" && (
        <span style={{ width: 5, height: 5, borderRadius: "50%", background: info.color, flexShrink: 0 }} />
      )}
      {compact ? info.shortLabel : info.label}
    </span>
  );
}
