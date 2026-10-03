/**
 * Pan dan zoom peta hubungan. Viewport disimpan sebagai skala dan titik kiri
 * atas area yang terlihat, dalam satuan kanvas peta (`MAP_WIDTH` × `MAP_HEIGHT`),
 * lalu dipakai sebagai `viewBox` SVG.
 */
import { MAP_HEIGHT, MAP_WIDTH } from "./wallet-map";

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** Kelipatan zoom untuk tombol dan keyboard. */
export const ZOOM_STEP = 1.5;

export interface Viewport {
  scale: number;
  x: number;
  y: number;
}

export const INITIAL_VIEWPORT: Viewport = { scale: 1, x: 0, y: 0 };

function visibleSize(scale: number) {
  return { width: MAP_WIDTH / scale, height: MAP_HEIGHT / scale };
}

/** Jaga skala dalam batas dan area terlihat tetap di dalam kanvas. */
export function clampViewport(viewport: Viewport): Viewport {
  const scale = Math.min(Math.max(viewport.scale, MIN_SCALE), MAX_SCALE);
  const { width, height } = visibleSize(scale);
  return {
    scale,
    x: Math.min(Math.max(viewport.x, 0), MAP_WIDTH - width),
    y: Math.min(Math.max(viewport.y, 0), MAP_HEIGHT - height),
  };
}

/**
 * Zoom dengan titik `(px, py)` (satuan kanvas) tetap di posisi layar yang
 * sama, mis. titik di bawah kursor atau tengah dua jari.
 */
export function zoomAt(viewport: Viewport, factor: number, px: number, py: number): Viewport {
  const scale = Math.min(Math.max(viewport.scale * factor, MIN_SCALE), MAX_SCALE);
  const ratio = viewport.scale / scale;
  return clampViewport({ scale, x: px - (px - viewport.x) * ratio, y: py - (py - viewport.y) * ratio });
}

/** Zoom dari tengah area yang sedang terlihat (tombol dan keyboard). */
export function zoomCenter(viewport: Viewport, factor: number): Viewport {
  const { width, height } = visibleSize(viewport.scale);
  return zoomAt(viewport, factor, viewport.x + width / 2, viewport.y + height / 2);
}

/** Geser area terlihat sejauh `(dx, dy)` satuan kanvas. */
export function panBy(viewport: Viewport, dx: number, dy: number): Viewport {
  return clampViewport({ ...viewport, x: viewport.x + dx, y: viewport.y + dy });
}

/** Ubah jarak piksel layar menjadi satuan kanvas pada skala saat ini. */
export function pixelsToCanvas(viewport: Viewport, pixels: number, renderedWidth: number): number {
  if (renderedWidth <= 0) return 0;
  return (pixels * visibleSize(viewport.scale).width) / renderedWidth;
}

/** Posisi titik kanvas sebagai persen area terlihat, untuk menaruh tooltip HTML. */
export function toViewportPercent(viewport: Viewport, x: number, y: number): { left: number; top: number } {
  const { width, height } = visibleSize(viewport.scale);
  return { left: ((x - viewport.x) / width) * 100, top: ((y - viewport.y) / height) * 100 };
}

export function viewBoxOf(viewport: Viewport): string {
  const { width, height } = visibleSize(viewport.scale);
  return `${viewport.x} ${viewport.y} ${width} ${height}`;
}

/**
 * Viewport yang memuat kotak `bounds` (satuan kanvas) beserta jarak tepi,
 * dipakai untuk memusatkan peta ke wallet yang sedang ditelusuri.
 */
export function fitBounds(
  bounds: { left: number; top: number; right: number; bottom: number },
  padding = 24,
): Viewport {
  const width = Math.max(bounds.right - bounds.left + padding * 2, 1);
  const height = Math.max(bounds.bottom - bounds.top + padding * 2, 1);
  const scale = Math.min(Math.max(Math.min(MAP_WIDTH / width, MAP_HEIGHT / height), MIN_SCALE), MAX_SCALE);
  const cx = (bounds.left + bounds.right) / 2;
  const cy = (bounds.top + bounds.bottom) / 2;
  return clampViewport({ scale, x: cx - MAP_WIDTH / scale / 2, y: cy - MAP_HEIGHT / scale / 2 });
}
