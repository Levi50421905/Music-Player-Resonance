/**
 * radioEngine.ts — Smart & plain radio queue generation
 */

import type { Song, PlayRecord } from "./db";
import { detectMoodContext, generateMoodPlaylist, MOOD_CATEGORIES } from "./moodEngine";
import { generateSmartQueue } from "./smartShuffle";

export type RadioSource = "library" | "same_genre" | "same_artist" | "smart" | "smart_mood";

export function pickRadioPool(
  songs: Song[],
  source: RadioSource,
  currentSong: Song | null,
  smartMood: boolean,
): Song[] {
  if (songs.length === 0) return [];

  switch (source) {
    case "same_genre": {
      if (!currentSong?.genre) return songs;
      const g = currentSong.genre.toLowerCase();
      const pool = songs.filter(s => (s.genre ?? "").toLowerCase() === g);
      return pool.length >= 5 ? pool : songs;
    }
    case "same_artist": {
      if (!currentSong?.artist) return songs;
      const a = currentSong.artist.toLowerCase();
      const pool = songs.filter(s => (s.artist ?? "").toLowerCase() === a);
      return pool.length >= 3 ? pool : songs;
    }
    case "smart_mood": {
      const ctx = detectMoodContext();
      const mood = MOOD_CATEGORIES[0];
      const list = generateMoodPlaylist(mood, songs, ctx);
      return list.length >= 5 ? list : songs;
    }
    case "smart":
      return songs;
    default:
      return songs;
  }
}

export function generateRadioQueue(
  songs: Song[],
  history: PlayRecord[],
  options: {
    source: RadioSource;
    smartMood: boolean;
    currentSong: Song | null;
    count?: number;
  },
): Song[] {
  const pool = pickRadioPool(songs, options.source, options.currentSong, options.smartMood);
  const count = options.count ?? 25;

  if (options.source === "smart" || options.source === "smart_mood" || options.smartMood) {
    return generateSmartQueue(pool, history).slice(0, count);
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/** Pick one random song without building a queue (continuous mix). */
export function pickRandomNextSong(
  songs: Song[],
  current: Song | null,
  history: PlayRecord[],
): Song | null {
  if (songs.length === 0) return null;
  const recentIds = new Set(history.slice(0, 25).map(h => h.song_id));
  const excludeId = current?.id;
  let pool = songs.filter(s => s.id !== excludeId && !recentIds.has(s.id));
  if (pool.length === 0) pool = songs.filter(s => s.id !== excludeId);
  if (pool.length === 0) pool = songs;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}
