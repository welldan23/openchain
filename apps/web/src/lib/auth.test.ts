import { describe, expect, it } from "vitest";
import { firstErrorField, normalizeEmail, passwordChecks, validateSignIn, validateSignUp } from "./auth";

const valid = { name: "Rina Analis", email: "rina@contoh.id", password: "rahasia123", confirm: "rahasia123" };

describe("validasi masuk", () => {
  it("email dan kata sandi wajib, format email dicek", () => {
    expect(validateSignIn({ email: "", password: "" })).toEqual({ email: "Email wajib diisi.", password: "Kata sandi wajib diisi." });
    expect(validateSignIn({ email: "rina@contoh", password: "x" }).email).toContain("Format email");
    expect(validateSignIn({ email: " Rina@Contoh.ID ", password: "x" })).toEqual({});
    expect(normalizeEmail(" Rina@Contoh.ID ")).toBe("rina@contoh.id");
  });
});

describe("validasi daftar", () => {
  it("isian lengkap lolos", () => {
    expect(validateSignUp(valid)).toEqual({});
  });

  it("nama, kekuatan kata sandi, kata sandi sama dengan email, dan konfirmasi", () => {
    expect(validateSignUp({ ...valid, name: " R " }).name).toBe("Nama 2–60 karakter.");
    expect(validateSignUp({ ...valid, password: "pendek1", confirm: "pendek1" }).password).toContain("minimal 8 karakter");
    expect(validateSignUp({ ...valid, password: "tanpaangka", confirm: "tanpaangka" }).password).toContain("huruf serta angka");
    expect(validateSignUp({ ...valid, password: "x1".repeat(40), confirm: "x1".repeat(40) }).password).toBe("Kata sandi maksimal 72 karakter.");
    expect(validateSignUp({ ...valid, email: "abc12345@x.io", password: "ABC12345@x.io", confirm: "ABC12345@x.io" }).password).toBe("Kata sandi tidak boleh sama dengan email.");
    expect(validateSignUp({ ...valid, confirm: "beda" }).confirm).toBe("Kata sandi tidak sama.");
    expect(validateSignUp({ ...valid, confirm: "" }).confirm).toBe("Ulangi kata sandi.");
  });

  it("syarat kata sandi per butir dan kolom salah pertama", () => {
    expect(passwordChecks("abc").map((check) => check.ok)).toEqual([false, true, false]);
    expect(passwordChecks("kata sandi 9").map((check) => check.ok)).toEqual([true, true, true]);
    const errors = validateSignUp({ ...valid, email: "", confirm: "x" });
    expect(firstErrorField(errors, ["name", "email", "password", "confirm"])).toBe("email");
    expect(firstErrorField({}, ["name"])).toBeNull();
  });
});
