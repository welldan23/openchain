import { describe, expect, it } from "vitest";
import {
  clampViewport,
  fitBounds,
  INITIAL_VIEWPORT,
  MAX_SCALE,
  panBy,
  pixelsToCanvas,
  toViewportPercent,
  viewBoxOf,
  zoomAt,
  zoomCenter,
} from "./map-viewport";

describe("viewport peta", () => {
  it("awalnya menampilkan seluruh kanvas", () => {
    expect(viewBoxOf(INITIAL_VIEWPORT)).toBe("0 0 720 480");
  });

  it("zoom di sebuah titik menjaga titik itu di posisi layar yang sama", () => {
    const zoomed = zoomAt(INITIAL_VIEWPORT, 2, 180, 120);
    expect(zoomed).toEqual({ scale: 2, x: 90, y: 60 });
    // Titik (180, 120) tetap di 25% lebar dan 25% tinggi area terlihat.
    expect(toViewportPercent(zoomed, 180, 120)).toEqual({ left: 25, top: 25 });
  });

  it("zoom dari tengah dan dibatasi skala minimum/maksimum", () => {
    expect(zoomCenter(INITIAL_VIEWPORT, 2)).toEqual({ scale: 2, x: 180, y: 120 });
    expect(zoomCenter({ scale: 3, x: 0, y: 0 }, 10).scale).toBe(MAX_SCALE);
    expect(zoomCenter({ scale: 2, x: 180, y: 120 }, 0.1)).toEqual(INITIAL_VIEWPORT);
  });

  it("geser tidak bisa keluar dari kanvas", () => {
    const zoomed = { scale: 2, x: 180, y: 120 };
    expect(panBy(zoomed, 50, -30)).toEqual({ scale: 2, x: 230, y: 90 });
    expect(panBy(zoomed, 9999, 9999)).toEqual({ scale: 2, x: 360, y: 240 });
    expect(panBy(INITIAL_VIEWPORT, 100, 100)).toEqual(INITIAL_VIEWPORT);
    expect(clampViewport({ scale: 0.5, x: -10, y: -10 })).toEqual(INITIAL_VIEWPORT);
  });

  it("mengubah piksel layar menjadi satuan kanvas", () => {
    expect(pixelsToCanvas(INITIAL_VIEWPORT, 360, 360)).toBe(720);
    expect(pixelsToCanvas({ scale: 2, x: 0, y: 0 }, 360, 720)).toBe(180);
    expect(pixelsToCanvas(INITIAL_VIEWPORT, 10, 0)).toBe(0);
  });
});

describe("pas ke kotak", () => {
  it("memperbesar ke area kecil dan memusatkannya", () => {
    const viewport = fitBounds({ left: 300, top: 200, right: 420, bottom: 280 }, 0);
    expect(viewport.scale).toBe(4);
    expect(viewport.x + 720 / 4 / 2).toBe(360);
    expect(viewport.y + 480 / 4 / 2).toBe(240);
  });

  it("area yang sudah memenuhi kanvas tidak diperbesar", () => {
    expect(fitBounds({ left: 0, top: 0, right: 720, bottom: 480 })).toEqual(INITIAL_VIEWPORT);
  });
});
