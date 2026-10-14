import { describe, expect, it } from "vitest";
import { parseSession, serializeSession, sessionLabel } from "./session";

const session = { displayName: "Rina Analis", email: "rina@contoh.id", signedInAt: "2026-10-03T05:00:00.000Z" };

describe("sesi tiruan", () => {
  it("bolak-balik simpan dan baca; kolom lain tidak ikut tersimpan", () => {
    expect(parseSession(serializeSession(session))).toEqual(session);
    const withExtra = { ...session, token: "rahasia" } as typeof session;
    expect(serializeSession(withExtra)).not.toContain("rahasia");
  });

  it("isi rusak atau tidak lengkap dianggap belum masuk", () => {
    for (const raw of [null, "", "bukan json", "null", "[]", JSON.stringify({ ...session, email: "tanpa-at" }), JSON.stringify({ ...session, signedInAt: "kemarin" }), JSON.stringify({ ...session, displayName: " " })]) {
      expect(parseSession(raw), String(raw)).toBeNull();
    }
  });

  it("label tombol akun untuk pembaca layar", () => {
    expect(sessionLabel(session)).toBe("Akun: masuk sebagai Rina Analis");
    expect(sessionLabel(null)).toBe("Akun: belum masuk");
  });
});
