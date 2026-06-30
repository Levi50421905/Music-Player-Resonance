/**
 * audioQuality.ts — Format & quality badge helpers
 */

import type { Song } from "./db";

export interface QualityInfo {
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  borderColor: string;
  tier: "lossless" | "high" | "standard" | "low";
}

function formatKhz(sampleRate: number): string {
  if (sampleRate >= 1000) return `${(sampleRate / 1000).toFixed(1)}kHz`;
  return `${sampleRate}Hz`;
}

export function getQualityFromSong(song: Song | null): QualityInfo | null {
  if (!song) return null;

  const fmt = (song.format ?? "").toUpperCase();
  const bitrate = song.bitrate ?? 0;
  const sampleRate = (song as any).sample_rate as number | undefined;
  const bits = (song as any).bits_per_sample as number | undefined;

  if (["FLAC", "ALAC", "APE", "WAV"].includes(fmt)) {
    const sr = sampleRate ? formatKhz(sampleRate) : "";
    const bit = bits ? `${bits}-bit` : "";
    const parts = [bit, sr].filter(Boolean);
    const label = parts.length ? `${fmt} · ${parts.join(" ")}` : `${fmt} · Lossless`;
    return {
      label,
      shortLabel: parts.length ? `${bit} ${sr}`.trim() : fmt,
      color: "#FBBF24",
      bgColor: "rgba(251,191,36,0.12)",
      borderColor: "rgba(251,191,36,0.35)",
      tier: "lossless",
    };
  }

  if (fmt === "M4A" || fmt === "MP4" || fmt === "AAC") {
    const sr = sampleRate ? ` · ${formatKhz(sampleRate)}` : "";
    return {
      label: `${fmt}${bitrate ? ` · ${bitrate} kbps` : ""}${sr}`,
      shortLabel: bitrate ? `${bitrate}k AAC` : fmt,
      color: "#34D399",
      bgColor: "rgba(52,211,153,0.1)",
      borderColor: "rgba(52,211,153,0.3)",
      tier: "high",
    };
  }

  if (fmt === "OGG" || fmt === "OPUS") {
    return {
      label: `${fmt}${bitrate ? ` · ${bitrate} kbps` : ""}`,
      shortLabel: bitrate ? `${bitrate}k ${fmt}` : fmt,
      color: "#60A5FA",
      bgColor: "rgba(96,165,250,0.1)",
      borderColor: "rgba(96,165,250,0.3)",
      tier: "high",
    };
  }

  if (fmt === "MP3") {
    const tier = bitrate >= 256 ? "high" : bitrate >= 192 ? "standard" : "low";
    const color = bitrate >= 256 ? "#A78BFA" : bitrate >= 192 ? "#94A3B8" : "#64748B";
    return {
      label: `MP3 · ${bitrate || "?"} kbps`,
      shortLabel: `${bitrate || "?"}k MP3`,
      color,
      bgColor: `${color}18`,
      borderColor: `${color}40`,
      tier,
    };
  }

  if (fmt === "WMA") {
    return {
      label: `WMA · ${bitrate || "?"} kbps`,
      shortLabel: `${bitrate || "?"}k WMA`,
      color: "#FB923C",
      bgColor: "rgba(251,146,60,0.1)",
      borderColor: "rgba(251,146,60,0.3)",
      tier: "standard",
    };
  }

  return {
    label: fmt || "AUDIO",
    shortLabel: fmt || "AUDIO",
    color: "#94A3B8",
    bgColor: "rgba(148,163,184,0.1)",
    borderColor: "rgba(148,163,184,0.25)",
    tier: "standard",
  };
}
