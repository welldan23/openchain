import { describe, expect, it } from "vitest";
import { MOCK_DEMO_ACCOUNT, MOCK_FAILING_AUTH_EMAIL } from "../mock/auth";
import { AuthError, signIn, signUp } from "./auth";

describe("api akun tiruan", () => {
  it("masuk dengan akun demo; email dinormalkan", async () => {
    await expect(signIn({ email: " RINA@contoh.id ", password: MOCK_DEMO_ACCOUNT.password })).resolves.toEqual({ displayName: "Rina Analis", email: "rina@contoh.id" });
  });

  it("email tak dikenal dan kata sandi salah dijawab pesan yang sama", async () => {
    const wrongPassword = await signIn({ email: MOCK_DEMO_ACCOUNT.email, password: "salah123" }).catch((error: unknown) => error);
    const unknownEmail = await signIn({ email: "siapa@contoh.id", password: MOCK_DEMO_ACCOUNT.password }).catch((error: unknown) => error);
    expect(wrongPassword).toBeInstanceOf(AuthError);
    expect((wrongPassword as AuthError).message).toBe((unknownEmail as AuthError).message);
  });

  it("daftar: email terdaftar ditolak, layanan gagal disimulasikan", async () => {
    await expect(signUp({ name: "Budi", email: MOCK_DEMO_ACCOUNT.email, password: "rahasia123", confirm: "rahasia123" })).rejects.toMatchObject({ code: "email_taken" });
    await expect(signUp({ name: " Budi ", email: "budi@contoh.id", password: "rahasia123", confirm: "rahasia123" })).resolves.toEqual({ displayName: "Budi", email: "budi@contoh.id" });
    await expect(signIn({ email: MOCK_FAILING_AUTH_EMAIL, password: "x" })).rejects.toThrow("tidak bisa dihubungi");
  });
});
