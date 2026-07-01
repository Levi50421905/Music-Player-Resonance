/**
 * metadataLang.ts — Pick title/artist from multi-language ID3 tags
 */

export type MetadataLangPriority = "auto" | "en" | "ja" | "id";

/** music-metadata native tags may include language variants in key suffix */
export function pickLocalizedTag(
  native: Record<string, unknown> | undefined,
  baseKey: string,
  priority: MetadataLangPriority,
  fallback: string,
): string {
  if (!native || priority === "auto") return fallback;

  const langMap: Record<string, string[]> = {
    en: ["eng", "en", "EN", "English"],
    ja: ["jpn", "ja", "JP", "Japanese"],
    id: ["ind", "id", "ID", "Indonesian"],
  };
  const codes = langMap[priority] ?? [];

  for (const code of codes) {
    for (const [key, val] of Object.entries(native)) {
      if (!key.toLowerCase().includes(baseKey.toLowerCase())) continue;
      if (key.toLowerCase().includes(code.toLowerCase()) && typeof val === "string" && val.trim()) {
        return val.trim();
      }
    }
  }
  return fallback;
}
