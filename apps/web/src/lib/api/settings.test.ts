import { describe, expect, it } from "vitest";
import { MOCK_SETTINGS } from "../mock/settings";
import { getAccountSettings, MOCK_FAILING_SOURCE_ID, setDataSourceEnabled } from "./settings";

describe("api pengaturan", () => {
  it("mengembalikan salinan supaya data tiruan tidak berubah oleh pemakai", async () => {
    const settings = await getAccountSettings();
    expect(settings).toEqual(MOCK_SETTINGS);
    settings.profile.displayName = "Diubah";
    expect(MOCK_SETTINGS.profile.displayName).toBe("Rina Analis");
  });

  it("saklar sumber data: terkunci ditolak, gagal simpan disimulasikan, nyala kembali ke kondisi terakhir", async () => {
    const [rpc] = MOCK_SETTINGS.dataSources.filter((source) => source.id === "rpc");
    await expect(setDataSourceEnabled(rpc, false, rpc.status)).rejects.toThrow("tidak bisa diubah");
    const goplus = MOCK_SETTINGS.dataSources.find((source) => source.id === "goplus")!;
    const off = await setDataSourceEnabled(goplus, false, "ok");
    expect(off).toMatchObject({ enabled: false, status: "disabled" });
    expect(await setDataSourceEnabled(off, true, "degraded")).toMatchObject({ enabled: true, status: "degraded" });
    await expect(setDataSourceEnabled({ ...goplus, id: MOCK_FAILING_SOURCE_ID }, false, "ok")).rejects.toThrow("gagal disimpan");
  });
});
