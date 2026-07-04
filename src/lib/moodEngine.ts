/**
 * moodEngine.ts — Context-aware smart playlists & mood detection
 */

import type { Song, PlayRecord } from "./db";
import { generateSmartQueue } from "./smartShuffle";
import { getLang, getMoodTimeLabels, type Lang } from "./i18n";
import { parsePlayedAt } from "./parsePlayedAt";

export type TimeSlot =
  | "early_morning" | "morning" | "afternoon"
  | "evening" | "night" | "late_night";

export interface MoodContext {
  timeSlot: TimeSlot;
  dayOfWeek: number;
  hour: number;
  isWeekend: boolean;
  label: string;
  description: string;
  color: string;
}

export interface SmartMix {
  id: string;
  name: string;
  description: string;
  color: string;
  songs: Song[];
  reason: string;
}

function getTimeSlot(hour: number): TimeSlot {
  if (hour >= 5 && hour < 8) return "early_morning";
  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 21) return "evening";
  if (hour >= 21 && hour < 24) return "night";
  return "late_night";
}

export function detectMoodContext(now = new Date(), lang: Lang = getLang()): MoodContext {
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const slot = getTimeSlot(hour);
  const meta = getMoodTimeLabels(lang)[slot];
  return {
    timeSlot: slot,
    dayOfWeek,
    hour,
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    label: meta.label,
    description: meta.desc,
    color: meta.color,
  };
}

function scoreForTimeSlot(song: Song, ctx: MoodContext): number {
  const bpm = song.bpm ?? 0;
  const stars = song.stars ?? 0;
  const plays = song.play_count ?? 0;

  switch (ctx.timeSlot) {
    case "early_morning":
      return (bpm > 0 && bpm < 100 ? 2 : bpm === 0 ? 0.5 : -1) + stars * 0.3;
    case "morning":
      return (bpm >= 100 && bpm <= 130 ? 2 : bpm > 130 ? 1 : 0) + stars * 0.2 + (plays > 0 ? 0.3 : 0);
    case "afternoon":
      return (bpm >= 90 && bpm <= 120 ? 1.5 : 0) + stars * 0.3;
    case "evening":
      return (bpm >= 70 && bpm <= 110 ? 2 : 0) + stars * 0.4;
    case "night":
      return (bpm > 0 && bpm < 95 ? 2 : bpm === 0 ? 0.8 : -0.5) + stars * 0.3;
    case "late_night":
      return (bpm > 0 && bpm < 85 ? 2.5 : bpm === 0 ? 1 : -1) + stars * 0.2;
    default:
      return 0;
  }
}

function scoreWeekend(song: Song, ctx: MoodContext): number {
  if (!ctx.isWeekend) return 0;
  const bpm = song.bpm ?? 0;
  return bpm >= 110 && bpm <= 140 ? 1.5 : 0;
}

function scoreGenreAffinity(song: Song, ctx: MoodContext): number {
  const genre = (song.genre ?? "").toLowerCase();
  const map: Partial<Record<TimeSlot, string[]>> = {
    morning: ["pop", "dance", "electronic", "rock"],
    afternoon: ["indie", "alternative", "jazz", "lo-fi"],
    evening: ["r&b", "soul", "acoustic", "jazz"],
    night: ["ambient", "chill", "lo-fi", "classical"],
    late_night: ["ambient", "classical", "jazz", "instrumental"],
  };
  const tags = map[ctx.timeSlot] ?? [];
  return tags.some(t => genre.includes(t)) ? 1.2 : 0;
}

export function scoreSongForContext(song: Song, ctx: MoodContext): number {
  return scoreForTimeSlot(song, ctx) + scoreWeekend(song, ctx) + scoreGenreAffinity(song, ctx);
}

export function buildContextPlaylist(
  songs: Song[],
  ctx: MoodContext,
  maxTracks = 40,
): Song[] {
  return songs
    .map(s => ({ song: s, score: scoreSongForContext(s, ctx) }))
    .filter(x => x.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTracks)
    .map(x => x.song);
}

export function buildSmartMix(
  songs: Song[],
  history: PlayRecord[],
  ctx: MoodContext,
): SmartMix {
  const contextSongs = buildContextPlaylist(songs, ctx, 60);
  const pool = contextSongs.length >= 8 ? contextSongs : songs;
  const mixed = generateSmartQueue(pool, history).slice(0, 35);

  return {
    id: `mix-${ctx.timeSlot}`,
    name: `${ctx.label} Mix`,
    description: `Smart mix for ${ctx.description.toLowerCase()}${ctx.isWeekend ? " · weekend" : ""}`,
    color: ctx.color,
    songs: mixed,
    reason: `Detected ${ctx.label} (${ctx.hour}:00) · ${mixed.length} tracks curated`,
  };
}

export interface MoodCategory {
  id: string;
  name: string;
  desc: string;
  color: string;
  score: (song: Song, ctx: MoodContext) => number;
  minScore: number;
  maxTracks?: number;
}

export const MOOD_CATEGORIES: MoodCategory[] = [
  {
    id: "now", name: "Right Now", desc: "Auto-detected for current time",
    color: "#7C3AED",
    score: (s, ctx) => scoreSongForContext(s, ctx),
    minScore: 0.5, maxTracks: 40,
  },
  {
    id: "energy", name: "High Energy", desc: "Fast tracks, high BPM",
    color: "#EF4444",
    score: (s) => {
      const bpm = s.bpm ?? 0;
      if (bpm === 0) return -1;
      return (bpm > 128 ? (bpm - 128) / 20 : -2) + (s.stars ?? 3) * 0.5;
    },
    minScore: 0.5, maxTracks: 30,
  },
  {
    id: "chill", name: "Chill", desc: "Slow tempo, relaxed",
    color: "#06B6D4",
    score: (s) => {
      const bpm = s.bpm ?? 80;
      const bpmScore = bpm < 90 ? (90 - bpm) / 30 : bpm < 110 ? 0.3 : -1;
      return bpmScore + (s.stars ?? 3) * 0.4;
    },
    minScore: 0.5, maxTracks: 30,
  },
  {
    id: "focus", name: "Focus", desc: "Steady tempo for concentration",
    color: "#3B82F6",
    score: (s) => {
      const bpm = s.bpm ?? 0;
      return bpm >= 80 && bpm <= 110 ? 2 : 0;
    },
    minScore: 1, maxTracks: 25,
  },
  {
    id: "top", name: "Top Rated", desc: "4 stars and above",
    color: "#F59E0B",
    score: (s) => (s.stars ?? 0) - 3.5,
    minScore: 0.5, maxTracks: 50,
  },
  {
    id: "forgotten", name: "Forgotten Gems", desc: "Never played before",
    color: "#8B5CF6",
    score: (s) => (s.play_count ?? 0) === 0 ? 1 : -1,
    minScore: 0.9, maxTracks: 40,
  },
  {
    id: "weekend", name: "Weekend Vibes", desc: "Upbeat picks for Sat/Sun",
    color: "#EC4899",
    score: (s, ctx) => ctx.isWeekend ? scoreWeekend(s, ctx) + (s.stars ?? 0) * 0.2 : -1,
    minScore: 0.8, maxTracks: 35,
  },
  {
    id: "discovery", name: "Discover", desc: "Unrated tracks to explore",
    color: "#10B981",
    score: (s) => (!s.stars || s.stars === 0) ? 1 : -1,
    minScore: 0.9, maxTracks: 20,
  },
];

export function generateMoodPlaylist(
  mood: MoodCategory,
  songs: Song[],
  ctx: MoodContext,
): Song[] {
  return songs
    .map(s => ({ song: s, score: mood.score(s, ctx) }))
    .filter(x => x.score >= mood.minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, mood.maxTracks ?? 50)
    .map(x => x.song);
}

/** Consecutive days with at least one play (ending today or yesterday). */
export function getListeningStreak(history: PlayRecord[]): number {
  if (history.length === 0) return 0;

  const daySet = new Set<string>();
  for (const r of history) {
    const d = parsePlayedAt(r.played_at);
    daySet.add(`${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let streak = 0;
  let cursor = new Date(today);

  // Allow streak to start from yesterday if nothing played yet today
  const todayKey = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
  if (!daySet.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }

  for (let i = 0; i < 365; i++) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}-${cursor.getDate()}`;
    if (!daySet.has(key)) break;
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Build "continue yesterday's session" playlist — songs played at similar
 * time-of-day on the previous calendar day (±1 hour window).
 */
export function buildSessionContinuation(
  history: PlayRecord[],
  songs: Song[],
  now = new Date(),
): { songs: Song[]; label: string } | null {
  if (history.length === 0 || songs.length === 0) return null;

  const hour = now.getHours();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yEnd = new Date(yesterday);
  yEnd.setHours(23, 59, 59, 999);

  const windowStart = Math.max(0, hour - 1);
  const windowEnd   = Math.min(23, hour + 1);

  const seen = new Set<number>();
  const result: Song[] = [];

  for (const r of history) {
    const t = parsePlayedAt(r.played_at);
    if (t < yesterday || t > yEnd) continue;
    const h = t.getHours();
    if (h < windowStart || h > windowEnd) continue;
    if (seen.has(r.song_id)) continue;
    seen.add(r.song_id);
    const song = songs.find(s => s.id === r.song_id);
    if (song) result.push(song);
  }

  if (result.length < 3) return null;

  const label = hour < 12 ? "Lanjutkan sesi pagi kemarin"
    : hour < 17 ? "Lanjutkan sesi siang kemarin"
    : hour < 21 ? "Lanjutkan sesi sore kemarin"
    : "Lanjutkan sesi malam kemarin";

  return { songs: result.slice(0, 30), label };
}

export function getResumeQueueInfo(): { songTitle: string; queueRemaining: number; contextName: string } | null {
  try {
    const raw = localStorage.getItem("sonarix-player-v1");
    if (!raw) return null;
    const data = JSON.parse(raw);
    const state = data?.state;
    if (!state?.currentSong) return null;
    const upcoming = Array.isArray(state.upcomingQueue) ? state.upcomingQueue.length : 0;
    const manual = Array.isArray(state.manualQueue) ? state.manualQueue.length : 0;
    return {
      songTitle: state.currentSong.title ?? "Unknown",
      queueRemaining: upcoming + manual,
      contextName: state.contextName ?? "",
    };
  } catch {
    return null;
  }
}

export interface ListeningInsight {
  topGenreAtHour: string;
  topArtistWeek: string;
  peakHour: string;
  playsThisWeek: number;
}

export function buildListeningInsights(
  history: PlayRecord[],
  songs: Song[],
): ListeningInsight | null {
  if (history.length === 0 || songs.length === 0) return null;
  const byId = new Map(songs.map(s => [s.id, s]));
  const hour = new Date().getHours();

  const hourPlays = history.filter(h => parsePlayedAt(h.played_at).getHours() === hour);
  const genreCount = new Map<string, number>();
  for (const h of hourPlays) {
    const g = byId.get(h.song_id)?.genre ?? "Unknown";
    genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
  }
  const topGenreAtHour = [...genreCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekPlays = history.filter(h => parsePlayedAt(h.played_at).getTime() >= weekAgo);
  const artistCount = new Map<string, number>();
  for (const h of weekPlays) {
    const a = byId.get(h.song_id)?.artist ?? "Unknown";
    artistCount.set(a, (artistCount.get(a) ?? 0) + 1);
  }
  const topArtistWeek = [...artistCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "—";

  const hourCounts = new Array(24).fill(0);
  for (const h of history) hourCounts[parsePlayedAt(h.played_at).getHours()]++;
  const peak = hourCounts.indexOf(Math.max(...hourCounts));
  const peakHour = `${peak}:00`;

  return {
    topGenreAtHour,
    topArtistWeek,
    peakHour,
    playsThisWeek: weekPlays.length,
  };
}

/** Combine multiple mood categories into one mixed playlist. */
export function buildMixFromMoods(
  moodIds: string[],
  songs: Song[],
  ctx: MoodContext,
  maxTracks = 40,
): Song[] {
  const picked = new Map<number, Song>();
  for (const id of moodIds) {
    const mood = MOOD_CATEGORIES.find(m => m.id === id);
    if (!mood) continue;
    for (const s of generateMoodPlaylist(mood, songs, ctx)) {
      picked.set(s.id, s);
      if (picked.size >= maxTracks) break;
    }
  }
  return [...picked.values()].sort(() => Math.random() - 0.5);
}
