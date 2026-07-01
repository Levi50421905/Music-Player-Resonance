/** Hide the static HTML splash (index.html) after app is ready. */
export function hideAppSplash(): void {
  const el = document.getElementById("app-splash");
  if (!el || el.classList.contains("app-splash--out")) return;
  el.classList.add("app-splash--out");
  window.setTimeout(() => el.remove(), 520);
}
