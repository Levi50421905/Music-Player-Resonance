import { describe, it, expect } from "vitest";
import { parsePlayedAt, localDayKey, createPlayEvent, getPlayDay } from "../lib/parsePlayedAt";

describe("parsePlayedAt", () => {
  it("parses unix ms timestamps", () => {
    const ms = Date.UTC(2026, 6, 4, 4, 3, 0);
    const d = parsePlayedAt(String(ms));
    expect(d.getTime()).toBe(ms);
  });

  it("parses legacy SQLite UTC timestamp", () => {
    const d = parsePlayedAt("2026-07-03 19:00:00");
    expect(d.getUTCHours()).toBe(19);
    expect(d.getUTCDate()).toBe(3);
  });

  it("createPlayEvent sets play_day to local today", () => {
    const now = new Date(2026, 6, 4, 11, 0, 0);
    const event = createPlayEvent(now);
    expect(event.play_day).toBe("2026-07-04");
    expect(parsePlayedAt(event.played_at).getTime()).toBe(now.getTime());
  });

  it("getPlayDay prefers explicit play_day column", () => {
    expect(getPlayDay({
      played_at: "2026-07-01 10:00:00",
      play_day: "2026-07-04",
    })).toBe("2026-07-04");
  });
});

describe("localDayKey", () => {
  it("formats local calendar date", () => {
    expect(localDayKey(new Date(2026, 6, 4, 23, 59, 0))).toBe("2026-07-04");
  });
});
