/**
 * dynamicTheme.ts — Extract accent color from cover art
 */

export function extractDominantColor(imageUrl: string): Promise<string | null> {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i], pg = data[i + 1], pb = data[i + 2], pa = data[i + 3];
          if (pa < 128) continue;
          const lum = 0.299 * pr + 0.587 * pg + 0.114 * pb;
          if (lum < 30 || lum > 220) continue;
          r += pr; g += pg; b += pb; n++;
        }
        if (n === 0) { resolve(null); return; }
        const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, "0");
        resolve(`#${hex(r)}${hex(g)}${hex(b)}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

export function applyDynamicAccent(color: string, intensity = 0.35): void {
  const root = document.documentElement;
  root.style.setProperty("--dynamic-accent", color);
  root.style.setProperty("--dynamic-accent-dim", `${color}${Math.round(intensity * 255).toString(16).padStart(2, "0")}`);
}

export function clearDynamicAccent(): void {
  const root = document.documentElement;
  root.style.removeProperty("--dynamic-accent");
  root.style.removeProperty("--dynamic-accent-dim");
}
