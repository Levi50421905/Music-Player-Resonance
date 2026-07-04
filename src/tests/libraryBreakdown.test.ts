import { describe, it, expect } from "vitest";
import { buildLibraryBreakdown } from "../components/Dashboard/LibraryBreakdown";
import type { Song } from "../lib/db";

function song(partial: Partial<Song> & Pick<Song, "id">): Song {
  return {
    id: partial.id,
    path: partial.path ?? `/music/${partial.id}.mp3`,
    title: partial.title ?? "Track",
    artist: partial.artist ?? "Artist",
    album: partial.album ?? "Album",
    genre: partial.genre ?? "Pop",
    year: partial.year ?? 2024,
    duration: partial.duration ?? 200,
    bitrate: partial.bitrate ?? 320,
    format: partial.format ?? "MP3",
    cover_art: null,
    bpm: null,
    file_size: null,
    loved: 0,
    date_added: "2026-01-01",
    play_count: partial.play_count ?? 0,
    ...partial,
  };
}

describe("buildLibraryBreakdown", () => {
  it("ranks artists by total play count", () => {
    const data = buildLibraryBreakdown([
      song({ id: 1, artist: "A", play_count: 10 }),
      song({ id: 2, artist: "B", play_count: 40 }),
      song({ id: 3, artist: "A", play_count: 5 }),
    ]);
    expect(data.topArtists[0].name).toBe("B");
    expect(data.topArtists[1].name).toBe("A");
    expect(data.topArtists[1].plays).toBe(15);
  });

  it("ranks albums by play count and skips empty album names", () => {
    const data = buildLibraryBreakdown([
      song({ id: 1, artist: "NMIXX", album: "Fe3O4", play_count: 10 }),
      song({ id: 2, artist: "NMIXX", album: "Fe3O4", play_count: 5 }),
      song({ id: 3, artist: "GFRIEND", album: "Time for the Moon Night", play_count: 20 }),
      song({ id: 4, artist: "X", album: "", play_count: 99 }),
    ]);
    expect(data.topAlbums[0].name).toBe("Time for the Moon Night");
    expect(data.topAlbums[0].subtitle).toBe("GFRIEND");
    expect(data.topAlbums[1].plays).toBe(15);
    expect(data.topAlbums.some(a => a.name === "")).toBe(false);
  });

  it("computes format percentages", () => {
    const data = buildLibraryBreakdown([
      song({ id: 1, format: "FLAC" }),
      song({ id: 2, format: "FLAC" }),
      song({ id: 3, format: "MP3" }),
    ]);
    const flac = data.formats.find(f => f.format === "FLAC");
    expect(flac?.pct).toBe(67);
  });
});
