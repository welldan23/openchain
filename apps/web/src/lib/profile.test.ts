import { describe, expect, it } from "vitest";
import { updateProfile } from "./api/settings";
import { MOCK_SETTINGS } from "./mock/settings";
import { AVATAR_MAX_BYTES, validateAvatarFile, validateDisplayName } from "./profile";

describe("ubah profil", () => {
  it("nama tampilan wajib dan 2–60 karakter", () => {
    expect(validateDisplayName("  ")).toBe("Nama wajib diisi.");
    expect(validateDisplayName("R")).toBe("Nama 2–60 karakter.");
    expect(validateDisplayName("x".repeat(61))).toBe("Nama 2–60 karakter.");
    expect(validateDisplayName(" Rina ")).toBeNull();
  });

  it("foto: hanya PNG/JPG/WebP, tidak kosong, maksimal 2 MB", () => {
    expect(validateAvatarFile({ type: "image/png", size: 1000 })).toBeNull();
    expect(validateAvatarFile({ type: "image/gif", size: 1000 })).toContain("PNG, JPG, atau WebP");
    expect(validateAvatarFile({ type: "image/svg+xml", size: 1000 })).toContain("PNG, JPG, atau WebP");
    expect(validateAvatarFile({ type: "image/jpeg", size: 0 })).toBe("Berkas foto kosong.");
    expect(validateAvatarFile({ type: "image/webp", size: AVATAR_MAX_BYTES + 1 })).toContain("maksimal 2 MB (berkas ini 2 MB)");
    expect(validateAvatarFile({ type: "image/webp", size: 3.4 * 1024 * 1024 })).toContain("berkas ini 3,4 MB");
  });

  it("API tiruan: nama dirapikan, foto diganti lalu dihapus, isian salah ditolak", async () => {
    const profile = MOCK_SETTINGS.profile;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "foto.png", { type: "image/png" });
    const replaced = await updateProfile(profile, { displayName: "  Rina A.  ", avatar: { kind: "replace", file } });
    expect(replaced).toMatchObject({ displayName: "Rina A.", email: profile.email });
    expect(replaced.avatarUrl).toMatch(/^blob:/);
    expect((await updateProfile(replaced, { displayName: "Rina A.", avatar: { kind: "keep" } })).avatarUrl).toBe(replaced.avatarUrl);
    expect((await updateProfile(replaced, { displayName: "Rina A.", avatar: { kind: "remove" } })).avatarUrl).toBeNull();
    await expect(updateProfile(profile, { displayName: "", avatar: { kind: "keep" } })).rejects.toThrow("Nama wajib diisi.");
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    await expect(updateProfile(profile, { displayName: "Rina", avatar: { kind: "replace", file: gif } })).rejects.toThrow("PNG, JPG, atau WebP");
    expect(MOCK_SETTINGS.profile.displayName).toBe("Rina Analis");
  });
});
