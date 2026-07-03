const LS_KEY = "sonarix-new-dismissed";

function loadDismissed(): Set<number> {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as number[];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<number>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify([...ids].slice(-2000)));
  } catch { /* ignore quota */ }
}

/** Mark a track as no longer "new" after ≥50% listened. */
export function dismissNewTrack(songId: number) {
  const ids = loadDismissed();
  if (ids.has(songId)) return;
  ids.add(songId);
  saveDismissed(ids);
}

/** NEW badge: added within 14 days, never played (play_count=0), not dismissed at 50%. */
export function isNewTrack(
  dateAdded?: string,
  playCount?: number,
  songId?: number,
): boolean {
  if (songId != null && loadDismissed().has(songId)) return false;
  if (!dateAdded) return false;
  if ((playCount ?? 0) > 0) return false;
  return new Date(dateAdded).getTime() > Date.now() - 14 * 86400000;
}
