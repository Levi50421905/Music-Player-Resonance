/**
 * lastfm.ts — Last.fm scrobbling with api_sig (requires API secret)
 */

import type { Song } from "./db";
import { md5 } from "./md5";

const API_ROOT = "https://ws.audioscrobbler.com/2.0/";

function buildSig(params: Record<string, string>, secret: string): string {
  const keys = Object.keys(params).sort();
  const raw = keys.map(k => k + params[k]).join("") + secret;
  return md5(raw);
}

async function signedPost(
  params: Record<string, string>,
  apiKey: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const body: Record<string, string> = {
    ...params,
    api_key: apiKey,
    format: "json",
  };
  body.api_sig = buildSig(body, secret);

  const res = await fetch(API_ROOT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return res.json();
}

export async function scrobbleTrack(
  song: Song,
  timestamp: number,
  apiKey: string,
  sessionKey: string,
  apiSecret: string,
): Promise<boolean> {
  if (!apiKey || !sessionKey || !apiSecret) return false;
  try {
    const data = await signedPost({
      method: "track.scrobble",
      sk: sessionKey,
      artist: song.artist ?? "Unknown",
      track: song.title ?? "Unknown",
      album: song.album ?? "",
      timestamp: String(Math.floor(timestamp / 1000)),
    }, apiKey, apiSecret);
    return !data.error;
  } catch {
    return false;
  }
}

export async function updateNowPlaying(
  song: Song,
  apiKey: string,
  sessionKey: string,
  apiSecret: string,
): Promise<void> {
  if (!apiKey || !sessionKey || !apiSecret) return;
  try {
    await signedPost({
      method: "track.updateNowPlaying",
      sk: sessionKey,
      artist: song.artist ?? "Unknown",
      track: song.title ?? "Unknown",
      album: song.album ?? "",
    }, apiKey, apiSecret);
  } catch { /* optional */ }
}

/** Get session key via token (user must open auth URL once) */
export async function getSessionKey(
  apiKey: string,
  apiSecret: string,
  token: string,
): Promise<string | null> {
  try {
    const data = await signedPost({
      method: "auth.getSession",
      token,
    }, apiKey, apiSecret) as { session?: { key?: string }; error?: number };
    return data.session?.key ?? null;
  } catch {
    return null;
  }
}

export function getAuthUrl(apiKey: string): string {
  return `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(apiKey)}`;
}
