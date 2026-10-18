import { describe, expect, it } from "vitest";
import { toDataSource, toPreferences } from "./settings";
import { toChainId, toEntityLabel, toFindingClassification, toInfoClassification, toNumber } from "./common";

describe("pemetaan respons API", () => {
  it("klasifikasi dan chain backend memakai istilah frontend; yang tidak dikenal tidak dipaksa", () => {
    expect(toInfoClassification("verified_fact")).toBe("fact");
    expect(toInfoClassification("derived_metric")).toBe("calculation");
    expect(toInfoClassification("aneh")).toBe("unavailable");
    expect(toFindingClassification("unavailable")).toBe("assumption");
    expect(toChainId("base")).toBe("base");
    expect(toChainId("hyperevm")).toBeNull();
    expect(toNumber("12.5")).toBe(12.5);
    expect(toNumber(null)).toBeNull();
    expect(toNumber("bukan angka")).toBeNull();
  });

  it("label pengguna tidak dipakai sebagai label entitas; jenis asing jadi unknown", () => {
    expect(toEntityLabel({ type: "exchange", name: "Binance 14", source: "external", sourceName: "Blockscout" })).toEqual({ type: "exchange", name: "Binance 14", source: "external", sourceName: "Blockscout" });
    expect(toEntityLabel({ type: "sesuatu", source: "heuristic" })).toEqual({ type: "unknown", source: "heuristic", sourceName: "OpenChain heuristic" });
    expect(toEntityLabel({ type: "exchange", source: "user" })).toBeUndefined();
  });

  it("preferensi: chain bawaan dan penjelasannya bila bukan pilihan pengguna", () => {
    const base = { theme: "dark", language: "id", numberLocale: "id", timeDisplay: "local", compactNumbers: true, valueUnit: "usd", density: "comfortable" } as const;
    expect(toPreferences({ ...base, defaultChain: "base", defaultChainSource: "chosen", defaultChainNote: null })).toMatchObject({ defaultChain: "base", defaultChainNote: null });
    expect(toPreferences({ ...base, defaultChain: "ethereum", defaultChainSource: "fallback", defaultChainNote: "Belum memilih chain bawaan; memakai Ethereum." })).toMatchObject({
      defaultChain: "ethereum",
      defaultChainNote: "Belum memilih chain bawaan; memakai Ethereum.",
    });
    expect(toPreferences({ ...base, defaultChain: null, defaultChainSource: "none", defaultChainNote: "Belum ada chain yang lolos smoke test." }).defaultChain).toBeNull();
  });

  it("sumber data: chain di luar daftar frontend dilewati, atribusi wajib ikut tampil", () => {
    const source = toDataSource({
      id: "goplus",
      name: "GoPlus Security",
      kind: "security",
      description: "Cek kontrak.",
      chains: ["base", "hyperevm"],
      status: "unknown",
      statusNote: "Belum ada pengambilan data dalam 24 jam terakhir.",
      envVars: [{ name: "SECURITY_PROVIDERS", purpose: "Penyedia.", required: false, configured: false }],
      lastCheckedAt: null,
      enabled: true,
      lockedReason: null,
      offEffect: "Ditandai tidak tersedia.",
      attribution: "Powered by GoPlus",
    });
    expect(source.chains).toEqual(["base"]);
    expect(source.status).toBe("unknown");
    expect(source.statusNote).toContain("Powered by GoPlus");
  });
});
