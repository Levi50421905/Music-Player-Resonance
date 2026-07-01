/**
 * albumArtFetch.ts — Fetch cover art when embedded tag is empty (Cover Art Archive)
 */

import type { Song } from "./db";

/** Best-effort cover URL from MusicBrainz release search. Returns null if not found. */
export async function fetchCoverArtUrl(song: Pick<Song, "title" | "artist" | "album">): Promise<string | null> {
  const artist = (song.artist ?? "").trim();
  const release = (song.album ?? song.title ?? "").trim();
  if (!artist || !release) return null;

  try {
    const q = encodeURIComponent(`artist:"${artist}" AND release:"${release}"`);
    const res = await fetch(
      `https://musicbrainz.org/ws/2/release/?query=${q}&fmt=json&limit=1`,
      { headers: { "User-Agent": "Sonarix/1.2 (local music player)" }, signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const mbid = data?.releases?.[0]?.id as string | undefined;
    if (!mbid) return null;

    const artRes = await fetch(
      `https://coverartarchive.org/release/${mbid}/front`,
      { redirect: "follow", signal: AbortSignal.timeout(8000) },
    );
    if (!artRes.ok) return null;
    return artRes.url;
  } catch {
    return null;
  }
}
