import { describe, expect, it } from "vitest";
import { authHref, DEFAULT_RETURN, safeReturnPath } from "./return-to";

describe("alamat kembali setelah masuk", () => {
  it("path internal diterima beserta query dan anchor", () => {
    expect(safeReturnPath("/token/base/0xabc")).toBe("/token/base/0xabc");
    expect(safeReturnPath("/flow/base/0xabc?rentang=7d#bukti-0x1")).toBe("/flow/base/0xabc?rentang=7d#bukti-0x1");
  });

  it("alamat luar, skema berbahaya, dan halaman akun ditolak", () => {
    for (const raw of [
      "https://jahat.example/",
      "//jahat.example/x",
      "/\\jahat.example",
      "javascript:alert(1)",
      "jahat.example",
      "/masuk",
      "/daftar?lanjut=/x",
      "/token\n/x",
      "/" + "a".repeat(600),
      "",
      null,
      undefined,
    ]) {
      expect(safeReturnPath(raw), String(raw)).toBe(DEFAULT_RETURN);
    }
  });

  it("tautan masuk/daftar membawa alamat kembali yang aman", () => {
    expect(authHref("/masuk", "/token/base/0xabc?x=1")).toBe("/masuk?lanjut=%2Ftoken%2Fbase%2F0xabc%3Fx%3D1");
    expect(authHref("/daftar", "https://jahat.example")).toBe("/daftar");
  });
});
